# PizzaTel UI Journey Test — 2026-06-14

**Branch:** `feat/pizzatel-plan4a-identity-store` (Plan 4a). **Path:** Playwright headless Chromium → `localhost:8080` (local, no auth). **Dual-channel:** UI + `docker logs` + `jmrdemo.zerobus.otel_spans`.

## Journey driven (J1→J4, one session)
1. **J1 Home + pickers** — selected profile "Curtis Guerrero (gold)" (`profileId=748`) + a store (`storeId=1`). Session persisted.
2. **J2 Product** — opened `/product/1`, clicked Add To Cart.
3. **J3 Cart + order** — `recommendation-list` rendered; checkout form (with **$0 shipping**) submitted via `checkout-place-order`.
4. **J4 Confirmation** — landed on `/cart/checkout/<orderId>`; **OrderTracker rendered all 5 stages** (Prep → Bake → Quality Check → Out for Delivery → Delivered).

`orderId = 96538543-685a-11f1-8967-7ead4677a563`. `session.userId = 8b428120-…`.

## Channel 1 — UI
- Both Plan 4a pickers render live (profile: Guest + 50 with tiers; store: 250). ✅
- **All 9 `/api/recommendations` calls returned 200 and carried `storeId=1&profileId=748&memberId=748`** plus cart context (`productIds`), confirming live threading. ✅
- Order total had **`shippingCost = $0.00`** — the delivery-fee fix is live in the UI. ✅
- OrderTracker present with 5 stages. ✅
- **0 console errors.** Only failed requests: 2 flagd `EventStream ERR_ABORTED` — benign SSE teardown on navigation.

## Channel 2 — docker logs (journey window)
- `recommendation`, `checkout`, `order-tracker`: **0 errors**.
- `frontend`: 43 `NOT_FOUND: Product Not Found: <astronomy ID>` (e.g. `OLJCESPC7Z`, `LS4PSXUNUM`). **Pre-existing, not from this work**: the load-generator still requests the original telescope-shop product IDs that don't exist in the 68-pizza catalog (flagged since Plan 1). recommendation correctly returns NOT_FOUND. Does not affect the journey.
- Valkey `tracker:96538543…` written: channel=delivery, 5-stage schedule.

## Channel 3 — OTel tables (`jmrdemo.zerobus.otel_spans`)
- **Recommendation threading:** spans with `app.recommendation.profile_id=748, store_id=1, member_id=748`, `cart_size ∈ {0,1,3}` — matches the journey's calls as the cart changed. ✅
- **Order-tracker for this order:** `order-tracker received order` + `stage: Prep`, both `parent_span_id` non-null → **children of the checkout trace** (W3C Kafka-header propagation). ✅

## Verdict: PASS
The end-to-end flow works: pickers → identity/store/cart threaded into recommendations (observable in Databricks) → order placed at $0 shipping → live pizza tracker → order-tracker spans land in Zerobus as part of the checkout trace.

## Notes / known items (not regressions)
- **Order-side `store_id` is still the shipping-tracking placeholder** in the tracker (`tracker.store_id` ≠ the picked store `1`). Expected: Plan 4a only threaded the real store into the *recommendation* path; threading it into the order/tracker is the documented deferred follow-up.
- **Load-gen astronomy product IDs** cause frontend NOT_FOUND noise — pre-existing; a future cleanup is to repoint the load generator at pizza IDs.
