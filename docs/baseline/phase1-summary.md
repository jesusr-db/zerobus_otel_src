# Phase 1 summary — pizza data layer live + telemetry verified (2026-06-12)

## What shipped
- **Provisioning bundle** (`provisioning/`, parameterized DAB) deployed to the Azure workspace: created `jmrdemo.pizzatel` schema + `exports` volume + `pizzatel-seed-export` serverless job.
- **Seed export ran:** `jmrdemo.pizzatel.menu` = **68 rows**, `jmrdemo.pizzatel.stores` = **250 rows**, exported `/Volumes/jmrdemo/pizzatel/exports/pizza_menu.json`.
- **product-catalog re-themed:** `products.json` replaced with 68 synth-sourced pizza products (proto-shaped). gRPC contract unchanged.
- Tested transform (`pytest` 2/2) + Go catalog test (`go test` PASS, run via Docker due to local Go-proxy DNS block).

## Integration test (docker-compose.minimal.yml + pizzatel-test-override.yml)
Pizza menu mounted into the prebuilt product-catalog image (no Go rebuild). Results:
- **Storefront API** `GET /api/products` → **68 pizza products** (e.g. "Large Hand-Tossed Pepperoni", categories `[pizza, pepperoni]`).
- **Dependents functionally clean:** recommendation + checkout had **0** product/gRPC resolution errors (new numeric pizza IDs resolve). The only errors were `otel-collector:4317 UNAVAILABLE` telemetry-export blips during the collector restart — not functional.
- **Telemetry parity (verified in Databricks Zerobus, not Jaeger — this collector routes traces to `[spanmetrics, otlphttp/traces→Databricks]`):**
  - `zerobus.otel_logs` 153,276 → **154,297**; `otel_metrics` 132,676 → **148,047**; `otel_spans` **0 → 3,248**.
  - **product-catalog spans = 285** in Zerobus: `ProductCatalogService/GetProduct` (257) + `ListProducts` (28) → frontend→product-catalog tracing intact with the pizza menu.
  - product-catalog logs in Zerobus = 168 rows. Full telemetry round-trip to Databricks confirmed.

## Notable findings
- **S3 (otel_spans=0) RESOLVED empirically:** spans DO land in Zerobus (3,248) when a properly-wired collector runs. The earlier 0 was absence of an exporting collector, not a broken ingestion path.
- **Pre-existing bug in `docker-compose.minimal.yml`:** its otel-collector service is stale — it mounts the Databricks `otelcol-config-extras.yml` (references `${env:DATABRICKS_*}`) but doesn't pass those vars, so the collector crash-loops. The MAIN `docker-compose.yml` wires it correctly (lines 827-831). Worked around in `docs/superpowers/pizzatel-test-override.yml` (env passthrough). Consider upstreaming a fix to minimal.yml.
- **Go vet:** fixed two pre-existing non-constant-format-string errors in `product-catalog/main.go` (surfaced by `go test`).

## Known Plan-1-boundary state (tracked in phase0-risk-register.md)
- B2 (pizza images 404 — Plan 2 UI), B3 (`productCatalogFailure` fault dead until re-pointed — Plan 3), S1 (load-gen hardcodes astronomy IDs — Plan 3). GetProduct spans present suggests the frontend drives valid product fetches regardless.

## Acceptance: ✅ MET
catalog returns pizza; dependents start + serve; traces still span frontend → product-catalog (verified in Zerobus). Telemetry parity-or-better.
