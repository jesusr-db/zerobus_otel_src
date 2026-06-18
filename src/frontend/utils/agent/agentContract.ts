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
