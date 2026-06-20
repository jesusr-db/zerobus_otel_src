# Handoff for Next Agent — opentelemetry-demo

**As of**: 2026-06-19 ~02:30 UTC
**Branch / HEAD**: `feat/agentic-commerce-chatbot` @ `55fe91a feat(agent): record proposed item ids/names on the BFF span` — **NOT pushed** (no upstream)

> Single canonical handoff. Detail lives behind §4 pointers, not inlined.

## §1 — Launchpad (act on this first)

- **State**: `feat/agentic-commerce-chatbot` **merged to `main`** (no-ff). On branch `fix/verify-order-otel-pipeline`. `main` is **31 commits ahead of `origin/main`** — still **not pushed**.
- **Next actions**:
  1. **Push `main` to `origin`** (closes the long-standing "main unpushed" issue). The chatbot feature is merged.
  2. **Order→OTel→app pipeline: VERIFIED & FIXED 2026-06-19** (see §2a). Root cause of stale app data was the `pizza_rt_refresh` schedule being **PAUSED** — now UNPAUSED at every-5-min. ⚠️ **Durable follow-up**: persist the unpause in the `otel_pizza` bundle's job YAML, or a `bundle deploy` reverts it to PAUSED.
  3. **NEW — troubleshoot logs not landing** (see §2b): the OTel collector `otlphttp/logs` exporter is 403'ing (~1550 drops/30m) while `otlphttp/traces` exports fine. Orders are unaffected (they ride traces), but **OTel *logs* are not reaching Databricks**. Investigate the logs endpoint/permission separately.
  4. pizza-rt-app demo segment can only be captured in **your own Chrome** (Okta wall) — `library/pizzatel-agent-order-journey-local.gif` is the storefront half.
- **Landmines**: collector `DATABRICKS_API_TOKEN` expires (~7-day PAT, ~**2026-06-25**) → exports 403 → orders vanish from the app. · Don't commit `.env` (holds the token; gitignored). · Refresh schedule lives in the `otel_pizza` bundle — redeploy may re-pause it.

## §2a — Order→OTel→app pipeline verification (2026-06-19)

Placed a real test order via curl (`POST /api/cart` then `POST /api/checkout` on `localhost:8080`) and traced it through every boundary:
- **B1 collector→Databricks (traces)**: healthy — 0 trace-export errors (only *logs* 403, see §2b).
- **B2 `jmrdemo.zerobus.otel_spans`**: order's 4 spans landed in ~30s (`CheckoutService/PlaceOrder`, `order-tracker received order`, `stage: Prep`, `send_order_confirmation`). Fresh to the minute.
- **B3 assembly**: **no `zerobus_sdp` pipeline exists** — `pizza_rt_refresh` (job `417359879058803`, notebook `src/rt_refresh`, bundle `otel_pizza/dev`) reads `otel_spans` directly (params `raw_schema=zerobus`,`rt_schema=pizza_rt`,`lakebase_instance=synth-qsr-online-store`).
- **B4 `pizza_rt.orders`**: was **stale to 2026-06-17** because the refresh **schedule was PAUSED**. Triggered a run → order appeared, table 395→826 rows. Set schedule to `0 */5 * * * ?` UNPAUSED.
- **B5 app source**: the app reads the **Lakebase mirror** (`synth-qsr-online-store`/`pizza_rt`.`orders`), not UC — confirmed the test order present there too. (UI itself Okta-walled.)
- Query path: `databricks api post /api/2.0/sql/statements` warehouse `d56091a1171f30ff`; Lakebase via `databricks database generate-database-credential` + `psql … sslmode=require`. Memory [[pizza-rt-data-chain]] corrected with all of the above.

## §2b — OPEN: OTel logs not landing (collector `otlphttp/logs` 403)

- **Symptom**: `docker logs otel-collector` shows continuous `Exporting failed. Dropping data.` for `"otelcol.component.id": "otlphttp/logs"`, `"otelcol.signal": "logs"`, `HTTP 403` against `…/api/2.0/otel/v1/logs`. ~1550 drops / 30 min. `otlphttp/traces` has **zero** errors with the same token — so it's logs-endpoint-specific, not a dead token.
- **Impact**: order pipeline unaffected (traces). But any log-based observability into Databricks is dropping.
- **Where to look**: collector config `src/otel-collector/otelcol-config-extras.yml` (logs exporter auth/headers vs traces), the Databricks-side OTLP **logs** ingest permission/enablement for the workspace, and whether the logs endpoint needs a different schema/UC target than traces. Confirm the principal behind the PAT has logs-ingest rights.

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
