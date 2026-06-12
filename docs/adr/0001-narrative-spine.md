# ADR 0001: Narrative spine

## Status
Accepted (2026-06-12)

## Decision
Sequenced "both" (brainstorm A3): the observability story carries Goal 1 (re-theme), the Databricks story carries Goal 2 (migration). The Phase-3 boundary is a polished, offline-runnable "stop-here" checkpoint so Goal 1 ships independent of any Databricks risk.

## Consequences
- Each half is independently demoable.
- Phase 3 must be treated as a real release, not a waypoint.
- The "see live data in Databricks" beat is strengthened by the already-wired `zerobus` OTel landing (once the `otel_spans` gap is fixed).
