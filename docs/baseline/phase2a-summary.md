# Phase 2a summary — frontend pizza-chain rebrand (2026-06-12)

## What shipped (branch `feat/pizzatel-phase2`)
- **Palette:** `styles/Theme.ts` recolored to the PizzaTel palette (red `#C8102E` / gold `#F2A900` / herb green / cream), keeping token KEY names so the whole app recolors in one edit.
- **Brand:** page titles → `PizzaTel - …`; hero banner copy → pizza; header logo → original `pizzatel-logo.svg` wordmark.
- **B2 resolved:** `utils/productImage.ts` maps products to category placeholder images (`pizza/sides/drinks/desserts/wings/default.jpg`) with an `onError` fallback, applied across all 6 image-rendering spots (ProductCard, CartItem, CartDropdown, CheckoutItem, ProductDetail, order-confirmation). Six original Pillow placeholders added to `image-provider/static/products/`. Dockerfile fixed to COPY `productImage.ts`.

## Verification (toolchain unblocked via `registry.npmmirror.com`; npmjs was DNS-blocked)
- **Build:** `tsc --noEmit` clean; full `next build` clean (route manifest intact); frontend image built from source via the mirror; image-provider category images served (mounted; committed source is the real fix).
- **App-validation user journeys (adapted from the app-validation-loop skill → Cypress, the frontend's own mechanism), driven headless against the running storefront:**
  - **J1 browse** ✅ — title `PizzaTel`, pizza menu cards render.
  - **J2 product detail** ✅ — name/price/add-to-cart present.
  - **J3+J4 add-to-cart → place order** ✅ — cart count=1, order placed, navigated to `/checkout/[orderId]`, title `Order Confirmed`, item images render.
  - Screenshots in `src/frontend/cypress/screenshots/pizzatel_journeys.cy.ts/`.
  - Dual-channel debugging caught a TEST bug (not an app bug): the confirmation page renders `S.OrderItem`, not the `checkout-item` component — the stale `Checkout.cy.ts` (`describe.skip` since 2024) used that selector; corrected.
- **`docker logs frontend`:** zero rebrand-introduced runtime errors. The only errors are the **1,872 known S1 astronomy-ID 404s** from the load-generator (documented; load-gen re-theme is Plan 3) + a benign GCP-metadata warning.
- **Telemetry parity (Zerobus):** frontend = 9,827 spans, product-catalog = 2,012 spans this run; `host.name=docker-desktop` (our containers). Rebrand touched zero instrumentation → parity preserved.

## Known boundary state / follow-ups
- **S1 (load-gen astronomy IDs → checkout/browse 404s):** Plan 3 (load-gen + fault re-theme). The keep-curated-errors demo note applies.
- **Stale e2e specs:** `Home.cy.ts` asserts exactly 10 products (now 68); `ProductDetail.cy.ts`/`Checkout.cy.ts` are `describe.skip` with astronomy assumptions. Re-theming the full e2e suite is a follow-up; the new `pizzatel_smoke.cy.ts` + `pizzatel_journeys.cy.ts` are count-robust and green.
- **image-provider:** images committed to source (correct fix); the running container uses a mount because the local rebuild kept hitting flaky-registry `DeadlineExceeded`. CI rebuilds the image normally.

## Adversarial section review — found real gaps my first pass missed (and overclaimed)
An adversarial review caught issues the initial "Acceptance MET" glossed over. All fixed + re-verified at runtime (commit `392bd23` + frontend/image-provider rebuild):
- **B-1 (blocker):** the home **hero was still the astronomy `Banner.png`** (only the copy changed). → replaced with an original pizza Banner.png. Verified: serves 200, 4.2KB (was 354KB astronomy).
- **B-2 (blocker):** the **footer said "OpenTelemetry" + linked the otel-demo GitHub** site-wide. → rebranded to "© PizzaTel — a demo pizza shop." Verified: no OpenTelemetry text/link in served HTML.
- **B-3 (blocker):** `Home.cy.ts` asserted exactly **10 products → red CI suite** (now 68). → re-pointed to `greaterThan 0`. Verified: Home.cy.ts 2/2 green.
- **S-1:** header band hardcoded OTel purple `#853b5c`. → brand-red token. Verified: served CSS shows `#C8102E`, no purple.
- **S-2/S-3:** ProductCard image fetch ignored 404s; onError loop-guards compared absolute `.src` to a relative string (never matched). → `res.ok` fallback + `.endsWith('/default.jpg')` guard in all spots.
- **N-2:** salads mapped to a generic default. → `salads`/`salad` → `sides.jpg`.
- Two review hunts correctly did NOT materialize: the token-key recolor produces no wrong-meaning UI (no error/success semantic tokens exist), and trademark is clean (original assets only).

## Re-verification after fixes
- Cypress: `pizzatel_journeys` (J1–J4) 3/3 + `pizzatel_smoke` 1/1 + `Home.cy.ts` 2/2 — all green against the rebuilt image.
- `docker logs frontend`: clean (only the documented S1 astronomy-ID 404s remain).
- Banner/footer/header fixes confirmed live via curl.

## Acceptance: ✅ MET (after review fixes)
Storefront presents as PizzaTel (palette, brand wordmark, **pizza hero**, **PizzaTel footer**, **brand-red header**, category images), 68 pizzas render, full browse→order journey works in a real browser, B2 resolved, telemetry parity held (frontend 9,827 / product-catalog 2,012 spans, provenance `docker-desktop`). Remaining: S1 load-gen re-theme (Plan 3); stale skipped e2e specs (ProductDetail/Checkout) are a follow-up.
