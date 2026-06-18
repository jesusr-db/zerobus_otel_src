# Agentic Commerce Chatbot — OTel Dual-Level Tracing Brainstorm

> Opus background brainstorm, 2026-06-18. Grounded in the canonical PizzaTel fork
> (`gitRepos_FY26/opentelemetry-demo`, remote `jesusr-db/zerobus_otel_src.git`).
> Builds on the tabled `research/agentic-commerce-chatbot_2026-06-15.md` and the
> Plan 5 roadmap entry in `docs/handoff.md`. Spec input for a `writing-plans` pass.

---

## Framing

The opportunity is to add an **agentic ordering surface** to PizzaTel: a chat widget that pops up on login, knows the selected customer (profile/loyalty/store/history + local context), holds a natural-language conversation about what to order (including occasion/holiday framing), pulls personalized recs from the **existing** `synth_qsr-recommender` endpoint, assembles an order list + price, gets explicit user **approve/disapprove**, and on approval places a **real, trackable order** through the *exact same* Checkout → Kafka `orders` → order-tracker → Valkey pipeline the storefront already uses — returning a real `order_id`, `shipping_tracking_id`, cost, and the existing order-tracker confirmation link.

The repo grounding confirms every load-bearing seam this depends on already exists in this canonical fork:
- **Identity is already threaded.** `Session.gateway.ts` carries `{userId, storeId, profileId='guest', memberId}`; `Api.gateway.ts:80` already defaults these so a stale session never emits the string `"undefined"`. The agent inherits identity from the same session object.
- **The order path is exact and reusable.** `pages/api/checkout.ts` → `Checkout.gateway.ts:12` calls `client.placeOrder(order, metadata)` with `pizzatel-store-id` / `pizzatel-order-type` gRPC metadata. Order-tracker continues the W3C trace from Kafka headers and writes `tracker:<order_id>` to Valkey; `pages/api/order-status.ts` reads it back. **An order placed by the agent through this exact call is byte-identical to a UI order at the Kafka boundary.**
- **The Databricks-serving integration pattern is proven.** `external_recommender.py` + `recommendation_server.py:67` establish the canonical wrapper: `dataframe_records` request with int sentinels (no nulls — verified HTTP 400 otherwise), JSON-string cart, `parse_response` tolerant of extra fields, flag-gated kill-switch (`recommendationModelEnabled`, default **ON**), 20s cold-start timeout, a rich OTel client span (`recommendation.model_call` with `endpoint`/`store_id`/`profile_id`/`personalized`/`cold_start`/`fallback` attrs), and graceful fallback. **The chatbot's agent endpoint should mirror this contract style and wrapper discipline.**

Hard constraints that shape the design: (1) the order must be **real, not simulated** — never fork the pipeline; (2) **offline-runnable / kill-switchable** is non-negotiable (registry DNS blocked locally, `DATABRICKS_API_TOKEN` expires ~daily, scale-to-zero cold starts); (3) **reuse, don't reinvent** the Databricks serving + auth + telemetry patterns; (4) **division of labor mirrors recommendation** — data-science team owns the agent endpoint, web team owns the BFF/UI integration.

## Assumptions

