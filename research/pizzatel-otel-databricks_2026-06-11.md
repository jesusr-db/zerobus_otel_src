# PizzaTel Brainstorm — Re-theme OpenTelemetry Demo + Migrate Backend to Databricks

**Date:** 2026-06-11
**Source:** Opus brainstorm subagent (grounded in both `opentelemetry-demo` and `synthData` repos)

---

## Repo-grounded findings (divergences from the brief)

- **synthData is far richer than "synth_*"** — structured UC layout (`synth_staging`, `synth_ref`, `synth_silver`, `synth_metrics`), a real Domino's-style `menu_catalog.py` (~80 items), `ref.unit`/`ref.franchisee`/`ref.menu_item`/`ref.item_price`/`ref.recipe_ingredient` seed tables, and a Poisson demand model — not raw "skus."
- **The brief's `synth_skus` table name is wrong** — the real table is `synth_ref.menu_item`. Stores = `synth_ref.unit`. There is no `synth_staging.skus`. The pizza menu the brief wants to "create" **already exists**.
- **synthData bundle already hardcodes** `catalog_name: jmrdemo` and `profile: DEFAULT` — the reproducibility risk the brief flags is confirmed on disk.
- **otel-demo's postgres `init.sql` is shipping/order/orderitem — NOT "accounting + product-reviews."** Accounting reads from Kafka; product-reviews uses Postgres. The brief's Lakebase scope needs adjustment.
- **flagd faults confirmed:** `recommendationCacheFailure`, `adHighCpu`, `adFailure`, `productCatalogFailure`, `cartFailure`. The ad/recommendation faults literally disappear when those services move to Databricks (brief decision (d) confirmed real).

---

## Framing

The brief bundles two genuinely separable initiatives under one banner: **(1) a domain re-theme** of the OpenTelemetry Demo into a pizza shop, and **(2) a backend migration** of three services (Postgres, recommendation, ad) onto Databricks serving primitives. These have different audiences, different risk profiles, and very different effort-to-payoff ratios. The most important framing decision is recognizing that they are *not equally valuable* and do not have to ship together.

Hard constraints, all confirmed against the repos:
- **Runnable at every phase boundary** (`docker compose up`) — the otel-demo is a 20+ service compose graph with gRPC contracts in `pb/demo.proto`; any change that breaks a contract breaks the whole graph.
- **Telemetry parity-or-better** — load-bearing risk is real: the moment recommendation/ad calls leave a container and hit a Databricks serving endpoint over HTTPS, the W3C `traceparent` context is dropped by the serving front door. Black hole in the trace exactly where the "interesting" Databricks call happens.
- **Offline fallback behind flags** for every Databricks-backed path — non-negotiable for a demo that must run on a plane.
- **synthData is the canonical data model and is actively evolving** (Phase 2.5 just completed, weather/events refresh jobs running). Its bundle hardcodes `jmrdemo` and `DEFAULT`.

Correction the brief needs: real seed tables are `synth_ref.unit` (stores), `synth_ref.menu_item` (~80-item menu, already built), `synth_ref.franchisee`, `synth_ref.item_price`, `synth_ref.recipe_ingredient`. No `synth_skus`. Live order traffic lands in `synth_staging.order_events` (wide sparse event table).

## Assumptions

