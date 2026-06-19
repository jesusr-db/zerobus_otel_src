# Agentic Commerce Chatbot — Web Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a login-triggered chat widget to the PizzaTel storefront that holds a natural-language ordering conversation, proposes a priced cart, and — on explicit user approval — places a real, trackable order through the existing checkout pipeline.

**Architecture:** A new Next.js BFF route (`/api/agent-chat`) calls a Databricks Model Serving agent endpoint, propagating the app's W3C trace context as a payload field and recording the agent's MLflow `trace_id` on the active OTel span. Because the real agent endpoint is still **owned by the data-science team and not yet delivered** (all 🟥 items in `docs/integration/agent-endpoint-contract.md`), this plan builds the entire web integration against a **deterministic mock agent** that honors the contract shape. Setting `AGENT_ENDPOINT_URL` + `AGENT_API_TOKEN` swaps in the real endpoint with no code change. Order placement reuses the existing cart → `/api/checkout` → confirmation/tracker path unchanged — the agent only *proposes*; the BFF *places*.

**Tech Stack:** Next.js (pages router), TypeScript, React, styled-components, `@tanstack/react-query`, `@openfeature/react-sdk` (flagd), `@opentelemetry/api`. New dev dependency: **Vitest** (additive — the frontend currently has only Cypress and zero unit tests).

## Global Constraints

- **License header on every new file** (verbatim, first two lines):
  `// Copyright The OpenTelemetry Authors`
  `// SPDX-License-Identifier: Apache-2.0`
- **All model serving is Databricks** — the agent is invoked via `POST /serving-endpoints/<NAME>/invocations`. No other LLM provider.
- **`place_order` is declared on the agent but EXECUTED IN THE BFF.** The agent returns a *proposal only*; order placement always goes through the existing cart/checkout path. Never let the agent place an order.
- **Offline / kill-switchable.** A flagd flag `agentEnabled` gates the widget. When `AGENT_ENDPOINT_URL` is empty the BFF uses the mock agent, so the feature is fully functional offline. On endpoint timeout/error the BFF returns a graceful fallback reply (`fallback: true`) — the storefront never breaks.
- **Cold-start timeout: 30s** on the agent fetch (model team SLA: p50 ≤ 3s, p99 ≤ 12s, endpoint is `scale_to_zero`; pre-warm on chat-open recommended).
- **Agent wire shape (confirmed by model team 2026-06-18):** the endpoint is an MLflow **`ResponsesAgent`** named **`synth_qsr-commerce-agent`** (UC model `jmrdemo.synth_features.qsr_commerce_agent`). The invocation body is `{ "input": [{role, content}...], "custom_inputs": {...} }`. **Stateless** — the web resends the full message array each turn. The web-facing route contract (`{messages, context}`) is unchanged; the BFF maps it to this shape internally.
- **Trace stitch (Option 2 from the brainstorm):** the BFF sends `app_trace_context` (W3C `traceparent` string) inside **`custom_inputs`** (payload, not an HTTP header). The agent records it as MLflow tag `app.trace_id` and returns its MLflow `trace_id` in **`custom_outputs.mlflow_trace_id`**; the BFF stamps it on the active span as `agent.mlflow.trace_id`. App spans stay in zerobus, agent spans stay in the MLflow experiment, joinable on trace ID.
- **Pricing authority:** the agent returns *indicative* prices in `propose_order`; the **BFF re-prices against the live catalog** at proposal time and is the source of truth at `place_order`. This plan ignores the agent's prices and re-prices (Task 2).
- **Item-ID space:** proposed items use `menu_item_id` (**integer**); the storefront catalog id is `str(menu_item_id)` (already aligned with the recommender — no mapping table).
- **Speech is browser-side** (Web Speech API), gated by flagd `agentSpeechEnabled`. No server-side ASR endpoint.
- **Out of scope (separate subsystem, model team):** the `pizzatel-agent` itself, its tools, MLflow registration, and the provisioning DAB. Tracked as 🟥 items in `docs/integration/agent-endpoint-contract.md`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/frontend/vitest.config.ts` | Vitest config (node env, ts) | 1 |
| `src/frontend/package.json` | add `vitest` devDep + `test` script | 1 |
| `src/frontend/utils/agent/agentContract.ts` | typed contract: `buildAgentRequest`, `parseAgentResponse` (pure) | 1 |
| `src/frontend/utils/agent/__tests__/agentContract.test.ts` | contract tests | 1 |
| `src/frontend/utils/agent/pricing.ts` | `priceProposal` — price line items from catalog Products (pure) | 2 |
| `src/frontend/utils/agent/__tests__/pricing.test.ts` | pricing tests | 2 |
| `src/frontend/utils/agent/mockAgent.ts` | deterministic offline agent honoring the contract | 3 |
| `src/frontend/utils/agent/__tests__/mockAgent.test.ts` | mock agent tests | 3 |
| `src/frontend/utils/agent/traceContext.ts` | `getTraceparent()` — inject active W3C context to a string | 4 |
| `src/frontend/services/Agent.service.ts` | server-side brain: call real/mock agent, price proposal | 4 |
| `src/frontend/pages/api/agent-chat.ts` | Next BFF route + OTel attrs + trace stitch | 4 |
| `src/frontend/gateways/Api.gateway.ts` | add `sendAgentMessage` client method | 5 |
| `src/frontend/components/AgentChat/AgentChat.tsx` | the chat widget (text) + confirm card | 5,6 |
| `src/frontend/components/AgentChat/AgentChat.styled.ts` | widget styles | 5 |
| `src/frontend/components/AgentChat/useSpeechInput.ts` | Web Speech API hook | 7 |
| `src/frontend/pages/_app.tsx` | mount the widget inside CartProvider | 5 |
| `src/flagd/demo.flagd.json` | add `agentEnabled`, `agentSpeechEnabled` flags | 5,7 |
| `src/frontend/.env.example` | document `AGENT_ENDPOINT_URL`, `AGENT_API_TOKEN` | 4,8 |
| `docs/integration/agent-endpoint-contract.md` | ledger note: web side built; go-live steps | 8 |

---

### Task 1: Vitest harness + agent contract module

**Files:**
- Create: `src/frontend/vitest.config.ts`
- Modify: `src/frontend/package.json` (devDependencies + scripts)
- Create: `src/frontend/utils/agent/agentContract.ts`
- Test: `src/frontend/utils/agent/__tests__/agentContract.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2–5):
  - `AgentSessionContext { profileId: string; storeId: string; memberId: string; userId: string; currencyCode: string }`
  - `AgentChatMessage { role: 'user' | 'assistant'; content: string }`
  - `ProposedItem { menuItemId: number; quantity: number }`
  - `AgentProposal { items: ProposedItem[]; orderType: string }`
  - `AgentReply { reply: string; proposal?: AgentProposal; agentTraceId?: string; coldStart?: boolean; fallback?: boolean }`
  - `AgentRequestPayload { input: AgentChatMessage[]; custom_inputs: { profile_id: string; member_id: string; store_id: string; app_trace_context: string } }` (ResponsesAgent shape — confirmed by model team)
  - `buildAgentRequest(messages: AgentChatMessage[], ctx: AgentSessionContext, traceparent: string): AgentRequestPayload`
  - `parseAgentResponse(raw: unknown): AgentReply` — reads ResponsesAgent output (assistant text + `custom_outputs.{propose_order, mlflow_trace_id, cold_start}`), tolerant of extra fields and the not-yet-finalized text envelope (model team posts the exact example at their deploy).

