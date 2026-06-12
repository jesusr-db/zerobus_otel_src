# ADR 0003: Data strategy (direct vs mimic vs hybrid)

## Status
Accepted (2026-06-12)

## Decision
Hybrid-thin (brainstorm B4). Reference/seed data (menu/stores/personas) is exported FROM Databricks `synth_ref.*` by a batch job into curated `jmrdemo.pizzatel.*` tables and a committed offline `products.json`-shaped export. Live order traffic is generated locally (Plan 3), shaped by a small set of distributions. `synth_ref` is the stable seed interface; we snapshot what we seed (`pizzatel_seed` export) so the continuously-evolving synth pipeline can't break a live demo. We never write into `synth_*` or `zerobus`.

## Consequences
- Demo is offline-runnable and fast; data is grounded in real generated reference data (68 menu items, 250 stores).
- A snapshot/versioned export decouples us from synth schema drift (already bit us once: `item_name` vs `name`).
- The live→Databricks round-trip (demo-as-producer) leverages the existing `zerobus`/`zerobus_sdp` landing rather than building new ingestion.

## Data residency note (from adversarial review S4)
The seed source (`synth_ref`, `synth_staging`, `zerobus`) exists in exactly ONE workspace — the `jmrdemo` **Azure** workspace. The bundle's `catalog`/`demo_schema` variables are portable, but the source data is not. Therefore the committed `pizzatel_seed` snapshot (the exported `pizza_menu.json` + curated tables) is the **actual portability mechanism** for running on a fresh workspace (e.g. an AWS FEVM workspace): you ship the snapshot, you do not re-run the export against synth. Re-running the seed export requires access to the `jmrdemo` Azure workspace.
