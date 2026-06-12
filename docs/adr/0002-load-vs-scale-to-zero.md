# ADR 0002: Continuous load vs scale-to-zero / cold starts

## Status
Accepted (2026-06-12)

## Decision
No Databricks on any hot/browse/tracker path. Databricks-backed paths (Plan 4) are flag-gated with an offline fallback that is the DEFAULT for local dev. Serving/Lakebase use scale-to-zero; a visible UI health indicator shows live-vs-fallback. Demo teardown via `databricks bundle destroy`.

## Consequences
- Cold starts never block the storefront.
- Cost is bounded; nothing bills overnight by default.
- The pizza tracker draws stage timings from a local seed snapshot, never a live query.