- [ ] **Step 1: Add Vitest dev dependency and test script**

Edit `src/frontend/package.json` — add to `devDependencies` (keep alphabetical-ish, match existing quoting):
```json
    "vitest": "2.1.9"
```
Add to `scripts`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Install**

Run: `cd src/frontend && npm install`
Expected: adds `vitest` to `node_modules`, exits 0.

- [ ] **Step 3: Create Vitest config**

Create `src/frontend/vitest.config.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['utils/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/frontend/utils/agent/__tests__/agentContract.test.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { buildAgentRequest, parseAgentResponse } from '../agentContract';

const ctx = { profileId: '1234', storeId: '42', memberId: '1234', userId: 'u1', currencyCode: 'USD' };

describe('buildAgentRequest', () => {
  it('builds the ResponsesAgent shape: messages in `input`, identity + traceparent in `custom_inputs`', () => {
    const req = buildAgentRequest([{ role: 'user', content: 'pepperoni please' }], ctx, 'tp-abc');
    expect(req).toEqual({
      input: [{ role: 'user', content: 'pepperoni please' }],
      custom_inputs: {
        profile_id: '1234',
        member_id: '1234',
        store_id: '42',
        app_trace_context: 'tp-abc',
      },
    });
  });
});

describe('parseAgentResponse', () => {
  it('reads assistant text, proposal + mlflow trace id from custom_outputs; ignores extras and indicative prices', () => {
    const out = parseAgentResponse({
      output_text: 'How about a large pepperoni?',
      custom_outputs: {
        mlflow_trace_id: 'tr-99',
        propose_order: {
          items: [{ menu_item_id: 1, quantity: 2, item_name: 'Large Pepperoni', unit_price: 14.99 }],
          order_type: 'delivery',
          subtotal: 29.98,
          pricing_note: 'indicative',
        },
      },
      usage: { ignore: true },
    });
    expect(out.reply).toBe('How about a large pepperoni?');
    // BFF re-prices, so only id + quantity are carried forward — indicative prices dropped.
    expect(out.proposal).toEqual({ items: [{ menuItemId: 1, quantity: 2 }], orderType: 'delivery' });
    expect(out.agentTraceId).toBe('tr-99');
    expect(out.fallback).toBeUndefined();
  });

  it('falls back to the `output[]` items when `output_text` is absent', () => {
    const out = parseAgentResponse({
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Welcome back!' }] }],
      custom_outputs: { mlflow_trace_id: 'tr-1' },
    });
    expect(out.reply).toBe('Welcome back!');
    expect(out.agentTraceId).toBe('tr-1');
    expect(out.proposal).toBeUndefined();
  });

  it('returns a fallback reply when the payload is malformed', () => {
    const out = parseAgentResponse({ unexpected: 'shape' });
    expect(out.fallback).toBe(true);
    expect(out.reply.length).toBeGreaterThan(0);
    expect(out.proposal).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/agentContract.test.ts`
Expected: FAIL — `Cannot find module '../agentContract'`.

- [ ] **Step 6: Write minimal implementation**

