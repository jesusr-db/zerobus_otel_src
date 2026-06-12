# synth_* catalog verification (Phase 0, Task 0.3)

Verified 2026-06-12 against the DEFAULT profile.

## DEFAULT profile target
- Host: `https://adb-7405605519549535.15.azuredatabricks.net` (**Azure** Databricks)
- User: `jesus.rodriguez@databricks.com`
- Auth: `databricks-cli` (OAuth); account `f9ba5888-…`, workspace `7405605519549535`

## Schemas in `jmrdemo`
`bronze, content, control_tower, crust_store_ops, default, gold, information_schema, internal, silver, synth_metrics, synth_ref, synth_silver, synth_staging, zerobus, zerobus_sdp`

## `synth_ref` tables (reference / seed source — read-only)
`financial_period, franchisee, item_price, local_events, menu_item, recipe_ingredient, supplier, unit, weather_conditions`

### `synth_ref.menu_item` — 68 rows (item_status: active=62, lto=6)
Columns: `menu_item_id LONG, item_name STRING, category STRING, subcategory STRING, base_price DOUBLE, cost DOUBLE, daypart STRING, item_status STRING, is_3pd_available BOOLEAN, is_olo_available BOOLEAN, is_delivery_available BOOLEAN, is_carryout_available BOOLEAN`

⚠️ **DRIFT vs plan/brief:** the name column is **`item_name`**, not `name`. The brief's `synth_skus` does not exist — the menu table is `synth_ref.menu_item`. Seed transform updated to use `item_name`.
Bonus columns available for later phases: `cost` (margin story), `daypart` (lunch menu), `is_*_available` (channel gating), keep both `active` + `lto` items.

### `synth_ref.unit` — 250 rows (stores)
Columns: `unit_id LONG, unit_name STRING, city STRING, state STRING, lat DOUBLE, lon DOUBLE, metro_area STRING, district_id LONG, region_id LONG, franchisee_id LONG, format STRING, unit_volume_bias DOUBLE, is_franchise BOOLEAN, status STRING, market_price_index DOUBLE`
(Has lat/lon + metro_area → real delivery-zone / store-locator data.)

## `synth_staging` (live generated events) — VERIFIED 2026-06-12
Tables: `guest_events, inventory_events, loyalty_events, order_events, workforce_events`.
`order_events` (wide event table, `event_type` discriminator) column-verified against the live catalog — matches the data-model exactly, including the tracker-critical fields:
`event_type, guest_order_id, unit_id, channel, order_type, order_status, profile_id, member_id, subtotal, total_amount, placed_at, ready_at, fulfilled_at, cancelled_at, sos_breach, menu_item_id, quantity, unit_price, prior_state, current_state, event_timestamp, elapsed_seconds_in_prior_state, sos_target_seconds, is_sos_breach, estimated_delivery_seconds, actual_delivery_seconds, delivery_status, tender_type, paid_at, …`
→ Plan 2 (tracker) contract confirmed against live data, not just the repo.

## 🔑 `zerobus` — live OTel telemetry ALREADY landing in Databricks
The otel-collector is already exporting to Databricks via Zerobus (this is the "otel config already configured" the user referenced).

| Table | Rows (2026-06-12) | Notes |
|---|---|---|
| `jmrdemo.zerobus.otel_logs` | **150,877** | flowing |
| `jmrdemo.zerobus.otel_metrics` | **131,210** | flowing |
| `jmrdemo.zerobus.otel_spans` | **0** ⚠️ | **traces NOT landing yet** — investigate collector span exporter |

`jmrdemo.zerobus_sdp` (Spark Declarative Pipeline processed): `cc_logs, cc_logs_synced, cc_spans, cc_spans_synced, otel_logs_pg, otel_metrics_pg, otel_spans_pg` (`_pg`/`_synced` = Lakebase-synced variants).

`zerobus.otel_spans` schema (standard OTLP): `trace_id, span_id, trace_state, parent_span_id, flags, name, kind, start_time_unix_nano, end_time_unix_nano, attributes MAP, events ARRAY, links ARRAY, status STRUCT, resource STRUCT, instrumentation_scope STRUCT, …`

### Implications
- The **OTel→Databricks landing** treated as roadmap in the research doc **already exists** (`zerobus.otel_*` + `zerobus_sdp`). The demo-as-producer round-trip is partially wired.
- **`otel_spans` = 0 is a real gap** — logs + metrics land but traces don't. Before leaning on a "see your trace in Databricks" demo beat, fix the collector's span export to Zerobus. Tracked as a follow-up (not a Plan 1 blocker — Plan 1 touches no telemetry).
- We still create `jmrdemo.pizzatel.*` for demo-owned curated/seed tables (never writing into `synth_*` or `zerobus`).
