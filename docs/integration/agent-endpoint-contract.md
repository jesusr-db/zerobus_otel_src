# Agentic Commerce Chatbot — Integration Contract & Communications Ledger

**Audience:** the team building the **`pizzatel-agent`** (Databricks Agents SDK + MLflow + Model Serving — the "Crustopher pattern").
**Counterparty:** the PizzaTel storefront / web team (this repo).
**Purpose:** the seam between the two projects so both can build in parallel — **and** a running ledger so the two teams can talk to each other in one place.

The storefront mounts a chat widget on login. It calls a Databricks Model Serving endpoint that hosts a conversational ordering agent. The agent reasons over the customer's identity, preferences, order history, local/holiday context, and live recommendations (from the **existing `synth_qsr-recommender`** endpoint), proposes a priced cart, and — after the customer explicitly **approves** — the **web BFF places the real order** through the unmodified Checkout → Kafka → order-tracker pipeline.

> Companion docs: [`recommendation-endpoint-contract.md`](./recommendation-endpoint-contract.md) (the proven sibling pattern) and the design brainstorm at [`../../research/agentic-chatbot-otel-dual-tracing_2026-06-18.md`](../../research/agentic-chatbot-otel-dual-tracing_2026-06-18.md).

**Status legend:** 🟥 TO BE PROVIDED · 🟨 PROPOSED / CONFIRM · 🟩 AGREED

---

## 0. Communications Ledger

> Both teams append here. Newest at top. Format: `YYYY-MM-DD — [team] — note`. Move resolved items into the contract body and mark them 🟩.

| Date | Team | Note |
|------|------|------|
| 2026-06-18 | web | Web integration built against the **mock agent** (offline-capable), targeting your confirmed **ResponsesAgent** shape: request `{ input, custom_inputs:{ profile_id, member_id, store_id, app_trace_context } }`; response parsed for assistant text + `custom_outputs.{ propose_order, mlflow_trace_id, cold_start }`. **Pricing authority: CONFIRMED — BFF re-prices at proposal + place_order; your indicative prices are display-only (we drop them).** Widget, BFF route `/api/agent-chat`, trace-stitch (`app_trace_context` in `custom_inputs` → `agent.mlflow.trace_id` recorded on the app span), approve→real-order via existing checkout/tracker, and optional browser speech are live behind flags `agentEnabled`/`agentSpeechEnabled`. Client timeout 30s per your SLA. **To go live:** set `AGENT_ENDPOINT_URL` (`.../serving-endpoints/synth_qsr-commerce-agent/invocations`) + `AGENT_API_TOKEN` — no web code change. **Last open item:** §2.4 exact response envelope + a real request/response example (your Task 9 deploy) so we finalize the `output_text` vs `output[]` text-extraction path. |
| 2026-06-18 | model | **Replied to all 7 open questions — see §0.1 below.** Decisions: (1) `ResponsesAgent`; (2) **stateless**, web resends full history 🟩; (3) **agent owns all data-side tools** 🟩 (matches your preference); (4) `propose_order` schema confirmed + enriched with indicative prices — see §3.1; (5) yes, we honor `app_trace_context` and return our MLflow `trace_id` 🟩; (6) latency SLA + guest behavior proposed in §5 🟨; (7) OTLP-alongside-experiment is a verification task we own, finding to follow. **One thing to confirm back:** pricing authority — agent returns *indicative* prices for the confirm card; we assume **your BFF re-prices at `place_order` as source of truth**. Confirm. Real example request/response + live endpoint URL land here once the agent is deployed (plan Task 9). |
| 2026-06-18 | web | Initial contract drafted from the 2026-06-18 brainstorm. All 🟥 items below are open questions for the model team. Top priority: **§2.1 agent flavor + payload format** (blocks the entire BFF request builder) and **§3 the `place_order` tool-call schema**. |

### Open questions for the model team (quick list)
1. 🟥 `ResponsesAgent` or `ChatAgent`? What exact invocation payload? (§2.1)
2. 🟥 Stateless (we resend full history) or server-held `conversation_id`? (§2.2)
3. 🟥 For each context signal (preferences, order history, local/holiday), does the **agent fetch it via its own Databricks tools**, or does the **web BFF pre-fetch and pass it in**? (§2.3)
4. 🟥 Exact `propose_order` tool-call JSON the agent emits. (§3.1)
5. 🟥 Will the agent honor `app_trace_context` and return its MLflow `trace_id`? (§3.2)
6. 🟨 Latency SLA + cold-start behavior on an interactive surface. (§5) — proposed below, confirm after first load test.
7. 🟨 Can OTLP export run **alongside** the MLflow experiment trace store on your serving runtime? (governs the tracing stretch goal — §6) — model team owns this verification; finding to follow.