Create `src/frontend/utils/agent/agentContract.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

export interface AgentSessionContext {
  profileId: string;
  storeId: string;
  memberId: string;
  userId: string;
  currencyCode: string;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProposedItem {
  menuItemId: number;
  quantity: number;
}

export interface AgentProposal {
  items: ProposedItem[];
  orderType: string;
}

export interface AgentReply {
  reply: string;
  proposal?: AgentProposal;
  agentTraceId?: string;
  coldStart?: boolean;
  fallback?: boolean;
}

// MLflow ResponsesAgent invocation body (confirmed by the model team):
// messages go in `input`; identity + the trace link go in `custom_inputs`.
export interface AgentRequestPayload {
  input: AgentChatMessage[];
  custom_inputs: {
    profile_id: string;
    member_id: string;
    store_id: string;
    app_trace_context: string;
  };
}

const FALLBACK_REPLY =
  "Sorry — I'm having trouble reaching the ordering assistant right now. You can keep shopping and try again in a moment.";

export function buildAgentRequest(
  messages: AgentChatMessage[],
  ctx: AgentSessionContext,
  traceparent: string
): AgentRequestPayload {
  return {
    input: messages,
    custom_inputs: {
      profile_id: ctx.profileId,
      member_id: ctx.memberId,
      store_id: ctx.storeId,
      app_trace_context: traceparent,
    },
  };
}

// Pull assistant text from a ResponsesAgent response. Prefer `output_text`;
// fall back to scanning `output[].content[].text`. (Exact envelope is finalized
// when the model team posts their first deploy example — this stays tolerant.)
function extractText(r: Record<string, unknown>): string | undefined {
  if (typeof r.output_text === 'string' && r.output_text.length) return r.output_text;
  const output = r.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const text = (c as Record<string, unknown>)?.text;
          if (typeof text === 'string' && text.length) return text;
        }
      }
      const text = (item as Record<string, unknown>)?.text;
      if (typeof text === 'string' && text.length) return text;
    }
  }
  return undefined;
}

// Tolerant of extra fields and minor shape drift (mirrors the recommendation
// wrapper's parse_response discipline). On anything unrecognized, degrade to a
// safe fallback reply rather than throwing into the request path. The agent's
// indicative prices are intentionally dropped — the BFF is the pricing authority.
export function parseAgentResponse(raw: unknown): AgentReply {
  if (!raw || typeof raw !== 'object') return { reply: FALLBACK_REPLY, fallback: true };
  const r = raw as Record<string, unknown>;
  const text = extractText(r);
  if (!text) return { reply: FALLBACK_REPLY, fallback: true };

  const out: AgentReply = { reply: text };
  const co = (r.custom_outputs ?? {}) as Record<string, unknown>;

  if (typeof co.mlflow_trace_id === 'string') out.agentTraceId = co.mlflow_trace_id;
  if (co.cold_start === true) out.coldStart = true;

  const p = co.propose_order as Record<string, unknown> | undefined;
  if (p && Array.isArray(p.items)) {
    const items: ProposedItem[] = p.items
      .map((it: unknown) => it as Record<string, unknown>)
      .filter(it => typeof it.menu_item_id === 'number' && typeof it.quantity === 'number')
      .map(it => ({ menuItemId: it.menu_item_id as number, quantity: it.quantity as number }));
    if (items.length) out.proposal = { items, orderType: typeof p.order_type === 'string' ? p.order_type : 'delivery' };
  }

  return out;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/agentContract.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
cd src/frontend && git add package.json package-lock.json vitest.config.ts utils/agent/agentContract.ts utils/agent/__tests__/agentContract.test.ts
git commit -m "feat(agent): add vitest harness + agent contract types/parser"
```

---

### Task 2: Proposal pricing module

**Files:**
- Create: `src/frontend/utils/agent/pricing.ts`
- Test: `src/frontend/utils/agent/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `ProposedItem` (Task 1), `Product`/`Money` (`../../protos/demo`).
- Produces (consumed by Tasks 4–6):
  - `PricedLine { productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }`
  - `PricedProposal { lines: PricedLine[]; currencyCode: string; subtotal: number }`
  - `moneyToNumber(m?: Money): number`
  - `priceProposal(items: ProposedItem[], products: Map<string, Product>, currencyCode: string): PricedProposal`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/utils/agent/__tests__/pricing.test.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { priceProposal, moneyToNumber } from '../pricing';
import type { Product } from '../../../protos/demo';

const product = (id: string, name: string, units: number, nanos = 0): Product =>
  ({ id, name, description: '', picture: '', priceUsd: { currencyCode: 'USD', units, nanos }, categories: [] } as Product);

describe('moneyToNumber', () => {
  it('combines units and nanos', () => {
    expect(moneyToNumber({ currencyCode: 'USD', units: 12, nanos: 990000000 })).toBeCloseTo(12.99, 2);
  });
  it('returns 0 for undefined', () => {
    expect(moneyToNumber(undefined)).toBe(0);
  });
});

describe('priceProposal', () => {
  it('prices known items, multiplies by quantity, and sums the subtotal', () => {
    const products = new Map<string, Product>([
      ['1', product('1', 'Large Pepperoni', 12, 990000000)],
      ['14', product('14', 'Garlic Knots', 5)],
    ]);
    const out = priceProposal(
      [{ menuItemId: 1, quantity: 2 }, { menuItemId: 14, quantity: 1 }],
      products,
      'USD'
    );
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0]).toMatchObject({ productId: '1', name: 'Large Pepperoni', quantity: 2 });
    expect(out.lines[0].lineTotal).toBeCloseTo(25.98, 2);
    expect(out.subtotal).toBeCloseTo(30.98, 2);
    expect(out.currencyCode).toBe('USD');
  });

  it('drops items whose menu_item_id is not in the catalog', () => {
    const products = new Map<string, Product>([['1', product('1', 'Large Pepperoni', 10)]]);
    const out = priceProposal([{ menuItemId: 1, quantity: 1 }, { menuItemId: 999, quantity: 3 }], products, 'USD');
    expect(out.lines).toHaveLength(1);
    expect(out.subtotal).toBeCloseTo(10, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/pricing.test.ts`
Expected: FAIL — `Cannot find module '../pricing'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/utils/agent/pricing.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { Money, Product } from '../../protos/demo';
import type { ProposedItem } from './agentContract';

export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedProposal {
  lines: PricedLine[];
  currencyCode: string;
  subtotal: number;
}

export function moneyToNumber(m?: Money): number {
  if (!m) return 0;
  return m.units + m.nanos / 1_000_000_000;
}

// Catalog id == str(menu_item_id) (aligned with the recommender). Items whose id
// is absent from the catalog are dropped, not faked — the order must resolve
// against the live catalog.
export function priceProposal(
  items: ProposedItem[],
  products: Map<string, Product>,
  currencyCode: string
): PricedProposal {
  const lines: PricedLine[] = [];
  for (const item of items) {
    const product = products.get(String(item.menuItemId));
    if (!product) continue;
    const unitPrice = moneyToNumber(product.priceUsd);
    lines.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, currencyCode, subtotal };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/pricing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd src/frontend && git add utils/agent/pricing.ts utils/agent/__tests__/pricing.test.ts
git commit -m "feat(agent): add proposal pricing against the live catalog"
```

