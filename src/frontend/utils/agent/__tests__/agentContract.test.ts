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

  it('does not throw on null/invalid items; keeps only valid integer-id items', () => {
    const out = parseAgentResponse({
      output_text: 'ok',
      custom_outputs: {
        propose_order: { items: [null, { menu_item_id: 1.5, quantity: 1 }, { menu_item_id: 7, quantity: 2 }], order_type: 'pickup' },
      },
    });
    expect(out.reply).toBe('ok');
    expect(out.proposal).toEqual({ items: [{ menuItemId: 7, quantity: 2 }], orderType: 'pickup' });
  });

  // Real deployed-endpoint envelopes from the contract ledger §2.4 (2026-06-18).
  it('parses the real deployed proposal-turn envelope (Example A) and drops the no-op trace sentinel', () => {
    const out = parseAgentResponse({
      output: [
        {
          type: 'message',
          id: '2a4174c4-a860-43b1-a11e-e289840718a1',
          role: 'assistant',
          content: [{ type: 'output_text', text: "Perfect! I've got your order ready:" }],
        },
      ],
      custom_outputs: {
        mlflow_trace_id: 'MLFLOW_NO_OP_SPAN_TRACE_ID',
        propose_order: {
          tool: 'propose_order',
          items: [
            { menu_item_id: 1, item_name: 'Large Hand-Tossed Pepperoni', quantity: 2, unit_price: 15.99 },
            { menu_item_id: 53, item_name: '20oz Coca-Cola', quantity: 1, unit_price: 2.29 },
          ],
          order_type: 'delivery',
          subtotal: 34.27,
          tax_estimate: 3.08,
          total: 37.35,
          currency: 'USD',
          pricing_note: 'indicative — BFF is pricing authority at place_order',
        },
      },
    });
    expect(out.reply).toBe("Perfect! I've got your order ready:");
    // indicative prices dropped; only id + quantity carried forward
    expect(out.proposal).toEqual({
      items: [
        { menuItemId: 1, quantity: 2 },
        { menuItemId: 53, quantity: 1 },
      ],
      orderType: 'delivery',
    });
    // sentinel trace id must be treated as absent (tracing is a no-op in serving)
    expect(out.agentTraceId).toBeUndefined();
  });

  it('parses the real guest text-only envelope (Example B): reply text, no proposal, no trace id', () => {
    const out = parseAgentResponse({
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Our most popular pizzas are the Pepperoni and the Margherita.' }] },
      ],
      custom_outputs: { mlflow_trace_id: 'MLFLOW_NO_OP_SPAN_TRACE_ID' },
    });
    expect(out.reply).toContain('most popular');
    expect(out.proposal).toBeUndefined();
    expect(out.agentTraceId).toBeUndefined();
  });

  it('renders the proposal even when the assistant text is empty (does not drop to fallback)', () => {
    const out = parseAgentResponse({
      output: [{ type: 'message', role: 'assistant', content: [] }], // no output_text
      custom_outputs: {
        propose_order: { items: [{ menu_item_id: 1, quantity: 1 }], order_type: 'delivery' },
        mlflow_trace_id: 'MLFLOW_NO_OP_SPAN_TRACE_ID',
      },
    });
    expect(out.fallback).toBeUndefined();
    expect(out.reply.length).toBeGreaterThan(0); // default proposal reply
    expect(out.proposal).toEqual({ items: [{ menuItemId: 1, quantity: 1 }], orderType: 'delivery' });
  });

  it('prefers the output_text content block over a preceding non-output_text block', () => {
    const out = parseAgentResponse({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'internal thinking that must not surface' },
            { type: 'output_text', text: 'the real answer' },
          ],
        },
      ],
      custom_outputs: {},
    });
    expect(out.reply).toBe('the real answer');
  });
});
