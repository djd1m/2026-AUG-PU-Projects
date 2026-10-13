# F07-I1-R01 test correction

Source: `e5a37bf12d2024502e093a5feb738ea868a1d948`. Profile: bounded TEST-ONLY, 600-second hard limit; receipt target 540 seconds.

Added exactly one real-PG child case in `tests/replicate.integration.test.js`: “UTC rollover while blocked on envelope retries both contenders with current-day ticket”. It starts at `2026-10-03T23:59:50Z`, locks the spend envelope in the existing helper's separate transaction, starts two authorizers, and changes the trusted clock to `2026-10-04T00:00:10Z` only after `pg_stat_activity` reports at least two actual lock waits. Canonical platform locking can place the second contender behind the first; the helper does not claim both wait directly on the envelope. The 20-second advance leaves the 30-second lease live.

Literal persisted assertions cover one authorized result, one false `submission_no_replay`, one submission, reservation `300000`, exactly two tickets with one superseded, and the consumed `2026-10-04` ticket referenced by the job and both returned submissions. Attempt number, fence and fixed deadline stay unchanged. A complete four-row comparison requires old/new platform/account bucket counts of exactly one each, preserving old consumption without duplicate new consumption. The first blocked transaction sampled the old day and cannot produce these outcomes without rollback/retry after its envelope lock wait. No sleep-only race or production guard change was introduced.

All prior child cases and the existing barrier helper remain byte-for-byte identical to source after removing the single added block. All four protected I1 files and the accepted specification retain their original snapshot SHA256 values.

Checks executed locally, all exit 0:

- `/tmp/n8-node22 --version`: `v22.20.0`.
- `/tmp/n8-node22 --check tests/replicate.integration.test.js`.
- `git diff --check`.
- Python source/snapshot verification: launch digest, four protected file hashes and source bytes, prior test bytes, specification digest.

Real PostgreSQL execution of this new case is **pending**, not run here. The supplied earlier 15/15 TAP result applies to the unchanged prior suite and is not evidence for this addition. Fresh independent review is also pending. Coordinator runs the affected suite after this frozen receipt, from `/tmp/n8-replicate-i1/projects/08-interior-ai-redesign`, with its dedicated owned PostgreSQL 16 database supplied through `TEST_DATABASE_URL`:

```sh
N8_TEST_DB_OWNERSHIP=n8-f07-replicate /tmp/n8-node22 --test tests/replicate.integration.test.js
```

No database, listener, Docker, browser, dependencies, paid calls, mutation execution, delegation, commit, push or run-event writes were performed. I6 transport mutation remains a later mandatory gate. Requested model/effort: `gpt-6.1-sol` / `high`; actual host-confirmed model/effort, token usage and cost are unknown (null), with no invented measurements. No fallback or model switch was invoked. Elapsed launch-to-artifact preparation: 187.229 seconds.

Evidence: `docs/telemetry/n8-20261002-1740/replicate-i1-r01-snapshot.json`; receipt: `docs/telemetry/n8-20261002-1740/replicate-i1-r01-receipt.md`.

Status: completed
