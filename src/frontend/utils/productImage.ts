// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

// Resolves a product image by matching the item's NAME to a variety photo within its
// category (e.g. a Veggie pizza shows veggie, a Caesar salad shows caesar, a Coke shows
// cola). Falls back to a generic category image, then a safe default. Files live in the
// image-provider /static/products dir.
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

// Per-category, name-keyword → variety photo. Order matters within each list
// (more specific descriptors first; e.g. Philly before Cheese, dip cups before pasta).
const VARIETIES: Record<string, Array<[RegExp, string]>> = {
  pizza: [
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
  ],
  wings: [
    [/buffalo/i, 'wing-buffalo.jpg'],
    [/bbq|barbe/i, 'wing-bbq.jpg'],
    [/mango|habanero/i, 'wing-mango.jpg'],
    [/garlic|parm/i, 'wing-garlic.jpg'],
  ],
  drinks: [
    [/coca|coke|cola/i, 'drink-cola.jpg'],
    [/sprite/i, 'drink-sprite.jpg'],
    [/water/i, 'drink-water.jpg'],
    [/root ?beer/i, 'drink-rootbeer.jpg'],
    [/fanta|orange/i, 'drink-orange.jpg'],
  ],
  desserts: [
    [/lava/i, 'dessert-lava.jpg'],
    [/brownie/i, 'dessert-brownie.jpg'],
    [/cinnamon/i, 'dessert-cinnamon.jpg'],
    [/cookie|oreo/i, 'dessert-cookie.jpg'],
  ],
  salads: [
    [/caesar/i, 'salad-caesar.jpg'],
    [/southwest/i, 'salad-southwest.jpg'],
    [/garden/i, 'salad-garden.jpg'],
  ],
  sides: [
    [/dipping|sauce cup|cup\b/i, 'side-dip.jpg'],
    [/tots/i, 'side-tots.jpg'],
    [/cheesy bread|stuffed/i, 'side-cheesybread.jpg'],
    [/bread twists|bread bites|breadstick/i, 'side-breadsticks.jpg'],
    [/pasta|alfredo|primavera|sausage/i, 'side-pasta.jpg'],
    [/melt|crispy chicken/i, 'side-chicken.jpg'],
  ],
};

// normalize singular category aliases → the plural key used in VARIETIES
const PLURAL: Record<string, string> = { side: 'sides', drink: 'drinks', dessert: 'desserts', salad: 'salads' };

export function productImageFile(name = '', categories: string[] = []): string {
  const cats = categories.map(c => (c?.toLowerCase?.() ?? ''));
  for (const c of cats) {
    const key = VARIETIES[c] ? c : (VARIETIES[PLURAL[c]] ? PLURAL[c] : '');
    if (key) {
      for (const [re, img] of VARIETIES[key]) if (re.test(name)) return img;
      return CATEGORY_IMAGES[c] ?? CATEGORY_IMAGES[key] ?? 'default.jpg';
    }
  }
  for (const c of cats) {
    const hit = CATEGORY_IMAGES[c];
    if (hit) return hit;
  }
  return 'default.jpg';
}
