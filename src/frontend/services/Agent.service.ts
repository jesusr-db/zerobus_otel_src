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
import { priceProposal, PricedProposal, PricedLine } from '../utils/agent/pricing';
import { getTraceparent } from '../utils/agent/traceContext';

// Destructured (not member access) so Next.js resolves them from the runtime
// env, matching the *_ADDR convention in order-status.ts. Empty URL => mock mode.
const { AGENT_ENDPOINT_URL = '', AGENT_API_TOKEN = '' } = process.env;
// Model team SLA: p99 ≤ 12s, scale_to_zero cold start. 30s client timeout.
const COLD_START_TIMEOUT_MS = 30_000;

export type AgentTurnResult = Omit<AgentReply, 'recommendations'> & { priced?: PricedProposal; recommendations?: PricedLine[] };

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

  // Collect every menu id referenced by this turn (proposal + recommendations),
  // resolve each once against the live catalog, and price both from the same map.
  // Unknown ids are dropped by priceProposal — the BFF is the pricing authority.
  const idSet = new Set<number>([
    ...(reply.proposal?.items ?? []).map(i => i.menuItemId),
    ...(reply.recommendations ?? []).map(r => r.menuItemId),
  ]);
  if (idSet.size === 0) return reply as AgentTurnResult;

  const entries = await Promise.all(
    [...idSet].map(async id => {
      try {
        const product = await ProductCatalogService.getProduct(String(id), ctx.currencyCode);
        return [String(id), product] as const;
      } catch {
        return null;
      }
    })
  );
  const products = new Map<string, Product>(entries.filter(Boolean) as Array<readonly [string, Product]>);

  // Destructure out the raw AgentRecommendation[] so the spread doesn't conflict
  // with AgentTurnResult.recommendations (PricedLine[]). The raw array is replaced
  // below with the BFF-priced PricedLine[] — or dropped if pricing yields nothing.
  const { recommendations: _rawRecs, ...replyRest } = reply;
  const result: AgentTurnResult = { ...replyRest };
  if (reply.proposal) {
    result.priced = priceProposal(reply.proposal.items, products, ctx.currencyCode, reply.proposal.orderType);
  }
  if (reply.recommendations) {
    const recLines: PricedLine[] = priceProposal(
      reply.recommendations.map(r => ({ menuItemId: r.menuItemId, quantity: r.quantity })),
      products,
      ctx.currencyCode
    ).lines;
    if (recLines.length) result.recommendations = recLines;
  }
  return result;
}

export function isMockMode(): boolean {
  return !AGENT_ENDPOINT_URL;
}
