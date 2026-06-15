# Plan 4b summary — recommendation Model Serving integration (2026-06-15)

Wires the storefront's `recommendation` service to the Databricks Model Serving endpoint `synth_qsr-recommender` (built by the model team), gated by a flagd flag with a robust fallback. Built on `feat/pizzatel-plan4b-recommendation-serving` via subagent-driven development with adversarial review.

## What shipped
- **`external_recommender.py`** (tested): `build_request` (int coercion, guest→`-1` sentinel), `parse_response` (`predictions[0].recommendations[].menu_item_id` → str ids + `personalized`), `fetch_recommendations` (stdlib `urllib` POST, Bearer token, 5s timeout). 4/4 unit tests.
- **`recommendation_server.py`**: reads `rec-profile-id`/`rec-store-id`/`rec-member-id`/`rec-viewed-product-id` from gRPC metadata; `recommendationModelEnabled` flag-gate; `recommendation.model_call` OTel client span (endpoint, store/profile, `personalized`, `model.count`, `cold_start`, `fallback`); **falls back to the existing random/popular recs on flag-off / empty URL / any exception / empty result**.
- **frontend**: `Recommendations.gateway` attaches the identity as gRPC metadata; the `/api/recommendations` BFF passes the Plan 4a query IDs through. No proto change.
- **config**: `EXTERNAL_RECOMMENDATION_URL` + `RECOMMENDATION_API_TOKEN=${DATABRICKS_API_TOKEN}` + `RECOMMENDATION_DEFAULT_STORE_ID` in compose; `recommendationModelEnabled` flagd flag (**default off**).

## Contract
`docs/integration/MODEL_TEAM_HANDOFF.md` — endpoint `synth_qsr-recommender`, request `dataframe_records` (ints), response `predictions[0].recommendations[]`, auth Bearer PAT w/ `CAN_QUERY`.

## Adversarial review — SHIP IT
Verified the **fallback fires in every failure mode** (flag off, empty URL, timeout, HTTP 4xx/5xx, malformed JSON, empty recs — all reach `get_product_list`), exception coverage complete, int/guest-sentinel coercion correct, metadata keys match end-to-end (`rec-*`), no token leaked to spans/logs, span continuity sound, grpc 3-arg call correct. Minors (deferred `viewedProductId`, null store/member tolerated by contract, flag-read pattern) all demo-acceptable.

## Verification (live, full stack)
- **Fallback path (flag OFF — the default):** rebuilt frontend + hot-loaded the new recommendation code; drove a UI journey (pick profile+store → add to cart → cart). Recommendations render (4 cards), all `/api/recommendations` calls 200, **0 console errors**, recommendation served 9 `ListRecommendations` with **0 errors** (silent catalog fallback). ✅
- **Error-fallback path (flag ON, live):** flipped `recommendationModelEnabled` on; the model call hit the endpoint and returned **HTTP 404 — the `synth_qsr-recommender` endpoint is not deployed in this workspace yet** (the model team's setup job hasn't run here). The 404 was caught → **fallback → recs still rendered (4 products, 200)**. This proves the fallback fires on a real endpoint failure. Flag reverted to off. ✅

## Pending — the live model-SUCCESS path (two external prerequisites)
1. **Endpoint not deployed here:** `synth_qsr-recommender` returns 404 — the model team's synthData **setup job** (`build_feature_tables` → `train_recommender`) must run in this workspace to create it.
2. **Token:** `DATABRICKS_API_TOKEN` is expired (OTel export 403s); refresh for both the serving call and Zerobus span export.

Once both are in place: flip the flag on → personalized recs (a pizza-only cart returns a drink/side near the top), `recommendation.source=model`, `personalized=true`, and the `recommendation.model_call` span lands in `jmrdemo.zerobus.otel_spans`.

## Action item to relay to the model team
The website authenticates with the **`DATABRICKS_API_TOKEN` principal (jesus.rodriguez@databricks.com)** — give that to the model team so they grant it `CAN_QUERY` on `synth_qsr-recommender` (handoff §9), and confirm the endpoint's setup job has run in `adb-7405605519549535`.

## Notes
- Recommendation is interpreted Python → verified via `docker cp` + restart (no pip build); the committed source is canonical, CI rebuilds normally. Frontend is a local mirror build (temp Dockerfile deleted after use).
- `recommendationModelEnabled` ships **off** — zero behavior change until explicitly enabled.
