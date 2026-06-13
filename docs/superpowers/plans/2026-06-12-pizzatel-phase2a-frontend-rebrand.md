# PizzaTel — Plan 2a: Frontend Pizza-Chain Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Next.js storefront from the "Astronomy Shop" into an original pizza-chain experience ("PizzaTel") — palette, brand name, copy, banner, and product imagery — using the synth-sourced pizza menu from Plan 1, with telemetry parity preserved and the app runnable at every step.

**Architecture:** The frontend styles via `styled-components` reading a central token object in `src/frontend/styles/Theme.ts`. Re-skinning the **values** of those tokens (keeping the **key names** so the ~hundreds of `theme.colors.otelBlue` references keep resolving) recolors the whole app in one edit. Branding/copy lives in a small number of components (`Banner`, `Header`/logo, page `<title>`s). Product images are served by the `image-provider` service from `src/image-provider/static/products/`; since the synth menu has 68 items but creating 68 photos is impractical, we map images by **category** (pizza/sides/drinks/desserts/wings) with a default fallback, resolving risk B2 from the Phase-0/1 reviews. No backend/gRPC changes; no proto changes.

**Tech Stack:** Next.js + TypeScript + styled-components 6, Cypress 15 (e2e smoke), Docker Compose (run/verify), the Plan 1 pizza menu (`product-catalog` mounted `products.json`).

---

## Plan series context
This is **Plan 2a** of the PizzaTel series. Phase 2 was split (scope check) into:
- **2a (this doc):** frontend pizza-chain rebrand + B2 image resolution. Pure frontend; independently shippable re-skin.
- **2b (indexed below):** Kafka-driven `order-tracker` service + Valkey state + instrumented BFF endpoint + the "pizza tracker" UI on `pages/cart/checkout/[orderId]`. Architecture locked (see end), full bite-sized plan to be written when 2a completes.

Carried-in from Plan 1 risk register: B2 (images — resolved here), S1/B3 (load-gen + fault re-theme — Plan 3), telemetry parity gate (every phase).

---

## File Structure (created/modified in this plan)

- `src/frontend/styles/Theme.ts` — **modify**: recolor token values to the PizzaTel palette (keep key names).
- `src/frontend/components/Banner/Banner.tsx` — **modify**: pizza hero copy.
- `src/frontend/components/Banner/Banner.styled.ts` — **modify** (if banner bg image referenced): point at a pizza hero asset.
- `src/frontend/components/Header/Header.tsx` (+ its styled) — **modify**: brand name/logo "PizzaTel".
- `src/frontend/pages/index.tsx`, `pages/product/[productId]/index.tsx`, `pages/cart/index.tsx`, `pages/cart/checkout/[orderId]/index.tsx` — **modify**: page `<title>` strings.
- `src/frontend/utils/imageLoader.ts` OR `src/frontend/components/ProductCard/ProductCard.tsx` + `ProductDetail` — **modify**: category→image mapping + onError fallback.
- `src/image-provider/static/products/` — **add**: original category placeholder images (`pizza.jpg`, `sides.jpg`, `drinks.jpg`, `desserts.jpg`, `wings.jpg`, `default.jpg`).
- `src/frontend/public/favicon.ico` / logo asset — **replace** (optional, nice-to-have).
- `src/frontend/cypress/e2e/pizzatel_smoke.cy.ts` — **create**: smoke test (menu renders pizza, brand present).

> Verification note: a pure visual/branding rebrand is not unit-testable; this plan verifies via (a) `npm run build` / `tsc` passing, (b) `grep` content assertions for brand + tokens, (c) a Cypress smoke run, and (d) a docker-compose visual check + telemetry-parity query (same Zerobus method as Plan 1).

---

## Task 1: Confirm clean Phase 2 branch + frontend builds at baseline

**Files:** none (verification)

- [ ] **Step 1: Confirm branch + baseline build**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
git branch --show-current   # expect: feat/pizzatel-phase2
cd src/frontend && npm ci && npx tsc --noEmit
```
Expected: branch is `feat/pizzatel-phase2`; `npm ci` installs; `tsc --noEmit` reports no errors (records the pre-change baseline). If the local Node/proxy environment blocks `npm ci`, fall back to building the frontend image in Docker (`docker compose build frontend`) and note it; do NOT proceed assuming a broken toolchain silently.

---

## Task 2: Re-skin the theme palette (whole-app recolor in one edit)

**Files:**
- Modify: `src/frontend/styles/Theme.ts`

- [ ] **Step 1: Replace the color token VALUES (keep KEYS) with the PizzaTel palette**

In `src/frontend/styles/Theme.ts`, replace the `colors` block with original, non-trademarked pizza-chain tokens (bold red + warm cream + herb green; **key names unchanged** so existing `theme.colors.otelBlue` references re-map cleanly):
```ts
  colors: {
    otelBlue: '#C8102E',      // PizzaTel primary red (CTAs, brand)
    otelYellow: '#F2A900',    // warm accent (deals/promo)
    otelGray: '#2B2B2B',      // near-black text/footers
    otelRed: '#1E7B3E',       // herb green (secondary accent / success)
    backgroundGray: 'rgba(43, 43, 43, 0.06)',
    lightBorderGray: 'rgba(200, 16, 46, 0.25)',
    borderGray: '#E8DCC8',    // cream border
    textGray: '#2B2B2B',
    textLightGray: '#7A7268',
    white: '#FFFFFF',
  },