### 0.1 Model team reply — 2026-06-18

The agent project lives in the **`qsr-synth-data-generator`** repo (`synthData`, FY27) — same repo that ships the `synth_qsr-recommender` and `synth_qsr-customer-features` endpoints you already consume. Build plan: `docs/superpowers/plans/2026-06-18-pizzatel-commerce-agent.md` in that repo. Answers, keyed to your sections:

- **§1 Endpoint & auth.** Endpoint name (our naming convention): **`synth_qsr-commerce-agent`** — your `pizzatel-agent` alias is fine, this is the Model Serving name you POST to. UC model: `jmrdemo.synth_features.qsr_commerce_agent`. Auth: **PAT/SP with `CAN_QUERY`**, granted in setup via a `commerce_agent_query_principal` job param (same pattern as `recommender_query_principal`). OAuth M2M on the roadmap. MLflow experiment path will be posted here after first deploy.
- **§2.1 Agent flavor 🟩 `ResponsesAgent`** (MLflow `mlflow.pyfunc` ResponsesAgent — current GA pattern, supersedes ChatAgent, native tool-calling + Tracing). Invocation is the **Responses input shape**: `{"input": [{"role":"user","content":"..."}], "custom_inputs": {...}}`. A real request/response example lands here after deploy (Task 9) — that resolves the signature faster than prose, agreed.
- **§2.2 Conversation state 🟩 STATELESS.** You resend the full message array every turn in `input`. No server-held `conversation_id`. Per-session correlation is via `app_trace_context` (§3.2).
- **§2.3 Context & tool ownership 🟩 AGENT OWNS ALL DATA-SIDE TOOLS.** `profile_id`/`member_id`/`store_id` come in `custom_inputs`; the agent does every lookup server-side (keeps identity keys + join logic on our side, mirrors the recommender). Tool map: menu/catalog → `search_menu` (`synth_ref.menu_item`+`item_price`); recs → `get_recommendations` (calls the existing `synth_qsr-recommender`); preferences → `get_customer_context` (feature serving + masked profile); order history → `get_order_history` (`synth_silver.guest_order`/`order_item`); local/holiday → `get_occasion_context` (`synth_ref.local_events`). You do **not** pre-fetch any of these.
- **§3.1 `propose_order` schema 🟩 (confirm enrichment).** Agent emits ints for `menu_item_id` and never places the order — you execute `place_order`. We **enrich** your proposed shape with indicative pricing for the confirm card:
  ```json
  {
    "tool": "propose_order",
    "items": [ { "menu_item_id": 1, "quantity": 2, "item_name": "Large Pepperoni", "unit_price": 14.99 } ],
    "order_type": "delivery",
    "subtotal": 29.98, "tax_estimate": 2.70, "total": 32.68, "currency": "USD",
    "pricing_note": "indicative — BFF is pricing authority at place_order"
  }
  ```
  **Confirm:** you re-price authoritatively at `place_order` (our prices are display-only). IDs are ints in and out.
- **§2.4 Per-turn response 🟥→ Task 9.** ResponsesAgent returns output items: an assistant **text** message (chat bubble) plus, when proposing, a structured `propose_order` item in `custom_outputs` so you render the confirm card without parsing free text. Exact envelope + example posted after deploy.
- **§3.2 Trace stitch 🟩 YES.** Send `app_trace_context` (W3C `traceparent`) **in the request payload** (`custom_inputs.app_trace_context`) — agreed, not an HTTP header. We record it as MLflow trace tag **`app.trace_id`** and **return our MLflow `trace_id`** in `custom_outputs.mlflow_trace_id` so you can stamp `agent.mlflow.trace_id` on your OTel span. Two backends, JOIN-able on ID, no exporter collision.
- **§5 Non-functional 🟨 PROPOSED.** Latency target **p50 ≤ 3s** (text-only turn), **p99 ≤ 12s** (tool-chaining turn); set client timeout **30s**. Endpoint is `scale_to_zero` — recommend your **pre-warm ping on chat-open** (cold start is visible on a live chat). Guest: `profile_id="guest"` → agent skips `get_customer_context`/`get_order_history` and uses store-popularity recs (recommender cold-start path, `personalized:false`). Confirm after first load test.
- **§6 OTLP verification 🟨 OURS.** We own verifying whether `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` export coexists with the in-experiment MLflow trace store on the deployed serving runtime (governs your single-pane "Option 3" stretch). Finding posted here.

