# Frozen telemetry analyzer holdout

- Run: `benchmark-telemetry20260910`
- Work unit: `holdout`
- Artifact: `/tmp/telemetry-holdout.json`
- Scope: synthetic control corpus prepared without reading analyzer implementation, prior benchmark fixtures, or prior benchmark reports
- Case count: 11

## Expected semantics rationale

1. `wall-clock-alias-keeps-compute-separate`: `metrics.wall_clock_seconds` is a measured elapsed alias. `active_compute_ms` describes a different quantity and must leave active wall time unknown; the issue must retain its source field.
2. `elapsed-seconds-alias-preserves-zero`: `metrics.elapsed_seconds` and `metrics.active_elapsed_seconds` accept measured zero. A zero-duration timestamp interval is also zero rather than missing.
3. `completed-at-is-valid-endpoint`: `completed_at` is an eligible terminal timestamp and yields 75 seconds from the zoned start.
4. `explicit-null-remains-unknown`: explicit null measurements and a missing endpoint cannot be converted to zero.
5. `terminal-stage-status-fallback-with-source`: when the run-level status is absent, the sole terminal stage status may supply the claimed status, and the diagnostic trail must name `stages.1.status` as its provenance. The missing top-level status is deliberate in this case.
6. `conflicting-top-and-terminal-stage-status`: contradictory run and terminal-stage claims are not resolved by preference; normalized claimed status is null and the conflict is reported.
7. `elapsed-measurement-conflicts-with-timestamps`: a 50-second claimed metric and a 60-second timestamp interval are both observations, but their inconsistency prevents a single normalized elapsed claim. The independently derived timestamp value remains visible.
8. `event-aliases-and-overlapping-wait-union`: `event`/`at` aliases are equivalent to `type`/`timestamp`. Two valid waits spanning seconds 10-40 and 30-60 have a 50-second union; subtracting that complete paired union from 120 seconds leaves 70 active-wall seconds.
9. `reverse-time-pairs-are-rejected`: a finish before its start is not a negative or zero interval. Both invalid pairs remain unobserved, wait union and inferred active time stay unknown, and identifiers remain in diagnostics.
10. `usage-and-claimed-model-locations-remain-provenance`: all present usage/model claim sites are locators rather than proof of totals or actual runtime model identity. Null at a present usage path remains distinct from absence.
11. `orphan-event-identifiers-stay-unpaired`: terminal events whose IDs have no corresponding starts cannot create attempt or wait intervals. Unknown wait coverage stays null, with both orphan IDs identified.

The checks intentionally assert only contract fields needed to distinguish measured zero, unknown, valid normalization, provenance, conflict, and rejected inference. Synthetic model names are claims without provider or host evidence.

Status: completed
