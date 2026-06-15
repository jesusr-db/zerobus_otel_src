# Order-side store_id + channel threading — summary (2026-06-15)

Threads the real picked `store_id` and `order_type` (delivery/carryout) from the storefront into the order, so the pizza tracker shows the actual store and the correct flow — replacing the `shippingTrackingId` placeholder + hardcoded `"delivery"`. Built on `feat/pizzatel-order-store-threading` via subagent-driven development with adversarial review on the substantive tasks.

## Approach — Option B (no proto change)
UI store + order-type → checkout BFF query → gRPC **metadata** (`pizzatel-store-id` / `pizzatel-order-type`) → checkout reads metadata, adds Kafka **headers** (`pizzatel.store_id` / `pizzatel.order_type`) next to the W3C trace headers → order-tracker reads the headers (falls back to the old placeholder/`delivery` when absent). No `.proto` regeneration.

## What shipped
- **order-tracker** (`consumer.go`): `headerValue` helper (unit-tested) reads `pizzatel.store_id` / `pizzatel.order_type` from `msg.Headers`; fallbacks preserved.
- **checkout** (`main.go`): reads gRPC metadata in `PlaceOrder`; `sendToPostProcessor` appends the two Kafka headers after `createProducerSpan` (trace headers preserved).
- **frontend**: delivery/carryout toggle in `CheckoutForm`; `orderType` flows form → `CartDetail` → `Cart.provider` → `Api.gateway` (which also reads `storeId` from the live session) → `/api/checkout` query; the BFF + `Checkout.gateway` attach them as gRPC metadata.

## Adversarial reviews (both SHIP IT)
- **checkout (OT2):** verified the Kafka headers are appended before the message is enqueued (reach the wire) and that the W3C trace headers are preserved (append-not-assign); metadata read nil-safe; keys consistent (dots for Kafka, dashes for gRPC).
- **frontend (OT3+OT4):** traced all 6 hops — `orderType`/`storeId` survive form → metadata with no drop; tsc clean; no proto-body pollution; `storeId` read at call time (not stale module scope).

## Verification (live UI journey, full stack)
Picked profile "Curtis Guerrero (gold)" + store **1**, placed one carryout + one delivery order via the browser. **Valkey tracker state:**

| order | channel | store_id | terminal stage | SOS |
|---|---|---|---|---|
| carryout | `carryout` | **1** (real) | **ReadyForPickup** | 720 |
| delivery | `delivery` | **1** (real) | **Delivered** | 1800 |

This proves the full path end-to-end: the order-tracker received the real `store_id` + `order_type` from the headers checkout injected from the frontend's gRPC metadata. The placeholder (`shippingTrackingId`) and hardcoded `delivery` are gone.

## Pending (token-blocked, not a code issue)
The **Zerobus span-attribute confirmation** (`order.store_id` / `order.channel` on the `order-tracker received order` span in `jmrdemo.zerobus.otel_spans`) is **blocked by an expired `DATABRICKS_API_TOKEN`** (collector 403 as of 09:53 UTC — gotcha #4). The same data Valkey already confirms is dropped at export. Refresh the token (`.env` + `docker compose up -d --force-recreate otel-collector`) and the span attributes will land. ADR 0002 (OAuth M2M) would end this recurring expiry.

## Notes
- Empty `store_id`/`order_type` (e.g. no store picked, or non-PizzaTel flows) → empty headers → order-tracker falls back gracefully. Acceptable; a carryout-requires-store validation is a possible UX refinement.
- Images are local builds via the mirror recipe (temp `Dockerfile.mirror` / `Dockerfile.mirror-buildtest`, deleted after use; CI rebuilds normally).
