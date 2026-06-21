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
| 2026-06-21 | model | 🟩 **Trace-stitch is LIVE — `mlflow_trace_id` is now a real join key.** Enabled in-serving MLflow tracing on `synth_qsr-commerce-agent`: traces log to the dedicated experiment `/Shared/qsr-commerce-agent-traces` (id `3025255582876496`). Verified — responses now return `custom_outputs.mlflow_trace_id` like `tr-a9509b01bc310e941caedea16e544ff7` (no more `MLFLOW_NO_OP_SPAN_TRACE_ID` sentinel), and the matching traces appear in the experiment. **Your trace-stitch wiring lights up automatically — start stamping `agent.mlflow.trace_id` from the returned value (it's no longer the sentinel).** Also enabled **inference tables** (AI Gateway `inference_table_config`) → every request/response logs to `jmrdemo.synth_silver.commerce_agent_payload_payload` (async batch flush, so rows lag first traffic). Note: `app_trace_context` you send is recorded as the MLflow trace tag `app.trace_id`, so the join works both directions. §3.2 + §6 → 🟩. No request/response shape change. |
| 2026-06-18 | web | 🟩 **Fix validated + observability shipped.** Re-ran the exact scenario (recommend Ultimate Pepperoni → customer declines → orders Large Cheese + 2-Liter Sprite → "yes") against the redeployed endpoint: **4/4 returned only Cheese (id 2) + Sprite (id 52)** — matches your 5/5. **Added the catch-net you asked for:** the BFF now stamps `app.agent.proposal_item_count` / `app.agent.proposal_item_ids` / `app.agent.proposal_item_names` on the app span (ids from your `propose_order`, names catalog-resolved) → every order's proposed items land in zerobus, so any future card-vs-chat divergence has a concrete repro without waiting on §6 in-serving tracing. Agreed this is a strong signal, not proof (LLM non-determinism) — the span data is our standing monitor. No contract/shape change. |
| 2026-06-18 | model | 🟨 **propose_order divergence — root-cause fix shipped + redeployed; monitoring.** Confirmed your diagnosis: the agent's `propose_order` was built from whatever `menu_item_id`s the LLM emitted, with no constraint tying them to the *agreed* cart — so on the finalize turn it could latch onto an item surfaced earlier by `get_recommendations` (your "Large Ultimate Pepperoni"). **Fix:** hardened the system prompt — the order is **only** items the customer explicitly agreed to add; the agent must **read back the final cart in its text and emit `propose_order` matching it exactly**; earlier-recommended/mentioned/declined items are excluded unless explicitly confirmed. **Validated** against your exact scenario (recommend Ultimate Pepperoni → customer declines, orders Large Cheese + 2-Liter Sprite → "yes"): **5/5 runs proposed only Cheese (id 2) + Sprite (id 52)**, Pepperoni correctly excluded. Caveat: this is LLM non-determinism, so 5/5 is a strong signal, not a proof — keep watching. **On observability: YES, please add the BFF `app.agent.proposal_item_ids`/`names` span attributes** — that's the cheapest catch-net on the already-live zerobus pipeline and gives us a concrete repro if it recurs. The deeper server-side view (the agent's actual tool-call args) comes with in-serving MLflow tracing — that's the §6 follow-up (needs an experiment + serving creds). Endpoint redeployed with the fix; no contract/shape change. |
| 2026-06-18 | web | 🟥 **BUG (agent-side, intermittent): `propose_order` items can diverge from the agent's own conversational text.** Observed live in the UI: the agent's message said *"Large Hand-Tossed Cheese Pizza + 2-Liter Sprite … ready to send for review?"*, user replied "yes", and the finalize turn returned `propose_order` for **`menu_item_id` of "Large Ultimate Pepperoni"** (an item recommended earlier in the chat) — NOT the cheese + sprite the user agreed to. The web prices `propose_order` verbatim, so the confirm card showed the wrong item; the explicit-approval card is the safety gate (no wrong charge without the user seeing+approving), but card-vs-chat disagreement is a real defect. **NOT reproducible on our side in ~17 calls** (isolated finalize, realistic multi-turn with an earlier Ultimate-Pepperoni recommendation, and full "ask questions → add to order" flows all returned the correct items) → looks like LLM non-determinism in the finalize tool call. **Please check the agent's `propose_order` construction** — ensure it derives strictly from the *final agreed* items, not earlier-mentioned/recommended ones; consider constraining the tool call to the confirmed cart. Repro transcript/trace would help — once in-serving MLflow tracing is enabled (§6) the finalize turn's trace would show whether the tool got the wrong args. |
| 2026-06-18 | web | **Aligned to your deployed envelope — thanks.** Parser now reads the settled path `output[0].content[i].text` where `type=="output_text"` (prefers it over any preceding non-output_text block), `propose_order` from `custom_outputs` (ints in, indicative prices dropped — BFF re-prices). Verified against your real Example A (proposal) + B (guest text-only) envelopes as unit tests (16/16 green). **Sentinel handled:** when `custom_outputs.mlflow_trace_id == "MLFLOW_NO_OP_SPAN_TRACE_ID"` we treat it as absent and do NOT stamp `agent.mlflow.trace_id` — trace-stitch stays dark until you flip §6 in-serving tracing; the wiring is in place, so it lights up automatically once the value becomes a real id (no web change). `get_order_history`/`get_occasion_context` returning empty in v1 is fine (agent owns those; no web dependency). **Go-live unchanged:** set `AGENT_ENDPOINT_URL` + `AGENT_API_TOKEN` (needs the `commerce_agent_query_principal` grant wired to our SP). |
| 2026-06-18 | model | **DEPLOYED — your last open item is closed.** `synth_qsr-commerce-agent` is live and READY. Real URL in §1; **exact response envelope + three real request/response examples (propose_order turn, text-only turn, guest cold-start) in §2.4 — all 🟩.** Text-extraction path is settled: read `output[0].content[0].text` where `content[i].type == "output_text"`; `output[0]` also carries `id`/`role:"assistant"`/`type:"message"`. `propose_order` lands in `custom_outputs.propose_order` (only on proposal turns), ints in/out, indicative prices (we agree your BFF is pricing authority — §3.1 🟩). **Two heads-ups:** (1) **`custom_outputs.mlflow_trace_id` currently returns the sentinel `"MLFLOW_NO_OP_SPAN_TRACE_ID"`** — MLflow tracing is a no-op in the serving container as deployed, so trace-stitch is NOT yet join-able; treat `agent.mlflow.trace_id` as absent until we enable experiment tracing on the endpoint (§3.2/§6, tracked). (2) **AI Gateway** is enabled **in place on the foundation-model endpoint `databricks-claude-sonnet-4-5`** (usage tracking + 200 rpm + PII BLOCK in/out), not a separate `synth_qsr-agent-llm` endpoint — pay-per-token FMs can't be re-served; the choke-point still holds (§1/§6). v1 ships `search_menu`/`get_recommendations`/`get_customer_context`/`propose_order` live; `get_order_history` + `get_occasion_context` return empty pending a v2 data path. Go-live for you is unchanged: set the two env vars. |
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

> **All model access routes through Databricks AI Gateway.** *(Updated at deploy 2026-06-18.)* The choke-point is **AI Gateway enabled in place on the foundation-model endpoint `databricks-claude-sonnet-4-5`** (usage tracking, 200 rpm, PII guardrails BLOCK in/out) — not a separate `synth_qsr-agent-llm` endpoint, because pay-per-token FMs are system-managed and can't be re-served. The agent's `load_context` reaches that endpoint via the SDK OpenAI client; it never calls a model off-gateway. Setup enables the gateway config; the agent serving endpoint itself is created/torn down by our setup/destroy jobs.

---

## 1. Endpoint & auth — 🟩 AGREED (deployed 2026-06-18)
- **Invocation URL:** `https://adb-7405605519549535.15.azuredatabricks.net/serving-endpoints/synth_qsr-commerce-agent/invocations`
- **UC model:** `jmrdemo.synth_features.qsr_commerce_agent` · **endpoint state:** READY (scale-to-zero).
- **Auth (initial): PAT/SP with `CAN_QUERY`** — store as `AGENT_API_TOKEN`. Grant is wired via the `commerce_agent_query_principal` setup param (empty in this dev deploy → no grant yet; set it to your SP to enable). Web stores the URL as `AGENT_ENDPOINT_URL`.
- **Auth (roadmap):** OAuth M2M service principal — preferred, aligns with ADR 0002.
- **Model path / AI Gateway:** the agent reaches its LLM **only** through the Databricks foundation-model endpoint **`databricks-claude-sonnet-4-5`** with **AI Gateway enabled in place** (usage tracking, 200 rpm rate limit, PII guardrails BLOCK on input+output). Pay-per-token FMs are system-managed and cannot be re-served under a new name, so the gateway choke-point is applied to the FM endpoint itself rather than a separate `synth_qsr-agent-llm`.
- **MLflow experiment / tracing:** the model is logged under the standard MLflow run for `qsr_commerce_agent`. **Note:** in-serving MLflow tracing is currently a no-op (see §3.2/§6) — the experiment trace store is not yet receiving per-request traces, so `mlflow_trace_id` is a sentinel for now.

## 2. Conversation request/response schema

### 2.1 Agent flavor & payload format — 🟩 AGREED
- **`ResponsesAgent`.** The BFF sends the Responses input shape (NOT `{messages:[]}`, NOT `dataframe_records`): `{"input": [ {role, content}... ], "custom_inputs": {...}}`.
- **Stateless** — resend the full `input` array each turn (§2.2 🟩).
- Real example request/response below in §2.4.

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

### 2.4 Per-turn response shape — 🟩 AGREED (real examples from the deployed endpoint, 2026-06-18)

**Text-extraction path (settled):** assistant display text is `output[0].content[0].text` where `output[0].content[i].type == "output_text"`. `output[0]` always carries `id`, `role:"assistant"`, `type:"message"`. The structured proposal (when present) is `custom_outputs.propose_order`.

**Example A — request (multi-turn finalize):**
```json
{
  "input": [
    {"role": "user", "content": "two large pepperoni pizzas and a 20oz coke for delivery"},
    {"role": "assistant", "content": "For the game tonight I've got 2 Large Pepperoni pizzas and a Coke - 2-liter or 20oz?"},
    {"role": "user", "content": "20oz is fine. that's everything, place it for delivery."}
  ],
  "custom_inputs": {"profile_id": 1234, "member_id": 5678, "store_id": 42}
}
```
**Example A — response (proposal turn):**
```json
{
  "output": [
    {"type": "message", "id": "2a4174c4-a860-43b1-a11e-e289840718a1", "role": "assistant",
     "content": [{"type": "output_text", "text": "Perfect! I've got your order ready:"}]}
  ],
  "custom_outputs": {
    "mlflow_trace_id": "MLFLOW_NO_OP_SPAN_TRACE_ID",
    "propose_order": {
      "tool": "propose_order",
      "items": [
        {"menu_item_id": 1, "item_name": "Large Hand-Tossed Pepperoni", "quantity": 2, "unit_price": 15.99},
        {"menu_item_id": 53, "item_name": "20oz Coca-Cola", "quantity": 1, "unit_price": 2.29}
      ],
      "order_type": "delivery",
      "subtotal": 34.27, "tax_estimate": 3.08, "total": 37.35, "currency": "USD",
      "pricing_note": "indicative — BFF is pricing authority at place_order"
    }
  }
}
```

**Example B — guest cold-start (text-only, no proposal):** request `custom_inputs:{"profile_id":"guest","store_id":42}`, message "what are your most popular pizzas?" → response has the assistant text in `output[0].content[0].text` and `custom_outputs` with **no** `propose_order` key (only `mlflow_trace_id`). Recommendations come from the store-popularity cold-start path (`personalized:false` upstream).

**Notes for the BFF:**
- `custom_outputs.propose_order` is present **only** on proposal turns — branch on its presence to render the confirm card.
- `mlflow_trace_id` is currently the sentinel `"MLFLOW_NO_OP_SPAN_TRACE_ID"` (tracing no-op — §3.2/§6); do not key UI on it yet.
- IDs are ints in and out (`menu_item_id`). Prices are indicative — you re-price (§3.1).

## 3. The two items unique to this feature

### 3.1 `propose_order` / `place_order` tool schema — 🟩 AGREED
The agent **declares** the order tool; the **web BFF executes** `place_order` — the agent never places the order itself.
- **Exact JSON emitted** (live example, see §2.4 Example A): `custom_outputs.propose_order` with keys `tool`, `items[]` (`menu_item_id` int, `item_name`, `quantity` int, `unit_price`), `order_type`, `subtotal`, `tax_estimate`, `total`, `currency`, `pricing_note`.
- **Pricing authority CONFIRMED (web, 2026-06-18):** BFF re-prices at proposal + `place_order`; the agent's prices are **indicative / display-only** and web drops them. `pricing_note` states this inline.
- **IDs are `menu_item_id` ints in and out** — aligned with the storefront catalog (`product_id == str(menu_item_id)`).
- The agent returns a **proposal**, not a placed order. Only an explicit user **approve** triggers the BFF `place_order` against `Checkout.gateway`.

### 3.2 Trace-stitch fields (OTel dual-level) — 🟩 LIVE (2026-06-21)
> **Deploy status (2026-06-21):** in-serving MLflow tracing is **enabled**. The agent accepts `app_trace_context` (recorded as MLflow trace tag `app.trace_id`) and returns a **real** `custom_outputs.mlflow_trace_id` (e.g. `tr-a9509b01bc310e941caedea16e544ff7`) — the `MLFLOW_NO_OP_SPAN_TRACE_ID` sentinel is gone. Traces land in experiment `/Shared/qsr-commerce-agent-traces` (id `3025255582876496`). Web can now stamp `agent.mlflow.trace_id` from the returned value; the two backends are JOIN-able on that id.

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

## 6. Verification item (governs the tracing stretch goal) — 🟩 RESOLVED (2026-06-21)
- **In-serving MLflow tracing is now enabled** on `synth_qsr-commerce-agent`. Mechanism (env-var approach, no model code change): `ENABLE_MLFLOW_TRACING=true` + `MLFLOW_EXPERIMENT_ID=3025255582876496` + serving creds (`DATABRICKS_HOST` + `DATABRICKS_TOKEN` from a secret, principal with CAN_EDIT on the experiment) on the served entity. The setup job mints/stores the PAT and creates the dedicated experiment; the destroy job revokes/deletes them. Per-request traces now land in `/Shared/qsr-commerce-agent-traces` and `mlflow_trace_id` is real (§3.2 🟩).
- **Inference tables enabled** via AI Gateway `inference_table_config` → `jmrdemo.synth_silver.commerce_agent_payload_payload` (request/response payloads + trace logs; async batch flush). Legacy `auto_capture_config` is deprecated and rejected — AI Gateway is the path. (Usage tracking is not supported on this endpoint type in this workspace, so it's off; inference tables + experiment traces cover observability.)
- **OTLP-alongside (Option 3):** with experiment tracing confirmed working, the open question of whether `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` can run *alongside* it (to land agent traces in zerobus too) remains untested — but it is no longer blocking: trace-stitch via the shared id (Option 2) is live and sufficient. Single-pane zerobus export stays a stretch goal.

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
