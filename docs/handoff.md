# PizzaTel — Handoff (2026-06-13)

Re-theme of the OpenTelemetry Demo into a Domino's-style pizza shop ("PizzaTel") + migrate selected backends to Databricks. This handoff covers everything built so far and the direction for the next agent.

## TL;DR state
- **Plan 1 (merged to `main`):** data layer — provisioning DAB (`jmrdemo.pizzatel` schema/volume + `pizzatel-seed-export` job), `product-catalog` serves 68 synth-sourced pizzas.
- **Plan 2a (merged to `main`):** full frontend rebrand (palette/brand/banner/footer/header + category images), Cypress journeys.
- **Plan 2b Phase A (on branch `feat/pizzatel-phase2b`):** `order-tracker` Go microservice — Kafka consumer → Valkey state + enriched OTEL spans. **Verified end-to-end.**
- **Research/specs:** `research/pizzatel-otel-databricks_2026-06-11.md` (brainstorm + deep-dives), ADRs in `docs/adr/`, plans in `docs/superpowers/plans/`, prior summaries in `docs/baseline/`.

## What's been DONE
### Plan 1 — pizza data layer (merged)
- `provisioning/` parameterized Databricks Asset Bundle: creates `jmrdemo.pizzatel` schema + `exports` volume + `pizzatel-seed-export` job; seed reads `synth_ref.menu_item` (68) + `synth_ref.unit` (250 stores) → `pizzatel.menu`/`.stores` + a `pizza_menu.json` baked into `product-catalog`.
- `product-catalog/products/products.json` = 68 pizza products (mounted at runtime by compose; NOT baked in the image).

### Plan 2a — rebrand (merged)
- `Theme.ts` PizzaTel palette; titles/banner/footer/header rebranded; original SVG wordmark.
- B2 images: `utils/productImage.ts` category resolver + onError fallback across all 6 image spots; 6 placeholder JPEGs in `image-provider/static/products/`; pizza `Banner.png`.
- Cypress: `pizzatel_smoke.cy.ts`, `pizzatel_journeys.cy.ts` (J1 browse, J2 product, J3+J4 add-to-cart→order). `Home.cy.ts` fixed for 68 products.

### Plan 2b Phase A — order-tracker (branch `feat/pizzatel-phase2b`)
- `src/order-tracker/` Go service: `timeline.go` (stage sampler from synth SOS/prep distributions — carryout ~12m/720s SOS, delivery ~31m/1800s SOS), `state.go` (Valkey JSON state + read-time `CurrentStage`), `consumer.go` (sarama consumer on `orders` topic, **continues the checkout trace** from W3C Kafka headers, emits `order-tracker received order` + `stage: *` spans), `main.go` (OTel+sarama+redis wiring). Dockerfile + wired into both compose files + `.env`.
- Span enriched with **order.skus / order.total_quantity / order.item_count / order.location.{city,state,zip} / order.channel / sos.target_seconds / order.store_id**.

## What's been TESTED
- **Cypress journeys J1–J4: green** (headless, real browser, against the live stack). Screenshots in `src/frontend/cypress/screenshots/`.
- **Phase A end-to-end (full stack):** placed a pizza order → Kafka → order-tracker → Valkey key `tracker:<order_id>` with the full 5-stage schedule → **enriched span landed in `jmrdemo.zerobus.otel_spans`**: `skus=["1 x1"]`, qty=1, location=Mountain View/CA/94043, channel=delivery, sos=1800. Stage spans (`stage: Prep`, …) emit as wall-clock advances.
- **Telemetry parity:** frontend + product-catalog + order-tracker spans/logs landing in Zerobus; provenance `host.name=docker-desktop`, `service.namespace=opentelemetry-demo`.

## GOTCHAS (read before doing anything)
1. **Registry DNS is blocked to 127.0.0.1** for `proxy.golang.org`, `sum.golang.org`, `registry.npmjs.org`, `registry.yarnpkg.com`, `download.cypress.io` host. Use mirrors:
   - Go: `GOPROXY=https://goproxy.io,direct GOSUMDB=off` (build in Docker `golang:1.24.2-alpine`, `apk add git`).
   - npm: `npm ci/install --registry=https://registry.npmmirror.com`.
   - Cypress binary is already cached (`~/Library/Caches/Cypress/15.5.0`).
