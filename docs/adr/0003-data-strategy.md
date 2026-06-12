# ADR 0003: Data strategy (direct vs mimic vs hybrid)

## Status
Accepted (2026-06-12)

## Decision
Hybrid-thin (brainstorm B4). Reference/seed data (menu/stores/personas) is exported FROM Databricks `synth_ref.*` by a batch job into curated `jmrdemo.pizzatel.*` tables and a committed offline `products.json`-shaped export. Live order traffic is generated locally (Plan 3), shaped by a small set of distributions. `synth_ref` is the stable seed interface; we snapshot what we seed (`pizzatel_seed` export) so the continuously-evolving synth pipeline can't break a live demo. We never write into `synth_*` or `zerobus`.

## Consequences
- Demo is offline-runnable and fast; data is grounded in real generated reference data (68 menu items, 250 stores).
- A snapshot/versioned export decouples us from synth schema drift (already bit us once: `item_name` vs `name`).
- The live→Databricks round-trip (demo-as-producer) leverages the existing `zerobus`/`zerobus_sdp` landing rather than building new ingestion.
