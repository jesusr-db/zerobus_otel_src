# Recommender Endpoint — Live Integration Findings (web team)

**Date:** 2026-06-15  ·  **Endpoint:** `synth_qsr-recommender` (jmrdemo workspace)  ·  **Pairs with:** `MODEL_TEAM_HANDOFF.md`

Record of what we hit integrating the storefront against the live Model Serving endpoint, and how the wrapper (`src/recommendation/external_recommender.py`) was corrected. Net status: **integration verified working end-to-end** (HTTP 200, personalized + cart-aware + cold-start all confirmed).

## Timeline of what the endpoint returned

| When | Request | Result | Meaning |
|---|---|---|---|
| Endpoint not yet deployed | handoff §8 payload | **HTTP 404 `ENDPOINT_NOT_FOUND`** | The setup job hadn't run in this workspace; `synth_qsr-recommender` didn't exist. Our flagd fallback handled it (recs still rendered). |
| After deploy, first call | `viewed_product_id: null` | **HTTP 400** `Failed to convert column viewed_product_id to type 'int64' … not 'NoneType'` | The deployed MLflow signature is **all-scalar int64**; null is rejected. |
| After deploy | `member_id: null` | **HTTP 400** `Failed to convert column member_id to type 'int64'` | Same — `member_id` null also rejected. |
| After deploy | raw array `cart_product_ids: [1,14]` | (handoff flagged) | Signature expects `cart_product_ids` as a **JSON string**, not an array. |
| After fixes | all-int ids + `cart_product_ids:"[1]"` | **HTTP 200** ✅ | Personalized recs returned. |

## Two discrepancies vs the handoff (as written)

1. **`cart_product_ids` must be a JSON string** — e.g. `"[1, 14]"`, empty cart `"[]"`. The model keeps an all-scalar signature, so the cart array is passed as a `json.dumps`'d string. *(The updated `MODEL_TEAM_HANDOFF.md` §3 now documents this.)*

2. **`member_id` / `viewed_product_id` / `store_id` must be NON-NULL int64.** The handoff field table + footer still say *"Missing/`null` fields are tolerated by the model"* — **this is not true for the deployed signature**: sending `null` for `member_id` or `viewed_product_id` returns **HTTP 400** (verified live, both fields). An all-scalar int64 signature cannot accept null. **Recommend the model team correct that line in the handoff** (or make the signature nullable). Either way the website doesn't depend on it — see the fix below.

## How the wrapper was fixed (`external_recommender.build_request`)
- `cart_product_ids` → `json.dumps([...])` (JSON string; empty → `"[]"`).
- Absent/guest values become **int sentinels, never null**:
  - `profile_id`: guest/empty → `-1` (cold-start sentinel; handoff §3).
  - `member_id`: absent → **mirrors `profile_id`** (handoff §5: `member_id == profile_id` in this data); guest → `-1`.
  - `store_id`: absent → `-1` (global-popularity fallback).
  - `viewed_product_id`: absent → `-1`.
- Unit tests updated (5/5 pass) to lock the JSON-string cart + sentinels.

## Verified live behavior (handoff §8 expectations — all met)
- **Known customer 748 (gold), pizza-only cart** → `personalized:true`; Lava Cake + Coca-Cola/Fanta/Diet-Coke with reasons *"no drink in cart; gold-tier favorite"*.
- **Cart already contains a soda (53)** → `personalized:true`; **no second soda** (Lava Cake, Blue Cheese Dip, BBQ Chicken, Extravaganzza) — same-subcategory suppression works.
- **Guest (`profile_id -1`)** → `personalized:false`; store-popular pizzas.
- Latency: ~0.25–0.5s warm (cold start after scale-to-zero a few seconds — our 5s client timeout + fallback covers it).

## Auth note
These calls authenticated fine with the existing `DATABRICKS_API_TOKEN` (principal **`jesus.rodriguez@databricks.com`**) — the serving call returned 200, even though the **OTel export** path 403s separately (that token/permission issue is unrelated to the serving endpoint). The 404→400→200 progression confirms auth was never the blocker. Model team: grant `CAN_QUERY` to that principal (handoff §9) if not already.

## Operational reminder
`recommendationModelEnabled` ships **off**. To go live: refresh the export token (for Zerobus spans), flip the flag on, and the storefront serves model recs with no code change. The endpoint scales to zero when idle — first call after idle is slow; the fallback absorbs it.
