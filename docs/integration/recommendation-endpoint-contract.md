# Recommendation Model Serving — Integration Contract

**Audience:** the team building the recommendation **feature store + model + serving endpoint** (separate project).
**Counterparty:** the PizzaTel storefront (this repo).
**Purpose:** the seam between the two projects, so both can build in parallel. Fill in the **TO BE PROVIDED BY MODEL TEAM** items; the website builds against them.

The storefront calls a Databricks Model Serving endpoint to get personalized pizza recommendations, sending **customer identity + store + live cart context**. The model is expected to do **online feature lookup** from the entity keys (the website sends keys + realtime context, *not* precomputed features).

---

## 1. What the website needs FROM the model team

### 1.1 Endpoint & auth — *TO BE PROVIDED*
- **Endpoint name** and workspace, i.e. invocation URL: `https://<workspace-host>/serving-endpoints/<NAME>/invocations`
- **Auth (initial): PAT** — a token/principal with `CAN_QUERY` on the endpoint. (Website will store it in env, like the existing `DATABRICKS_*` config.)
- **Auth (roadmap):** OAuth M2M service principal (client id/secret) — preferred; aligns with ADR 0002.

### 1.2 Request schema — *TO BE PROVIDED / CONFIRMED*
Confirm the model does **online feature lookup**, so the website sends entity keys + realtime context. Proposed inputs (confirm names/types/format):

| field | type | meaning |
|-------|------|---------|
| `profile_id` | bigint | active customer profile (`synth_silver.guest_profile`) |
| `member_id` | bigint, nullable | loyalty member, if any |
| `store_id` | bigint | active store (`synth_ref.unit.unit_id`) |
| `cart_product_ids` | array<bigint> | **live cart** menu_item_ids (may be empty) |
| `viewed_product_id` | bigint, nullable | item being viewed (product page only) |
| `num_recommendations` | int | how many to return (default 5) |

- **Payload format:** confirm `dataframe_records` vs `dataframe_split` vs `inputs` (MLflow signature).

### 1.3 Response schema — *TO BE PROVIDED / CONFIRMED*
- A **ranked list of `menu_item_id`** (most relevant first), optionally with scores. Confirm exact JSON shape and the field name.
- Count: at most `num_recommendations`.

### 1.4 Entity-ID space (the join keys) — *CONFIRM*
The website's pickers will emit the **exact synth IDs** your feature tables/online store are keyed on. Confirm the canonical columns:
- profile → `synth_silver.guest_profile.profile_id`
- loyalty → `member_id` (from guest_order / loyalty tables)
- store → `synth_ref.unit.unit_id`

### 1.5 Item-ID space — ALREADY ALIGNED ✅
The recommended item IDs must be **`menu_item_id`** (`synth_ref.menu_item`). This is already the storefront's catalog ID: catalog `product_id == str(menu_item_id)` (verified — id `1` = "Large Hand-Tossed Pepperoni" in both `synth_ref.menu_item` and the storefront `products.json`; training history `synth_silver.order_item.menu_item_id` is the same space). **No mapping table needed.**
- **Only caveat — type:** website carries product IDs as **strings**; `menu_item_id` is **bigint**. Website sends `cart_product_ids` as ints and `str()`s the returned ids. Confirm your endpoint accepts/returns ints.

### 1.6 Non-functional — *TO BE PROVIDED*
- **Latency SLA** (p50/p99) so the website sets a sane client timeout.
- **Cold-start:** behavior for an **unknown / guest profile** (the website sends a default guest `profile_id` when no one is "logged in"). What should the website send, and what will the model return (e.g. popularity fallback)? The website also has its own offline fallback (below), but the model's cold-start contract should be explicit.

---

## 2. What the website PROVIDES (so you can build to it)

- **Calls** `POST /serving-endpoints/<NAME>/invocations` with the agreed payload, on every recommendation surface (product page, cart, checkout).
- **Always sends the live cart** (fetched from the cart service) as `cart_product_ids`, plus `viewed_product_id` on product pages.
- **Sends synth-aligned entity IDs** via the "shop as profile/loyalty" + store pickers (seeded from `guest_profile`, loyalty, `unit`).
- **Type handling:** sends ids as ints; `str()`s returned `menu_item_id`s for the catalog/UI.
- **Telemetry:** wraps the call in an OpenTelemetry **client span** (endpoint, latency, returned count, fallback?, cold-start?) that continues the active browse/checkout trace — your model's latency shows up in the end-to-end trace in `jmrdemo.zerobus.otel_spans`.
- **Graceful degradation:** a flagd feature flag gates the call; on timeout/error/flag-off the website returns its existing popular/random recommendations, so the storefront runs without the endpoint.

---

## 3. Proposed example (to confirm)

**Request** (`dataframe_records`, illustrative):
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

**Response** (illustrative):
```json
{ "predictions": [ { "menu_item_id": 23, "score": 0.91 }, { "menu_item_id": 7, "score": 0.88 } ] }
```
Website maps `menu_item_id` → `str()` → resolves against the live catalog (the 68 pizza products) → renders in "You May Also Like".

---

## 4. Checklist for the model team
- [ ] Endpoint name + workspace URL
- [ ] PAT principal with `CAN_QUERY` (+ OAuth M2M later)
- [ ] Confirm online feature lookup from entity keys
- [ ] Finalize request field names/types + payload format
- [ ] Finalize response shape + field name
- [ ] Confirm entity-key columns (profile/member/store)
- [ ] Confirm `menu_item_id` int in/out (type cast)
- [ ] Latency SLA + cold-start/guest behavior
