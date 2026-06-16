# Agentic Commerce Chatbot on PizzaTel — Brainstorm (Opus, 2026-06-15)

> Brainstorm output for an agentic-commerce chatbot on the PizzaTel storefront: a conversational agent that knows the user's preferences (location, pizzas, prior orders, upcoming events), places a real trackable order, and returns a tracking number + cost. Agent endpoint provisioned on Databricks with access to the synth data + the `synth_qsr-recommender` model. Grounded in the existing codebase.

## Framing

The opportunity is to add an **agentic ordering surface** to PizzaTel: a conversational agent that already knows who the user is (profile/loyalty/store/history/local context), can recommend a personalized order, and can **place a real, trackable order** that flows through the *exact same* checkout → Kafka `orders` → `order-tracker` → Valkey pipeline the storefront already uses — returning a real `order_id`, the `shipping_tracking_id`, and the (currently $0-delivery) cost so the user can track it.

The hard constraint that shapes everything: **the order must be real, not simulated.** PizzaTel already has a working order path with a precise contract:
- `PlaceOrderRequest{ user_id, user_currency, address, email, credit_card }` → Checkout (Go) gateway, with `pizzatel-store-id` / `pizzatel-order-type` set as **gRPC metadata** (`src/frontend/gateways/rpc/Checkout.gateway.ts`).
- Checkout publishes `OrderResult{ order_id, shipping_tracking_id, shipping_cost, ... }` protobuf to Kafka `orders` with W3C trace headers + `pizzatel.store_id` / `pizzatel.order_type` Kafka headers.
- `order-tracker` (`src/order-tracker/consumer.go`) consumes those, samples a stage timeline, writes `tracker:<order_id>` to Valkey; the BFF `/api/order-status?orderId=` (`src/frontend/pages/api/order-status.ts`) reads it back.
- Cart is keyed by `user_id` in Valkey via `Cart.gateway.ts` (getCart/addItem/emptyCart).

The agent's "place order" tool must therefore **build a valid `PlaceOrderRequest` and call the same Checkout service with the same metadata** — anything else would bypass the tracker and produce a fake order. This is the central design decision.

Two more framing constraints from the project:
- **Reuse, don't reinvent, the Databricks integration pattern.** The recommendation service (`external_recommender.py` + `recommendation_server.py`) already establishes the canonical pattern: a microservice calls a Databricks Model Serving endpoint (PAT auth, flag-gated kill-switch `recommendationModelEnabled`, 20s cold-start timeout, OTel client span `recommendation.model_call`, graceful fallback). The agent's recommendation tool should call the **existing `synth_qsr-recommender` endpoint**, not a new model.
- **Offline-runnable is non-negotiable.** Registry DNS is blocked locally and `DATABRICKS_API_TOKEN` expires ~daily. The agent must degrade gracefully: if the Databricks-served LLM is unreachable, the chat surface must still function (or fail visibly without breaking the storefront), exactly as the recommendation service falls back to random.

## Assumptions

1. **Goal is demo-quality, not production.** Databricks FE demo asset; "compelling agentic-commerce flow end-to-end with real telemetry" is the bar — not multi-tenant hardening, payment PCI scope, or auth beyond the existing PAT→OAuth-M2M trajectory (ADR 0002).
2. **Identity is selected, not authenticated.** User picks a profile/loyalty member + store (Plan 4a picker exists). Agent inherits `profile_id` (== `member_id`, 1–50,000) and `store_id` (`unit_id`) from session — no real login. Cart `user_id` = existing session/cart id.
3. **Preferences come from synth tables in `jmrdemo`, surfaced as agent tools/context** (not a new feature store): `synth_silver.guest_order` + `order_item` (prior orders), `guest_profile`, `loyalty_transaction` (tier), `synth_ref.local_events` / `weather_conditions` (upcoming events / weather), `synth_ref.menu_item` / `unit`.
4. **The menu the agent orders from is the live product-catalog** (68 items, ids == `menu_item_id`), so recommended/ordered ids resolve against the real catalog and tracker.
5. **Payment/credit-card is dummy** (demo already uses fake card data); agent fills a valid-shaped `CreditCardInfo` + default delivery `Address` from store/profile zip. Delivery cost is $0 per current quote config.
6. **One agent, single-turn-to-order is acceptable**; no multi-session memory beyond synth history.
7. **Telemetry target is `jmrdemo.zerobus.otel_spans`** via the existing OTel collector — agent tool calls appear as spans in the same trace tree.

## Perspectives