> **All model models route through Databricks AI Gateway.** The agent never calls a foundation model directly — it targets an AI-Gateway-fronted serving endpoint (`synth_qsr-agent-llm`) configured with usage tracking, rate limits, and PII guardrails. This is the cost/safety choke point and is created/torn down by our setup/destroy jobs.

---

## 1. Endpoint & auth — 🟥 TO BE PROVIDED
- **Invocation URL:** `https://<workspace-host>/serving-endpoints/<NAME>/invocations` (endpoint name + workspace).
- **Auth (initial): PAT** — a token/principal with `CAN_QUERY` on the endpoint. Web stores it as `AGENT_API_TOKEN` (same env pattern as the recommender's `DATABRICKS_*`).
- **Auth (roadmap):** OAuth M2M service principal — preferred, aligns with ADR 0002.
- **MLflow experiment** name/path the agent logs runs + traces to (so web can reference it in the demo and confirm trace correlation).

## 2. Conversation request/response schema

### 2.1 Agent flavor & payload format — 🟥 TO BE PROVIDED **(highest priority — blocks the BFF request builder)**
- Is the agent a **`ResponsesAgent`** or a **`ChatAgent`**? This decides whether the BFF sends `{ "messages": [...] }` (chat) or the Responses input shape, and whether the MLflow signature wants `dataframe_records` / `dataframe_split` / agent-native.
- Provide one **real example request and response** from your deployed endpoint — that resolves 90% of the ambiguity faster than prose.

### 2.2 Conversation state — 🟥 CONFIRM
- **Stateless** (web resends the full message history every turn — simplest, recommended) **or** server-held session via a returned `conversation_id`/`session_id` we echo back? The recommender was one-shot; this is multi-turn, so we need this pinned.

### 2.3 Context & tool ownership — 🟨 PROPOSED / CONFIRM
The web side already threads synth-aligned identity (these IDs are **already settled** with the recommender — same join keys):

| field | type | meaning |
|-------|------|---------|
| `profile_id` | bigint *(or `"guest"` sentinel)* | active customer profile |
| `member_id` | bigint, nullable | loyalty member, if any |
| `store_id` | bigint | active store (`synth_ref.unit.unit_id`) |

For each of the following, **confirm who owns the lookup** — the agent's own Databricks-side tools, or the web BFF pre-fetching and passing it in the first turn:

| signal | source | owner? 🟥 |
|--------|--------|-----------|
| menu / product catalog | `synth_ref.menu_item` | agent tool (`search_menu`) — assumed |
| recommendations | **existing `synth_qsr-recommender`** | agent tool (`get_recommendations`) calling the existing contract — assumed |
| preferences | `synth_silver.*` | **?** |
| order history | `synth_silver.guest_order` / `order_item` | **?** |
| local / holiday / occasion context | static holiday table or prompt context | **?** |

> Web's preference: agent owns the data-side tools (keeps identity keys server-side, mirrors the recommender). Confirm.

### 2.4 Per-turn response shape — 🟥 TO BE PROVIDED
What the BFF receives each turn:
- assistant **display text** (rendered in the chat bubble), and
- an optional **structured tool-call intent** (esp. `propose_order` — see §3.1), so the web can render the **approve/disapprove confirm card** instead of free-text-parsing a cart.

## 3. The two items unique to this feature

### 3.1 `propose_order` / `place_order` tool schema — 🟥 TO BE PROVIDED **(load-bearing)**
The agent **declares** an order tool but the **web BFF executes it** — the agent must never place the order itself (keeps the order byte-identical to a UI order and keeps secrets/pipeline web-side).
- Provide the **exact JSON** the agent emits when it wants to place an order. Proposed (confirm):
  ```json
  {
    "tool": "propose_order",
    "items": [ { "menu_item_id": 1, "quantity": 2 }, { "menu_item_id": 14, "quantity": 1 } ],
    "order_type": "delivery"
  }
  ```
- **Item IDs must be `menu_item_id` (bigint)** — already aligned with the storefront catalog (`product_id == str(menu_item_id)`); web `str()`s them to resolve against the live 68-item catalog and prices them. Confirm ints in/out.
- The agent returns a **proposal**, not a placed order. Web renders the priced confirm card; only an explicit user **approve** triggers the BFF `place_order` against `Checkout.gateway`.

### 3.2 Trace-stitch fields (OTel dual-level) — 🟨 PROPOSED / CONFIRM
The storefront already emits an end-to-end OTel trace (browser → BFF → checkout → Kafka → order-tracker) into `jmrdemo.zerobus.otel_spans`. To **correlate** the agent's MLflow trace with the app trace (Option 2 in the brainstorm — keep two backends, link on a shared ID):
- Web sends **`app_trace_context`** (a W3C `traceparent` string) **in the request payload** — *not* an HTTP header, because Model Serving may strip headers.
- Agent: record it as an MLflow trace tag **`app.trace_id`** (and/or start the trace as a child of that context).
- Agent: **return your MLflow `trace_id`** in the response so the web BFF can stamp `agent.mlflow.trace_id` on its OTel span.
- Result: agent traces stay in the **MLflow experiment** (MLflow eval/scorers intact), app traces stay in **zerobus**, and the two are JOIN-able on trace ID. No exporter collision.

## 4. What the website PROVIDES (so you can build to it)
- **Calls** `POST /serving-endpoints/<NAME>/invocations` per chat turn with the agreed payload, including the synth-aligned `profile_id`/`member_id`/`store_id` and `app_trace_context`.
- **Executes `place_order`** in the BFF via the unmodified `Checkout.gateway.placeOrder(order, { storeId, orderType })` with `pizzatel-store-id` / `pizzatel-order-type` metadata — the same call the storefront checkout makes today. Returns the real `order_id` / `shipping_tracking_id` / cost and hands off to the existing order tracker (`/api/order-status`).
- **Renders** the approve/disapprove confirm card from the structured proposal; the agent never auto-orders.
- **Type handling:** sends item ids as ints; `str()`s returned `menu_item_id`s for the catalog/UI.
- **Telemetry:** wraps the agent call in an OpenTelemetry **client span** (endpoint, latency, turn, fallback?, `agent.mlflow.trace_id`) that continues the active session trace.
- **Graceful degradation:** a flagd flag (`agentEnabled`) gates the widget; on timeout/error/flag-off the chat shows a degraded state and the storefront runs normally without the endpoint. Optional `agentSpeechEnabled` flag gates browser speech-to-text input (no server-side ASR required).

## 5. Non-functional — 🟥 TO BE PROVIDED
- **Latency SLA (p50/p99)** — interactive chat surface, so we set a sane client timeout (recommender used 20s) and decide whether a **pre-warm ping on chat-open** is worth it.
- **Cold-start behavior** — scale-to-zero is far more visible on a live chat than a background rec call.
- **Guest / no-profile behavior** — what the agent does for the `profile_id = "guest"` sentinel, so our degraded path matches.

## 6. Verification item (governs the tracing stretch goal) — 🟥 TO BE PROVIDED
- On the **deployed MLflow version**, can OTLP export (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) run **alongside** the experiment trace store, or does enabling OTLP export **disable** the in-experiment trace UI/eval? This decides whether "Option 3 / single-pane traces in zerobus" is ever viable without sacrificing the MLflow-experiment requirement. The model team owns this verification (it's a serving-runtime fact).

---

## 7. Checklist for the model team
- [ ] Endpoint name + workspace URL + MLflow experiment path
- [ ] PAT principal with `CAN_QUERY` (+ OAuth M2M later)
- [ ] **Agent flavor (`ResponsesAgent`/`ChatAgent`) + one real example request/response** (§2.1)
- [ ] Conversation state model: stateless vs server-held session (§2.2)
- [ ] Confirm context/tool ownership per signal (§2.3)
- [ ] Per-turn response shape incl. structured tool-call intent (§2.4)
- [ ] `propose_order` tool-call JSON + confirm `menu_item_id` ints in/out (§3.1)
- [ ] Honor `app_trace_context` + return MLflow `trace_id` (§3.2)
- [ ] Latency SLA + cold-start + guest behavior (§5)
- [ ] OTLP-alongside-experiment verification (§6)
