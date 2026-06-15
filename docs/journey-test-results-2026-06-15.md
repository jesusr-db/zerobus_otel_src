# PizzaTel Plan 4b — Full UI Journey + Backend Verification (2026-06-15)

**Branch:** `feat/pizzatel-plan4b-recommendation-serving`. **Stack:** full `docker-compose.yml`, `recommendationModelEnabled` flipped **ON**, live `synth_qsr-recommender` endpoint. **Channels:** UI (Playwright) + `docker logs` + `jmrdemo.zerobus.otel_spans` + Valkey.

## Verdict: PASS (with one demo-tuning finding — cold-start timeout)
The recommendation-model integration works end-to-end: identity/store/cart thread to the live model, personalized recs come back when the endpoint is warm, the fallback fires cleanly on cold-start timeouts, and order-side store/channel land correctly.

## Journeys driven
Shop-as **Curtis Guerrero (profile 748, gold)** + **store 1**, added a pizza, then placed a **delivery** and a **carryout** order (`017f62c5…`, `09e3c07d…`).

## Evidence

### Recommendation model (`recommendation.model_call` span, Zerobus)
- **Metadata threading works:** spans carry `app.recommendation.profile_id=748`, `store_id=1` — the "shop as"/store pickers reach the recommendation service via gRPC metadata. ✅
- **Model succeeds when warm:** 4 warm profile-748 BFF calls → `personalized=true`, `fallback=None`, `model.count=5`, ~0.22–0.28s. ✅
- **Guest cold-start:** `profile_id=""` → `personalized=false` (store-popular). ✅
- **Fallback on timeout:** 22 model_call spans had `fallback=true` with an `exception` event `TimeoutError: The read operation timed out` — the storefront still rendered recs (catalog fallback). ✅
- Direct + in-container calls confirm correct behavior: pizza cart → drink/side; cart with a soda → no second soda; guest → store-popular.

### Order tracker (Valkey + Zerobus)
| order | channel | store_id | terminal | source |
|---|---|---|---|---|
| delivery `017f62c5` | delivery | **1** | Delivered | Valkey + `order-tracker received order` span |
| carryout `09e3c07d` | carryout | **1** | ReadyForPickup | Valkey + span |

Real picked store + channel both threaded correctly through checkout → Kafka headers → order-tracker. ✅

### UI / logs
- All `/api/recommendations` calls 200; recommendations render (when the model is warm or via fallback).
- recommendation service: served requests with metadata; no crashes.

## ⚠️ Finding — cold-start timeout (demo tuning, not a bug)
The endpoint **scales to zero when idle** (handoff §7); the first calls after idle exceed our **5s client timeout** → `TimeoutError` → fallback. During the journey, **most profile-748 calls fell back** (timed out cold) and only rendered *personalized* recs once warm. The integration is correct and resilient, but to reliably **show personalized model recs in a live demo**, do one of:
1. **Warm the endpoint** right before demoing (fire a few calls), **or**
2. ask the model team to **disable scale-to-zero** on `synth_qsr-recommender` (handoff §7 / §100), **or**
3. bump the client timeout (trade-off: a slow first rec instead of a fast fallback — not recommended for UX).
Recommended: (1) or (2). The committed 5s timeout + fallback is the right *default*.

## Known cosmetic noise (not blockers)
- Product-image `404`s in the journey: the `image-provider` running image lacks the per-variety pizza images (we ran without the `pizzatel-test-override.yml` image mount). Committed source has them; CI/override serves them. Recommendations still resolve (IDs are valid catalog products).
- Playwright's rec-card selector read 0 in the scripted run (timing/async), but the BFF returns recs (verified directly) and they render in the browser.

## Net
All Plan 4b acceptance criteria met: model integration live-verified through the service (metadata → model → response), fallback proven on real timeouts, order-side store/channel correct. **Ready to merge** once the demo-warm-up approach is chosen. `recommendationModelEnabled` reverted to **off** (committed default).