2. **Docker base pulls intermittently `DeadlineExceeded`.** Pre-pull bases; prefer **`golang:1.24.2-alpine`** (cached) over `golang:1.24-bookworm` (deadlines). Pull `gcr.io/distroless/static-debian12:nonroot` explicitly before Go image builds.
3. **`docker-compose.minimal.yml` has NO kafka** → the order-tracker path needs the **full `docker-compose.yml`**. Minimal is fine for frontend-only testing.
4. **`DATABRICKS_API_TOKEN` expires** (saw an overnight 403 → all collector exports dropped). Refresh it in `.env` then `docker compose ... up -d --force-recreate otel-collector`. ADR 0002: switch to OAuth M2M for Plan 4.
5. **`.env` is uncommitted + holds the live token** (pre-commit secret-scan blocks committing it). `ORDER_TRACKER_DOCKERFILE=./src/order-tracker/Dockerfile` is on-disk (works locally) but NOT committed — a fresh clone needs it added to a sanitized `.env`.
6. **`frontend` + `order-tracker` images are LOCAL builds** (via the mirror), tagged `ghcr.io/open-telemetry/demo:latest-{frontend,order-tracker}`. A fresh environment must rebuild them with the mirror recipe (`docs/superpowers/pizzatel-test-override.yml` + the temp-Dockerfile trick documented in the Plan 2a/2b summaries). `image-provider`'s pizza images + Banner are served via a **mount in the override** because local rebuilds kept deadline-ing; the committed source is correct and CI rebuilds normally.
7. **order-tracker placeholders (Phase D/B TODOs):** `channel` is hardcoded `"delivery"`; `store_id` = the shipping_tracking_id placeholder (not a real store). The per-order `advance` goroutine is in-process (lost on restart) — Valkey + read-time `CurrentStage` is the canonical source, so the UI survives a restart.
8. **Stale e2e specs:** `ProductDetail.cy.ts` + `Checkout.cy.ts` are `describe.skip` with astronomy assumptions — re-theme them when convenient.

## How to run (full stack + tracker)
```bash
cd <repo>; set -a; source .env; set +a
# build local images via mirror if missing (see Plan 2a/2b summaries for the temp-Dockerfile recipe)
docker compose -f docker-compose.yml -f docs/superpowers/pizzatel-test-override.yml up -d
# storefront: http://localhost:8080 ; Jaeger: /jaeger/ui ; Grafana: /grafana
# verify tracker: docker exec valkey-cart redis-cli --scan --pattern 'tracker:*'
```
(opensearch is slow to go healthy on first `up` — re-run `up -d` once it's healthy if dependents abort.)

## NEXT DIRECTION
**Plan 2b remaining** (`docs/superpowers/plans/2026-06-13-pizzatel-phase2b-tracker.md`):
- **Phase B:** instrumented BFF `/api/order-status` (reads Valkey; code in the plan). Needs `redis` npm dep + `VALKEY_ADDR` in the frontend env.
- **Phase C:** the 5-stage tracker UI on `pages/cart/checkout/[orderId]` polling `/api/order-status` (component code in the plan). **This is the visible payoff** — the tracker currently has NO UI yet.
- **Phase D:** store picker (decided: option A — grouped dropdown from a baked `stores.json`; auto-nearest is roadmap). Thread real `store_id` (and ideally `order_type`/channel) from checkout into the order so the tracker stops using placeholders.
- **Phase E:** imagery upgrade — **see `docs/baseline/menu-imagery-plan.md`** (the user flagged menu images as critical for look-and-feel; current images are functional placeholder tiles, not appetizing).

**Roadmap (post-2b):** address→auto-nearest store routing (haversine via `us_locations` centroids in `shipping`); trajectory/lifecycle-template tracker sampling; OTel→`order_events` write-back (demo-as-producer); **Plan 4** Databricks migrations — recommendation→Feature/Model Serving (the flagship, with the reusable serving-call wrapper) + Postgres→Lakebase. Fix `otel_spans` export robustness / OAuth M2M.

**The reusable Databricks-serving-wrapper** (rich client span + flag-gated offline fallback + cold-start/fallback attrs) is the single highest-leverage piece for Plan 4 — build it once for recommendation, reuse for ad/accounting.