---

### Task 3: Deterministic mock agent (offline mode)

**Files:**
- Create: `src/frontend/utils/agent/mockAgent.ts`
- Test: `src/frontend/utils/agent/__tests__/mockAgent.test.ts`

**Interfaces:**
- Consumes: `AgentChatMessage`, `AgentSessionContext`, `AgentReply` (Task 1).
- Produces (consumed by Task 4): `mockAgentRespond(messages: AgentChatMessage[], ctx: AgentSessionContext): AgentReply`

**Why:** the real endpoint is a 🟥 contract dependency. The mock lets the full feature run, demo, and test offline. It is intentionally simple — a keyword state machine, not an LLM — and emits a contract-shaped proposal so swapping in the real endpoint changes nothing downstream.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/utils/agent/__tests__/mockAgent.test.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mockAgentRespond } from '../mockAgent';

const ctx = { profileId: '1234', storeId: '42', memberId: '1234', userId: 'u1', currencyCode: 'USD' };

describe('mockAgentRespond', () => {
  it('greets without a proposal on an opening message', () => {
    const out = mockAgentRespond([{ role: 'user', content: 'hi' }], ctx);
    expect(out.reply.length).toBeGreaterThan(0);
    expect(out.proposal).toBeUndefined();
  });

  it('emits a contract-shaped proposal when the user expresses intent to order', () => {
    const out = mockAgentRespond([{ role: 'user', content: 'I want to order a pepperoni pizza' }], ctx);
    expect(out.proposal).toBeDefined();
    expect(out.proposal!.items.length).toBeGreaterThan(0);
    expect(typeof out.proposal!.items[0].menuItemId).toBe('number');
    expect(out.proposal!.orderType).toBe('delivery');
  });

  it('tags itself so the BFF can mark responses as mock-sourced', () => {
    const out = mockAgentRespond([{ role: 'user', content: 'order pizza' }], ctx);
    expect(out.agentTraceId).toMatch(/^mock-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/mockAgent.test.ts`
Expected: FAIL — `Cannot find module '../mockAgent'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/utils/agent/mockAgent.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { AgentChatMessage, AgentReply, AgentSessionContext } from './agentContract';

// Deterministic stand-in for the Databricks pizzatel-agent. Keyword-driven, no
// network, no randomness. menu_item_id 1 = "Large Hand-Tossed Pepperoni",
// 14 = a sides item (aligned with the catalog / recommender id space).
const ORDER_INTENT = /\b(order|buy|get|want|add|cart|checkout|hungry)\b/i;

export function mockAgentRespond(messages: AgentChatMessage[], ctx: AgentSessionContext): AgentReply {
  const last = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  const who = ctx.profileId && ctx.profileId !== 'guest' ? ` (profile ${ctx.profileId})` : '';

  if (!ORDER_INTENT.test(last)) {
    return {
      reply: `Hi${who}! I'm your PizzaTel ordering assistant. Tell me what you're in the mood for — a classic pepperoni, something for a game night, or your usual?`,
      agentTraceId: `mock-${messages.length}`,
    };
  }

  return {
    reply:
      "Great — here's a suggested order: a Large Hand-Tossed Pepperoni and a side of Garlic Knots. Review it below and approve to place the order.",
    proposal: { items: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 14, quantity: 1 }], orderType: 'delivery' },
    agentTraceId: `mock-${messages.length}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run utils/agent/__tests__/mockAgent.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite + commit**

Run: `cd src/frontend && npm test`
Expected: PASS (all agent tests green).
```bash
cd src/frontend && git add utils/agent/mockAgent.ts utils/agent/__tests__/mockAgent.test.ts
git commit -m "feat(agent): add deterministic mock agent for offline mode"
```

---

### Task 4: Trace-context helper + Agent service + `/api/agent-chat` BFF route

**Files:**
- Create: `src/frontend/utils/agent/traceContext.ts`
- Create: `src/frontend/services/Agent.service.ts`
- Create: `src/frontend/pages/api/agent-chat.ts`
- Modify: `src/frontend/.env.example` (create if absent)

**Interfaces:**
- Consumes: everything from Tasks 1–3, `ProductCatalogService.getProduct` (`../../services/ProductCatalog.service`), `InstrumentationMiddleware`.
- Produces (consumed by Task 5):
  - `getTraceparent(): string`
  - `runAgentTurn(messages, ctx): Promise<AgentTurnResult>` where
    `AgentTurnResult = AgentReply & { priced?: PricedProposal }`
  - HTTP: `POST /api/agent-chat` body `{ messages: AgentChatMessage[]; context: { profileId; storeId; memberId } }` query `?currencyCode=USD` → `200` JSON `AgentTurnResult`.

- [ ] **Step 1: Create the trace-context helper**

Create `src/frontend/utils/agent/traceContext.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { context, propagation } from '@opentelemetry/api';

// Inject the active W3C context into a carrier and return the `traceparent`
// string. The BFF sends this in the agent request PAYLOAD (not a header) so the
// agent can link its MLflow trace to this app trace. Empty string if no active
// context (degrades safely).
export function getTraceparent(): string {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ?? '';
}
```

- [ ] **Step 2: Create the Agent service (real-or-mock + pricing)**

Create `src/frontend/services/Agent.service.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { Product } from '../protos/demo';
import ProductCatalogService from './ProductCatalog.service';
import {
  AgentChatMessage,
  AgentReply,
  AgentSessionContext,
  buildAgentRequest,
  parseAgentResponse,
} from '../utils/agent/agentContract';
import { mockAgentRespond } from '../utils/agent/mockAgent';
import { priceProposal, PricedProposal } from '../utils/agent/pricing';
import { getTraceparent } from '../utils/agent/traceContext';

// Destructured (not member access) so Next.js resolves them from the runtime
// env, matching the *_ADDR convention in order-status.ts. Empty URL => mock mode.
const { AGENT_ENDPOINT_URL = '', AGENT_API_TOKEN = '' } = process.env;
// Model team SLA: p99 ≤ 12s, scale_to_zero cold start. 30s client timeout.
const COLD_START_TIMEOUT_MS = 30_000;

export type AgentTurnResult = AgentReply & { priced?: PricedProposal };

async function callRealAgent(messages: AgentChatMessage[], ctx: AgentSessionContext): Promise<AgentReply> {
  const payload = buildAgentRequest(messages, ctx, getTraceparent());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLD_START_TIMEOUT_MS);
  try {
    const res = await fetch(AGENT_ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_API_TOKEN}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { reply: 'The ordering assistant is unavailable right now. Please try again shortly.', fallback: true };
    return parseAgentResponse(await res.json());
  } catch {
    return { reply: 'The ordering assistant is unavailable right now. Please try again shortly.', fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function runAgentTurn(
  messages: AgentChatMessage[],
  ctx: AgentSessionContext
): Promise<AgentTurnResult> {
  const reply: AgentReply = AGENT_ENDPOINT_URL ? await callRealAgent(messages, ctx) : mockAgentRespond(messages, ctx);

  if (!reply.proposal) return reply;

  // Resolve + price proposed items against the live catalog (same getProduct the
  // recommendations route uses). Unknown ids are dropped by priceProposal.
  const entries = await Promise.all(
    reply.proposal.items.map(async item => {
      try {
        const product = await ProductCatalogService.getProduct(String(item.menuItemId), ctx.currencyCode);
        return [String(item.menuItemId), product] as const;
      } catch {
        return null;
      }
    })
  );
  const products = new Map<string, Product>(entries.filter(Boolean) as Array<readonly [string, Product]>);
  const priced = priceProposal(reply.proposal.items, products, ctx.currencyCode);
  return { ...reply, priced };
}

export function isMockMode(): boolean {
  return !AGENT_ENDPOINT_URL;
}
```

- [ ] **Step 3: Create the BFF route**

Create `src/frontend/pages/api/agent-chat.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import { trace } from '@opentelemetry/api';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';
import { runAgentTurn, AgentTurnResult, isMockMode } from '../../services/Agent.service';
import { AgentChatMessage } from '../../utils/agent/agentContract';

type TResponse = AgentTurnResult | { error: string };

const handler = async ({ method, body, query }: NextApiRequest, res: NextApiResponse<TResponse>) => {
  if (method !== 'POST') return res.status(405).send({ error: 'method not allowed' });

  const { currencyCode = 'USD' } = query;
  const { messages = [], context = {} } = (body ?? {}) as {
    messages: AgentChatMessage[];
    context: { profileId?: string; storeId?: string; memberId?: string };
  };
  const ctx = {
    profileId: String(context.profileId ?? 'guest'),
    storeId: String(context.storeId ?? ''),
    memberId: String(context.memberId ?? ''),
    userId: '',
    currencyCode: String(currencyCode),
  };

  trace.getActiveSpan()?.setAttributes({
    'app.agent.profile_id': ctx.profileId,
    'app.agent.store_id': ctx.storeId,
    'app.agent.member_id': ctx.memberId,
    'app.agent.turn': messages.length,
    'app.agent.mock_mode': isMockMode(),
  });

  const result = await runAgentTurn(messages, ctx);

  trace.getActiveSpan()?.setAttributes({
    'app.agent.has_proposal': Boolean(result.proposal),
    'app.agent.fallback': Boolean(result.fallback),
    'app.agent.cold_start': Boolean(result.coldStart),
    // The cross-link to the agent's MLflow trace (Option 2 in the brainstorm).
    'agent.mlflow.trace_id': result.agentTraceId ?? '',
  });

  return res.status(200).json(result);
};

export default InstrumentationMiddleware(handler);
```

- [ ] **Step 4: Document the env vars**

Create (or append to) `src/frontend/.env.example`:
```bash
# Databricks agent endpoint — Model Serving name: synth_qsr-commerce-agent
# (UC model jmrdemo.synth_features.qsr_commerce_agent), a ResponsesAgent.
# Leave BOTH empty to run the built-in mock agent offline. Set both to go live.
# URL form: https://<workspace-host>/serving-endpoints/synth_qsr-commerce-agent/invocations
AGENT_ENDPOINT_URL=
AGENT_API_TOKEN=
```

- [ ] **Step 5: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: exits 0 (no type errors). If `ProductCatalogService.getProduct` signature differs, fix the call to match `recommendations.ts` usage (`getProduct(id, currencyCode)`).

- [ ] **Step 6: Smoke-test the route in dev (mock mode)**

Run (terminal A): `cd src/frontend && npm run dev`
Run (terminal B):
```bash
curl -s -X POST 'http://localhost:8080/api/agent-chat?currencyCode=USD' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"I want to order a pepperoni pizza"}],"context":{"profileId":"1234","storeId":"42","memberId":"1234"}}' | jq .
```
Expected: JSON with a non-empty `reply`, a `proposal.items` array, and a `priced.lines` array with `lineTotal`/`subtotal`. (Port: the frontend dev server — adjust if your dev port differs.)

- [ ] **Step 7: Commit**

```bash
cd src/frontend && git add utils/agent/traceContext.ts services/Agent.service.ts pages/api/agent-chat.ts .env.example
git commit -m "feat(agent): add /api/agent-chat BFF route with trace stitch + mock fallback"
```

---

### Task 5: Client API method + chat widget (text) + flag + mount

**Files:**
- Modify: `src/frontend/gateways/Api.gateway.ts`
- Create: `src/frontend/components/AgentChat/AgentChat.tsx`
- Create: `src/frontend/components/AgentChat/AgentChat.styled.ts`
- Modify: `src/frontend/pages/_app.tsx`
- Modify: `src/flagd/demo.flagd.json`

**Interfaces:**
- Consumes: `runAgentTurn` HTTP contract (Task 4), `useBooleanFlagValue` (`@openfeature/react-sdk`), `SessionGateway`, `useCurrency`.
- Produces (consumed by Task 6): the `AgentChat` component with local `messages` state, a `sendMessage` handler, and a render slot for the priced proposal confirm card (approve wiring lands in Task 6).
  - `ApiGateway.sendAgentMessage(messages: AgentChatMessage[]): Promise<AgentTurnResult>`

- [ ] **Step 1: Add the client method to Api.gateway.ts**

In `src/frontend/gateways/Api.gateway.ts`, add this method inside the `Apis()` object (after `listRecommendations`):
```ts
  sendAgentMessage(messages: import('../utils/agent/agentContract').AgentChatMessage[]) {
    // defaults so a stale session never emits the string "undefined"
    const { storeId = '', profileId = 'guest', memberId = '', currencyCode = 'USD' } = SessionGateway.getSession();
    return request<import('../services/Agent.service').AgentTurnResult>({
      url: `${basePath}/agent-chat`,
      method: 'POST',
      queryParams: { currencyCode },
      body: { messages, context: { profileId, storeId, memberId } },
    });
  },
```

- [ ] **Step 2: Add the flagd flag**

In `src/flagd/demo.flagd.json`, add to the `flags` object (copy the `recommendationModelEnabled` pattern):
```json
    "agentEnabled": {
      "description": "Show the agentic commerce chatbot widget",
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "on"
    },
```

- [ ] **Step 3: Create the widget styles**

Create `src/frontend/components/AgentChat/AgentChat.styled.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Launcher = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  border: none;
  border-radius: 50%;
  width: 56px;
  height: 56px;
  font-size: 24px;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.otelBlue ?? '#1f7aec'};
  color: #fff;
`;

export const Panel = styled.div`
  position: fixed;
  right: 24px;
  bottom: 92px;
  z-index: 1000;
  width: 360px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
`;

export const Header = styled.div`
  padding: 12px 16px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.otelBlue ?? '#1f7aec'};
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Bubble = styled.div<{ $role: 'user' | 'assistant' }>`
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : 'flex-start')};
  background: ${({ $role }) => ($role === 'user' ? '#1f7aec' : '#f1f1f1')};
  color: ${({ $role }) => ($role === 'user' ? '#fff' : '#222')};
  padding: 8px 12px;
  border-radius: 12px;
  max-width: 80%;
  font-size: 14px;
  white-space: pre-wrap;
`;

export const Card = styled.div`
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 12px;
  font-size: 14px;
`;

export const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
`;

export const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

export const InputRow = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #eee;
`;

export const TextInput = styled.input`
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 14px;
`;

export const Button = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  background: ${({ $variant }) => ($variant === 'ghost' ? '#eee' : '#1f7aec')};
  color: ${({ $variant }) => ($variant === 'ghost' ? '#222' : '#fff')};
`;
```

- [ ] **Step 4: Create the widget (text only; approve handler stubbed for Task 6)**

Create `src/frontend/components/AgentChat/AgentChat.tsx`:
```tsx
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { useBooleanFlagValue } from '@openfeature/react-sdk';
import ApiGateway from '../../gateways/Api.gateway';
import type { AgentChatMessage } from '../../utils/agent/agentContract';
import type { AgentTurnResult } from '../../services/Agent.service';
import type { PricedProposal } from '../../utils/agent/pricing';
import * as S from './AgentChat.styled';

const AgentChat = () => {
  const enabled = useBooleanFlagValue('agentEnabled', false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [proposal, setProposal] = useState<PricedProposal | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const next = [...messages, { role: 'user' as const, content: trimmed }];
      setMessages(next);
      setInput('');
      setBusy(true);
      try {
        const res: AgentTurnResult = await ApiGateway.sendAgentMessage(next);
        setMessages(m => [...m, { role: 'assistant', content: res.reply }]);
        setProposal(res.priced && res.priced.lines.length ? res.priced : undefined);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy]
  );

  // Approve/disapprove wiring is added in Task 6.
  const onApprove = useCallback(() => undefined, []);
  const onChange = useCallback(() => setProposal(undefined), []);

  if (!enabled) return null;

  if (!open) {
    return (
      <S.Launcher aria-label="Open ordering assistant" onClick={() => setOpen(true)}>
        🍕
      </S.Launcher>
    );
  }

  return (
    <S.Panel role="dialog" aria-label="Ordering assistant">
      <S.Header>
        PizzaTel Assistant
        <S.Button $variant="ghost" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </S.Button>
      </S.Header>
      <S.Messages>
        {messages.length === 0 && <S.Bubble $role="assistant">Hi! What would you like to order today?</S.Bubble>}
        {messages.map((m, i) => (
          <S.Bubble key={i} $role={m.role}>
            {m.content}
          </S.Bubble>
        ))}
        {proposal && (
          <S.Card>
            {proposal.lines.map(l => (
              <S.CardRow key={l.productId}>
                <span>
                  {l.quantity}× {l.name}
                </span>
                <span>
                  {l.lineTotal.toFixed(2)} {proposal.currencyCode}
                </span>
              </S.CardRow>
            ))}
            <S.CardRow>
              <strong>Subtotal</strong>
              <strong>
                {proposal.subtotal.toFixed(2)} {proposal.currencyCode}
              </strong>
            </S.CardRow>
            <S.Actions>
              <S.Button onClick={onApprove}>Place order</S.Button>
              <S.Button $variant="ghost" onClick={onChange}>
                Change something
              </S.Button>
            </S.Actions>
          </S.Card>
        )}
      </S.Messages>
      <S.InputRow
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
      >
        <S.TextInput
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={busy ? 'Thinking…' : 'Type your order…'}
          disabled={busy}
        />
        <S.Button type="submit" disabled={busy}>
          Send
        </S.Button>
      </S.InputRow>
    </S.Panel>
  );
};

export default AgentChat;
```

- [ ] **Step 5: Mount the widget in `_app.tsx`**

In `src/frontend/pages/_app.tsx`, add the import near the other component imports:
```tsx
import AgentChat from '../components/AgentChat/AgentChat';
```
Then render it inside `CartProvider` (it needs cart context in Task 6), immediately after `<Component {...pageProps} />`:
```tsx
            <CartProvider>
              <Component {...pageProps} />
              <AgentChat />
            </CartProvider>
```

- [ ] **Step 6: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: exits 0. (If `theme.colors.otelBlue` is not in the theme type, the `?? '#1f7aec'` fallback already covers runtime; if tsc complains, change the styled access to a literal `#1f7aec`.)

- [ ] **Step 7: Verify in dev**

Run: `cd src/frontend && npm run dev`, open the storefront. Expected: a 🍕 launcher bottom-right; clicking opens the panel; typing "I want to order a pepperoni pizza" returns an assistant reply and a priced confirm card with "Place order" / "Change something". "Change something" dismisses the card. (Place order is wired in Task 6.)

- [ ] **Step 8: Commit**

```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
git add src/frontend/gateways/Api.gateway.ts src/frontend/components/AgentChat/ src/frontend/pages/_app.tsx src/flagd/demo.flagd.json
git commit -m "feat(agent): add chat widget (text) + agentEnabled flag, mounted in app"
```

---

### Task 6: Approve → reuse cart checkout → confirmation/tracker

**Files:**
- Modify: `src/frontend/components/AgentChat/AgentChat.tsx`

**Interfaces:**
- Consumes: `useCart()` → `{ emptyCart, addItem, placeOrder }` (`../../providers/Cart.provider`), `useCurrency()`, `useRouter()`, `SessionGateway`, `PlaceOrderArg`.
- Produces: on approve, a real order via the existing pipeline + client navigation to `/cart/checkout/<orderId>` (the existing confirmation page + order tracker).

**Design:** the agent only proposes. On approve the BFF-backed cart path executes the order: empty the cart so the order is exactly what was approved, add each approved line as a cart item, then call the same `placeOrder` the checkout form uses (with demo defaults for the fields the chat doesn't collect). This reuses checkout → Kafka → order-tracker → confirmation untouched.

- [ ] **Step 1: Add imports and demo-checkout constant**

In `src/frontend/components/AgentChat/AgentChat.tsx`, add imports:
```tsx
import { useRouter } from 'next/router';
import { useCart } from '../../providers/Cart.provider';
import { useCurrency } from '../../providers/Currency.provider';
import SessionGateway from '../../gateways/Session.gateway';
import type { PlaceOrderArg } from '../../providers/Cart.provider';
```
Add this module-level constant above the component (the chat doesn't collect payment/address; use the same demo values the storefront uses for a quick checkout):
```tsx
const DEMO_CHECKOUT = {
  email: 'someone@example.com',
  address: { streetAddress: '1600 Amphitheatre Parkway', city: 'Mountain View', state: 'CA', country: 'United States', zipCode: '94043' },
  creditCard: { creditCardNumber: '4432801561520454', creditCardCvv: 672, creditCardExpirationYear: 2030, creditCardExpirationMonth: 1 },
};
```

- [ ] **Step 2: Wire hooks and replace the stubbed `onApprove`**

Inside the component, add hook calls near the other `useState`/`useBooleanFlagValue` calls:
```tsx
  const { emptyCart, addItem, placeOrder } = useCart();
  const { selectedCurrency } = useCurrency();
  const { push } = useRouter();
```
Replace the stubbed `onApprove` with:
```tsx
  const onApprove = useCallback(async () => {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      const { userId } = SessionGateway.getSession();
      await emptyCart();
      for (const line of proposal.lines) {
        await addItem({ productId: line.productId, quantity: line.quantity });
      }
      const order = await placeOrder({
        userId,
        email: DEMO_CHECKOUT.email,
        address: DEMO_CHECKOUT.address,
        userCurrency: selectedCurrency,
        creditCard: DEMO_CHECKOUT.creditCard,
        orderType: 'delivery',
      } as PlaceOrderArg);
      setProposal(undefined);
      setMessages(m => [...m, { role: 'assistant', content: `Order placed! Confirmation #${order.orderId}. Opening your tracker…` }]);
      push({ pathname: `/cart/checkout/${order.orderId}`, query: { order: JSON.stringify(order) } });
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'I could not place the order. Please try from the cart.' }]);
    } finally {
      setBusy(false);
    }
  }, [proposal, busy, emptyCart, addItem, placeOrder, selectedCurrency, push]);
