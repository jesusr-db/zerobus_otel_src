// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { IProductCartItem } from '../../types/Cart';
import { moneyToNumber } from '../agent/pricing';

export function cartItemCount(items: IProductCartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartSubtotal(items: IProductCartItem[]): number {
  return items.reduce((sum, i) => sum + moneyToNumber(i.product.priceUsd) * i.quantity, 0);
}
