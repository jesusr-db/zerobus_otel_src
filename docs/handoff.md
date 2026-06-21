# Handoff for Next Agent — opentelemetry-demo

**As of**: 2026-06-19 ~02:30 UTC
**Branch / HEAD**: `feat/agentic-commerce-chatbot` @ `55fe91a feat(agent): record proposed item ids/names on the BFF span` — **NOT pushed** (no upstream)

> Single canonical handoff. Detail lives behind §4 pointers, not inlined.

## §1 — Launchpad (act on this first)

- **State**: `feat/agentic-commerce-chatbot` **merged to `main`** (no-ff). On branch `fix/verify-order-otel-pipeline`. `main` is **31 commits ahead of `origin/main`** — still **not pushed**.
- **Next actions**:
  1. **Push `main` to `origin`** (closes the long-standing "main unpushed" issue). The chatbot feature is merged.
  2. **Order→OTel→app pipeline: VERIFIED & FIXED 2026-06-19** (see §2a). Root cause of stale app data was the `pizza_rt_refresh` schedule being **PAUSED** — now UNPAUSED at every-5-min. ⚠️ **Durable follow-up**: persist the unpause in the `otel_pizza` bundle's job YAML, or a `bundle deploy` reverts it to PAUSED.
  3. **OTel logs/exports 403 — ROOT-CAUSED & FIXED 2026-06-20** (see §2c). It was never logs-specific: `docker-compose.yml` passed the collector creds as **bare passthrough** (`- DATABRICKS_API_TOKEN`) which reads the **shell, not `.env`**, so the collector drifted to a stale/empty token → 403 on all signals. Fixed to `- VAR=${VAR}` interpolation; validated clean-shell recreate → 0 403s, traces+demo-logs+metrics all landing. Branch `fix/otel-logs-403`.
  4. **Chatbot agent token — FIXED 2026-06-21** (see §2d). `AGENT_API_TOKEN` in `docker-compose.override.yml` was a 1-hour OAuth U2M JWT, expired 61h → serving endpoint 403 "Invalid Token" → BFF "assistant unavailable" fallback. Swapped in a **90-day PAT (expires 2026-09-19)**, recreated `frontend`; verified 2-turn journey (reply + proposal card) works. ⚠️ **Durable follow-up = OAuth M2M** (service principal + `client_credentials` refresh in `Agent.service.ts`) — this is the 3rd token-expiry outage; see ADR 0002.
  5. **MLflow tracing — NOW LIVE 2026-06-21** (model team enabled in-serving tracing). Agent returns real `custom_outputs.mlflow_trace_id` (no more `MLFLOW_NO_OP_SPAN_TRACE_ID` sentinel) → BFF auto-stamps `agent.mlflow.trace_id` on OTel spans → **trace-stitch is join-able**. Traces in MLflow experiment **`3025255582876496`** (`/Shared/qsr-commerce-agent-traces`); inference table **`jmrdemo.synth_silver.commerce_agent_payload_payload`** also enabled (req/resp payloads, async-batch lag). Verified end-to-end: real trace id on spans + trace retrievable from backend. Three correlated layers now: OTel spans (zerobus) + MLflow traces + per-order tracker.
  6. ⚠️ **OPEN (model team): `propose_order` divergence RECURS** (2026-06-21 journeys). Asking for Large Pan MeatZZa (id 4) → wrong id 4/5 runs (13/10/2003); Pepperoni/Cheese map correctly. Re-flagged in the contract ledger; details in `docs/journey-test-results-2026-06-21.md`. For demos, stick to Pepperoni/Cheese.
  7. pizza-rt-app demo segment can only be captured in **your own Chrome** (Okta wall) — `library/pizzatel-agent-order-journey-local.gif` is the storefront half.
- **Landmines**: **ONE shared 90-day PAT (exp 2026-09-19)** now powers BOTH the OTel collector export (`.env` `DATABRICKS_API_TOKEN`) and the chatbot agent endpoint (`AGENT_API_TOKEN` in `docker-compose.override.yml`) — consolidated 2026-06-21. When it expires, BOTH break (OTel exports 403 + chatbot "unavailable"); rotate in one place each: `.env` and `override.yml`, then recreate `otel-collector` + `frontend`. Don't commit `.env`/`override.yml` (gitignored). · Refresh schedule lives in the `otel_pizza` bundle — redeploy may re-pause it.