```

- [ ] **Step 3: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: exits 0. (`addItem` expects a `CartItem` = `{ productId, quantity }`; `placeOrder` expects `PlaceOrderArg`. If `addItem`'s type is stricter, match the `CartItem` shape from `protos/demo`.)

- [ ] **Step 4: Verify the end-to-end journey in dev**

Run the full stack (`docker compose up` or the project's run target) so cart/checkout/order-tracker services are live. In the storefront:
1. Select a store + profile (pickers).
2. Open the chat, say "I want to order a pepperoni pizza".
3. Confirm the priced card appears, click **Place order**.
Expected: navigates to `/cart/checkout/<orderId>` showing a real order id + shipping tracking id, and the existing order tracker renders. Confirm in `order-tracker` logs/Valkey that `tracker:<orderId>` exists (same as a manual order).

- [ ] **Step 5: Commit**

```bash
cd src/frontend && git add components/AgentChat/AgentChat.tsx
git commit -m "feat(agent): approve proposal -> real order via existing checkout + tracker"
```

---

### Task 7: Speech-to-text input (optional, flag-gated)

**Files:**
- Create: `src/frontend/components/AgentChat/useSpeechInput.ts`
- Modify: `src/frontend/components/AgentChat/AgentChat.tsx`
- Modify: `src/flagd/demo.flagd.json`

**Interfaces:**
- Consumes: browser `window.SpeechRecognition || window.webkitSpeechRecognition`, `useBooleanFlagValue`.
- Produces: `useSpeechInput(onText: (t: string) => void): { supported: boolean; listening: boolean; toggle: () => void }`

- [ ] **Step 1: Add the speech flag**

In `src/flagd/demo.flagd.json`, add to `flags`:
```json
    "agentSpeechEnabled": {
      "description": "Enable browser speech-to-text input in the chatbot",
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off"
    },
