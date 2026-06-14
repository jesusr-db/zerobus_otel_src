# Phase 2b summary — pizza tracker live (BFF + UI) + telemetry verified (2026-06-14)

Phases B (BFF) and C (tracker UI) of Plan 2b, built on branch `feat/pizzatel-phase2bc-tracker-ui` (off Phase A's `order-tracker` service). Executed via subagent-driven development: implementer → spec review → code-quality review → fixes per task, then an adversarial review of the combined change.

## What shipped
- **Phase B1 — `/api/order-status` BFF endpoint** (`src/frontend/pages/api/order-status.ts`): OTel-instrumented Next.js route. Reads `tracker:{orderId}` from Valkey, computes the current stage at **read-time** (survives restarts, no server timer), returns `{orderId, channel, currentStage, stages[], sosTargetSeconds, elapsedSeconds}` — or `{status:'pending', stages:[]}` before the tracker key exists. TS `OrderState`/`Schedule`/`Stage` types + `currentStage()` mirror the Go source (`src/order-tracker/state.go`, `timeline.go`) field-for-field (verified: no contract drift).
- **Phase C1 — `OrderTracker` component** (`src/frontend/components/OrderTracker/`): polls `/api/order-status` every 3s, renders a 5-stage horizontal stepper (Prep → Bake → Quality Check → Out for Delivery → Delivered, or → Ready for Pickup for carryout) on the order-confirmation page with the current stage highlighted and an SOS-breach note. Stops polling at terminal stages.
- **`redis` dep** added to the frontend (via npmmirror); `VALKEY_ADDR` wired into both compose files' frontend service.

## Integration test (full `docker-compose.yml` stack — Kafka required; minimal.yml has no Kafka)
Placed a real order through the BFF (`/api/cart` → `/api/checkout`, product `1` ×2, delivery to Mountain View):
- **Kafka → order-tracker → Valkey:** `tracker:c287983d-…` written with the full 5-stage delivery schedule (SOS 1800s, Bake@568s, QualityCheck@1136s, OutForDelivery@1421s, Delivered@2394s). ✅
- **BFF read path:** `GET /api/order-status?orderId=…` → `currentStage:"Prep"` at 35s elapsed (correct — Bake isn't until +568s), full stages array, `sosTargetSeconds:1800`. ✅
- Bogus orderId → `{status:'pending', stages:[]}` (200); missing orderId → 400; non-GET → 405. ✅

### Telemetry into Databricks (`jmrdemo.zerobus.*` — this collector routes to Databricks, **not** Jaeger; Jaeger storage is empty here)
- **order-tracker spans landed** in `otel_spans`: `order-tracker received order` ×1, `stage: Prep` ×1 (later stage spans emit as wall-clock advances).
- **Trace continuation verified:** the `order-tracker received order` span has `parent_span_id=da873416…` → it is a **child of the checkout trace** (W3C trace context propagated through Kafka message headers works).
- **Enriched attributes present:** `order.channel=delivery`, `sos.target_seconds=1800`, `order.location.city=Mountain View`, `order.skus=["1 x2"]` (matches the placed order).
- **All three signals flowing** (last 10 min, after token refresh): `otel_spans` +3,548 · `otel_logs` +3,206 · `otel_metrics` +52,073.

## Adversarial review outcome
Verdict FIX-FIRST. All prior per-task review fixes confirmed resolved; no Go/TS contract drift. Findings addressed in commit `7dbb2bd`:
- **(Important) Carryout breach banner:** `breached` only excluded `Delivered`; carryout terminates at `ReadyForPickup`, so ~50% of completed carryout orders showed "Running a little behind…" forever. Fixed to exclude both terminal stages (hoisted `TERMINAL_STAGES`).
- **(Minor) `next.config.js` footgun:** removed the vestigial `VALKEY_ADDR` from the `env:` block (it baked a build-time `''` that would shadow runtime member-access reads); runtime destructuring in the BFF is the source of truth.
- **(Minor) `encodeURIComponent(orderId)`** in the poll URL.
- **(Minor) BFF JSON guard:** valid-but-incomplete Valkey JSON now returns the pending shape instead of an unhandled 500.
- **(Minor) compose:** `frontend` now `depends_on: valkey-cart`.

## The `VALKEY_ADDR` build-inlining bug (caught by live verification)
Initial endpoint read `process.env.VALKEY_ADDR` via member access. Next.js inlines member accesses listed in the next.config `env:` block at **build time**, where `.env` is absent in the Docker build context → it baked `redis://` (empty host) → the endpoint 504'd. Fixed by destructuring `const { VALKEY_ADDR = '' } = process.env` (matches the `*_ADDR` gateway convention; resolves from the container runtime env). Commit `3b65b89`, verified live.

## Known limitations / deferred (roadmap, not in 2b-B/C)
- **UX cliff:** if `order-tracker` never writes the key (crash/Kafka lag), the page shows "Starting your order…" indefinitely with no timeout/error. Acceptable for the demo; a timeout state is a roadmap polish item.
- **`store_id` / `channel` are placeholders** (channel hardcoded `delivery`; store_id = shipping_tracking_id) until **Phase D** threads a real store picker + order_type through checkout.
- The per-order `advance` goroutine is in-process (lost on restart) — but Valkey + read-time `CurrentStage` is canonical, so the UI survives a tracker restart.
- **Phase E imagery** was already addressed ahead of this work with real CC-licensed per-variety photos (better than the planned SVGs).

## Environment notes (gotchas hit this run)
- **Docker VM disk filled to 100%** after an ~18h run → Kafka crash-looped with `InternalError: unsafe memory access` / `No space left on device` (mmap SIGBUS on its KRaft log). Freed 16.65 GB build cache (`docker builder prune`), recreated Kafka clean.
- **`DATABRICKS_API_TOKEN` expired** (collector 403 on all exports). Refreshed in `.env` + `docker compose up -d --force-recreate otel-collector`. ADR 0002: move to OAuth M2M.
- Frontend is a **local image build** via the npm mirror (`registry.npmjs.org` is DNS-blocked to 127.0.0.1). Recipe: a temp `Dockerfile.mirror-buildtest` setting `ENV npm_config_registry=https://registry.npmmirror.com`, built with `--network=host` (deleted after use; CI rebuilds normally).