- **Storefront/microservices engineer:** Don't fork the order path. The agent's order must be indistinguishable from a UI order at the Kafka boundary, or tracker/fraud-detection/Zerobus analytics diverge. Thin agent calling existing services > re-implementing checkout.
- **Databricks FE / demo narrator:** The money shot is *the agent runs on Databricks, calls a Databricks-served model, reads Databricks synth data, and the whole tool-call chain shows up as MLflow traces + OTel spans in Zerobus.* Maximize how much of the agent lives on Databricks.
- **Offline-demo operator:** Must run on a laptop with Databricks unreachable + expired token. Hard dependency on a live LLM endpoint = fragile. Needs a fallback path + kill-switch flag like recommendation has.
- **Security/auth:** PAT expires daily (ADR 0002 → OAuth M2M). Don't add a second PAT consumer without a migration story. Order-placing tools need a guardrail against runaway loops.
- **UX:** Agent should feel like it *knows* me — "Welcome back, your usual Large Pepperoni from Store #1234, and there's a game Saturday — add wings?" Requires preference + local_events tools pre-fetched, not slow per-turn round-trips.

## Options

### A. Where the agent is hosted / served
**A1 — Databricks-served agent endpoint (MLflow ResponsesAgent / Mosaic AgentFramework), frontend chat widget calls it. [recommended]**
New `pizzatel-agent` Model Serving endpoint deployed via the existing `provisioning/` DAB (mirroring `synth_qsr-recommender`, with setup/destroy job). MLflow `ResponsesAgent` with function-calling tools; MLflow Tracing for free. Frontend chat widget (new `pages/api/agent-chat.ts` BFF + React panel, reusing profile/store picker) proxies turns with PAT auth, like `recommendations.ts`.
- **Pros:** Maximizes "agentic commerce on Databricks" story; reuses proven provisioning/PAT/flag-gate/OTel pattern; MLflow tool-call tracing is the highlight; tools run near data.
- **Cons:** Order/cart tools must reach local gRPC microservices (Docker, not Databricks) → either tools call back through a BFF callback, or (cleaner) **action tools execute in the BFF** while the Databricks agent does LLM reasoning + recommendation + preference lookups. This split is the key complexity.
- **Fit:** Best. Matches every established pattern + the demo's purpose.

**A2 — Agent entirely in a new microservice (Go/Python) in the compose stack, calls a Databricks FM endpoint only for the LLM.**
- **Pros:** Tools next to gRPC services (trivial order placement); easy offline fallback; one new service.
- **Cons:** Weakens "agent on Databricks" narrative (Databricks = just an LLM API); loses MLflow agent tracing/eval; re-implements orchestration.
- **Fit:** Good engineering, weaker demo. Solid **fallback tier**.

**A3 — Agent Bricks Multi-Agent Supervisor / Genie-backed agent.**
- **Pros:** Fast; Genie over synth tables answers preference questions in NL.
- **Cons:** Genie/KA are Q&A-shaped; **placing a real imperative order through gRPC/Kafka isn't native** — you bolt a custom tool on anyway, inheriting A1's split without A1's control.
- **Fit:** Poor for order-placing; possibly a *preference-lookup sub-tool* only.

### B. How the agent places + tracks a real order
**B1 — Agent emits structured order intent; a BFF `place_order` tool calls the existing Checkout gateway. [recommended]**
Agent's `place_order` is a *declared* function the frontend BFF fulfills: agent returns `{tool:place_order, items:[{product_id,qty}], order_type, store_id}`; BFF builds a real `PlaceOrderRequest` (default address/email/dummy card from profile+store), calls `CheckoutGateway.placeOrder(req, {storeId, orderType})` — the **same call `checkout.ts` makes today** — returns `OrderResult.order_id` + `shipping_tracking_id` + `shipping_cost`. Tracking = existing `/api/order-status?orderId=`.
- **Pros:** Order byte-identical to UI order at Kafka; tracker/fraud/Zerobus unchanged; zero new order contract.
- **Cons:** Action lives in BFF, not Databricks (reasoning = MLflow trace, action = OTel span — stitch via the W3C trace header checkout already propagates).
- **Fit:** Best — only option satisfying "real trackable order" without forking the pipeline.

**B2 — Agent (on Databricks) calls a tunnelled Checkout endpoint directly.** Requires exposing Docker gRPC to Databricks (ngrok), breaks offline, adds auth surface. **Reject.**

**B3 — Agent writes to Kafka `orders` itself.** Re-implements pricing/quote/payment/fraud + protobuf+headers by hand; high drift; bypasses fraud-detection. **Reject.**

