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