```

- [ ] **Step 2: Create the speech hook**

Create `src/frontend/components/AgentChat/useSpeechInput.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API wrapper. Browser-only; degrades to unsupported where
// the API is absent (no server-side ASR — see the contract).
export function useSpeechInput(onText: (t: string) => void): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) onText(transcript);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setSupported(true);
    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, [onText]);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      rec.start();
      setListening(true);
    }
  }, [listening]);

  return { supported, listening, toggle };
}
```

- [ ] **Step 3: Wire the mic button into the widget**

In `src/frontend/components/AgentChat/AgentChat.tsx`, add the import:
```tsx
import { useSpeechInput } from './useSpeechInput';
```
Add inside the component (after the other hooks):
```tsx
  const speechEnabled = useBooleanFlagValue('agentSpeechEnabled', false);
  const { supported: speechSupported, listening, toggle: toggleSpeech } = useSpeechInput(setInput);
```
In the `InputRow`, add a mic button before the Send button (only when enabled + supported):
```tsx
        {speechEnabled && speechSupported && (
          <S.Button type="button" $variant="ghost" onClick={toggleSpeech} aria-label="Speak your order">
            {listening ? '⏺' : '🎤'}
          </S.Button>
        )}
```

- [ ] **Step 4: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Manual verify**

With `agentSpeechEnabled` on (edit `demo.flagd.json` defaultVariant to `on` locally, or toggle via flagd), open the chat in a Chromium browser: a 🎤 button appears; clicking prompts mic permission; speaking fills the input box. With the flag off (default), no mic button. (Speech is hard to automate — manual check is the gate.)

- [ ] **Step 6: Commit**

```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
git add src/frontend/components/AgentChat/useSpeechInput.ts src/frontend/components/AgentChat/AgentChat.tsx src/flagd/demo.flagd.json
git commit -m "feat(agent): optional browser speech-to-text input, flag-gated"
```

---

### Task 8: Go-live docs + ledger update + final review

**Files:**
- Modify: `docs/integration/agent-endpoint-contract.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Run the full unit suite**

