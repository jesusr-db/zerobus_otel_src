// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

// Maps a product to a category placeholder image, with a safe default.
// The synth menu has 68 items but only category placeholder art exists, so we key on
// the product's first matching category instead of a per-item photo (resolves risk B2).
const CATEGORY_IMAGES: Record<string, string> = {
  pizza: 'pizza.jpg',
  sides: 'sides.jpg',
  side: 'sides.jpg',
  drinks: 'drinks.jpg',
  drink: 'drinks.jpg',
  desserts: 'desserts.jpg',
  dessert: 'desserts.jpg',
  wings: 'wings.jpg',
  salads: 'sides.jpg',
  salad: 'sides.jpg',
};

export function productImageFile(categories: string[] = []): string {
  for (const c of categories) {
    const hit = CATEGORY_IMAGES[c?.toLowerCase?.() ?? ''];
    if (hit) return hit;
  }
  return 'default.jpg';
}
