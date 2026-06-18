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
