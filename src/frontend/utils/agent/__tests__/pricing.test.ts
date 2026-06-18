// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { priceProposal, moneyToNumber } from '../pricing';
import type { Product } from '../../../protos/demo';

const product = (id: string, name: string, units: number, nanos = 0): Product =>
  ({ id, name, description: '', picture: '', priceUsd: { currencyCode: 'USD', units, nanos }, categories: [] } as Product);

describe('moneyToNumber', () => {
  it('combines units and nanos', () => {
    expect(moneyToNumber({ currencyCode: 'USD', units: 12, nanos: 990000000 })).toBeCloseTo(12.99, 2);
  });
  it('returns 0 for undefined', () => {
    expect(moneyToNumber(undefined)).toBe(0);
  });
});

describe('priceProposal', () => {
  it('prices known items, multiplies by quantity, and sums the subtotal', () => {
    const products = new Map<string, Product>([
      ['1', product('1', 'Large Pepperoni', 12, 990000000)],
      ['14', product('14', 'Garlic Knots', 5)],
    ]);
    const out = priceProposal(
      [{ menuItemId: 1, quantity: 2 }, { menuItemId: 14, quantity: 1 }],
      products,
      'USD'
    );
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0]).toMatchObject({ productId: '1', name: 'Large Pepperoni', quantity: 2 });
    expect(out.lines[0].lineTotal).toBeCloseTo(25.98, 2);
    expect(out.subtotal).toBeCloseTo(30.98, 2);
    expect(out.currencyCode).toBe('USD');
  });

  it('drops items whose menu_item_id is not in the catalog', () => {
    const products = new Map<string, Product>([['1', product('1', 'Large Pepperoni', 10)]]);
    const out = priceProposal([{ menuItemId: 1, quantity: 1 }, { menuItemId: 999, quantity: 3 }], products, 'USD');
    expect(out.lines).toHaveLength(1);
    expect(out.subtotal).toBeCloseTo(10, 2);
  });
});
