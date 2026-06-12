# Phase 0 risk register (adversarial review, 2026-06-12)

Output of an adversarial "did we miss anything" review of Phase 0, with dispositions.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| B1 | BLOCKER | Task 1.7 parity gate referenced `docs/baseline/services.txt`, produced only by the deferred Task 0.2. No stock baseline → "parity" had no reference. | **FIXED in plan.** 1.7 now derives the expected service set from `docker compose config --services` (static, no stock bring-up) and scopes trace-parity to `product-catalog ListProducts` spans. Full 0.2 stack baseline is now optional/nice-to-have, not a gate dependency. |
| B2 | BLOCKER (Plan 2) | Seed transform emits `picture = pizza-{id}.jpg`; images are served by `image-provider` from `src/image-provider/static/products/` (astronomy filenames only). Every pizza image 404s. | **Deferred to Plan 2 (UI layer).** Plan 1 is data-only and renders no UI. Plan 2 must provision pizza images keyed to `menu_item_id` OR add a frontend fallback. Transform keeps `pizza-{id}.jpg` as a forward reference. Tracked as Plan 2 task. |
| B3 | BLOCKER (parity) | `product-catalog/main.go:385` hardwires the `productCatalogFailure` fault to `OLJCESPC7Z`; that ID disappears after re-theme → teaching fault dies silently. | **Deferred to Plan 3 (fault re-theme).** Documented coupling. Plan 3 re-points `checkProductFailure` to a real pizza `menu_item_id`. |
| S1 | SHOULD-FIX | `load-generator` hardcodes astronomy product IDs → browse/view traffic 404s after re-theme; 1.7 trace counts could pass while browse traffic is broken. | **Scoped.** 1.7 parity check limited to `ListProducts`. Load-gen product list re-themed in Plan 3. Documented as a known Plan-1-boundary state. |
| S2 | SHOULD-FIX | `synth_staging` not verified against live catalog; mapping doc asserted repo-derived names. | **✅ RESOLVED 2026-06-12.** Live verify: tables = guest/inventory/loyalty/order/workforce_events; `order_events` columns match the data-model exactly (status_event + delivery + sos fields). Mapping doc updated to VERIFIED. |
| S3 | SHOULD-FIX | `zerobus.otel_spans=0` documented but unowned/un-rootcaused; ADR 0001 consequence depends on it. | **✅ RESOLVED 2026-06-12 (Phase 1 integration).** Spans DO land in Zerobus (0 → 3,248, incl. 285 product-catalog spans) once a properly-wired collector runs. The 0 was absence of an exporting collector, not a broken ingestion path. ADR 0001 stays appropriately softened. |
| S4 | SHOULD-FIX | Seed source (`synth_ref/staging/zerobus`) exists ONLY in the `jmrdemo` Azure workspace; bundle catalog/schema params are portable but the source data is not. | **Documented.** The `pizzatel_seed` snapshot is reframed (ADR 0003) as the actual portability mechanism for other (e.g. AWS FEVM) workspaces, not just drift protection. |
| S5 | SHOULD-FIX | Task 1.5 used `databricks fs cp dbfs:/Volumes/...`; inconsistent with the notebook's `/Volumes/...` write path. | **FIXED in plan.** Aligned the download path; verify against installed CLI before running. |
| N1 | NICE | No compute/warehouse availability noted for the Spark seed job. | Serverless warehouse `d56091a1171f30ff` confirmed RUNNING during 0.3; seed job uses serverless. Noted. |
| N2 | NICE | ADR 0002 scale-to-zero/teardown unverified on Azure. | Revisit at Plan 4 (Lakebase/serving) where it becomes testable. |
| N3 | NICE | `item_status`/channel flags exported but not surfaced to Product. | Intentional for Plan 1; available for Plan 3 (86'd items). Noted in mapping doc. |

## Phase-1 close-out adversarial review (2026-06-12)
| ID | Severity | Finding | Disposition |
|---|---|---|---|
| P1-B1 | BLOCKER | `databricks bundle destroy` would FAIL: the seed notebook creates tables inside `pizzatel` schema (non-empty), and the schema lacked `force_destroy`. Paired teardown (automation standard) was broken. | **PARTIAL:** added `force_destroy: true` to `pizzatel_schema`, but the installed CLI emits `Warning: unknown field: force_destroy` and may ignore it. README now documents the manual drop-then-destroy fallback. Full robustness (a destroy notebook/job that empties the schema) deferred to Plan 4 when Lakebase/serving make teardown non-trivial. |
| P1-B2 | BLOCKER (verification) | Pizza menu proven only via runtime MOUNT into the prebuilt image; `docker compose build product-catalog` from source never run (Go proxy DNS-blocked). | **✅ RESOLVED — was a misdiagnosis.** `products.json` is NOT baked: the prebuilt image contains only the binary (verified via `docker export`); the runtime menu comes from a compose volume mount that BOTH compose files already declare. So the mount IS the real runtime path. Separately, a from-source build (temp Dockerfile + reachable GOPROXY) compiled clean with the `%s` fixes. No rebuild ever needed for menu changes. |
| P1-B3 | BLOCKER (hygiene) | Load-bearing `docker-compose.yml` collector-env passthrough is UNCOMMITTED in the working tree (pre-existing user change); stray `otelcol-config-extras.yml.bak`. | **ESCALATED to user** — their pre-existing change; commit-or-revert decision pending. |
| P1-S1 | SHOULD-FIX | phase1-summary claimed 257 GetProduct spans = "browse works". They are `NotFound` error spans (load-gen astronomy IDs). | **FIXED:** corrected summary; parity rests on the 28 ListProducts spans. |
| P1-S3 | SHOULD-FIX | README `--var=catalog=…` portability omits that `synth_ref.*` source data exists only in the `jmrdemo` Azure workspace. | **FIXED:** README caveat added. |

## Open follow-up: `zerobus.otel_spans = 0`
- **Hypothesis:** collector span pipeline not exporting to the Zerobus span sink (logs+metrics pipelines are), OR sampling, OR the span ingestion endpoint differs.
- **Owner:** TBD (not a Plan 1 blocker — Plan 1 touches no telemetry config).
- **Verification after fix:** `SELECT count(*) FROM jmrdemo.zerobus.otel_spans` > 0.
- **Impact if unfixed:** the "see your trace in Databricks" demo beat (Plan 4) is unavailable; logs/metrics-on-lakehouse still work.