## §2a — Order→OTel→app pipeline verification (2026-06-19)

Placed a real test order via curl (`POST /api/cart` then `POST /api/checkout` on `localhost:8080`) and traced it through every boundary:
- **B1 collector→Databricks (traces)**: healthy at the time — 0 trace-export errors (the broader 403 issue is root-caused in §2c).
- **B2 `jmrdemo.zerobus.otel_spans`**: order's 4 spans landed in ~30s (`CheckoutService/PlaceOrder`, `order-tracker received order`, `stage: Prep`, `send_order_confirmation`). Fresh to the minute.
- **B3 assembly**: **no `zerobus_sdp` pipeline exists** — `pizza_rt_refresh` (job `417359879058803`, notebook `src/rt_refresh`, bundle `otel_pizza/dev`) reads `otel_spans` directly (params `raw_schema=zerobus`,`rt_schema=pizza_rt`,`lakebase_instance=synth-qsr-online-store`).
- **B4 `pizza_rt.orders`**: was **stale to 2026-06-17** because the refresh **schedule was PAUSED**. Triggered a run → order appeared, table 395→826 rows. Set schedule to `0 */5 * * * ?` UNPAUSED.
- **B5 app source**: the app reads the **Lakebase mirror** (`synth-qsr-online-store`/`pizza_rt`.`orders`), not UC — confirmed the test order present there too. (UI itself Okta-walled.)
- Query path: `databricks api post /api/2.0/sql/statements` warehouse `d56091a1171f30ff`; Lakebase via `databricks database generate-database-credential` + `psql … sslmode=require`. Memory [[pizza-rt-data-chain]] corrected with all of the above.

## §2c — RESOLVED: OTel collector 403 (root cause = compose env passthrough, not token expiry)

The §2a "logs-only 403" framing was a red herring caught mid-transition. By the time I dug in, **all three signals (traces/logs/metrics) were 403** `PermissionDenied`. Investigation:
- **`.env` token is VALID** — SCIM `/Me` → 200 as `jesus.rodriguez` (ALL PRIVILEGES on `jmrdemo`). So NOT expiry.
- **Direct OTLP ingest with the `.env` token → 200** (empty payload AND a real hand-rolled span, all 3 signals). Endpoint/table/grants all fine. (Empty payload short-circuits to 200 — must send ≥1 real record to test the permission layer.)
- **`otel_logs`/`otel_metrics` tables exist, same owner/grants/`otel.schemaVersion=v1` as `otel_spans`** — not a table problem. Both had real data historically (logs 510K rows, metrics 9.7M) → regression, not never-configured.
- **Root cause**: `docker-compose.yml`'s collector block passed creds as **bare passthrough** (`- DATABRICKS_API_TOKEN`), which docker-compose resolves from the **shell env at `up` time, NOT `.env`**. The running collector had drifted to a stale/empty token while `.env` stayed valid → 403 on everything. Staggered failure (logs first, traces last) is just volume ordering, masquerading as "logs-only".
- **Controlled proof**: recreate with the var UNSET in shell → 403 (empty token); recreate with `.env` exported → all signals land. Token presence was the only variable.
- **Durable fix (this branch `fix/otel-logs-403`)**: changed to `- DATABRICKS_API_TOKEN=${DATABRICKS_API_TOKEN}` (+ endpoint & 3 table vars). `${VAR}` interpolation reads `.env`; bare passthrough doesn't. Validated: `env -u DATABRICKS_API_TOKEN … docker compose config` resolves token from `.env`; **clean-shell `--force-recreate` → 0 403s, spans=551 + demo-logs=233 (6 services) + metrics landing in 90s**.
- Durable: `docker exec otel-collector printenv` is unreliable in this sandbox (showed "1 env var") — don't trust it; use `docker compose config` / data-landing checks. Memory [[otel-collector-token-compose-passthrough]] captures the full method. Long-term token story still OAuth M2M (ADR 0002).

## §2d — RESOLVED: chatbot "assistant unavailable" (expired agent serving token, 2026-06-21)