### C. How it accesses preferences + the recommendation model
**C1 — Reuse `synth_qsr-recommender` for recs; add lightweight preference tools over synth tables. [recommended]**
- `get_recommendations` → existing endpoint, same contract (`profile_id, member_id, store_id, cart_product_ids` JSON string, `viewed_product_id`, `num_recommendations`) + the `external_recommender.py` parsing.
- `get_preferences`/`get_order_history` → `synth_silver.guest_order` + `order_item` (usual order), `loyalty_transaction` (tier), `guest_profile`.
- `get_local_context` → `synth_ref.local_events` + `weather_conditions` on the store's metro (the "upcoming special event" upsell).
- **Pros:** Single rec source of truth; no retraining; data exists. Agent = conversational layer over the same model + data the storefront uses.
- **Cons:** Per-turn SQL latency — mitigate by pre-fetching a "profile context blob" once on chat open.
- **Fit:** Best.

**C2 — New Lakebase online feature view / vector index for preferences.** Low-latency but new provisioning surface for marginal demo gain; YAGNI. **Defer.**

## Recommendation

**Build a Databricks-served `pizzatel-agent` (A1) as an MLflow `ResponsesAgent`/AgentFramework endpoint, provisioned via the existing `provisioning/` DAB (setup + destroy job), fronted by a new chat widget + `pages/api/agent-chat.ts` BFF — using tool split B1 + C1.**

**Tool surface (function-calling):**
- `search_menu(query)` — product-catalog / `synth_ref.menu_item`.
- `get_recommendations(cart_ids, viewed_id)` — existing `synth_qsr-recommender` via the `external_recommender` contract.
- `get_preferences()` / `get_order_history()` / `get_local_context()` — read `guest_order`, `order_item`, `loyalty_transaction`, `guest_profile`, `local_events`, `weather_conditions` (pre-fetched into a context blob on session open).
- `check_store(store_id)` — `synth_ref.unit`.
- `place_order(items, order_type)` — **declared on the agent, executed in the BFF**, which calls real `CheckoutGateway.placeOrder` with `pizzatel-store-id`/`pizzatel-order-type` metadata. Returns real `order_id`, `shipping_tracking_id`, `shipping_cost`.
- `get_order_status(order_id)` — proxies existing `/api/order-status`.

**Telemetry:** MLflow Tracing for agent reasoning + data/model tool calls on Databricks; `place_order` action is an OTel span in the BFF, stitched into the same trace via the W3C `traceparent` the agent passes down (checkout already propagates it to Kafka → tracker → Zerobus). One trace: "user asks" → model rec → checkout → tracker, visible in MLflow + `jmrdemo.zerobus.otel_spans`.

**Auth:** PAT for the agent endpoint + recommender (reuse `RECOMMENDATION_API_TOKEN` pattern / new `AGENT_API_TOKEN`); OAuth-M2M migration (ADR 0002) flagged as follow-up (this adds a 2nd daily-expiring PAT consumer).

**Offline / kill-switch:** flagd flag `agentEnabled` (mirroring `recommendationModelEnabled`); if the Databricks agent endpoint is unreachable, chat shows a degraded "agent offline" state and the storefront is unaffected. Order-placement tools (BFF over local gRPC) keep working even when Databricks is down (canned/scripted offline path possible).

### Top risks
1. **The LLM/action split (Databricks reasoning vs BFF order execution).** Make `place_order` a declared-but-BFF-fulfilled tool and keep the W3C trace header threaded so MLflow + OTel traces stitch into one. Mishandled → two disconnected traces, or the agent calls Checkout directly and breaks offline-runnability. Mitigation: strictly partition "data/model tools (Databricks)" vs "action tools (BFF)"; agent returns intents the BFF executes.
2. **PAT expiry + cold-start latency.** Second daily-expiring PAT + scale-to-zero cold starts can make live demos flaky. Mitigation: reuse the recommender's 20s cold-start timeout + fallback discipline; keep an offline canned path behind `agentEnabled`; prioritize OAuth-M2M.

### Files/services this would touch
New `provisioning/resources/agent_endpoint_job.yml` (+ destroy job) + agent notebook/model; reuse `src/recommendation/external_recommender.py` contract; new `src/frontend/pages/api/agent-chat.ts` BFF + chat React component; reuse `Checkout.gateway.ts`, `Cart.gateway.ts`, `pages/api/order-status.ts`, `profiles.ts`, `stores.ts`; new flagd flag `agentEnabled`; tables `jmrdemo.synth_silver.{guest_order,order_item,guest_profile,loyalty_transaction}` + `synth_ref.{menu_item,unit,local_events,weather_conditions}`; endpoint `synth_qsr-recommender`; telemetry into `jmrdemo.zerobus.otel_spans`.
