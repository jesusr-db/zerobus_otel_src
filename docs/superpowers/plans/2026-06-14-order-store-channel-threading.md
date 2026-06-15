# PizzaTel — Order-side store_id + channel threading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thread the real picked `store_id` and an `order_type` (delivery/carryout) from the storefront into the order so the pizza tracker shows the actual store and the correct flow (Delivered vs Ready for Pickup) — replacing the `shippingTrackingId` placeholder + hardcoded `"delivery"` in `order-tracker`.

**Architecture (no proto change — Option B):** The frontend sends `storeId` + `orderType` (from the session + a new checkout toggle) to the checkout BFF, which attaches them as **gRPC metadata** on the `placeOrder` call. The `checkout` service reads the metadata and adds `store_id` + `order_type` **Kafka message headers** to the `orders` record (next to the W3C trace headers it already injects). The `order-tracker` reads those headers (it already iterates `msg.Headers`) and uses them instead of the placeholder/hardcoded values. No `.proto` regeneration anywhere.

**Tech Stack:** Go 1.24 (checkout, order-tracker; sarama + grpc metadata), Next.js/TypeScript (frontend BFF + grpc-js metadata), Docker Compose. Frontend/Go images build via the registry-mirror recipe (Appendix).

## Spec / decision
Brainstormed this session: Option B (gRPC metadata → Kafka header), scope = store_id **and** channel. Tracker stage machine already supports carryout (`BuildSchedule("carryout", …)` → ends at `ReadyForPickup`).

## Entity facts
- `order-tracker/consumer.go:34-38` already builds a `propagation.MapCarrier` from `msg.Headers` (trace ctx). Add two more header reads there.
- `order-tracker/consumer.go:45-46`: `channel := "delivery"` (hardcoded) and `storeID := order.GetShippingTrackingId()` (placeholder) — the two lines to replace.
- `checkout/main.go:618` builds the `sarama.ProducerMessage`; `:624` `createProducerSpan(ctx, &msg)` injects trace headers. Add header injection at the same site.
- Header keys: `pizzatel.store_id`, `pizzatel.order_type` (namespaced to avoid clashing with W3C `traceparent`).

## File Structure
- `src/order-tracker/consumer.go` — **modify**: read `pizzatel.store_id` / `pizzatel.order_type` headers; use them.
- `src/order-tracker/consumer_test.go` — **new**: unit-test header extraction.
- `src/checkout/main.go` — **modify**: read gRPC metadata in `PlaceOrder`; pass into `sendToPostProcessor`; add Kafka headers.
- `src/frontend/components/CheckoutForm/CheckoutForm.tsx` — **modify**: add delivery/carryout toggle to the form + `IFormData`.
- the CheckoutForm `onSubmit` wiring (provider/page) + `src/frontend/gateways/Api.gateway.ts` — **modify**: carry `storeId` (session) + `orderType` (form) in the checkout request.
- `src/frontend/pages/api/checkout.ts` — **modify**: read `storeId`/`orderType`, pass to the gateway.
- `src/frontend/gateways/rpc/Checkout.gateway.ts` — **modify**: attach gRPC `Metadata`.

---

## Task 1: order-tracker reads store_id + order_type from Kafka headers (TDD)

**Files:** modify `src/order-tracker/consumer.go`; create `src/order-tracker/consumer_test.go`

- [ ] **Step 1: Extract a pure helper for header reading.** In `consumer.go`, the `handle` method already loops `msg.Headers` into a `MapCarrier`. Add a tiny pure helper above `handle`:
```go
// headerValue returns the value of a Kafka header by key, or "" if absent.
func headerValue(headers []*sarama.RecordHeader, key string) string {
	for _, h := range headers {
		if string(h.Key) == key {
			return string(h.Value)
		}
	}
	return ""
}
```

- [ ] **Step 2: Write the failing test** — create `src/order-tracker/consumer_test.go`:
```go
package main

import (
	"testing"

	"github.com/IBM/sarama"
)

func TestHeaderValue(t *testing.T) {
	hs := []*sarama.RecordHeader{
		{Key: []byte("pizzatel.store_id"), Value: []byte("42")},
		{Key: []byte("traceparent"), Value: []byte("00-abc-def-01")},
	}
	if got := headerValue(hs, "pizzatel.store_id"); got != "42" {
		t.Fatalf("store_id want 42 got %q", got)
	}
	if got := headerValue(hs, "pizzatel.order_type"); got != "" {
		t.Fatalf("absent header want empty got %q", got)
	}
}
```

- [ ] **Step 3: Run it (Docker, due to local Go-proxy DNS block)**

Run: `cd src/order-tracker && GOPROXY=https://goproxy.io,direct GOSUMDB=off go test ./... -run TestHeaderValue -v`
Expected: PASS (helper compiles + behaves). If the local toolchain can't fetch deps, build the test in `golang:1.24-alpine` with `apk add git` and the GOPROXY env (see Appendix).