1. **This builds on, not replaces, the 2026-06-15 tabled brainstorm.** That brainstorm's core architecture (A1 + B1 + C1 — Databricks-served MLflow `ResponsesAgent`, `place_order` declared-on-agent-but-executed-in-BFF, reuse `synth_qsr-recommender`) is treated as **accepted prior art**. This prompt's *new* deliverables are the explicit approve/disapprove gate, speech-to-text input, the Crustopher/Agents-SDK + MLflow-experiment requirement, and the deep OTel dual-level tracing analysis.
2. **"Crustopher pattern" = MLflow `ResponsesAgent`/`ChatAgent` authored with the Databricks Agents SDK, logged to MLflow with autologging/tracing on, registered in Unity Catalog, and deployed to Model Serving** via `agents.deploy()`. The Crustopher repo is not in this cwd; assumed standard Databricks agent-authoring template (`mlflow.pyfunc` + `databricks-agents` + `mlflow.openai.autolog()`-style tracing). **Confirm against the actual Crustopher project before planning.**
3. **Demo-quality, not production.** Bar = a compelling end-to-end agentic-commerce flow with real telemetry; not PCI scope, multi-tenant hardening, or real auth. Identity is *selected* (profile/store pickers), not authenticated.
4. **Speech-to-text is browser-side (Web Speech API)**, feeding the same text turn into the agent — not a Databricks-served ASR endpoint. (Requirement "all model serving endpoints from Databricks" applies to *model* endpoints; browser ASR is not one. Server-side ASR = a second Databricks endpoint, flagged as an option.)
5. **Approve/disapprove is a structured BFF step, not an LLM self-grade.** The agent proposes a cart (`{items[], subtotal, fees, total}`); the UI renders a confirm card; only an explicit user "approve" triggers the BFF `place_order`. The agent never places an order autonomously.
6. **MLflow experiment registration happens at agent-build time** (data-science logs runs/models to an MLflow experiment in `jmrdemo`). Per-request agent *traces* land in the experiment's trace store by default.
7. **Telemetry app-level target remains `jmrdemo.zerobus.otel_spans`** via the existing collector; agent-level traces land in the MLflow experiment. The dual-level question is about whether/how to bridge them.

Confirmed from grounding (not assumed): the order contract, metadata header names, session identity fields and their defaults, the recommendation wrapper's exact request/response shape and sentinels, the flag-gate-default-ON convention, and that order-tracker already continues the W3C trace through Kafka.

## Prior Art Delta

**The 2026-06-15 brainstorm already decided** (and the handoff promoted to official Plan 5):
- **Hosting:** Databricks-served `pizzatel-agent` (MLflow `ResponsesAgent`/AgentFramework) provisioned via the existing `provisioning/` DAB with setup + destroy jobs (mirrors `synth_qsr-recommender`). Option A1.
- **The critical partition:** **data/model tools run on Databricks** (recs, preferences, local_events, menu search via synth tables); **the `place_order` action tool is declared on the agent but executed in the BFF** by calling the real `CheckoutGateway.placeOrder` with the store-id/order-type metadata. Settled (Option B1; B2 tunnel and B3 direct-Kafka-write rejected).
- **Tool surface:** `search_menu`, `get_recommendations` (existing endpoint/contract), `get_preferences`/`get_order_history`/`get_local_context` (pre-fetched context blob on chat open), `check_store`, `place_order` (BFF-executed), `get_order_status` (proxies `/api/order-status`).
- **Recs source:** reuse `synth_qsr-recommender` via the `external_recommender` contract — no retraining (Option C1; new Lakebase feature view deferred as YAGNI).
- **Auth / offline:** PAT (new `AGENT_API_TOKEN`) reusing the recommender's token pattern; OAuth-M2M (ADR 0002) as follow-up; flagd `agentEnabled` kill-switch + offline degraded state mirroring `recommendationModelEnabled`.
- **Top risks already named:** the LLM-reasoning-vs-BFF-action split (must thread W3C trace header to stitch traces) and PAT-expiry + cold-start flakiness.

**What THIS prompt ADDS or CHANGES:**

| New requirement | Delta vs prior art |
|---|---|
| **Explicit approve/disapprove gate** | Prior art said "single-turn-to-order is acceptable." This **adds a mandatory human-in-the-loop confirm step** between agent proposal and BFF order placement. New UI state + agent returns a *proposed cart*, not an order. |
| **Speech-to-text input** | **Net-new.** Browser Web Speech API → same text turn. Optional, flag-gated. |
| **Databricks Agents SDK "like Crustopher" + MLflow experiment registration** | Pins the authoring path to the Databricks Agents SDK and **explicitly requires MLflow experiment registration** — formalizing the data-science deliverable; MLflow tracing/eval becomes a first-class requirement, not a byproduct. |
| **Holidays/special-occasions conversation** | Broadens `get_local_context` to a calendar/holiday signal (static holiday table or prompt context). Minor. |
| **OTel dual-level tracing deep question** | Prior art *asserted* "stitch MLflow + OTel via W3C traceparent." This prompt **demands the actual investigation** — addressed below. **This is where prior art was hand-wavy.** |
| **Division-of-labor formalized** | Makes the recommendation-style contract handoff a first-class deliverable — a new `docs/integration/agent-endpoint-contract.md` mirroring `recommendation-endpoint-contract.md`. |

