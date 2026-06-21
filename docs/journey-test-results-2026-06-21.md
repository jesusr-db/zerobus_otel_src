# Chatbot User-Journey Test Results — 2026-06-21

**Stack**: local `docker-compose` (`localhost:8080`) · real `synth_qsr-commerce-agent` serving endpoint · agent pre-warmed
**Auth**: single 90-day PAT (exp 2026-09-19) for both OTel export and the agent endpoint
**Method**: drove the real BFF path (`/api/agent-chat` multi-turn → proposal → emptyCart → addItem per line → `/api/checkout`), mirroring the AgentChat widget's `onApprove`. Runner: `/tmp/journey_runner.py`.

## Summary

| Journey | Turns | Result | Order | Verified |
|---|---|---|---|---|
| J1 single pizza (pepperoni) | 4 | ✅ proposal → placed | `5d77e9bd…` (1 line) | tracker key ✓, 4 OTel spans ✓ |
| J2 pizza + drink (cheese + Sprite) | 4 | ✅ proposal → placed | `6d522cf9…` (2 lines) | tracker key ✓, 4 OTel spans ✓ |
| J3 info/deals ("any deals?") | 1 | ✅ text-only (no spurious order) | — | correct graceful reply |
| J4 recommendation → MeatZZa | 4 | ⚠️ proposal placed WRONG item (see below) | — | exposed `propose_order` divergence |

Core happy path (browse → converse → propose → approve → checkout → tracker + OTel) **works end-to-end** and both placed orders were confirmed in the valkey-cart tracker and `jmrdemo.zerobus.otel_spans` (4 spans each).

## Findings

### 1. Agent gates `propose_order` on conversational completeness (journey/UX)
The agent will not emit a structured proposal until the user has (a) confirmed a **specific** catalog item (not just a category), and (b) specified **delivery or pickup**. Abrupt "finalize my order" without these yields a clarifying question, not a proposal — the BFF correctly returns text (no card). Demo scripts must include an explicit item confirmation **and** a fulfillment-type turn. (This is why earlier "2-turn" demo phrasings worked: they implicitly carried both.)

### 2. 🔴 `propose_order` item divergence has REGRESSED (was "fixed/validated 4/4" per handoff)
Asking for **Large Pan MeatZZa (catalog id 4)**, the agent's `propose_order` returned the wrong id in **4 of 5** runs:

| run | proposed id | resolves to | correct? |
|---|---|---|---|
| 1 | 13 | Medium Thin-Crust Cheese | ❌ |
| 2 | 4 | Large Pan MeatZZa | ✅ |
| 3 | 10 | Large BBQ Chicken | ❌ |
| 4 | 13 | Medium Thin-Crust Cheese | ❌ |
| 5 | 13 | Medium Thin-Crust Cheese | ❌ |

- **Impact**: the diverged ids (10, 13) are *valid* storefront products, so the order places **silently with the wrong item** — worse than an error. A separate variant proposed id **2003** (outside the storefront catalog 1–~20) → `priceProposal` drops it → empty `priced.lines` → order silently fails to populate (this is the J4 live-run "no priced lines" case).
- **Aligned items**: Pepperoni (id 1) and Cheese (id 2) map correctly and were reliable across runs — likely coincidental id alignment between the agent's menu space and the storefront `ProductCatalog`.
- **Root-cause hypothesis**: the agent's `menuItemId` namespace does not reliably map to the storefront catalog ids (model-team-owned mapping); only a few ids coincide. Needs the model team — relay this doc.
- **Catch-net working**: the BFF span `app.agent.proposal_item_ids/names` recorded every divergence in `jmrdemo.zerobus.otel_spans` (verified: ids `[13] Medium Thin-Crust Cheese`, `[10] Large BBQ Chicken`, `[2003] (empty)`, etc.). This is exactly the instrumentation added 2026-06-18 for this bug — it's earning its keep.

## Demo guidance (until divergence is fixed by the model team)
- **Pre-warm** the agent before demoing (scale-to-zero cold start >30s → "unavailable" fallback on the first turn).
- Stick to **Pepperoni / Cheese** pizzas in scripted demos — they map correctly. Avoid MeatZZa / BBQ Chicken until the model team fixes the id mapping.
- Always include an explicit item confirmation + **delivery/pickup** turn to trigger the proposal.

## Evidence
- Runner: `/tmp/journey_runner.py`; raw summary: `/tmp/journey_results.json`
- Orders verified: `docker exec valkey-cart valkey-cli --scan --pattern "*<orderId>*"` and `SELECT … FROM jmrdemo.zerobus.otel_spans WHERE attributes['app.order.id']=…`
- Divergence spans: `SELECT attributes['app.agent.proposal_item_ids'], attributes['app.agent.proposal_item_names'] FROM jmrdemo.zerobus.otel_spans WHERE attributes['app.agent.proposal_item_count'] IS NOT NULL`