- **Symptom**: every chat turn returned `{"reply":"The ordering assistant is unavailable right now…","fallback":true}` in ~0.15s.
- **Path**: BFF `src/frontend/services/Agent.service.ts` does a raw `fetch` to the Model Serving endpoint with a STATIC `Authorization: Bearer ${AGENT_API_TOKEN}` (no refresh). `AGENT_ENDPOINT_URL`/`AGENT_API_TOKEN` live in `docker-compose.override.yml` (gitignored).
- **Root cause**: `AGENT_API_TOKEN` was a **1-hour OAuth U2M JWT** (`databricks auth token` style, `client_id=databricks-cli`), **expired 61h** (decoded `exp`). Endpoint → `HTTP 403 "Invalid Token"` instantly → BFF `!res.ok` → fallback. (Fast 403 = bad token; a 40s hang instead = scale-to-zero cold start, which means auth PASSED — useful to distinguish.)
- **Fix**: minted a **90-day PAT** (`databricks tokens create --lifetime-seconds 7776000`, exp **2026-09-19**), replaced the `AGENT_API_TOKEN` literal in `override.yml`, `docker compose up -d --force-recreate frontend`. Verified through the real BFF: turn 1 conversational reply (8s, warm), turn 2 finalize → `has_proposal=true` proposal card (Large Hand-Tossed Pepperoni $15.99). Working.
- **Consolidated 2026-06-21**: this same 90-day PAT also replaced the collector's `.env` `DATABRICKS_API_TOKEN` (was a separate `dapi26…` PAT) → **one PAT for the whole demo** (agent endpoint + OTel export). Recreated `otel-collector` from a clean shell; re-verified 0 403s + spans/logs/metrics landing. Same jesus.rodriguez principal already has UC write + endpoint query, so one token covers both.
- **Minor**: turn-2 `priced.total` came back `null` while the line price was present ($15.99) — card still renders from `lines`; worth a glance in `utils/agent/pricing.ts` if a total ever needs to show.
- **Durable follow-up**: same recurring class as the collector token — move the BFF to **OAuth M2M** (service principal + `client_credentials` token refresh, ~20 lines in `Agent.service.ts`, SP granted `CAN_QUERY` on `synth_qsr-commerce-agent`). ADR 0002.

## §2 — This session   (evidence cited)

- Built the **agentic commerce chatbot** web feature (8 plan tasks: vitest+contract, pricing, mock agent, BFF route, widget, approve→order, speech, docs) — evidence: `0b8446c`,`cbc2d95`,`0a2298f`,`1779531`,`b846344` + per-task reviews.
- Review/adversarial fixes: double-submit guard + emptyCart-204 tolerance, Dockerfile `utils/agent` COPY, orderType threading, empty-text-proposal card — evidence: `f802adc`,`407cbda`,`25e1b71`,`f5b8a47`.
- **Real `synth_qsr-commerce-agent` wired + live-tested**: J1 (mock) + J2 (real) PASS, real orders placed→checkout→tracker; envoy `/api/agent-chat` timeout 35s; parser aligned to deployed envelope + drops `MLFLOW_NO_OP_SPAN_TRACE_ID` — evidence: `33758ba`,`34eb289`,`6ce0d9c`,`1e5affe`; order `3c8c3025…` = 4 spans in `otel_spans` (query).
- Agent `propose_order`-vs-conversation divergence: logged → **model team fixed** (system-prompt) → validated 4/4 on redeploy; added BFF `app.agent.proposal_item_ids/names` span catch-net (queryable in `otel_spans`, verified) — evidence: `9b39d9c`,`3eeea73`,`55fe91a`.
- **Fixed broken Databricks telemetry export**: collector PAT was expired → 403 dropping all spans; minted fresh PAT in `.env`, recreated `otel-collector`; 1,302 rows/10min landing again — evidence: collector logs + `otel_spans` query (unverified beyond query; `.env` change local, not committed).

## §3 — Gotchas this session

- Orders not in pizza-rt-app ⇒ check collector 403 first, then the SDP/`pizza_rt_refresh` chain — (durable → memory: `pizza-rt-data-chain`).
- Can't automate/record the Okta-walled pizza-rt-app from a copied/fresh Chrome profile — (durable → memory: `databricks-app-okta-automation-block`).
- Real agent is conversational + cold-starts slow (tool-chaining turn >40–70s cold; ~7–13s warm) — pre-warm before demos/recordings — (session-local).
- `databricks api post /api/2.0/sql/statements` is the reliable query path here (warehouse `d56091a1171f30ff`, serverless) — (session-local).

