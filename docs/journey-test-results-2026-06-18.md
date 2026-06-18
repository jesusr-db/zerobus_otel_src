# Agentic Commerce Chatbot — Deployed-App Journey Test Results

**Date:** 2026-06-18
**Branch:** `feat/agentic-commerce-chatbot`
**Path:** Playwright (headless chromium) driving the deployed frontend container behind the envoy proxy at `http://localhost:8080` (local Docker Compose stack — no OAuth wall).
**Mode:** mock agent (offline; `AGENT_ENDPOINT_URL` empty). Full backend stack live (product-catalog, cart, checkout, order-tracker, flagd, valkey).

## Setup notes
- The frontend container had to be rebuilt to pick up the new widget (it was running a pre-feature image).
- Build env: `registry.npmjs.org` is DNS-blocked here; builds used the `npm-proxy.cloud.databricks.com` registry via a temporary `.npmrc` (reverted before commit — not part of the feature).

## Journey J1 — Happy path: order a pizza via chat → place order → tracker
**Session:** seeded `storeId=42, profileId=1234, memberId=1234` (a built-in profile, as the dropdown would set).
**Prompt:** "I want to order a pepperoni pizza"

| Stage | Evidence | Verdict |
|---|---|---|
| Launcher renders | 🍕 "Open ordering assistant" visible (flagd `agentEnabled` on) | ✅ |
| Panel opens | dialog renders | ✅ |
| Agent reply + priced card | "Large Hand-Tossed Pepperoni $15.99" + "Medium BBQ Chicken $14.99", **Subtotal $30.98 USD** (priced against live catalog, agent's indicative prices dropped) | ✅ |
| Place order | navigated to `/cart/checkout/310ddc4a-6b4f-11f1-8515-bec41c5b19ca`, confirmation page rendered | ✅ |
| Backend propagation | Valkey `EXISTS tracker:310ddc4a-…` → `1` (order-tracker consumed the Kafka event) | ✅ |

**BFF server-side check (curl through proxy):** `POST /api/agent-chat` returns `priced.lines` populated with real catalog prices + `agentTraceId: mock-1`. Confirms the Task-4 "empty priced.lines" smoke observation was an env artifact (no gRPC backend under bare `npm run dev`), not a code bug.

**Verdict: PASS** — agent proposal → real order → confirmation/tracker, identical pipeline to a manual checkout. Widget inherits the selected dropdown profile via `SessionGateway` (read fresh per message).

## New findings (caught ONLY by the deployed-app test; unit tests + tsc could not surface them)

### 1. Build-breaker — frontend Dockerfile omitted `utils/agent/` (FIXED, commit 407cbda)
`src/frontend/Dockerfile` copies `utils/` file-by-file (`Request.ts`, `productImage.ts`, `enums/`, `telemetry/`), not wholesale. The feature's new `utils/agent/` dir was never copied → `next build` failed: *Cannot find module '../../utils/agent/agentContract'*. The feature was unbuildable into the production image. Host `tsc`/`vitest` run on the full tree and never see this. **Fix:** added `COPY ./src/frontend/utils/agent/ utils/agent/`.

### 2. `emptyCart()` 204 aborts agent order placement (FIXED, commit f802adc)
On approve, `await emptyCart()` (DELETE → **204**) rejected with `Failed to execute 'text' on 'Response': body stream already read`. Root cause: the OTel fetch instrumentation fails to clone the empty-body 204 (`Failed to construct 'Response': Response with null body status cannot have body`), corrupting the body stream that `Request.ts` then reads via `.text()`. Only 204 responses hit this; every other endpoint returns 200 + JSON. The existing `CartDetail` "Empty Cart" button calls `emptyCart` **fire-and-forget**, so this latent rejection was always harmless — the agent flow is the first to `await` it. The DELETE reaches the server (cart empties server-side); only the client promise rejects afterward. **Fix:** wrap the clear in try/catch in `onApprove` — safe because the server-side empty already succeeded.

### 3. Double-submit window on "Place order" (FIXED, adversarial review)
The approve button lacked `disabled={busy}` (unlike Send), so a fast double-click could fire two order sequences. Fixed by disabling both proposal buttons while busy.

## Deferred (non-blocking)
- **Cosmetic:** mock bubble text says "Garlic Knots" but `menu_item_id 14` prices as "Medium BBQ Chicken" — the priced card shows the real catalog name; only the chat prose mismatches. (mockAgent.ts)
- **Real-agent-path only (go-live checklist):** agent's `order_type` not threaded through `PricedProposal` (approve hardcodes `'delivery'`); no telemetry/UX for a proposal that prices to zero lines; no empty-`AGENT_API_TOKEN` guard.
- **UX (plan-mandated):** approve `emptyCart()` wipes any pre-existing user cart so the order = exactly the approved lines.

## Roll-up
- Journeys: **1 PASS / 0 PARTIAL / 0 FAIL**
- Unit suite: 12/12 green; `tsc` clean
- Deployed-app: 2 build/runtime bugs found + fixed + re-verified PASS; 1 review bug fixed
- Design confirmed with owner: widget is **always-on (flag-gated), inherits the selected dropdown profile** (guest by default) — the plan's "login-triggered" phrasing meant this, not a separate auth gate.