## Perspectives

- **Web team (integration owner):** owns the BFF (`pages/api/agent-chat.ts`), the chat React component, the approve/disapprove card, speech input, and `place_order` execution against the existing `Checkout.gateway`. Does **not** own the agent's reasoning or tool implementations. Contract with data-science is a request/response shape exactly like `recommendation-endpoint-contract.md`. Hard rule: the agent's proposed cart resolves against the **live catalog** and the order goes through the **unmodified** checkout path. Wants the endpoint behind a kill-switch and a cold-start-tolerant timeout.
- **Data-science team (endpoint owner):** builds `pizzatel-agent` with the Databricks Agents SDK (Crustopher pattern), authors data/model tools (Genie/SQL over `synth_silver` + `synth_ref`, plus a tool calling `synth_qsr-recommender`), logs to an MLflow experiment with tracing on, registers in UC, deploys to Model Serving. Delivers invocation URL + auth + a frozen contract. **Does NOT implement `place_order`** — it's a *declared* tool the BFF fulfills; the agent emits the structured tool-call intent.
- **Observability / SRE:** must still answer "what happened in this order?" end-to-end. Today the app trace (browser → BFF → checkout → Kafka → tracker) lands in `jmrdemo.zerobus.otel_spans` as **one continuous trace**. The agent adds a *second* tracing layer (MLflow). Worry: one stitched trace, two disjoint trees in two backends, or double-counted/colliding spans? Needs a deliberate answer, not an accidental one.
- **Customer UX:** chat should feel like it *knows me* on open ("Welcome back — your usual Large Pepperoni from Store #1234? Game Saturday — add wings?"), so the preference/local-context/holiday blob is **pre-fetched once on chat open**, not per turn. The approve step is a clean card (items, price, total, "Place order" / "Change something"); the confirmation hands straight off to the **existing order tracker** so both paths converge on the same screen.

## OTEL Dual-Level Tracing (App + Agent)

**The setup.** The app already emits OpenTelemetry spans (browser/BFF → Go/Python microservices → Kafka → order-tracker) through the OTel collector into `jmrdemo.zerobus.otel_spans`, as one trace per journey with W3C context propagated to the tracker. The Databricks agent, authored with the Agents SDK and MLflow tracing/autologging on, will *also* emit traces — at the agent reasoning/tool-call level — into its **MLflow experiment**.

### Do they conflict, double-count, or interfere?

**Key fact:** MLflow Tracing is **built on OpenTelemetry** — MLflow spans are OTel spans under the hood, and MLflow uses the OTel context/propagation machinery. This cuts both ways:

- **No double-counting *by default*, because they run in different processes against different backends.** The app's OTel SDK (browser/BFF/microservices) and the agent's MLflow tracer (inside the Model Serving container) are **separate tracer providers in separate processes**. App exports to the OTLP collector → zerobus; MLflow exports to the experiment's trace store. Neither sees the other's spans — no in-process exporter collision, no span emitted twice into the same backend. By default, **two disjoint trace trees in two backends.**
- **The interference risk is at the *boundary*, not within either layer.** When the BFF calls the agent endpoint, the BFF is inside an active OTel span. If its HTTP client injects a `traceparent` header (OTel auto-instrumentation tends to), the agent side's MLflow-on-OTel *may* pick up that incoming context as parent — the **good** kind of interference (continuity). The **bad** kind: the agent's tracer exporting *back* into the app's collector (it won't unless configured), or trace-ID format mismatches making a link look real but break in the backend.
- **Trace-ID continuity is achievable but not automatic.** Both layers use W3C 128-bit trace IDs. A single trace ID *can* span both — but only if (a) the BFF propagates `traceparent` on the agent call, and (b) the agent side extracts/continues it rather than starting a fresh root. Out of the box on Model Serving, the agent typically starts its **own** root trace per request. Continuity requires **deliberate wiring**.

### Can a single end-to-end trace span both layers?

