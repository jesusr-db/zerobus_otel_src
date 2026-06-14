# Menu Imagery Plan (2026-06-13)

The user flagged menu images as **critical for the website's look-and-feel**. This plans how to get from the current placeholders to appetizing imagery.

## Current state
- Product images are **functional placeholder tiles**: solid PizzaTel-red background + gold border + a category label ("Pizza", "Sides", …). Original/non-trademarked, no 404s — but flat and not appetizing.
- Served by `image-provider` (nginx, `/static/products/`), resolved by `frontend/utils/productImage.ts` by **category** (68 items → ~6 category images + default).
- Surfaces affected: product cards (grid), product detail, cart/checkout thumbnails, order-confirmation items, **hero banner** (`Banner.png`), and any category/deal banners.

## Constraints
- **No in-environment image generator** and **no license-safe stock fetch** available to this agent (registry/network are locked down; trademark caution applies — original art only, no Domino's/branded imagery).
- So "appetizing photos" cannot be produced purely in-code here — they need either an asset source, an AI image model, or user-provided files.

## Options

| Option | What | Pros | Cons | Who/where |
|---|---|---|---|---|
| **1. Flat SVG illustrations (per category)** | ~7 original vector illustrations (pizza w/ pepperoni, soda cup, wings, dessert, salad bowl, sides box, default plate) | In-code NOW, original, recognizable, crisp/scalable, tiny, offline | Stylized not photoreal; category-level not per-item | I can do now (Plan 2b Phase E) |
| **2. Per-item / per-subcategory SVG** | Distinct illustration per subcategory (pepperoni vs cheese vs veggie…) | More variety on the grid | 68 items → diminishing returns; more authoring | Extension of #1 |
| **3. AI-generated images via a Databricks Model Serving image endpoint** | Batch-generate appetizing per-item images from prompts (item name + category) on a workspace-hosted text-to-image model → write to the UC Volume → `image-provider` serves them | **Appetizing AND on-narrative** — generating your menu imagery on the lakehouse is itself a Databricks showcase; per-item; reproducible from the seed | Needs a text-to-image model deployed/available in the workspace (FMAPI doesn't natively do text-to-image as of now → would need a custom diffusion/FLUX serving endpoint); cost; a feasibility spike | Databricks (Plan 4-adjacent) |
| **4. Curated open-license (CC0) food photos** | Pull CC0 photos (e.g. Unsplash/Pexels) keyed by category | Real, appetizing, fast | Not brand-specific; licensing/attribution must be verified; needs a fetch/approval step (not pure-code here) | User provides source/approval |
| **5. User-provided brand assets** | You drop real photos / brand art into `image-provider/static/products/` keyed by category or `menu_item_id` | Highest fidelity, fully controlled | Requires you to supply assets | User |

## Recommendation (tiered)
1. **Ship Option 1 now** (Plan 2b Phase E): flat SVG category illustrations — an immediate, original, offline, no-cost step up from solid tiles. This makes the grid look intentional today.
2. **Pursue Option 3 as the flagship** — AI-generate appetizing per-item images via a **Databricks-hosted image model**, batch job → UC Volume → `image-provider`. This is the highest-impact path *and* doubles as a Databricks demo beat ("our menu photos are generated on the lakehouse"). Gate it on a quick **feasibility spike**: is a text-to-image model deployable on this workspace's Model Serving (custom diffusion/FLUX), and what's the cost? If yes, it becomes a great Plan-4 companion to the recommendation/serving migration.
3. **Fallback to Option 5/4** if Option 3 isn't feasible: you drop brand assets, or we wire CC0 photos with verified licensing.

## Decisions needed from you
- **A.** Do Option 1 (SVG category illustrations) now as the v1 look — yes? (I can execute immediately.)
- **B.** For "real" imagery, which path: **(3)** AI-gen via Databricks Model Serving (I'd run a feasibility spike first), **(4)** curated CC0 stock, or **(5)** you provide assets?
- **C.** Scope of imagery beyond product tiles: also refresh the **hero banner** + add category/deal banners? (Affects look-and-feel most.)

## Notes
- Whatever the source, the resolver (`productImage.ts`) already maps by category with a fallback, and `image-provider` serves `/static/products/*` — so swapping placeholders for SVGs or photos is a content change, not an architecture change (low risk).
- If Option 3: the generation prompts can be derived from `pizzatel.menu` (item_name + category + subcategory) so the imagery stays grounded in the synth menu — same seed-driven pattern as the rest of the demo.
