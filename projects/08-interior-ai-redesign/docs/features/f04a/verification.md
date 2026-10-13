# F04a — проверка и передача

Author tests run with `/tmp/n6b-f06-node22/bin/node`, exact existing lockfile dependencies. Focused logs/commands/exits: `final-checks.json`; regression commands/exits: `regression-checks.json`. All logs stay in this directory. `source-snapshot.json` freezes all baseline66 runtime/test/build files plus new files, including hidden .env.example/.dockerignore, with canonical SHA256 and per-file digests. `checks-evidence.json` binds final source/build to logs and their SHA256. Historical snapshots/receipts are untouched.

Mapped software checks:

- GALLERY/SHARE03/BADGE02/SEC02: two-owner composite404, public original/raw-path exclusion, no private public fields; injected actual app handler, no listener.
- SHARE01/BADGE01/PAY05: actual sharp before/after image pixels, AI and RoomKind/demo labels, server entitlement, actual-byte mismatch, cached paid hold race, two concurrent preparation slots and no SQL locks during image work.
- PUBLIC01/02: explicit consent, fixture/unverified/rejected/missing privileged evidence refusal, mismatched immutable evidence/actual bytes, exact0/1/160/161 context and39/40/2000/2001 description boundaries, Unicode and XSS on otherwise-valid synthetic accepted record.
- PUBLIC03: public page/media/list no-store; revoke/republish/new token, rejection/deletion denial, final list consent recheck and bounded pagination.
- SHARE02: exact event counts/replays, native resolved only after valid artifact attempt; abort/error/unavailable zero completions; download finish versus aborted response and no download completion.
- SEC02: body16385→413 including public GET, Origin denial, unknown/duplicate queries,121st public request→429.
- SEC03/PAY05: disposable-copy share-owner/share-hold mutations require green baseline0→exact tagged assertion1; mutation oracle rejects unrelated assertions/spawn/timeouts. No production source left mutated.

Existing permitted regressions: boundaries, media, jobs unit, quality unit, payments unit, attribution unit/injected HTTP, partners unit and mutation harness pass. `payments.http.test.js` was inadvertently included in the regression batch; it attempts127.0.0.1 listen and failed exit1 with sandbox EPERM. No listener was opened, no bypass/retry. Raw failure retained in `check-payments.http.test.log`; this is a pending runtime check, not a pass. Unchanged Python worker/generation suite was not rerun for comfort.

Coordinator required next gates, commands as data only:

1. Fresh Astra source review of snapshot; only concrete fixes by bounded author pass. No author delegation performed.
2. Dedicated PG16 database, random schema, `N8_TEST_DB_OWNERSHIP=n8-f04a` plus secret TEST_DATABASE_URL supplied out of logs: `node --test-reporter=tap tests/sharing.integration.test.js`. Refuses missing ownership/nonlocal host/non16 server. Tests migrations twice, two owners, consent boundaries/no inheritance, actual-byte/evidence mismatch, revoke/delete/reject trigger/one release, cached paid response waiting on real concurrent account hold lock, event replay serialization and bounded pagination. All fixtures explicitly SOFTWARE synthetic, never GPU evidence. This test does not open an HTTP listener.
3. Run affected existing `integration.test.js`, `jobs.integration.test.js`, `quality.integration.test.js`, `payments.integration.test.js`, `attribution.integration.test.js` with each suite's own ownership marker and isolated dedicated database. Runtime HTTP payment cap/redirect/timeouts: `node tests/payments.http.test.js`. Old origin/owner/budget/fixture/payment/consent/partner mutation regressions use their existing isolated runtime harness as appropriate. Preserve failures; do not infer pass from syntax or injected SQL.
4. F04b owner UI/native outcome browser matrix and actual desktop1440/mobile390 E2E require separate fresh companion readiness preflight. Author preflight is not_applicable because E2E/runtime execution is outside this bounded unit. F05 actual CUDA/corpus/latency remains separate.

No commit/push/deploy/provider/GPU/browser/Docker/installation was performed by this author. Run identity and stage metadata live in `attempt.json`; launch timestamp is authoritative for total elapsed. Local metadata was created after required instruction/context reads, which is disclosed rather than retroactively claiming an early telemetry write. Actual model/effort, token counters, active-time breakdown and cost remain null; savings are not established.
