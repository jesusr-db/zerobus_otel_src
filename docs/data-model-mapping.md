# PizzaTel data-model mapping

Maps the canonical synthData entities (verified live 2026-06-12 — see `docs/baseline/synth-verification.md`) to PizzaTel demo concepts. Drives Phases 1–4.

| Data-model entity | Live table | Demo concept | Notes |
|---|---|---|---|
| menu item | `jmrdemo.synth_ref.menu_item` (68 rows) | Product-catalog menu (pizzas/sides/drinks/desserts) | id=`menu_item_id`; name=**`item_name`**; categories=`[category, subcategory]`; price=`base_price`. Keep `active`+`lto`. |
| store / unit | `jmrdemo.synth_ref.unit` (250 rows) | Store + delivery zone / locator | `unit_name, city, state, lat, lon, metro_area`; drives checkout store selection (Plan 2). |
| guest profile | `jmrdemo.synth_staging.guest_events` ✅ | Customer persona | PII column-masked; `member_id`→loyalty. |
| loyalty | `jmrdemo.synth_staging.loyalty_events` ✅ | Tier/points (Plan 4 feature) | bronze/silver/gold/elite. |
| order lifecycle | `jmrdemo.synth_staging.order_events` ✅ (status_event rows) | Pizza tracker timeline (Plan 2) | VERIFIED 2026-06-12: `prior_state, current_state, event_timestamp, elapsed_seconds_in_prior_state` present. |
| SOS target | `order_events.sos_target_seconds` ✅ + `is_sos_breach` | Tracker promise-time / SLA | 720 carryout / 1800 delivery. |
| delivery | `order_events` `estimated/actual_delivery_seconds` ✅ | Tracker delivery leg (Plan 2) | est-vs-actual "running late". |
| inventory | `jmrdemo.synth_staging.inventory_events` ✅ | 86'd items / faults (Plan 3) | `quantity_on_hand`, `par_level`. |

✅ = column-verified against the live catalog 2026-06-12 (synth_staging tables: guest/inventory/loyalty/order/workforce_events; `order_events` columns match the data-model exactly).
| **live telemetry** | `jmrdemo.zerobus.otel_logs/metrics/spans` + `zerobus_sdp.*` | Observability-on-lakehouse + demo-as-producer round-trip | **Already wired.** logs/metrics flowing; **spans=0 (gap)**. |

## Gaps / drift (from Task 0.3)
1. **`item_name` not `name`** — corrected in seed transform; the brief's `synth_skus` does not exist (use `synth_ref.menu_item`).
2. **`zerobus.otel_spans` = 0 rows** — traces not landing in Databricks though logs+metrics are. Fix collector span export before relying on a Databricks trace-view demo beat. Not a Plan 1 blocker.
3. Bonus `menu_item` columns (`cost`, `daypart`, `is_*_available`) and `unit` geo (`lat/lon/metro_area`) available for Plans 2–4 (margin, lunch menu, channel gating, store locator).
