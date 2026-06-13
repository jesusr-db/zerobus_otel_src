// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

// Resolves a product image. Pizzas match their description by name keyword (so a Veggie
// pizza shows a veggie photo, Pepperoni shows pepperoni, etc.); everything else falls back
// to a category image, then a safe default. Files live in image-provider /static/products.
const CATEGORY_IMAGES: Record<string, string> = {
  pizza: 'pizza.jpg',
  sides: 'sides.jpg',
  side: 'sides.jpg',
  drinks: 'drinks.jpg',
  drink: 'drinks.jpg',
  desserts: 'desserts.jpg',
  dessert: 'desserts.jpg',
  wings: 'wings.jpg',
  salads: 'salads.jpg',
  salad: 'salads.jpg',
};

// Order matters: more specific descriptors first (Philly before Cheese, Buffalo before BBQ).
const PIZZA_VARIETIES: Array<[RegExp, string]> = [
  [/pepperoni/i, 'pizza-pepperoni.jpg'],
  [/buffalo/i, 'pizza-buffalo.jpg'],
  [/bbq|barbe/i, 'pizza-bbq.jpg'],
  [/hawaiian|honolulu|pineapple/i, 'pizza-hawaiian.jpg'],
  [/philly|cheese ?steak/i, 'pizza-philly.jpg'],
  [/meat|sausage|meatzza/i, 'pizza-meat.jpg'],
  [/veggie|vegg|spinach|feta|pacific|garden/i, 'pizza-veggie.jpg'],
  [/extravaganzza|supreme|deluxe|new yorker|ultimate/i, 'pizza-supreme.jpg'],
  [/garlic/i, 'pizza-garlic.jpg'],
  [/cheese/i, 'pizza-cheese.jpg'],
];

export function productImageFile(name = '', categories: string[] = []): string {
  const cats = categories.map(c => (c?.toLowerCase?.() ?? ''));
  if (cats.includes('pizza')) {
    for (const [re, img] of PIZZA_VARIETIES) if (re.test(name)) return img;
    return 'pizza.jpg';
  }
  for (const c of cats) {
    const hit = CATEGORY_IMAGES[c];
    if (hit) return hit;
  }
  return 'default.jpg';
}