```
(Token keys like `otelRed` now hold green — acceptable for a re-skin since the key is just an identifier; renaming keys would touch every styled file and is out of scope. A follow-up cleanup can rename keys.)

- [ ] **Step 2: Verify it type-checks**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: no errors (token shape unchanged → `style.d.ts` still satisfied).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/styles/Theme.ts
git commit -m "feat(frontend): recolor theme tokens to PizzaTel palette

Co-authored-by: Isaac"
```

---

## Task 3: Rebrand name + page titles

**Files:**
- Modify: `src/frontend/pages/index.tsx`, `pages/product/[productId]/index.tsx`, `pages/cart/index.tsx`, `pages/cart/checkout/[orderId]/index.tsx`

- [ ] **Step 1: Replace the four `<title>` strings**

In each file, change the `<title>` text:
- `pages/index.tsx`: `Otel Demo - Home` → `PizzaTel - Order Pizza`
- `pages/product/[productId]/index.tsx`: `Otel Demo - Product` → `PizzaTel - Menu Item`
- `pages/cart/index.tsx`: `Otel Demo - Cart` → `PizzaTel - Your Order`
- `pages/cart/checkout/[orderId]/index.tsx`: `Otel Demo - Checkout` → `PizzaTel - Order Confirmed`

- [ ] **Step 2: Verify no other "Otel Demo" / astronomy title strings remain**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
grep -rn "Otel Demo" src/frontend/pages src/frontend/components | grep "<title>\|title>" || echo "no demo titles remain"
```
Expected: `no demo titles remain`.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/pages
git commit -m "feat(frontend): PizzaTel page titles

Co-authored-by: Isaac"
```

---

## Task 4: Rebrand the hero banner copy

**Files:**
- Modify: `src/frontend/components/Banner/Banner.tsx`

- [ ] **Step 1: Replace the banner title (and subtitle if present)**

In `src/frontend/components/Banner/Banner.tsx`, replace:
`The best telescopes to see the world closer`
with:
`Fresh, fast, made-to-order pizza — built your way.`
(If the component has a subtitle/CTA string, set a deals-oriented line, e.g. `Deals daily. Delivery or carryout.`)

- [ ] **Step 2: Verify the astronomy copy is gone**

Run: `grep -rn "telescope\|astronomy\|see the world closer" src/frontend/components/Banner/ || echo "banner clean"`
Expected: `banner clean`.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/components/Banner/
git commit -m "feat(frontend): pizza hero banner copy

Co-authored-by: Isaac"
```

---

## Task 5: Brand name/logo in the header

**Files:**
- Modify: `src/frontend/components/Header/Header.tsx` (+ its styled file if the logo is text/asset there)

- [ ] **Step 1: Inspect how the header renders the brand**

Run: `sed -n '1,80p' src/frontend/components/Header/Header.tsx`
Identify whether the brand is an `<img>` logo or text.

- [ ] **Step 2: Set the brand to "PizzaTel"**

- If text: replace the brand text node with `PizzaTel`.
- If an `<img src=...>` logo: point it at `/images/pizzatel-logo.svg` and add that original SVG asset under `src/frontend/public/images/` (a simple wordmark: the text "PizzaTel" in the primary red `#C8102E`). Provide the SVG inline:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40" viewBox="0 0 160 40"><text x="0" y="29" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#C8102E">Pizza</text><text x="74" y="29" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#F2A900">Tel</text></svg>
```
(Original wordmark — no trademarked logo/imagery.)

- [ ] **Step 3: Verify build + brand present**

Run: `cd src/frontend && npx tsc --noEmit && grep -rn "PizzaTel" components/Header/`
Expected: type-checks; brand present.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/Header/ src/frontend/public/images/ 2>/dev/null
git commit -m "feat(frontend): PizzaTel brand in header

Co-authored-by: Isaac"
```

---

## Task 6: Resolve B2 — category-based product images + fallback

