# Phase 0 risk register (adversarial review, 2026-06-12)

Output of an adversarial "did we miss anything" review of Phase 0, with dispositions.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| B1 | BLOCKER | Task 1.7 parity gate referenced `docs/baseline/services.txt`, produced only by the deferred Task 0.2. No stock baseline → "parity" had no reference. | **FIXED in plan.** 1.7 now derives the expected service set from `docker compose config --services` (static, no stock bring-up) and scopes trace-parity to `product-catalog ListProducts` spans. Full 0.2 stack baseline is now optional/nice-to-have, not a gate dependency. |
| B2 | BLOCKER (Plan 2) | Seed transform emits `picture = pizza-{id}.jpg`; images are served by `image-provider` from `src/image-provider/static/products/` (astronomy filenames only). Every pizza image 404s. | **Deferred to Plan 2 (UI layer).** Plan 1 is data-only and renders no UI. Plan 2 must provision pizza images keyed to `menu_item_id` OR add a frontend fallback. Transform keeps `pizza-{id}.jpg` as a forward reference. Tracked as Plan 2 task. |
| B3 | BLOCKER (parity) | `product-catalog/main.go:385` hardwires the `productCatalogFailure` fault to `OLJCESPC7Z`; that ID disappears after re-theme → teaching fault dies silently. | **Deferred to Plan 3 (fault re-theme).** Documented coupling. Plan 3 re-points `checkProductFailure` to a real pizza `menu_item_id`. |
| S1 | SHOULD-FIX | `load-generator` hardcodes astronomy product IDs → browse/view traffic 404s after re-theme; 1.7 trace counts could pass while browse traffic is broken. | **Scoped.** 1.7 parity check limited to `ListProducts`. Load-gen product list re-themed in Plan 3. Documented as a known Plan-1-boundary state. |
| S2 | SHOULD-FIX | `synth_staging` not verified against live catalog; mapping doc asserted repo-derived names. | **✅ RESOLVED 2026-06-12.** Live verify: tables = guest/inventory/loyalty/order/workforce_events; `order_events` columns match the data-model exactly (status_event + delivery + sos fields). Mapping doc updated to VERIFIED. |
| S3 | SHOULD-FIX | `zerobus.otel_spans=0` documented but unowned/un-rootcaused; ADR 0001 consequence depends on it. | **Tracked** here as an explicit follow-up (below). ADR 0001 softened so the spine does not depend on it. |
| S4 | SHOULD-FIX | Seed source (`synth_ref/staging/zerobus`) exists ONLY in the `jmrdemo` Azure workspace; bundle catalog/schema params are portable but the source data is not. | **Documented.** The `pizzatel_seed` snapshot is reframed (ADR 0003) as the actual portability mechanism for other (e.g. AWS FEVM) workspaces, not just drift protection. |
| S5 | SHOULD-FIX | Task 1.5 used `databricks fs cp dbfs:/Volumes/...`; inconsistent with the notebook's `/Volumes/...` write path. | **FIXED in plan.** Aligned the download path; verify against installed CLI before running. |
| N1 | NICE | No compute/warehouse availability noted for the Spark seed job. | Serverless warehouse `d56091a1171f30ff` confirmed RUNNING during 0.3; seed job uses serverless. Noted. |
| N2 | NICE | ADR 0002 scale-to-zero/teardown unverified on Azure. | Revisit at Plan 4 (Lakebase/serving) where it becomes testable. |
| N3 | NICE | `item_status`/channel flags exported but not surfaced to Product. | Intentional for Plan 1; available for Plan 3 (86'd items). Noted in mapping doc. |

## Open follow-up: `zerobus.otel_spans = 0`
- **Hypothesis:** collector span pipeline not exporting to the Zerobus span sink (logs+metrics pipelines are), OR sampling, OR the span ingestion endpoint differs.
- **Owner:** TBD (not a Plan 1 blocker — Plan 1 touches no telemetry config).
- **Verification after fix:** `SELECT count(*) FROM jmrdemo.zerobus.otel_spans` > 0.
- **Impact if unfixed:** the "see your trace in Databricks" demo beat (Plan 4) is unavailable; logs/metrics-on-lakehouse still work.