- [ ] **Step 4: Use the headers in `handle`.** Replace the two placeholder lines (`consumer.go:45-46`):
```go
	channel := headerValue(msg.Headers, "pizzatel.order_type")
	if channel == "" {
		channel = "delivery" // default when the order didn't carry an order_type
	}
	storeID := headerValue(msg.Headers, "pizzatel.store_id")
	if storeID == "" {
		storeID = order.GetShippingTrackingId() // legacy fallback
	}
```
(`channel` now feeds `BuildSchedule(channel, …)` which already branches carryout→ReadyForPickup; `storeID` is the real store.)

- [ ] **Step 5: Build + test**

Run: `cd src/order-tracker && GOPROXY=https://goproxy.io,direct GOSUMDB=off go build ./... && go test ./...`
Expected: builds + tests pass.

- [ ] **Step 6: Commit**
```bash
git add src/order-tracker/consumer.go src/order-tracker/consumer_test.go
git commit -m "feat(order-tracker): read pizzatel.store_id + order_type Kafka headers (fallback to placeholder/delivery)

Co-authored-by: Isaac"
```

---

## Task 2: checkout reads gRPC metadata + injects Kafka headers

**Files:** modify `src/checkout/main.go`

- [ ] **Step 1: Read metadata in `PlaceOrder`.** Find the `PlaceOrder(ctx context.Context, req *pb.PlaceOrderRequest)` handler. Near its top, extract the two values from incoming gRPC metadata:
```go
import "google.golang.org/grpc/metadata"
// ...
md, _ := metadata.FromIncomingContext(ctx)
storeID := firstMD(md, "pizzatel-store-id")
orderType := firstMD(md, "pizzatel-order-type")
```
Add the helper (gRPC metadata keys are lowercased; HTTP/2 header keys can't contain `_`, so use `-`):
```go
func firstMD(md metadata.MD, key string) string {
	if v := md.Get(key); len(v) > 0 {
		return v[0]
	}
	return ""
}
```

- [ ] **Step 2: Thread them to the Kafka publish.** `sendToPostProcessor(ctx, result)` builds the `sarama.ProducerMessage` at ~`main.go:618`. Pass `storeID`/`orderType` down to it (add params, or stash on a struct field — match the codebase's style; simplest is to add two string params to `sendToPostProcessor`). At the message-build site, set headers before/after `createProducerSpan`:
```go
msg.Headers = append(msg.Headers,
	sarama.RecordHeader{Key: []byte("pizzatel.store_id"), Value: []byte(storeID)},
	sarama.RecordHeader{Key: []byte("pizzatel.order_type"), Value: []byte(orderType)},
)
```
(Append AFTER `createProducerSpan(ctx, &msg)` so trace headers + these coexist. Empty values are fine — order-tracker falls back.)

- [ ] **Step 3: Build (Docker mirror)**

Run: `cd src/checkout && GOPROXY=https://goproxy.io,direct GOSUMDB=off go build ./...`
Expected: builds clean.

- [ ] **Step 4: Commit**
```bash
git add src/checkout/main.go
git commit -m "feat(checkout): propagate store_id + order_type from gRPC metadata to Kafka headers

Co-authored-by: Isaac"
```

---

## Task 3: frontend — order-type toggle + carry storeId/orderType in the checkout request

**Files:** modify `src/frontend/components/CheckoutForm/CheckoutForm.tsx`, the `onSubmit` wiring (locate: it's where `<CheckoutForm onSubmit=...>` is rendered — grep `CheckoutForm` under `src/frontend`; likely a Cart/Checkout component), `src/frontend/gateways/Api.gateway.ts`

- [ ] **Step 1: Add `orderType` to the form.** In `CheckoutForm.tsx`, add `orderType` to `IFormData` (`'delivery' | 'carryout'`), default `'delivery'` in the `useState`, include it in the `onSubmit({...})` payload, and render a toggle before "Shipping Address":
```tsx
<S.Title>Order Type</S.Title>
<Input label="Order Type" name="orderType" id="order_type" value={orderType} onChange={handleChange} type="select">
  <option value="delivery">Delivery</option>
  <option value="carryout">Carryout</option>
</Input>
```
(Add `orderType` to the destructure + the `onSubmit` object. `handleChange` already handles selects.)

- [ ] **Step 2: Carry storeId (session) + orderType into the request.** In `Api.gateway.ts` `placeOrder`, read `storeId` from the session at call time and include `storeId` + `orderType` in the POST so the BFF can read them. Keep `body: order` for the proto fields; add the two as queryParams (avoids polluting the proto body):
```ts
placeOrder({ currencyCode, orderType, ...order }: PlaceOrderRequest & { currencyCode: string; orderType?: string }) {
  const { storeId } = SessionGateway.getSession();
  return request<IProductCheckout>({
    url: `${basePath}/checkout`,
    method: 'POST',
    queryParams: { currencyCode, storeId, orderType: orderType ?? 'delivery' },
    body: order,
  });
},
```
Ensure `orderType` flows from the form through the provider (`Cart.provider.tsx` `placeOrder` → `mutateAsync({...order, currencyCode})`) — add `orderType` alongside `currencyCode` there, sourced from the form data the onSubmit handler passes. (Import `SessionGateway` in Api.gateway if not present.)

- [ ] **Step 3: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/frontend/components/CheckoutForm src/frontend/gateways/Api.gateway.ts src/frontend/providers/Cart.provider.tsx
git commit -m "feat(frontend): order-type toggle + carry storeId/orderType into checkout request

Co-authored-by: Isaac"
```

---

## Task 4: checkout BFF + gateway — attach storeId/orderType as gRPC metadata

**Files:** modify `src/frontend/pages/api/checkout.ts`, `src/frontend/gateways/rpc/Checkout.gateway.ts`

- [ ] **Step 1: Gateway accepts + attaches metadata.** In `Checkout.gateway.ts`:
```ts
import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
// ...
placeOrder(order: PlaceOrderRequest, ctx?: { storeId?: string; orderType?: string }) {
  const metadata = new Metadata();
  if (ctx?.storeId) metadata.set('pizzatel-store-id', ctx.storeId);
  if (ctx?.orderType) metadata.set('pizzatel-order-type', ctx.orderType);
  return new Promise<PlaceOrderResponse>((resolve, reject) =>
    client.placeOrder(order, metadata, (error, response) => (error ? reject(error) : resolve(response)))
  );
},
```

- [ ] **Step 2: BFF reads query + passes context.** In `pages/api/checkout.ts` GET/POST handler, read `storeId`/`orderType` from `query` and pass to the gateway:
```ts
const { currencyCode = '', storeId = '', orderType = '' } = query;
const orderData = body as PlaceOrderRequest;
const { order: { items = [], ...order } = {} } = await CheckoutGateway.placeOrder(orderData, {
  storeId: String(storeId), orderType: String(orderType),
});
```

- [ ] **Step 3: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/frontend/pages/api/checkout.ts src/frontend/gateways/rpc/Checkout.gateway.ts
git commit -m "feat(frontend): checkout BFF attaches store_id/order_type as gRPC metadata

Co-authored-by: Isaac"
```

---

## Task 5: Integration verification

**Files:** none (verification) + `docs/baseline/order-store-threading-summary.md`

- [ ] **Step 1: Rebuild the three images via the mirror** (frontend + checkout + order-tracker — see Appendix) and recreate them:
```bash
set -a; source .env; set +a
docker compose -f docker-compose.yml up -d --no-deps --force-recreate checkout order-tracker frontend
```
- [ ] **Step 2: Drive a CARRYOUT order** in the UI (Playwright, localhost:8080): pick a profile + store, add a pizza, set Order Type = Carryout, Place Order.
- [ ] **Step 3: Verify Valkey** `tracker:<orderId>`: `channel == "carryout"`, `store_id ==` the picked store's id (NOT a UUID placeholder), and the schedule ends at `ReadyForPickup`.
- [ ] **Step 4: Verify Zerobus** `jmrdemo.zerobus.otel_spans`: the `order-tracker received order` span for that order has `order.store_id` = picked store and `order.channel = carryout`.
- [ ] **Step 5:** Repeat with a Delivery order → `store_id` real, channel delivery, ends at `Delivered`.
- [ ] **Step 6:** Write `docs/baseline/order-store-threading-summary.md`; commit.

---

## Appendix — building Go/frontend with the blocked-proxy mirror
- Go images: temp Dockerfile (or `--build-arg GOPROXY=https://goproxy.io,direct`), `docker build --network=host`; pre-pull `golang:1.24-bookworm` + `gcr.io/distroless/static-debian12:nonroot`.
- Frontend: temp `src/frontend/Dockerfile.mirror-buildtest` with `ENV npm_config_registry=https://registry.npmmirror.com`, `--network=host`; delete after (don't commit).

## Self-Review notes (author)
- **Spec coverage:** order-tracker header read + fallback (T1), checkout metadata→header (T2), frontend toggle + request threading (T3), BFF/gateway metadata attach (T4), e2e verify both channels (T5). No proto change anywhere (Option B).
- **Type/key consistency:** Kafka header keys `pizzatel.store_id`/`pizzatel.order_type` written in checkout (T2) and read in order-tracker (T1). gRPC metadata keys use `-` not `_` (`pizzatel-store-id`/`pizzatel-order-type`) — HTTP/2 header constraint — set in gateway (T4 Step 1) and read in checkout (T2 Step 1). `orderType` values `delivery`/`carryout` match `BuildSchedule`'s `channel != "carryout"` branch.
- **Known unknowns to resolve at execution:** (a) the exact `PlaceOrder` handler signature + whether `sendToPostProcessor` takes params or reads a field — match the file; (b) the CheckoutForm `onSubmit` wiring file (grep to locate) and how `orderType` flows through `Cart.provider`; (c) confirm `@grpc/grpc-js` `Metadata` import path (it's already a frontend dep).
