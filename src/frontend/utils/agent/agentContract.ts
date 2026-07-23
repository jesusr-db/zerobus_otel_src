// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { PricedLine } from './pricing';

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
  // Priced recommendation cards attached to an assistant turn (Phase 2). The
  // BFF resolves + prices these against the live catalog before they reach here.
  recommendations?: PricedLine[];
}

export interface ProposedItem {
  menuItemId: number;
  quantity: number;
}

export interface AgentRecommendation {
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
  recommendations?: AgentRecommendation[];
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

// Used when the agent returns a structured proposal but no assistant chat text
// (some proposal turns come back with an empty message body). We still render
// the confirm card rather than degrading to the fallback.
const PROPOSAL_ONLY_REPLY = "Here's a suggested order — review it below and approve to place it.";

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

// In-serving MLflow tracing is currently a no-op on the deployed endpoint, so
// custom_outputs.mlflow_trace_id comes back as this sentinel rather than a real
// trace id (per the contract ledger, §3.2/§6). Treat it as absent — never stamp
// it as agent.mlflow.trace_id — until the model team enables experiment tracing.
const MLFLOW_NOOP_TRACE_ID = 'MLFLOW_NO_OP_SPAN_TRACE_ID';

// Pull assistant text from a ResponsesAgent response. The settled envelope
// (contract §2.4) is `output[0].content[i].text` where `content[i].type ==
// "output_text"`; we prefer that and only fall back to any text-bearing field
// for forward-compat. A top-level `output_text` string is also honored.
function extractText(r: Record<string, unknown>): string | undefined {
  if (typeof r.output_text === 'string' && r.output_text.length) return r.output_text;
  const output = r.output;
  if (!Array.isArray(output)) return undefined;
  let fallback: string | undefined;
  for (const item of output) {
    const content = (item as Record<string, unknown>)?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        const cr = c as Record<string, unknown>;
        const text = cr?.text;
        if (typeof text === 'string' && text.length) {
          if (cr.type === 'output_text') return text; // the settled path
          fallback ??= text;
        }
      }
    }
    const text = (item as Record<string, unknown>)?.text;
    if (typeof text === 'string' && text.length) fallback ??= text;
  }
  return fallback;
}

// Tolerant of extra fields and minor shape drift (mirrors the recommendation
// wrapper's parse_response discipline). On anything unrecognized, degrade to a
// safe fallback reply rather than throwing into the request path. The agent's
// indicative prices are intentionally dropped — the BFF is the pricing authority.
export function parseAgentResponse(raw: unknown): AgentReply {
  if (!raw || typeof raw !== 'object') return { reply: FALLBACK_REPLY, fallback: true };
  const r = raw as Record<string, unknown>;
  const co = (r.custom_outputs ?? {}) as Record<string, unknown>;

  // Parse the structured proposal FIRST, so a proposal turn that comes back with
  // an empty assistant text still renders the confirm card (don't drop it).
  let proposal: AgentProposal | undefined;
  const p = co.propose_order as Record<string, unknown> | undefined;
  if (p && Array.isArray(p.items)) {
    const items: ProposedItem[] = p.items
      .map((it: unknown) => it as Record<string, unknown> | null)
      .filter((it): it is Record<string, unknown> => it != null && Number.isInteger(it.menu_item_id) && typeof it.quantity === 'number')
      .map(it => ({ menuItemId: it.menu_item_id as number, quantity: it.quantity as number }));
    if (items.length) proposal = { items, orderType: typeof p.order_type === 'string' ? p.order_type : 'delivery' };
  }

  // Parse the recommendations channel (Phase 2). Same discipline as propose_order:
  // integer menu_item_id required, quantity optional (default 1), malformed
  // entries dropped. The agent's indicative prices (if any) are ignored — the BFF
  // re-prices against the live catalog.
  let recommendations: AgentRecommendation[] | undefined;
  const rawRecs = co.recommendations;
  if (Array.isArray(rawRecs)) {
    const recs: AgentRecommendation[] = rawRecs
      .map(it => it as Record<string, unknown> | null)
      .filter((it): it is Record<string, unknown> => it != null && Number.isInteger(it.menu_item_id))
      .map(it => ({
        menuItemId: it.menu_item_id as number,
        quantity: Number.isInteger(it.quantity) ? (it.quantity as number) : 1,
      }));
    if (recs.length) recommendations = recs;
  }

  const text = extractText(r);
  // Degrade to the fallback only when there is NEITHER assistant text NOR a
  // usable proposal — a proposal alone is enough to keep going.
  if (!text && !proposal) return { reply: FALLBACK_REPLY, fallback: true };

  const out: AgentReply = { reply: text ?? PROPOSAL_ONLY_REPLY };
  if (proposal) out.proposal = proposal;
  if (recommendations) out.recommendations = recommendations;
  if (typeof co.mlflow_trace_id === 'string' && co.mlflow_trace_id !== MLFLOW_NOOP_TRACE_ID) {
    out.agentTraceId = co.mlflow_trace_id;
  }
  if (co.cold_start === true) out.coldStart = true;

  return out;
}
