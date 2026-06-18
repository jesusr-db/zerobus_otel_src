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