1. **Primary audience is a Databricks field-engineering demo** (user is a Databricks SE; repo lives under FY26/FY27 demo trees; synthData is DPZ/Domino's-flavored). The telemetry story serves *selling Databricks*, not teaching OTel to the OSS community.
2. **This is a hard fork** — no intent to upstream. Rebase is "nice if cheap," not a requirement.
3. **The demo runs on FE Vending Machine workspaces**, not a single permanent workspace — reproducibility/parameterization is a real near-term need.
4. **synthData stays a separate repo** — PizzaTel *consumes* it (reads `synth_ref` / `synth_staging`), may later *produce* into it, does not fork/absorb it.
5. **The menu already exists** — bind to `synth_ref.menu_item`, don't re-derive.
6. **"Pizza builder" combinatorics are a stretch goal, not Phase-1** — the synth menu is fixed SKUs (e.g. "Large Hand-Tossed Pepperoni"), not a crust×size×topping configurator. Brief decision (f) is true *only if* you insist on a configurator the data model doesn't support.
7. **Cost discipline matters** — Lakebase + Feature/Model Serving bill while up; demo torn down between sessions.

## Perspectives

- **SE / demo-giver:** Wants a 10-minute "wow" loop that survives a flaky conference network, resets cleanly, tells one crisp story. Hates cold-starts mid-demo and silent fallbacks. Values the *pizza tracker* far more than which DB backs accounting.
- **Databricks product storytelling:** Wants *differentiated* primitives — Lakebase, Feature/Model Serving, online tables, UC governance, the synth pipeline as a live producer. recommendation→Feature Serving and ad→Model Serving are the actual product proof points. Accounting→Lakebase is the cleanest "lift a Postgres container onto Databricks" story.
- **Observability purist:** Cares that trace context is *propagated*, not faked; parity claims measured, not asserted; removing teaching faults without replacing them guts pedagogical value. Loudest voice on the Databricks-boundary black hole.
- **Maintainability / rebasing:** Wants minimal, contract-preserving diffs (keep gRPC `.proto` untouched), changes concentrated in data/config not scattered across 12 runtimes, hard fork acknowledged.
- **Cost owner:** Wants scale-to-zero defaults, `bundle destroy` one-liner, no orphaned Lakebase billing overnight, offline mode as the *default* for local dev.

## Options

### A. Narrative-spine choices
- **A1 — Databricks story is the spine; observability is the texture.** Headline: "a real QSR's data platform on Databricks, observable end-to-end." *Strong* — matches audience; migrations become the climax. But raises stakes on the trace-boundary gap and worsens offline story.
- **A2 — Observability spine; Databricks is one backend.** Lowest risk, preserves existing strength, but undersells Databricks. Weak as primary; correct *fallback* spine if migrations slip.
- **A3 — Both, sequenced: observability spine for Goal 1, Databricks spine for Goal 2.** *Good* — pragmatically this is what the phased plan already is. Win is to name it and make the Phase-3 boundary a polished "stop-here-and-it's-still-great" checkpoint.

### B. Data-strategy choices
- **B1 — Use Databricks directly (live reads at request time).** Max authenticity but couples frontend latency to warehouse state; cold-start + cost on hot path; breaks offline. Poor for hot-path; OK only for migrated serving endpoints.
- **B2 — Mimic patterns locally (port generator into Locust).** Fully offline but duplicates/drifts from synthData, throws away the asset, high maintenance. Poor — most work, least Databricks credit.
- **B3 — Hybrid (brief default):** batch-export `synth_ref.*` as seed, generate live traffic locally shaped by distributions mined from `synth_staging.order_events`. *Strong, confirmed correct.* Refinement: menu already exists, so scope distribution-mining to a *small* set of levers (hourly demand curve, item-mix weights, order-type split) as a single `pizzatel_seed` snapshot — not a faithful reimplementation.
- **B4 — Hybrid-thin (recommended):** seed menu/stores from a frozen `synth_ref` snapshot; drive Locust with a *handful* of hardcoded distributions (peak-hours multiplier, top-N item weights). Distribution-mining → backlog. **Best for v1 — ~90% of realism at ~30% of effort.**

### C. Scope
- **C1 — Full build, all 7 phases.** Complete vision but three independent migrations each with own fallback/auth/cost/trace-boundary work; configurator rabbit hole; high chance of a half-finished migration violating gates.
- **C2 — Goal 1 + one flagship migration (recommended).** Ship Phases 0–3 (full re-theme incl. pizza tracker + re-themed faults) as a complete polished demo. Then do **exactly one** migration — **recommendation → Feature/Model Serving** — solving the trace-boundary problem once as reusable infra. Defer accounting→Lakebase and ad→serving. *Strong — right v1.*
- **C3 — Goal 1 only.** Fastest shippable themed demo, zero Databricks risk, but no product proof. Acceptable as a *checkpoint* (the Phase-3 boundary of C2), not the endpoint.

## Recommendation

**Adopt narrative spine A3 (sequenced both), build to scope C2 (Goal 1 + one flagship migration), with data strategy B4 (hybrid-thin).**

- **A3 names what the phased plan already is** and forces the Phase-3 boundary to be a genuinely polished, offline-runnable "stop-here" state — protects the whole project if migrations slip.
- **C2 picks recommendation as the single flagship migration, not accounting.** recommendation→serving is the highest-value Databricks proof point (Feature/Model Serving on the request path, personalization driven by `synth` guest/order data) and the one where solving trace-context-across-the-Databricks-boundary pays off as reusable infrastructure. Accounting→Lakebase is the *easiest* migration but the *weakest* story (async Kafka consumer; users never see it) — wrong thing to lead with; keep as next backlog item once the boundary pattern exists.
- **B4 confirmed correct by repos:** menu and stores already exist as `synth_ref.menu_item` / `synth_ref.unit`; the work is a *thin* seed-export snapshot (`pizzatel_seed`) plus a small explicit set of demand levers in Locust. Treat `synth_ref` (not `synth_staging`) as the stable seed interface; snapshot it so synthData's active evolution can't break a live demo.

**Top risks (priority order):**
1. **The Databricks serving-boundary trace black hole.** Biggest threat to the parity gate and to the A1/A3 climax. Cannot rely on `traceparent` surviving the serving front door. Design mitigation in **Phase 0**, not Phase 5: rich client span around the serving call (endpoint, model/feature-table version, latency, cold-start flag, fallback-taken flag as attributes) + a synthetic child span from observable response metadata / MLflow trace ID. Make "did we take the fallback?" a first-class visible span attribute so the demo never silently lies.
2. **Cost/teardown + auth drift.** Lakebase + serving bill while up; OAuth/PAT expiry silently flips demo into fallback mid-presentation. Mitigation: offline mode default for local dev; single `bundle destroy`; OAuth M2M over PAT; visible UI health indicator showing live-vs-fallback so the SE knows their token expired *before* the customer does.

**Single highest-leverage piece of work:** a **reusable "Databricks serving call wrapper"** — one well-instrumented client module (rich OTel span + flag-gated offline fallback + OAuth M2M + cold-start/fallback span attributes) every migration reuses. Solves risk #1 (trace boundary), risk #2 (auth/cost/fallback visibility), and the fallback-drift decision (e) at once. Build it for recommendation in C2; every later migration becomes a thin application of a proven pattern.

**Lowest-value work to cut/defer:** the build-your-own-pizza *configurator* (data model is fixed SKUs — decision (f) is self-inflicted difficulty); React Native re-theme (Phase 7 optional); ad→serving and accounting→Lakebase (backlog after boundary pattern proven); bidirectional sync of demo orders back into `synth_staging` (roadmap, zero v1 value).

---

# Deep-dive: The Pizza Tracker (Phase 2 centerpiece)

## Core architectural problem
The otel-demo is **stateless after checkout** (confirmed in code):
- `ShipOrder` (`src/shipping/src/shipping_service.rs:49`) calls `create_tracking_id()`, returns a random string, **persists nothing**. The tracking ID is not a key into any store.
- `PlaceOrderResponse → OrderResult` (order_id, tracking_id, items, address) is the end of the line — **no order-status concept exists** in any of the 20+ services.
- A confirmation page keyed by order already exists: `src/frontend/pages/cart/checkout/[orderId]/` — natural home for the tracker.
- The frontend is a **BFF**: `pages/api/*` routes wrap gRPC gateways in `InstrumentationMiddleware`, so new instrumented endpoints land here **without touching any backend language**.

So "build a tracker" = "add order-state-over-time"; the design question is where state lives and how stages advance.

## Options
| Option | Stage advancement | Telemetry value | Effort/risk |
|---|---|---|---|
| 1. Client-only timer | `setInterval` in `[orderId]` page | Zero — no spans, looks fake | Trivial |
| 2. Stateless derived | stage = `f(now − placed_at, eta)`, served by instrumented BFF poll | Real poll traces, no backend transitions | Low |
| 3. Real stateful service | net-new service + state table + worker emits span per transition | Highest | New service = runnable-gate risk |
| **4. Kafka-driven lightweight state (recommended)** | new `order-tracker` consumer reuses existing order stream, writes state + baked timeline, ticker advances | High, architecturally honest | Moderate — **no new gRPC contract** |

## Recommendation: Option 4 — a Kafka-driven `order-tracker`
The demo already publishes every order to Kafka (`checkout → kafka`, consumed by `accounting` + `fraud-detection`). Add a third consumer instead of a new gRPC service:
1. **Reuses existing Kafka trace-context propagation** → the consume-span joins the checkout trace; "place order" and "tracker started" become one coherent distributed trace, zero proto changes (satisfies the preserve-contracts guardrail).
2. **Produces the most watchable telemetry in the demo** — consume span → stage-transition spans (`Prep→Bake→QualityCheck→OutForDelivery→Delivered`, attrs `order.id`, `order.stage`, `store.id`, `delivery.eta_seconds`) → frontend poll chain `[orderId] → /api/order-status → gateway → order-tracker`. Plus metrics `pizza.orders.active{stage}` + `pizza.stage.duration`.
3. **Makes the Lakebase migration visible** — the tracker's order-state store moves Valkey → Lakebase in Phase 4, so Lakebase powers the most-watched screen (fixes the "accounting→Lakebase is invisible" weakness).

## State & data design
On order receipt, compute a per-order schedule and store it (Valkey in Goal 1, Lakebase in Goal 2):
`order_id, store_id, placed_at, eta_seconds, stage_started_at, current_stage, stage_deadlines{...}`.
Stage can be advanced by a ticker **or** computed at read-time (`now` vs deadlines) — read-time is the simplest correct version (survives restarts, no worker). Feed shipping's delivery ETA into the `OutForDelivery → Delivered` duration so tracker and shipping agree.

## Decision forced
Adopt the **synth state machine** (placed/preparing/ready/fulfilled + delivery) as source of truth, presented with pizza labels — rather than inventing the brief's 5 stages independently. Real, cleaner, roadmap-aligned.

---

# Deep-dive: Synthetic-data leverage (what synthData gives us, by phase)

The synth data is a **feature set**, not garnish. Two connective insights:
- **These are ML features, not decoration.** Loyalty tier, weather, daypart, store, recent-order history = exactly the feature vector a Feature Serving endpoint consumes. They elevate the recommendation/ad migration from "static list" to "personalized by real signals."
- **The live feeds dodge the trace-boundary problem.** Weather/events/holiday calls are real outbound HTTP from our own code → honest spans, no front-door context loss. Observability richness "for free" while the Databricks-serving boundary stays the one hard problem.

### The tracker's lifecycle data (confirmed in `orders.py` + `data-model.md`)
- **`status_event`** = a real stage machine: `placed→preparing` (60s), `preparing→ready` (`prep_secs`), `ready→fulfilled` (120s), with `prior_state`, `current_state`, `event_timestamp`, `elapsed_seconds_in_prior_state`. Reuse verbatim as the tracker backend model.
- **Realistic prep distributions** (`entropy.py`): carryout ~Gaussian(12min,3min), delivery ~Gaussian(31min,6min). Tracker deadlines drawn from these, not hardcoded.
- **SOS / speed-of-service SLA** (`sos_target_seconds`: 720 carryout / 1800 delivery, `is_sos_breach`) — the observability hook: promise-time vs actual, breach → span attr `pizza.sos.breach` + metric + the re-themed "delivery surge" fault now violates a *real KPI*. Gold view `sos_compliance_summary` is a ready-made dashboard.
- **Delivery estimate-vs-actual** (`delivery_order`: `estimated_delivery_seconds` = prep+900, `actual_delivery_seconds` = prep+600–1800, `delivery_status`) → honest "running late" state.
- **Channel mix** (carryout / own_delivery / 3pd_delivery / catering) → carryout skips delivery stage + 12-min SLA; delivery gets full leg + 30-min SLA. Same weights feed the load generator.

### Tier 1 — high realism + reinforces core stories
- **🌦️ Live weather/events/holidays feeds** (`src/refresh/`, open-meteo + Ticketmaster/SeatGeek + nager.at) → demand multiplier + weather→delivery-shift. Real outbound-HTTP spans; built-in `return [] on error` fallback story. **Phase 3** (load-gen realism) + observability.
- **🏆 Loyalty tiers + points** (`loyalty_events`: bronze/silver/gold/elite, `reward_value`) → best feature for recommendation/ad serving migration; tier-gated deals, "200 pts to a free pizza." **Phase 5/6** (+ surfaced in UI Phase 2).
- **📦 Inventory / 86'd items** (`inventory_events`: `quantity_on_hand`, `par_level`, `waste_log`, `temperature_check_pass`) → unavailable menu items + most relatable fault ("out of pepperoni"). **Phase 1 (catalog) + Phase 3 (fault)**.

### Tier 2 — good realism, moderate effort
- **👤 Guest profiles + UC column masking** (`guest_events`: PII masked for non-admin, `account_status`, `zip_code`) → real personas + a UC governance differentiator. **Phase 1/2**.
- **🍕 Menu richness** (`menu_catalog.py`: categories/subcategories incl. LTO, `daypart` lunch-vs-all-day, `base_price` + `food_cost`, **3pd surcharge $0.75**, `recipe_ingredient` → inventory link). **Phase 1**.
- **👷 Workforce/staffing** (`workforce_events`: shifts, `hours_worked`) → staffing modulates prep time / SOS; understaffing fault. **Phase 3 (stretch)**.

### Tier 3 — enterprise texture (platform story, lower app payoff)
Franchisee hierarchy (`ref.franchisee`), financial periods, payment tender mix, silver/DLT quality expectations (`@dp.expect_or_drop`) + gold metric views as free dashboards. **Roadmap.**

---

# Deep-dive: Tracker ↔ synth correlation & the live→Databricks round-trip

## Two separate order populations (do NOT join on an order key)
- **Live orders** — born in the running demo (real user or Locust): `frontend → checkout → kafka → order-tracker`. Net-new.
- **Synthetic orders** — `synth_staging.order_events`, generated continuously by the synthData Poisson pipeline. Pre-existing, separate population.

A live order has **no matching row** in synth. They share a time axis but are different facts. synth uses sequential BIGINT ids; the demo mints its own — they collide if naively unioned. **Never set `live.order_id = synth.guest_order_id`.**

## What actually correlates
1. **Shared dimension keys (via the Phase-1 seed)** — the real link. Menu/stores/personas were exported *from* Databricks, so every live order carries real FKs: `productId → synth_ref.menu_item.menu_item_id`, store → `synth_ref.unit.unit_id`, persona → guest `profile_id`/loyalty `member_id`+tier, `channel`. Order fact is new; FKs are shared. ⚠️ keys must come from the exact `pizzatel_seed` snapshot or the join dangles.
2. **Distributional / trajectory correlation (behavior, not identity)** — see below.
3. **In-demo correlation id** — `order_id` minted at checkout threads through: OTel span (`trace_id`) → Kafka message key → tracker state row → `/api/order-status?orderId=`. Trace correlation rides Kafka headers (same mechanism accounting/fraud-detection use).

## Trajectory adoption ("use the generated tracker from synth to populate the website")
**Goal:** drive the tracker from a real synth-generated lifecycle, not independently-sampled stats.
- **Do NOT overwrite synth rows** — `synth_*` is read-only / pipeline-owned. Instead **graft**: clone a synth order's lifecycle template into a demo-owned record stamped with the live order's identity + a `template_synth_order_id` provenance pointer.
- **Independent-distribution sampling** (draw prep/SOS/delivery from separate curves) vs **trajectory/lifecycle-template sampling** (adopt one real synth order's whole lifecycle as a jointly-consistent unit: slow prep ⇒ tends to breach SOS ⇒ late delivery, with the generator's real correlations). Trajectory sampling is more realistic; cost is exporting N example trajectories per channel vs a few summary stats.
- **Keep Databricks OFF the tracker hot path.** The tracker is polled/user-facing — a live Databricks query or scale-to-zero cold-start there violates "runs offline / no Databricks on hot path." Pre-load a **pool of lifecycle templates** (bucketed by channel/daypart/item-count) into Valkey at the Phase-1 seed export; at placement pick a template locally, rebase its relative stage deltas to `now`, cache it; tracker polls local state. Fallback to independent sampling if the pool is unavailable.
- **Items-vs-timing consistency caveat:** grafting live items onto a template whose `prep_secs` was conditioned on different items breaks internal consistency. For a demo: match templates on coarse channel/item-count bucket, OR treat the synth order as a pure **timing donor** and let live items be cosmetic. Go with the latter + coarse matching.

## Sequencing
- **v1 (C2):** independent-distribution sampling — tracker works offline, zero Databricks dependency.
- **Enhancement (once seed export exists):** swap in trajectory/template sampling for richer joint realism.
- **Roadmap:** live→Databricks landing + `UNION` view (demo-as-producer).

**The payoff beat:** place an order on the site → watch the tracker (driven by a real generated lifecycle) → pivot to Databricks and see that same order land in a table seconds later, beside years of synthetic history in the same SLA dashboard. Round-trip in 30 seconds.

---

# Deep-dive: Store selection (Plan 2b decision, 2026-06-13)

**Decision: explicit store picker now; address→auto-nearest as roadmap.** Whichever pattern, the downstream artifact is identical — a `store_id` that flows into the order → tracker → SOS — so the picker ships now and auto-nearest is added later with zero downstream rework.

**v1 (Plan 2b) — store picker (option A):**
- A "Choose your store" selector in the frontend, grouped by metro/state (250 stores is too many flat). Fed by a baked `stores.json` seed (same offline pattern as the pizza menu; sourced from `jmrdemo.pizzatel.stores` ← `synth_ref.unit`, which has `unit_name/city/state/lat/lon/metro_area`). New instrumented BFF endpoint `/api/stores` (or a baked static file) — no backend/geocoding work.
- Demo-repeatable: deliberately pick a store with rich synth history so the tracker/SOS/recommendation story is consistent every run. Realistic for carryout.
- The selected `store_id` is carried into checkout → order → the Kafka order-tracker (keys timeline by store) → SOS target (carryout 720s / delivery 1800s).

**Roadmap — address→auto-nearest (option B), evolving to D (split by order type):**
- Geocode the checkout `Address` (`city/state/zip_code`) offline using `synthData/src/generator/reference/us_locations.py` metro centroids (or a baked zip→lat/lon table) → **haversine** to all store `lat/lon` → nearest within a delivery radius. No external geocoder (honors ADR 0002 offline-runnable).
- Natural home: the `shipping` service (Rust) — it already receives the address and computes the delivery ETA/fee, so distance drives the "Out for Delivery → Delivered" leg.
- End state (option D): carryout → store picker; delivery → address→auto-nearest.

---

# Deep-dive: OTel export → `order_events` schema conformance

## Principle: separate transport from conformance
OTel's native wire shape (spans/logs/metrics) will **never** equal `order_events`. Don't force it; **don't reconstruct order events from spans** (sampled, retried, not 1:1 with business facts — wrong source of truth). Put a mapping step in between:

```
[website / order-tracker]
  ── OTel LOGS signal (one structured log per business event) ──▶
[OTel Collector] ── exporter ──▶ pizzatel.order_events_raw   (bronze landing, generic OTel-log shape)
                                      │ conformance job (mirror mvm_pipeline.py)
                                      ▼
                              pizzatel.live_order_events       (SAME schema as the silver tables below)
                                      │
                                      ▼
                              view: synth ∪ live  (source discriminator)
```
**The OTel export doesn't match the schema — a Databricks conformance job does.** OTel is just the pipe.

## How synthData itself does it (the pattern to mirror)
`synth_staging.order_events` is ONE wide raw event table with an `event_type` discriminator ∈ `{guest_order, order_item, payment, status_event, delivery_order, on_hand_balance, waste_log, …}`. The DLT pipeline (`src/pipeline/mvm_pipeline.py`) reads staging, `.filter(event_type=="…")`, and `.cast(...)`-projects into typed silver tables. **Matching the schema = emit rows with the right column names + `event_type`; typing is enforced downstream in the transform.**

## Emit via the OTel *Logs* signal (not spans)
One structured log record per business event; business fields in attributes under a `pizzatel.*` namespace + an `event_type` attribute; carry your own ISO-8601 timestamps as attributes (not the log observed-time).

## The conformance contract — exact silver DDL (from `mvm_pipeline.py`)
Live events must project into these shapes (`created_at` set at write; live rows also get `source='live'` + `source_order_ref` STRING):

```sql
-- guest_order
guest_order_id BIGINT, unit_id BIGINT, franchisee_id BIGINT, region_id BIGINT,
channel STRING, order_type STRING, order_status STRING, profile_id BIGINT, member_id BIGINT,
subtotal DOUBLE, discount_amount DOUBLE, tax_amount DOUBLE, total_amount DOUBLE,
placed_at TIMESTAMP, ready_at TIMESTAMP, fulfilled_at TIMESTAMP, cancelled_at TIMESTAMP,
financial_period_id BIGINT, sos_breach BOOLEAN, created_at TIMESTAMP

-- order_item (one per line)
order_item_id BIGINT, guest_order_id BIGINT, unit_id BIGINT, menu_item_id BIGINT,
quantity INT, unit_price DOUBLE, line_gross_amount DOUBLE, line_net_amount DOUBLE,
line_discount_amount DOUBLE, item_status STRING, waste_flag BOOLEAN, placed_at TIMESTAMP, created_at TIMESTAMP

-- payment
payment_id BIGINT, guest_order_id BIGINT, unit_id BIGINT, tender_type STRING,
amount DOUBLE, settlement_date STRING, paid_at TIMESTAMP, created_at TIMESTAMP

-- status_event (the tracker emits these LIVE)
status_event_id BIGINT, guest_order_id BIGINT, unit_id BIGINT, prior_state STRING,
current_state STRING, event_timestamp TIMESTAMP, elapsed_seconds_in_prior_state INT,
sos_target_seconds INT, is_sos_breach BOOLEAN, created_at TIMESTAMP

-- delivery_order
delivery_order_id BIGINT, guest_order_id BIGINT, unit_id BIGINT, platform_order_reference STRING,
estimated_delivery_seconds INT, actual_delivery_seconds INT, delivery_status STRING, created_at TIMESTAMP
```
Source events already exist: checkout → guest_order + items + payment; order-tracker → status_event; shipping → delivery_order.

## Gotchas
1. **ID namespace collision** — add `source` ('synth'|'live') + `source_order_ref` STRING for the live UUID; mint live surrogate BIGINTs in a reserved range (≥ 9e9) so unions never collide.
2. **Cast in the transform, not on the wire** — OTel attributes often flatten to strings at landing; do `.cast(LongType())`/`to_timestamp()` in the Databricks job (mirror `mvm_pipeline`). Don't fight OTel's type system.
3. **Carry own timestamps as ISO strings** in attributes (`placed_at`, `event_timestamp`) so `event_ts` semantics match synth and survive the collector.

## Roadmap placement
- **v1:** OTel telemetry → Databricks for observability-on-lakehouse (no conformance needed).
- **Enhancement/roadmap:** the bronze `order_events_raw` → conformance job → `live_order_events` → `UNION` view with synth silver (demo-as-producer + bidirectional sync).
