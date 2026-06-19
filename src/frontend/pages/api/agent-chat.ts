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

  // Record exactly what the agent proposed (ids from the agent's propose_order,
  // names resolved against the live catalog). This is the catch-net for the
  // agent-side propose_order/conversation divergence (contract ledger 2026-06-18):
  // if the card ever disagrees with the chat again, the proposed items are on the
  // span in zerobus for a concrete repro — no in-serving MLflow trace required.
  const proposalItemIds = (result.proposal?.items ?? []).map(i => String(i.menuItemId));
  const proposalItemNames = (result.priced?.lines ?? []).map(l => l.name);

  trace.getActiveSpan()?.setAttributes({
    'app.agent.has_proposal': Boolean(result.proposal),
    'app.agent.fallback': Boolean(result.fallback),
    'app.agent.cold_start': Boolean(result.coldStart),
    'app.agent.proposal_item_count': proposalItemIds.length,
    'app.agent.proposal_item_ids': proposalItemIds,
    'app.agent.proposal_item_names': proposalItemNames,
    // The cross-link to the agent's MLflow trace (Option 2 in the brainstorm).
    'agent.mlflow.trace_id': result.agentTraceId ?? '',
  });

  return res.status(200).json(result);
};

export default InstrumentationMiddleware(handler);