Run: `cd src/frontend && npm test`
Expected: PASS (all agent tests green).

- [ ] **Step 2: Append a ledger entry**

In `docs/integration/agent-endpoint-contract.md`, add a row at the **top** of the Section 0 ledger table:
```
| 2026-06-18 | web | Web integration built against the **mock agent** (offline-capable), targeting your confirmed **ResponsesAgent** shape: request `{ input, custom_inputs:{ profile_id, member_id, store_id, app_trace_context } }`; response parsed for assistant text + `custom_outputs.{ propose_order, mlflow_trace_id, cold_start }`. **Pricing authority: CONFIRMED — BFF re-prices at proposal + place_order; your indicative prices are display-only (we drop them).** Widget, BFF route `/api/agent-chat`, trace-stitch (`app_trace_context` in `custom_inputs` → `agent.mlflow.trace_id` recorded on the app span), approve→real-order via existing checkout/tracker, and optional browser speech are live behind flags `agentEnabled`/`agentSpeechEnabled`. Client timeout 30s per your SLA. **To go live:** set `AGENT_ENDPOINT_URL` (`.../serving-endpoints/synth_qsr-commerce-agent/invocations`) + `AGENT_API_TOKEN` — no web code change. **Last open item:** §2.4 exact response envelope + a real request/response example (your Task 9 deploy) so we finalize the `output_text` vs `output[]` text-extraction path. |
```