**Partially, with caveats** — two distinct questions hide here:
1. **Can the trace ID / parent-child relationship link the layers?** Yes — via W3C `traceparent` propagation, the agent's MLflow trace can record the app's trace ID as parent (or carry it as a tag/attribute). This gives **correlation**: "agent trace X belongs to app trace Y."
2. **Can they live as one trace tree in *one backend*?** Not without an export bridge. App spans live in zerobus; agent spans live in the MLflow experiment. A shared trace ID makes them *joinable* (SQL join on trace_id), but they are not automatically *one tree in one viewer*.

So: **two trace trees in two backends by default; a shared trace ID makes them correlatable; a single tree requires an export bridge.**

### The three options

**Option 1 — Keep them fully separate (two backends, no link).**
- *Description:* App tracing untouched (zerobus). Agent uses default MLflow tracing into its experiment. No `traceparent` threading.
- *Pros:* Zero effort; each layer uses native best-fit tooling; no collision risk; MLflow eval works cleanly.
- *Cons:* No end-to-end story; the "one trace, browser→Kafka→agent" narrative is lost; order↔conversation correlation is manual.
- *Effort:* ~0. *Fit:* Safe fallback; weak demo.

**Option 2 — Propagate context so the agent trace *links* to the app trace (shared trace ID / parent reference). [RECOMMENDED]**
- *Description:* The BFF (`agent-chat.ts`), already inside an OTel span, propagates the active `traceparent` to the agent endpoint **as an explicit field in the request payload** (contract-clean — Model Serving may strip arbitrary headers). The agent reads it and either starts its MLflow trace as a child of that context **or** records the app trace ID as a trace tag (`app.trace_id`). The BFF records the returned MLflow `trace_id` as an attribute (`agent.mlflow.trace_id`) on its OTel span. Each backend now holds a span naming the other.
- *Pros:* Demo-grade end-to-end correlation with **low effort and no exporter collision**; each layer keeps its native backend (MLflow eval intact, zerobus analytics intact); JOIN `otel_spans` to MLflow traces on shared ID; **same pattern the app already uses into Kafka → tracker, extended one hop**; survives offline/kill-switch (the link is just an attribute).
- *Cons:* Still two backends to query (correlation, not unification); requires data-science to honor the propagated context (a contract line item, like cart-as-JSON-string was); Model Serving header pass-through must be verified (hence payload, not header).
- *Effort:* Low. *Fit:* **Best** — maximal demo value per unit effort, no collision risk, reuses existing propagation discipline.

**Option 3 — Export MLflow agent traces into the same OTel backend (one tree, one store).**
- *Description:* Configure the agent's MLflow tracing to **also** export via OTLP to the app's collector (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `_PROTOCOL`). Agent spans then land in `jmrdemo.zerobus.otel_spans` alongside app spans; with propagated context they form one literal trace tree.
- *Pros:* True single-pane end-to-end trace in zerobus — strongest "one trace, browser → agent → Kafka → tracker" demo; one query surface.
- *Cons:* **The real catch:** when MLflow Tracing is set to export via OTLP to an external collector, it (in current MLflow) routes traces there and you **lose the rich MLflow trace UI + MLflow evaluation/scorers in the experiment** — precisely requirement (j). Collector must reach the Model Serving network (egress). Couples agent observability to the app collector (daily-token/zerobus fragility now hits agent traces too). Higher blast radius. *Effort:* Medium. *Fit:* Highest "wow," but **fights requirement (j)** and adds coupling/fragility.

### Concrete recommendation for THIS architecture

**Adopt Option 2 (propagate context to link, keep two backends).** Rationale:
- **Extends the pattern the app already uses** — W3C context is already threaded browser → BFF → checkout → Kafka → tracker. One more hop into the agent request (as a **payload field**, not a fragile header) is idiomatic.
- **Satisfies requirement (j) without compromise:** agent MLflow traces stay in the experiment, so tracing/eval/scorers (the Crustopher value) work natively. Option 3 sacrifices that.
- **Preserves offline/kill-switch resilience:** the cross-link is just span attributes (`agent.mlflow.trace_id` app-side, `app.trace_id` MLflow-side). Any layer offline → the other unaffected — the discipline `recommendation.model_call` already follows.
- Gives the **demo narrative** ("here's the agent conversation in MLflow; here's the same order's app trace in zerobus; they share a trace ID") at near-zero risk.

