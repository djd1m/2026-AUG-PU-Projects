# I5a F1 exact correction handback

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i5a-f1
Attempt-ID: replicate-i5a-f1-1
Source: 4958570113bf7aeb70caaa6040fc228050d3d0d3
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Launch-SHA256: 64cf79e5d989bc790abdcf6a818747c3aa1401d859ba999f72acc8109737fb60
Profile: compact-quality-first-v2; substantive XL accepted lifecycle contract, mechanical M lower bound (exit 0). Owner-forced sole requested gpt-6.1-sol/high. Actual model/effort/usage/cost null pending host attestation. No delegation/fallback.

The bounded writer correction is delivered; corrected-source PostgreSQL verification and independent F1 closure remain parent-owned. This is not I5a acceptance.

## Exact change and contract

Only `web/jobs.js` completion branch changes: current-fence guard remains first inside the owned transaction; shared `expire(c,j,now,s)` then runs before live/mode rejection. Hosted worker binding, discriminated evidence validation, account→job→submission lock order and DB clock sampling, atomic evidence/completion and healthy hold-after-CAS private completion remain unchanged.

For current-fence original attempt/hard expiry, completion now fails/fences once/clears lease, releases exactly one reserved customer credit and marks known-prediction cleanup. Existing hostedInvalid terminal causes retain their correct reasons: input revocation, submission binding mismatch, provider failed, prediction identity conflict. Customer credit release is not provider refund or billing reconciliation. No provider spend, original ticket, attempt, counter, output or evidence attachment changes are allowed. Cleanup identity and other fields remain literal original values. Cleanup already designated needed/claimed/done/unresolved stays designated as before.

Lease-only expiry with healthy original deadlines, wrong evidence/settings, healthy geometry/identity binding mismatch, hosted without submission and local with healthy submission remain pure denials. A stale fence after a new owner remains pure denial even at attempt/hard deadline; only the current owner may terminalize. Valid local fixture/controlnet output on expired submitted work performs lifecycle expiration before mode denial.

Only affected integration oracles changed: the existing nine actual account/job/submission × lease/attempt/hard lock-wait cases separate lease-only equality from terminal transition; original deletion-only oracle remains unchanged; input/ticket/mode/cleanup/provider terminal expectations now use required transitions. Two necessary new cases cover stale-fence/new-owner deadlines and local-output/submission deadlines. The terminal oracle checks status first, then fence+1/null lease/reason/unique release, and exact full-state equality with only terminal fields/cleanup marker/one release added. Repeated complete (old and terminal fence), heartbeat and fail must preserve the entire resulting state. Unaffected migration, hold completion, race winner, evidence/settings negatives, SQL constraints, rollback and local retry oracles are unchanged.

## Author checks and protected source

- Node22.20.0 syntax: `web/jobs.js` and `tests/replicate-evidence.integration.test.js`, exit 0.
- `/tmp/n8-node22 --test --test-concurrency=1 tests/jobs.test.js tests/provider-submissions.test.js`, exit 0; 7 pass, 0 fail/skip/cancel. Log: `docs/telemetry/n8-20261002-1740/replicate-i5a-f1-local.log`.
- `git diff --check`, exit 0. Exactly three existing tracked paths changed: the two owned product/test files and the implementation handback; new artifacts use only the authorized F1 paths.
- All 102 protected source/spec hashes match prior immutable snapshot; DB008/evidence helper/fixture/static evidence units and I1–I4a stay byte-identical. Fresh snapshot records both changed hashes and the protected path/hash map plus source/spec/launch identity.

Earlier parent actual PG 14+18+16+21+7 PASS and author 33 units/vendor-null mutation PASS remain raw history, not corrected-source results. Unchanged helper proof was not rerun. No author PG, fake SQL, skipped PG, Docker, provider/network/credentials, install, extra CLI/modeltask, commit/push, run-events or global configuration operation occurred.

## Parent actual-PG checks and meaningful baseline RED

Use the existing authorized internal PG16/Node22 overlay, exact frozen snapshot, securely supplied TEST_DATABASE_URL and N8_TEST_DB_OWNERSHIP=n8-f07-replicate, plus the existing sharp concurrency1 preload. From the project root, corrected-source GREEN commands remain pending:

```sh
node --test --test-concurrency=1 tests/replicate-evidence.integration.test.js
node --test --test-concurrency=1 tests/replicate-lifecycle.integration.test.js tests/jobs.integration.test.js
```

For baseline RED, parent creates a disposable overlay of the same corrected snapshot, replacing **only** `web/jobs.js` with its bytes from source `4958570113bf7aeb70caaa6040fc228050d3d0d3` (SHA256 `1d849d356b7c31ed4d5c9c16b634da6ccfd7c0751d04d4e6ae50ae6b6705183f`). Mount source/dependencies read-only as in the existing runner. The corrected integration test itself must remain unchanged. Execute:

```sh
node --test --test-concurrency=1 tests/replicate-evidence.integration.test.js
```

Run the full file without a name filter: its historical migration subtest prepares schema008, avoiding filtered-out setup or skipped-PG proof. The first affected subtest is `clock after account/job/submission lock waits preserves lease-only denial and terminalizes original attempt/hard deadline`. The first account/lease scenario remains green; account/attempt must fail on `current-fence completion must terminalize`, actual `running`, expected `failed`, at terminalState's first assertion. This is missing terminal status, not an import, runner, reason-only or unrelated assertion. Its subsequent intended oracles are fence+1, null lease and one unique customer release. Full-file baseline execution may also report later expected lifecycle failures; preserve all raw TAP history. Parent binds execution to hashes and restores corrected overlay before GREEN; author neither runs nor claims RED/GREEN PG.

Parent continuation: run these exact corrected PG checks and unchanged lifecycle/jobs regressions, retain baseline RED evidence, then obtain independent F1 closure without broadening I5a/I4b/I5b scope. This writer assigns no reviewer. F07 I6/I7/I8 and activation gates remain later parent work.

Companion applied only for source/evidence handoff. E2E preflight: not_applicable (no author E2E). Receipt: `docs/telemetry/n8-20261002-1740/replicate-i5a-f1-receipt.md`; snapshot: `replicate-i5a-f1-snapshot.json`. Required PG/review remain pending, with no acceptance claim.

Finished-At: 2026-10-03T11:20:50.023281+00:00

Status: completed
