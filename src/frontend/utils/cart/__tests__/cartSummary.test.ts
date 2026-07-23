// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { cartItemCount, cartSubtotal } from '../cartSummary';
import type { IProductCartItem } from '../../../types/Cart';
import type { Product } from '../../../protos/demo';

const item = (id: string, units: number, nanos: number, quantity: number): IProductCartItem => ({
  productId: id,
  quantity,
  product: {
    id,
    name: `Product ${id}`,
    description: '',
    picture: '',
    priceUsd: { currencyCode: 'USD', units, nanos },
    categories: [],
  } as Product,
});

describe('cartItemCount', () => {
  it('sums the quantities of all lines', () => {
    expect(cartItemCount([item('1', 10, 0, 2), item('2', 5, 0, 3)])).toBe(5);
  });
  it('returns 0 for an empty cart', () => {
    expect(cartItemCount([])).toBe(0);
  });
});

describe('cartSubtotal', () => {
  it('sums unit price times quantity across lines', () => {
    const out = cartSubtotal([item('1', 12, 990000000, 2), item('2', 5, 0, 1)]);
    expect(out).toBeCloseTo(30.98, 2);
  });
  it('returns 0 for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });
});