- [ ] **Step 3: Self-review against the spec**

Confirm each spec requirement maps to a task: profile-aware (Task 4 ctx) ✓; product-aware/pricing (Tasks 2,4) ✓; Databricks-served + mockable (Task 4) ✓; pop-up chat on login (Task 5) ✓; NL conversation (Tasks 3,5) ✓; recommendations/history/holidays (agent-side, contract §2.3 — out of scope here, noted) ✓; proposal + approve/disapprove (Tasks 5,6) ✓; flows into existing order + confirmation/tracker (Task 6) ✓; speech optional (Task 7) ✓; trace stitch app+agent (Task 4) ✓.

- [ ] **Step 4: Commit**

```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
git add docs/integration/agent-endpoint-contract.md
git commit -m "docs(agent): record web-integration completion + go-live steps in ledger"
```

---

## Notes for the implementer

- **Dev server port:** the smoke-test curl in Task 4 assumes the frontend on `:8080`. Adjust to your actual dev port.
- **`ProductCatalogService.getProduct` signature:** verified used as `getProduct(id, currencyCode)` in `pages/api/recommendations.ts`. If it differs in your tree, match that file.
- **`Product.priceUsd`:** pricing reads `product.priceUsd` (a `Money`). If the catalog returns a different price field, adjust `priceProposal`'s `moneyToNumber(product.priceUsd)` accordingly and update the pricing test.
- **Do not move order placement onto the agent.** If the real endpoint starts returning a "placed order," ignore it — the BFF/cart path is the only thing that places orders (Global Constraints).
- **Trace continuity check (when live):** after wiring the real endpoint, confirm the BFF span carries a non-empty `agent.mlflow.trace_id` and that the agent's MLflow trace tags `app.trace_id` — that's the Option-2 join key.