## §4 — Pointers

- Plan: `docs/superpowers/plans/2026-06-18-agentic-commerce-chatbot-web-integration.md` · Contract/ledger: `docs/integration/agent-endpoint-contract.md` · Test results: `docs/journey-test-results-2026-06-18.md` · pizza-rt project: `~/Documents/ItsAVibe/gitRepos_FY26/o11yApp`
- Memory entries added this session: `pizza-rt-data-chain`, `databricks-app-okta-automation-block` (also active: `frontend-dockerfile-utils-copy`, `emptycart-204-otel-fetch-reject`, `otel-demo-npm-registry-blocked`, `agent-chat-envoy-proxy-timeout`)
- **Carried-forward open issues** (from prior handoff, still unresolved):
  - **Plan 4b (recommendation Model Serving)** on branch `feat/pizzatel-plan4b-recommendation-serving` is **NOT merged**; verified only by direct endpoint calls, the full UI+backend journey verification (the prior handoff's "⚠️ NEXT — REQUIRED") was still pending. Relay calling principal `jesus.rodriguez@databricks.com` to the model team for `CAN_QUERY`.
  - `main` unpushed to `origin` (per prior handoff).
  - Recurring: `DATABRICKS_API_TOKEN` daily expiry → 403 → exports dropped (refresh + recreate `otel-collector`; durable fix = OAuth M2M, ADR 0002). `.env` uncommitted/holds live token; `ORDER_TRACKER_DOCKERFILE` on-disk but not in committed `.env`.
  - Build env: registry DNS blocked → Go `GOPROXY=goproxy.io`, npm `npm-proxy.cloud.databricks.com`; prefer `golang:1.24.2-alpine`; `docker-compose.minimal.yml` has no Kafka (order-tracker needs full compose); `frontend`/`order-tracker` are local mirror builds.
  - order-tracker placeholders (channel hardcoded `delivery`, store_id = tracking-id placeholder, in-process advance goroutine). Stale e2e specs `ProductDetail.cy.ts`/`Checkout.cy.ts` (`describe.skip`).
  - Roadmap: Plan 5b (agent customer deals + order-history via feature store — `get_order_history`/`get_occasion_context` return empty in v1); address→auto-nearest store routing; OTel→`order_events` write-back; Postgres→Lakebase; reusable Databricks-serving wrapper.
  - **Roadmap — AI Gateway for the agent: RESOLVED 2026-06-21 (no action left).** Reopened to "move the endpoint to AI Gateway"; on review it's already as complete as the platform allows, split across the two layers (verified live):
    - **Agent endpoint `synth_qsr-commerce-agent`**: AI Gateway `inference_table_config` ✅ → `jmrdemo.synth_silver.commerce_agent_payload` (req/resp payloads) + in-serving MLflow experiment traces ✅ (exp `3025255582876496`). **Usage tracking is NOT supported on this endpoint type** (custom ResponsesAgent) per the model team (contract doc body, "Usage tracking is not supported on this endpoint type") — so it stays off by design; guardrails also N/A on a custom agent. Inference table + traces cover observability here.
    - **LLM endpoint `databricks-claude-sonnet-4-5`** (the AI Gateway choke-point all model access routes through): usage tracking ✅ + 200 rpm rate limit ✅ + PII guardrails BLOCK in/out ✅. This is the correct layer for token/usage governance.
    - **Net:** every applicable AI Gateway feature is on, at the right layer. Nothing to enable on the agent endpoint beyond what's there. *Earlier "enable usage tracking on the agent endpoint" idea was dropped — unsupported on that endpoint type and redundant with the LLM-layer tracking.*
    - Not-recommended (unchanged): ❌ repointing `AGENT_ENDPOINT_URL` at a raw gateway/FM endpoint — breaks the `propose_order` contract. Only revisit AI Gateway work if the goal becomes routing the agent's LLM through a *different* org gateway (model-team-side `load_context` change, zero app impact).