**Files:**
- Add: `src/image-provider/static/products/pizza.jpg`, `sides.jpg`, `drinks.jpg`, `desserts.jpg`, `wings.jpg`, `default.jpg`
- Modify: the frontend component that builds the product image `src` (find it in Step 1)

- [ ] **Step 1: Find where the product image src is built**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
grep -rnE "picture|/images/products/|imageLoader|product.*\.jpg" src/frontend/components src/frontend/utils | grep -iE "picture|images/products|imageLoader" | head
```
Note the file(s) that interpolate `product.picture` into an `<img>`/`next/image` src.

- [ ] **Step 2: Add a category→image resolver with fallback**

Create `src/frontend/utils/productImage.ts`:
```ts
// Maps a product to a category placeholder image, with a safe default.
// The synth menu has 68 items but only category placeholder art exists, so we key on
// the product's first category instead of a per-item photo (resolves risk B2).
const CATEGORY_IMAGES: Record<string, string> = {
  pizza: 'pizza.jpg',
  sides: 'sides.jpg',
  side: 'sides.jpg',
  drinks: 'drinks.jpg',
  drink: 'drinks.jpg',
  desserts: 'desserts.jpg',
  dessert: 'desserts.jpg',
  wings: 'wings.jpg',
};

export function productImageFile(categories: string[] = []): string {
  for (const c of categories) {
    const hit = CATEGORY_IMAGES[c?.toLowerCase?.() ?? ''];
    if (hit) return hit;
  }
  return 'default.jpg';
}
```

- [ ] **Step 3: Use the resolver in the image component**

In the component found in Step 1, replace the `product.picture`-based filename with `productImageFile(product.categories)` (import from `../../utils/productImage`), and add an `onError` handler on the `<img>` that swaps `src` to `/images/products/default.jpg`. (For `next/image`, use a standard `<img>` for these placeholders or the loader's onError equivalent.)

- [ ] **Step 4: Generate the original placeholder images**

Run (creates simple original category placeholders — solid brand background + label, no trademarked art):
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo/src/image-provider/static/products
for c in pizza sides drinks desserts wings default; do
  python3 - "$c" <<'PY'
import sys
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Pillow not installed: pip install pillow")
name=sys.argv[1]
img=Image.new("RGB",(400,300),(200,16,46))           # PizzaTel red
d=ImageDraw.Draw(img); d.rectangle([10,10,390,290],outline=(242,169,0),width=6)
label=name.capitalize() if name!="default" else "PizzaTel"
d.text((30,130),label,fill=(255,255,255))
img.save(f"{name}.jpg","JPEG",quality=85)
print("wrote",name)
PY
done
ls -1 *.jpg | grep -E "pizza|sides|drinks|desserts|wings|default"
```
Expected: the six `.jpg` files written. (If Pillow is unavailable, substitute any original 400×300 JPEGs with those names — do not use trademarked imagery.)

