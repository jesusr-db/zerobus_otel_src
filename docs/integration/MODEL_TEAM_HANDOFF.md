# Model Team Handoff — Recommendation Endpoint (filled-in answers)

**From:** the recommendation feature-store + model team (qsr-synth-data-generator).
**To:** the PizzaTel storefront team (this repo).
**Pairs with:** `recommendation-endpoint-contract.md` — this doc fills in every "TO BE PROVIDED BY MODEL TEAM" item and is self-contained for implementation.

The endpoint is built, tested, and wired into the synthData setup/destroy jobs. No knowledge of synthData internals is required to integrate.

---

## 1. The endpoint

- **Model Serving endpoint name:** `synth_qsr-recommender`
- **Invocation URL:** `https://<jmrdemo-workspace-host>/serving-endpoints/synth_qsr-recommender/invocations`
- **Method:** `POST`, `Content-Type: application/json`
- **Availability:** live after the synthData **setup job** completes its `build_feature_tables` → `train_recommender` tasks. Until then the endpoint does not exist — keep the flagd fallback ON.
- **Online feature lookup:** confirmed. The website sends entity keys + live cart; the endpoint does the online feature lookup internally. Do **not** send precomputed features.
- (Optional, not needed for recs) a raw feature-lookup endpoint also exists: `synth_qsr-customer-features`. Ignore unless you want to display raw customer features.

## 2. Auth

- Use a **PAT or service principal with `CAN_QUERY`** on the endpoint: `Authorization: Bearer <token>` (same pattern as the existing `DATABRICKS_*` config).
- **Action on the website side:** tell the model team which **service principal (or user)** the website authenticates as. The model team grants `CAN_QUERY` automatically at deploy time via the `recommender_query_principal` bundle variable — they only need the principal identity from you. (OAuth M2M can replace the PAT later per ADR 0002.)

## 3. Request schema (send exactly this)

`dataframe_records`, one record per call. **All IDs are integers.**

```json
{
  "dataframe_records": [
    {
      "profile_id": 1234,
      "member_id": 5678,
      "store_id": 42,
      "cart_product_ids": [1, 14],
      "viewed_product_id": 8,
      "num_recommendations": 5
    }
  ]
}
```

| field | type | required | notes |
|---|---|---|---|
| `profile_id` | int | yes | The synth **`guest_order.profile_id`** (~1–50,000). **NOT** the 16-digit `guest_profile.guest_profile_id` (disjoint from order history). Anonymous/guest session → send a sentinel (e.g. `-1`) → cold-start. |
| `member_id` | int / null | no | Loyalty member; `== profile_id` in this data. Optional — tier is derived from `profile_id`. Send it or `null`. |
| `store_id` | int | yes | The synth **`unit_id`** (your store picker). Unknown → global-popularity fallback. |
| `cart_product_ids` | int[] | yes | Live cart `menu_item_id`s, may be empty `[]`. These == your catalog `product_id`s. |
| `viewed_product_id` | int / null | no | Item being viewed (product page). Folded into context and excluded from results. `null` elsewhere. |
| `num_recommendations` | int | no | Default 5, clamped 1–10. |

Send ints; `str()` the returned `menu_item_id`s for the catalog/UI. Missing/`null` fields are tolerated by the model.

## 4. Response schema (what you get back)

One `predictions` element per request record:

```json
{
  "predictions": [
    {
      "personalized": true,
      "recommendations": [
        {"menu_item_id": 53, "score": 0.94, "item_name": "20oz Coca-Cola", "category": "drinks", "subcategory": "soda", "reason": "complements your order; no drink in cart"},
        {"menu_item_id": 61, "score": 0.81, "item_name": "Garlic Dipping Cup", "category": "sides", "subcategory": "dip", "reason": "complements pizza"}
      ]
    }
  ]
}
```

Read it as `predictions[0].recommendations[*].menu_item_id` (+ optional `score`).

- `menu_item_id` is an **int** == your `product_id` → `str()` it → resolve against the live catalog (68 products) → render in "You May Also Like".
- `recommendations` already **excludes cart items and the viewed item**, is **sorted by score desc**, and has length ≤ `num_recommendations`.
- `personalized` = `false` on cold-start (unknown/guest `profile_id`); results are store-popularity-based. Good source for a `cold_start?` telemetry tag.
- `item_name` / `category` / `subcategory` / `reason` are bonus fields — safe to ignore, or use `reason` for a "why" tooltip.

> **Shape note:** this is richer than the illustrative flat list (`predictions:[{menu_item_id,score}]`) in `recommendation-endpoint-contract.md`. We return a per-row object with a `personalized` flag because Model Serving returns one prediction per input row. If you strictly prefer the bare flat list, ask — it's a cheap change on the model side.

## 5. ID alignment (confirmed — no mapping table)

- `product_id == str(menu_item_id)` — one ID space across the storefront catalog, the model, and training history. ✅
- Customer join key = **`guest_order.profile_id`**. The "shop as profile/loyalty" picker must emit that id (1–50,000), not `guest_profile.guest_profile_id`.
- Store = `unit_id`, sent as `store_id`.
- `member_id == profile_id` (100% match in this data).

## 6. Integration point (this repo)

Wire it in the Python gRPC recommendation service (`src/recommendation/recommendation_server.py`):

- Add env vars: `EXTERNAL_RECOMMENDATION_URL`, `RECOMMENDATION_API_TOKEN`, `STORE_ID` (default `unit_id`), plus a way to supply the active `profile_id` (the "shop as" picker).
- In `ListRecommendations`: build the §3 request (cart from `request.product_ids`, `profile_id`/`store_id` from session/pickers), POST it, parse `predictions[0].recommendations`, return the `menu_item_id`s.
- Keep the existing flagd gate + random/popular fallback on timeout/error/flag-off.
- Wrap the call in an OTel client span (endpoint, latency, returned count, `personalized`, fallback?) continuing the active browse/checkout trace.

## 7. Non-functional

- **Latency:** warm p50 ~ low-hundreds ms; first call after idle (scale-to-zero) can take a few seconds. Set a client timeout ~5s and rely on the fallback. Ask the model team to disable scale-to-zero if you want consistently warm demo latency.
- **Cold-start:** send the default guest `profile_id` sentinel → `personalized:false` + store-popular items.

## 8. Smoke test

```bash
curl -s -X POST \
  https://<jmrdemo-host>/serving-endpoints/synth_qsr-recommender/invocations \
  -H "Authorization: Bearer $DATABRICKS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dataframe_records":[{"profile_id":1234,"member_id":1234,"store_id":42,"cart_product_ids":[1],"viewed_product_id":null,"num_recommendations":4}]}'
```

Expected: a pizza-only cart for a known customer returns a drink near the top; a cart that already contains a soda returns no second soda; a guest `profile_id` returns `personalized:false` with store-popular items.

## 9. The one thing the model team needs back from you

The **service principal / user identity** the website will call with, so they grant it `CAN_QUERY` on `synth_qsr-recommender`.

---

### Checklist status (from `recommendation-endpoint-contract.md` §4)
- [x] Endpoint name + workspace URL — §1
- [x] PAT principal with `CAN_QUERY` (+ OAuth M2M later) — §2 (you provide the principal)
- [x] Confirm online feature lookup from entity keys — §1
- [x] Finalize request field names/types + payload format — §3
- [x] Finalize response shape + field name — §4 (confirm flat-vs-object if you care)
- [x] Confirm entity-key columns (profile/member/store) — §5
- [x] Confirm `menu_item_id` int in/out — §3/§4
- [x] Latency SLA + cold-start/guest behavior — §7