**Make it a contract line item** in `agent-endpoint-contract.md`: "BFF sends `app_trace_context` (W3C traceparent string) in the request; the agent records it as the `app.trace_id` trace tag and returns its MLflow `trace_id` so the BFF can attribute it on the active OTel span." Mirrors how `recommendation-endpoint-contract.md` froze `cart_product_ids` as a JSON string and the `"guest"` sentinel.

**Keep Option 3 as a documented stretch** ("single-pane end-to-end"), attempted *after* Option 2 works and *only if* the deployed MLflow version supports dual-sink (experiment **and** OTLP) — verify first, because if OTLP export disables the experiment trace store, requirement (j) loses.

## Options

### Overall architecture

**Arch-A — Databricks-served agent (Agents SDK / Crustopher), BFF executes `place_order`, recs via existing endpoint. [RECOMMENDED]**
- *Description:* Prior-art A1+B1+C1, now pinned to the Databricks Agents SDK with MLflow experiment registration, plus the approve/disapprove gate and optional speech. New `provisioning/resources/agent_endpoint_job.yml` (+ destroy job) and an agent notebook/model (data-science); new `pages/api/agent-chat.ts` BFF + chat React component + confirm card + speech toggle (web). `place_order` declared on the agent, executed in BFF via `Checkout.gateway.placeOrder` with `pizzatel-store-id`/`pizzatel-order-type`.
- *Pros:* Maximizes the "agentic commerce on Databricks" story; reuses every proven pattern; MLflow tracing + eval native; order byte-identical to a UI order; clean division of labor.
- *Cons:* The reasoning(Databricks)/action(BFF) split is the central complexity; second daily-expiring PAT until OAuth-M2M; cold-start latency on a live demo.
- *Fit:* **Best.** Matches codebase, prior decision, all requirements.

**Arch-B — Agent as a new microservice in the compose stack, Databricks only for the LLM/tools.**
- *Pros:* Tools sit next to the gRPC services (trivial order placement, no split); easy offline fallback.
- *Cons:* Guts requirements (c) and (j) — no Agents SDK / no MLflow agent tracing/eval; Databricks becomes "just an LLM API"; weak demo. *Fit:* Fallback tier only.

**Arch-C — Agent Bricks Multi-Agent Supervisor / Genie-backed.**
- *Pros:* Genie answers preference questions over synth tables in NL fast; low build.
- *Cons:* Q&A-shaped; placing a real imperative order isn't native — you bolt on a custom tool anyway, inheriting Arch-A's split without its control; weaker fit with "Agents SDK like Crustopher." *Fit:* Viable only as a **preference-lookup sub-tool** inside Arch-A.

### Approve/disapprove mechanism (new this prompt)

**Gate-A — Structured proposed-cart + UI confirm card; BFF places order only on explicit approve. [RECOMMENDED]**
- *Description:* Agent's terminal tool is `propose_order(items[], order_type)`; returns `{proposed_cart, subtotal, fees, total}` (priced against the live catalog). UI confirm card. "Place order" → BFF `place_order` (real Checkout call). "Change something" → continues the conversation.
- *Pros:* Human-in-the-loop explicit and auditable; agent **never** auto-orders; real catalog pricing; clean handoff to the existing tracker. *Cons:* One extra round-trip + UI state. *Fit:* Best.

**Gate-B — Agent self-confirms in chat ("shall I place it?") and the next "yes" triggers placement.**
- *Pros:* Simpler UI. *Cons:* NL-parsed confirmation (ambiguous), no structured price card, weaker audit. *Fit:* Reject for an order-placing action.

### Speech input (new this prompt)

**Speech-A — Browser Web Speech API → text turn, flag-gated (`agentSpeechEnabled`). [RECOMMENDED]** Zero new endpoint, no Databricks cost, degrades to text. *Con:* browser-dependent, English-demo only.
**Speech-B — Databricks-served ASR endpoint.** Satisfies "all model endpoints on Databricks" literally, on-brand, but adds a second endpoint, latency, offline fragility for marginal gain. *Fit:* Defer / stretch.

### Tracing strategy
Covered above: **Option 2 (propagate-to-link) recommended**, Option 1 fallback, Option 3 documented stretch.

## Recommendation

