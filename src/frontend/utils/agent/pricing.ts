// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { Money, Product } from '../../protos/demo';
import type { ProposedItem } from './agentContract';

export interface PricedLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedProposal {
  lines: PricedLine[];
  currencyCode: string;
  subtotal: number;
  orderType: string;
}

export function moneyToNumber(m?: Money): number {
  if (!m) return 0;
  return m.units + m.nanos / 1_000_000_000;
}

// Catalog id == str(menu_item_id) (aligned with the recommender). Items whose id
// is absent from the catalog are dropped, not faked — the order must resolve
// against the live catalog.
export function priceProposal(
  items: ProposedItem[],
  products: Map<string, Product>,
  currencyCode: string,
  orderType = 'delivery'
): PricedProposal {
  const lines: PricedLine[] = [];
  for (const item of items) {
    const product = products.get(String(item.menuItemId));
    if (!product) continue;
    const unitPrice = moneyToNumber(product.priceUsd);
    lines.push({
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, currencyCode, subtotal, orderType };
}
