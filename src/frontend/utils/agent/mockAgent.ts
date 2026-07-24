// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { AgentChatMessage, AgentReply, AgentSessionContext } from './agentContract';

// Deterministic stand-in for the Databricks pizzatel-agent. Keyword-driven, no
// network, no randomness. menu_item_id 1 = "Large Hand-Tossed Pepperoni",
// 14 = a sides item (aligned with the catalog / recommender id space).
const ORDER_INTENT = /\b(order|buy|get|want|add|cart|checkout|hungry)\b/i;
const RECOMMEND_INTENT = /\b(recommend|recommendation|suggest|suggestion|popular|what should)\b/i;

export function mockAgentRespond(messages: AgentChatMessage[], ctx: AgentSessionContext): AgentReply {
  const last = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  const who = ctx.profileId && ctx.profileId !== 'guest' ? ` (profile ${ctx.profileId})` : '';

  if (RECOMMEND_INTENT.test(last)) {
    return {
      // Names + prices come from the live catalog on the BFF; the bubble stays
      // generic so it never drifts from the menu. Ids align with the catalog /
      // recommender id space (1 = pepperoni, 14 = a sides item).
      reply: 'Here are a few picks you might like — tap "+" to add any of them to your cart.',
      recommendations: [
        { menuItemId: 1, quantity: 1 },
        { menuItemId: 14, quantity: 1 },
      ],
      agentTraceId: `mock-${messages.length}`,
    };
  }

  if (!ORDER_INTENT.test(last)) {
    return {
      reply: `Hi${who}! I'm your PizzaTel ordering assistant. Tell me what you're in the mood for — a classic pepperoni, something for a game night, or your usual?`,
      agentTraceId: `mock-${messages.length}`,
    };
  }

  return {
    // The priced confirm card (built from the live catalog) is the source of truth
    // for item names + prices, so the bubble stays generic — naming specific items
    // here would drift from the catalog whenever the menu changes.
    reply:
      "Great — I've put together a suggested order based on a classic pepperoni pick. Review the items and prices below, then approve to place the order.",
    proposal: { items: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 14, quantity: 1 }], orderType: 'delivery' },
    agentTraceId: `mock-${messages.length}`,
  };
}