**Build Arch-A:** a Databricks-served `pizzatel-agent` authored with the **Databricks Agents SDK (Crustopher pattern)**, logged/registered to an **MLflow experiment** in `jmrdemo` with tracing on, deployed to Model Serving, provisioned via the existing `provisioning/` DAB (**setup + destroy job**, per the project automation standard). Front it with a new `pages/api/agent-chat.ts` BFF + a React chat widget that pops on login, reusing the existing profile/store/session identity.

- **Tool partition (load-bearing, settled):** data/model tools run on Databricks — `search_menu`, `get_recommendations` (the **existing `synth_qsr-recommender`** via the frozen `external_recommender` contract), `get_preferences`/`get_order_history`/`get_local_context` (incl. holidays/occasions), `check_store`; the **`place_order` action tool is declared on the agent but executed in the BFF** via `Checkout.gateway.placeOrder(order, {storeId, orderType})` with `pizzatel-store-id`/`pizzatel-order-type` — the same call `checkout.ts` makes today. Order byte-identical at the Kafka boundary; tracker/fraud/zerobus unchanged.
- **Approve/disapprove (Gate-A):** agent proposes a priced cart; UI confirm card; explicit approve → BFF `place_order` → real `order_id`/`shipping_tracking_id`/cost → hand off to the **existing** order tracker (`/api/order-status`). Agent never auto-orders.
- **Tracing (Option 2):** propagate the app's W3C `traceparent` to the agent as a **request payload field** (`app_trace_context`); agent records it as `app.trace_id` and returns its MLflow `trace_id`; BFF stamps `agent.mlflow.trace_id` on its OTel span. App spans stay in `jmrdemo.zerobus.otel_spans`, agent spans stay in the MLflow experiment, **joinable on trace ID** — no exporter collision, MLflow eval intact. Contract line item.
- **Speech (Speech-A):** browser Web Speech API behind `agentSpeechEnabled`.
- **Auth / offline:** new `AGENT_API_TOKEN` reusing the recommender's PAT pattern + 20s cold-start timeout; flagd `agentEnabled` kill-switch (mirrors `recommendationModelEnabled`); agent offline → degraded chat state, storefront unaffected. OAuth-M2M (ADR 0002) as follow-up.
- **Division of labor:** author `docs/integration/agent-endpoint-contract.md` mirroring `recommendation-endpoint-contract.md` — request/response shape (incl. `app_trace_context`), auth, `propose_order`/tool-intent schema, cold-start/offline behavior, MLflow `trace_id` return. Data-science builds to it; web builds the BFF/UI against it.
- **Dependency:** Plan 4b (the model-serving wrapper) must land first — it's the reusable client this builds on.

### Top 1–2 risks

1. **The reasoning(Databricks)/action(BFF) split, and its trace stitch.** If `place_order` ever executes on the agent side, or `app_trace_context` is dropped, you get a forked/fake order or two disconnected traces — defeating both "real trackable order" and "one correlatable trace." *Mitigation:* strictly partition data/model tools (Databricks) vs the single action tool (BFF-executed); freeze `app_trace_context` + returned MLflow `trace_id` in the contract exactly as the rec contract froze the JSON-string cart and `"guest"` sentinel; verify Model Serving doesn't strip the field (payload, not header).
2. **PAT expiry + cold-start flakiness on a live demo, now on a chat surface users watch in real time.** A dead token or scale-to-zero cold start is far more visible in an interactive chatbot than a background rec call. *Mitigation:* reuse the 20s cold-start timeout + flag-gated offline path; keep a canned/scripted offline demo path behind `agentEnabled`; prioritize OAuth-M2M; consider a pre-warm ping on chat open.

### Verification flagged for the planning step (not blocking)
Confirm the Crustopher project's exact authoring pattern (`ResponsesAgent` vs `ChatAgent`, autolog flavor) and confirm, on the deployed MLflow version, whether OTLP export can run *alongside* the experiment trace store (governs whether Option 3 ever becomes viable without sacrificing req j).

---

### Files cited
`src/frontend/gateways/Api.gateway.ts`, `Session.gateway.ts`, `gateways/rpc/Checkout.gateway.ts`, `pages/api/{checkout,recommendations,order-status}.ts`, `src/recommendation/{external_recommender,recommendation_server}.py`, `docs/integration/recommendation-endpoint-contract.md`.
