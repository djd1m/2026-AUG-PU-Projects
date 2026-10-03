# I7 fixture mutation correction

Source: `d562842454a5e4bfa7d7af0c1d7c27cf1fa31d7e`.
Work unit: `n8-replicate-i7-mutation`; sole requested author `gpt-6.1-sol/high`.

The historical fixture mutant removed only the explicit fixture rejection.
The subsequent `supportedRealMode(mode)` rejection threw `quality_mode_invalid`,
so the unchanged GEOM-03 assertion was never reached. Historical baseline was
exit0; historical mutant exit1 was inconclusive, not a detected mutation.
Original raw evidence remains in
[fixture diagnostic](../../telemetry/n8-20261002-1740/replicate-i7-fixture-diagnostic/diagnostic.json).

The fixture branch of `mutateSource` now requires exactly one occurrence of each
of the two complete rejection statements in `requireRealQuality`. It removes
only the explicit fixture rejection and exempts only fixture from the real-mode
predicate in the disposable mutant. Other invalid modes remain rejected.
Absent, duplicated or already-mutated guards fail with `mutation_guard_mismatch`
before any source write. No other evidence, config, corpus, byte, provenance,
transition or locking validation is bypassed.

Concrete control flow: `review` validates evidence, then calls
`requireRealQuality(row.mode)` before provenance/byte/config/corpus validation;
the final transaction calls the same function again after account/job locks.
The otherwise-valid existing fixture test reaches both checks and the existing
GEOM-03 assertion when these two equivalent fixture rejections are bypassed.
No additional validator bypass was needed.

Contracts retained: approved `01_specification.md` FR5/AC8 fixture exclusion
and NFR3/AC11 meaningful source-bound mutation; `03_architecture.md` mutation
runner ownership and preservation of old fixture controls. Production
`web/quality.js`, oracle `tests/quality.test.js`, helpers and all other product
and test bytes are unchanged.

Measured checks using `/tmp/n8-node22` (Node22.20.0):

- Existing quality suite: baseline exit0, 7 passed; mutant exit1, exact existing
  `GEOM-03 fixture quality must be rejected with otherwise valid provenance`,
  `ERR_ASSERTION`, expected true / actual false / strictEqual. The other five
  leaf tests pass; TAP also counts the parent failure. Explicit restore:
  exit0, 7 passed, original production/oracle hashes identical.
- Mutation units: 10 passed, exit0, including missing/duplicate guards,
  reapplication refusal, other invalid modes, unchanged exact assertion
  recognizer and standalone infrastructure/spawn/timeout rejection.
- Static build syntax and whitespace checks: exit0.

[Measured quality receipt](../../telemetry/n8-20261002-1740/replicate-i7-mutation-evidence/quality-proof.json)
binds raw baseline/mutation/restored logs and runner/production/oracle hashes.
[Terminal handoff](../../telemetry/n8-20261002-1740/replicate-i7-mutation-receipt.md)
binds launch, source snapshot, protected bytes and every check.
The disposable copy was explicitly restored and removed. Existing runner helpers
were reused; no orchestration engine was added.

ROUTE: mechanical S/exit0; bounded correction inside inherited approved XL.
Companion prepare/handoff used; E2E preflight not applicable to these local tests.
Historical 480 local +163 PG +5 Python, eight other mutation controls and I6a
were supplied as accepted parent evidence and were not repeated or claimed as
new measurements. Parent retains independent review/integration and whole-feature
acceptance. No commit/push, Docker, network, secrets, installation or provider
spend. Provider-resolved model/effort, usage and cost remain null pending host data.

Launch-SHA256: `331ec20dbb7f118b102393930a156e102f649d57d6f01d9c7431203eac5b02c8`.
Trace: `docs/telemetry/n8-20261002-1740/replicate-i7-mutation-receipt.md`.
