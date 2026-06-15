# Plan 4 — Website ⇄ Databricks Model Integration (design)

**Status:** Design / brainstorm output. Awaiting review before writing implementation plans.
**Date:** 2026-06-14
**Scope owner:** website (this repo). The recommendation **model, feature store, and serving endpoint are built in a separate project** and are explicitly out of scope here.

## Goal
Make the PizzaTel storefront consume a Databricks **recommendation Model Serving endpoint** (built externally) instead of the current random picker — personalized by **customer identity + store + live cart context** — while preserving telemetry parity and offline-runnability. Define the exact **contract** between the website and the model project so both sides can build in parallel.

## What changed from the original "Plan 4"
The model/feature-store work moves to a separate project. The website's job shrinks to: **supply the right inputs, call the endpoint, consume the output, and degrade gracefully.** "Plan 4" is therefore a small program; this spec covers the **website-side** pieces only.

## Decomposition
- **4a — Identity & Store Context** (this spec; no model dependency — ships value alone)
- **4b — Recommendation integration** (this spec; depends on the external endpoint + the contract in the appendix)
- **4c — 2nd model endpoint** (deferred; fraud-scorer *or* ad-ranker — TBD, reuses the 4b wrapper)
- **4d — Postgres → Lakebase** (deferred; independent track)

---

## Plan 4a — Identity & Store Context (foundation)

**Why first:** nothing can be personalized until the storefront can say *who* the customer is and *which* store — and those IDs must be the **exact entity keys** the model's feature store is keyed on.

### Components
- **"Shop as" profile/loyalty picker** — a selector that sets the active `profile_id` (+ `member_id` and loyalty tier) for the session. Sourced from **`synth_silver.guest_order.profile_id`** (1–50,000, the real join key) + loyalty (`loyalty_transaction`). **Important:** `guest_profile.guest_profile_id` (16-digit bigint) is disjoint from order history — the picker uses `guest_order.profile_id` as the canonical ID, with cosmetic display names borrowed from `guest_profile`. `member_id == profile_id` (100% match in the 1–50,000 space).
- **Store picker** — grouped (by metro/region) selector setting the active `store_id`. Sourced from `synth_ref.unit` (the 250 stores already seeded to `jmrdemo.pizzatel.stores`). (Absorbs the previously-deferred Plan 2b Phase D.)
- **Reference-data export** — `provisioning/src/seed_export_notebook.py` emits `profiles.json` (50 top-ordered profiles keyed on `guest_order.profile_id` with real loyalty tier from `loyalty_transaction`) and `stores.json`, carrying the **canonical synth entity IDs** (`profile_id`, `member_id`, `unit_id`). These back the pickers.

### Threading
`profile_id` / `member_id` / `store_id` flow: session/context → cart → checkout → and into the recommendation call. Carried in the frontend session + request payloads (no gRPC/proto changes; threaded via the BFF request like other session fields). Default to a **guest profile** when nothing is picked (cold-start, see contract).

### Data flow
Picker selection → session context → BFF recommendation request includes the IDs → serving wrapper forwards them as entity keys.

---

## Plan 4b — Recommendation integration (website portion)

### Reusable serving-call wrapper
A single client module (reused later for the 4c endpoint) that:
- `POST https://<host>/serving-endpoints/<name>/invocations`
- **Auth: PAT in env for now** (`DATABRICKS_*` token). **Roadmap: OAuth M2M service principal** (ADR 0002) — same change that fixes the collector token-expiry pain.
- Builds the contract payload (entity keys + context — see appendix).
- Parses the ranked-IDs response; **casts `menu_item_id` (int) → catalog `product_id` (str)**.
- Emits a **client span** around the call (so the model's latency appears inside the existing browse/order trace).
- **Flag-gated offline fallback** (flagd): on timeout/error/feature-flag-off, return the current behavior (popular/random) so the demo runs without the endpoint. Records fallback + cold-start attributes on the span.

### Live cart context
Fetch the **live cart** from `CartService.GetCart` (not just the page-passed products) so `cart_product_ids[]` is the true cart on every surface, plus `viewed_product_id` for the current product page. (Decided: always send live cart + viewed item.)

### Request inputs (website → model)
`profile_id`, `member_id`, `store_id`, `cart_product_ids[]` (live cart), `viewed_product_id` (optional), `num_recommendations`. Full schema in the appendix contract.

### Wiring
Swap the random picker in `src/recommendation/recommendation_server.py` (`ListRecommendations`) to call the wrapper. The gRPC contract (`ListRecommendations(userId, productIds)`) is **unchanged**; the new identity/store/context fields ride in via the request the BFF builds. Existing callers (product page, cart, checkout `<Recommendations/>`) keep working.

### Verified ID alignment (de-risks the whole feature)
Catalog `product_id` **is** `str(menu_item_id)` (`provisioning/src/seed_transform.py:19`). Values align 1:1 (id `1` = "Large Hand-Tossed Pepperoni" in both `synth_ref.menu_item` and `products.json`). The model's training join key `synth_silver.order_item.menu_item_id` is the same space. **No mapping table needed — only a string↔bigint cast** (documented in the contract).

---

## Telemetry goals
- A client span per serving call: endpoint name, latency, `num_recommendations`, returned count, **fallback used?**, **cold-start?** (unknown profile).
- The span continues the active browse/checkout trace, so model latency is visible end-to-end (and lands in `jmrdemo.zerobus.otel_spans`).

## Testing strategy
- Unit: request-builder (correct entity keys + live cart), response-mapper (int→str cast, ordering), fallback path (endpoint down → popular/random, flag off → bypass).
- Integration: pickers thread IDs into the call; with the endpoint stubbed/mocked, recommendations resolve against the live catalog; with the flag off, behavior matches today.
- tsc + existing Cypress journeys stay green.

## Out of scope (the model project owns these)
Feature store / online tables, feature engineering from synth history, model training/registration, the serving endpoint itself, and any model evaluation. This spec only consumes the endpoint per the appendix contract.

## Open items
- **Auth:** PAT now → OAuth M2M (ADR 0002) roadmap.
- **2nd endpoint (4c):** fraud-scorer vs ad-ranker — decide later.
- Appendix contract values (endpoint name, exact request/response schema, SLA, cold-start) are **filled in by the model team** — see the standalone handoff doc.

## Appendix
Model-team handoff contract: [`docs/integration/recommendation-endpoint-contract.md`](../../integration/recommendation-endpoint-contract.md)
