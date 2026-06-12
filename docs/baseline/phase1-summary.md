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
  - **product-catalog spans = 312** in Zerobus (verified by fresh time-filtered query), broken down by status:
    - `ListProducts` — **31, clean** (the pizza menu loads + traces). This is the core parity signal. ✅
    - `GetProduct` — **124 OK + 157 ERROR.** The 124 OK are valid pizza product fetches (frontend pulling real menu IDs); the 157 ERROR are `NotFound` (`main.go:346`) from the load-generator still requesting hardcoded astronomy IDs (S1, Plan 3). So browse is *partially* working, not fully broken.
  - product-catalog logs in Zerobus = 168 rows. Telemetry round-trip to Databricks confirmed.

### Provenance — confirmed the telemetry is OUR containers, not another source
The `zerobus.*` tables are shared (150k+ historical rows), so provenance was verified, not assumed:
- product-catalog spans' resource attributes: `host.name = docker-desktop`, `service.namespace = opentelemetry-demo`, `telemetry.sdk.language = go` → our local Docker stack.
- The **entire** spans table (3,864; **0 before this run**) is exactly our 10 launched services (frontend, frontend-proxy, load-generator, cart, product-catalog, recommendation, checkout, ad, flagd, image-provider), all timestamped **19:13–19:20** (the run window).
- Caveat: the endpoint/token are shared, so a simultaneous identical demo elsewhere can't be cryptographically excluded — but the 0-span baseline + exact window + exact service set make it effectively certain to be our run.

### Demo design note — keep curated errors on purpose
The 157 `GetProduct` NotFound spans are currently *accidental* (S1 stale load-gen IDs), but **intentional, curated errors are valuable for the observability demo**. When Plan 3 re-themes the load generator and flagd faults, do NOT zero out all errors — preserve a tasteful, explainable error/fault signal (e.g. an "out-of-stock pizza" 404, a re-themed `productCatalogFailure`/"oven outage", a delivery-surge latency spike) so the trace/error views have a story to tell. Replace accidental noise with deliberate, narratable faults rather than eliminating errors entirely.

## Notable findings
- **S3 (otel_spans=0) RESOLVED empirically:** spans DO land in Zerobus (3,248) when a properly-wired collector runs. The earlier 0 was absence of an exporting collector, not a broken ingestion path.
- **Pre-existing bug in `docker-compose.minimal.yml`:** its otel-collector service is stale — it mounts the Databricks `otelcol-config-extras.yml` (references `${env:DATABRICKS_*}`) but doesn't pass those vars, so the collector crash-loops. The MAIN `docker-compose.yml` wires it correctly (lines 827-831). Worked around in `docs/superpowers/pizzatel-test-override.yml` (env passthrough). Consider upstreaming a fix to minimal.yml.
- **Go vet:** fixed two pre-existing non-constant-format-string errors in `product-catalog/main.go` (surfaced by `go test`).

## Known Plan-1-boundary state (tracked in phase0-risk-register.md)
- B2 (pizza images 404 — Plan 2 UI), B3 (`productCatalogFailure` fault dead until re-pointed — Plan 3), S1 (load-gen hardcodes astronomy IDs → GetProduct 404s — Plan 3).

## B2 (Phase-1 review) — RESOLVED, was a misdiagnosis
The review assumed `products.json` is baked into the image (`COPY ./src/product-catalog/products/ products/`). It is NOT: that COPY is in the **builder** stage only; the final image (`COPY --from=builder /usr/src/app/product-catalog/ ./`) contains **only the 17MB binary** — verified by exporting the prebuilt `ghcr.io/open-telemetry/demo:latest-product-catalog` (no `products/` dir present). The runtime gets the menu from a **compose volume mount** that BOTH `docker-compose.yml` and `docker-compose.minimal.yml` already declare:
`- ./src/product-catalog/products:/usr/src/app/products`.
So `products.json` is runtime-mounted config — changing the menu never needs an image rebuild, and the integration test exercised the real runtime path. (The product-catalog mount in `pizzatel-test-override.yml` was therefore redundant with the base compose; its only needed content was the collector env fix.)

**From-source build confirmed clean:** a real build via a temp Dockerfile (injecting a reachable GOPROXY, since proxy.golang.org is DNS-blocked here) ran `go mod download` + `go build` successfully with the two `%s` vet fixes — proving the build compiles. No baked-image gap remains.

## Acceptance: ✅ MET
catalog returns pizza; dependents start + serve; traces still span frontend → product-catalog (verified in Zerobus). Telemetry parity-or-better.