- [ ] **Step 5: Verify resolver + type-check**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
git add src/frontend/utils/productImage.ts src/image-provider/static/products/*.jpg src/frontend/components
git commit -m "feat(frontend): category-based pizza images + fallback (resolves B2)

Co-authored-by: Isaac"
```

---

## Task 7: Cypress smoke test

**Files:**
- Create: `src/frontend/cypress/e2e/pizzatel_smoke.cy.ts`

- [ ] **Step 1: Confirm the cypress dir + baseUrl convention**

Run: `ls src/frontend/cypress/e2e/ 2>/dev/null; grep -iE "baseUrl" src/frontend/cypress.config.* 2>/dev/null`
Note the existing e2e spec layout + baseUrl (defaults to the frontend-proxy at :8080).

- [ ] **Step 2: Write the smoke spec**

Create `src/frontend/cypress/e2e/pizzatel_smoke.cy.ts`:
```ts
describe('PizzaTel rebrand smoke', () => {
  it('home shows PizzaTel brand and pizza products', () => {
    cy.visit('/');
    cy.title().should('include', 'PizzaTel');
    cy.contains(/PizzaTel/i).should('exist');
    // pizza menu from product-catalog (Plan 1): at least one product card renders
    cy.get('[data-cy="product-card"], a[href*="/product/"]').its('length').should('be.greaterThan', 0);
  });
});
```
(If product cards lack a `data-cy` hook, the `a[href*="/product/"]` selector covers the existing markup.)

- [ ] **Step 3: Run it against a running stack**

Bring up the stack (reuse the Plan 1 override for collector env), then run cypress headless:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
docker compose -f docker-compose.minimal.yml -f docs/superpowers/pizzatel-test-override.yml up -d
cd src/frontend && npx cypress run --spec cypress/e2e/pizzatel_smoke.cy.ts
```
Expected: spec passes (title includes PizzaTel; product cards render). If cypress can't run locally (Node/proxy), document that and rely on the manual visual check in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/cypress/e2e/pizzatel_smoke.cy.ts
git commit -m "test(frontend): PizzaTel rebrand smoke spec

Co-authored-by: Isaac"
```

---

## Task 8: Integration — rebranded storefront runs + telemetry parity

**Files:**
- Create: `docs/baseline/phase2a-summary.md`

- [ ] **Step 1: Build + run the rebranded frontend**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
docker compose -f docker-compose.minimal.yml -f docs/superpowers/pizzatel-test-override.yml up -d --build frontend
```
Expected: frontend builds + starts. (The build runs in Docker, sidestepping any local Node/proxy issue.)

- [ ] **Step 2: Verify brand + pizza menu over HTTP**

Run:
```bash
curl -s http://localhost:8080/ | grep -iE "PizzaTel" | head -1 && echo "brand present"
curl -s http://localhost:8080/api/products | python3 -c "import sys,json;ps=json.load(sys.stdin);print('products',len(ps));assert len(ps)==68"
```
Expected: brand present; 68 products.

- [ ] **Step 3: Telemetry parity (same Zerobus method as Plan 1)**

Snapshot `jmrdemo.zerobus.otel_spans` count, let load-gen run ~2 min, confirm frontend + product-catalog spans increased and `service.name` set is unchanged vs Plan 1 (provenance: `host.name=docker-desktop`, `service.namespace=opentelemetry-demo`). Record counts.

- [ ] **Step 4: Tear down + write summary**

Run: `docker compose -f docker-compose.minimal.yml -f docs/superpowers/pizzatel-test-override.yml down`
Create `docs/baseline/phase2a-summary.md` noting: brand/palette/banner/images changed, 68 pizzas render, telemetry parity (span deltas + provenance), B2 resolved. Then:
```bash
git add docs/baseline/phase2a-summary.md
git commit -m "docs(pizzatel): Phase 2a summary — rebrand live, B2 resolved, parity held

Co-authored-by: Isaac"
```

---

## Plan 2b (indexed — locked architecture, full plan written after 2a)

**Order-tracker (the pizza tracker).** New Kafka consumer service that reuses the EXISTING order stream — no proto change:
- **Producer side (already exists, verified):** `checkout` publishes `OrderResult` protobuf to `kafka.Topic` and **injects W3C trace context into Kafka headers** via `createProducerSpan` (`src/checkout/main.go:677`). The new consumer continues that trace.
- **`order-tracker` service:** subscribes to `kafka.Topic`, extracts trace context from headers (child span of the checkout trace), unmarshals `OrderResult`, computes a per-order stage timeline by **independent-distribution sampling** of synth SOS/prep values (carryout ~N(12min,3min), delivery ~N(31min,6min); SOS 720/1800s), writes state to **Valkey** keyed by `order_id`, emits a span per stage transition (`Prep→Bake→QualityCheck→OutForDelivery→Delivered`) with attrs `order.id`, `order.stage`, `store.id`, `sos.target_seconds`, `sos.breach`.
- **BFF endpoint:** `src/frontend/pages/api/order-status.ts` (wrapped in `InstrumentationMiddleware`) reads Valkey state for an `orderId`.
- **Tracker UI:** the 5-stage tracker on `pages/cart/checkout/[orderId]/index.tsx`, polling `/api/order-status` ~2–3s.
- **Stage source of truth:** synth state machine (placed/preparing/ready/fulfilled + delivery) with pizza labels (verified columns in `synth_staging.order_events`).
- Deferred to roadmap (not 2b): trajectory adoption, OTel→order_events write-back.

---

## Self-Review notes (author)

- **Spec coverage:** rebrand palette (T2), brand/name/titles (T3, T5), banner copy (T4), B2 images (T6 — the carried-in blocker), smoke test (T7), runnable + telemetry parity gate (T8). Tracker (the other half of Phase 2) correctly split to 2b with locked architecture, not dropped.
- **Verification honesty:** no fake unit tests for visual changes — verification is build/`tsc`, grep content assertions, Cypress smoke, and the docker + Zerobus parity check (same method proven in Plan 1).
- **No proto/backend changes** in 2a (preserves contracts + parity). Token KEY names kept to avoid touching every styled file (noted as a follow-up rename).
- **Trademark guardrail:** original wordmark SVG + original solid-color placeholder images only; no Domino's logo/imagery/copy.
- **Type consistency:** `productImageFile(categories: string[])` signature is used consistently (T6 Step 2 defines, Step 3 consumes). Theme token shape unchanged (satisfies `style.d.ts`).
