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
