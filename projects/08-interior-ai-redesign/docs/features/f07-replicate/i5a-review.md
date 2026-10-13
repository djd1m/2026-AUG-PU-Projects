# F07 I5a independent review

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: 42f61355e64dedbf07d9eecc4c39c54461a7c0ec
Verdict: REQUEST_CHANGES
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i5a-review
Attempt-ID: replicate-i5a-review-1
Launch-SHA256: 9d6dda2dcc935d985eac6db7dc5a6c178a306d264c569c3b675f2cb5d614ceb3
Profile: compact-quality-first-v2; accepted XL contract, bounded independent review.
Requested reviewer: gpt-6-astra / high. Actual reviewer model/effort/usage/cost: null pending host attestation.
Author: host-attested gpt-6.1-sol / high, separate requested reviewer family; author elapsed 1302.8832905179588 seconds.
Review performed by this reviewer alone. No subagents or delegation.

## Scope and conclusion

Reviewed only the eight product/test files in 2ad12e0e1cf98e0aacff28472f29b9a3bcdbf374 → d19bf2970b6f4e27c6eea085cc1bbc14e1340fe9, their exact bytes at Source, i5a-slice-boundaries.md and i5a-implementation.md, and the accepted F07 completion/evidence/quality requirements at the I3/I4a conjunction. No broad I1–I3 re-audit. One confirmed High finding blocks I5a acceptance. Report delivery is complete; product acceptance is not.

## F1 — High: current-fence completion no longer terminalizes expired submitted work

Location: `web/jobs.js:240–243`; conflicting oracle: `tests/replicate-evidence.integration.test.js:157–166`.

The new `hosted || s` branch bypasses `expire()` and returns false on `!live()`. With a current fence, a running submitted job, and DB time at its original attempt or hard deadline, completion leaves status running, the old fence/lease, reserved customer credit, and cleanup_state=none intact. It inserts no evidence, but now requires a later heartbeat/get/maintenance/fail/claim operation to perform the deadline transition. The accepted contract requires that transition in the current transaction, including completion, even after the lease is no longer live.

This is a regression from baseline `web/jobs.js:237–240`, which checked stale fence first and then called `expire(c,j,now,s)` before live/mode checks. `i4a-implementation.md:14` explicitly includes current-fence complete; `i4-slice-boundaries.md:9` requires deadline terminal/release; accepted `02_pseudocode.md:53` requires terminal/fence/release and known-ID cleanup in the current transaction. The I5a implementation handback's new blanket zero-effects claim does not supersede those accepted requirements.

Reproducer, already exercised by the source-bound real-PG suite: create a running authorized submitted job with durable succeeded prediction and valid hosted output; retain its current fence. Block account, job, or submission row, call complete, advance the trusted DB clock to the original attempt deadline (179000ms after the fixture's first 1000ms) or hard deadline, and release the lock. Lines 165–166 assert false and complete DB-state equality. Thus the green recorded test demonstrates the regression instead of guarding the accepted transition. Its lease-only case should remain a side-effect-free rejection while original deadlines remain live. The same bypass affects a valid local output offered to an expired submitted job, which previously still triggered expiration before mode rejection.

Minimum fix: after the existing stale-fence guard, restore the shared `expire(c,j,now,s)` handling before the live/mode denial, then keep the discriminated evidence checks. Preserve the stale-fence early return so an old owner cannot terminalize a newer owner. Separate deadline/terminal lifecycle expectations from pure evidence/mode mismatch denials in the new tests: on current-fence attempt/hard expiry require failed with the correct reason, one fence advance, cleared lease, one unique customer release and known-ID cleanup marker; no evidence/output attachment, no new ticket/attempt, no counter or provider-spend decrement. Repeat must not release twice. Update affected denial cases for existing hostedInvalid terminal causes and the handback's blanket assertion. Keep healthy active pre-hold private completion allowed and unchanged; customer credit release on failure is not provider billing reconciliation/refund.

## Bounded contract assessment

| Contract | Assessment and evidence |
|---|---|
| Append-only migration/history | 008 adds no columns and performs no historical-row update; mode CHECK changes and four nullable columns are conditional on mode. Original immutable trigger remains. PG migration case compares complete old job/evidence rows, hashes, idempotence and mutation rejection. |
| Local requirements / SQL NULL logic | Local mode still requires all four original nonnull fields. Hosted requires explicit SQL null vendor/local-model columns and JSON null vendor values. Required keys, closed top-level object, IS TRUE comparisons and trigger NOT EXISTS prevent the inspected missing/null identity and metric paths from passing via SQL unknown. Existing seed/hash/queue constraints remain. |
| Canonical hosted evidence | Closed plain-data shape, pinned model/version/contract, strict hashes/UUIDs, deterministic transform, timestamps and exact metric-source enum/nulls. Unknown vendor hardware/warm/inference/billing claims fail. No URL/token/raw-response or invented model revisions accepted by worker completion. |
| I3 compatibility | PROVENANCE exactly matches unchanged replicate-media.js:284–289 safe config. config_sha is recomputed from that subset only. Enriching a new output object with job/worker fields preserves the original config digest and I3 disposal capability. No impossible API conjunction found. |
| Detached return/local compatibility | Local validateOutput still returns detached model revisions. Hosted returns frozen detached evidence, nested transform and metric sources. Original local fixture/controlnet production exclusion remains. |
| Transaction authority | account → job → submission locks, post-lock clock, stale current-fence check, live original deadlines, consumed nonsuperseded original ticket, matching attempt/fence, input owner/hash/dimensions/nondeletion, durable succeeded identity and cleanup none/nonquarantine are checked. Deadline denial lifecycle is F1. |
| Atomic completion and hold | One evidence insert and succeeded/unverified update in one transaction; rollback test covers failed final update. Two real lock-barrier contenders yield one winner. Healthy pre-hold attempt may finish privately without spending/ticket/credit reconciliation. |
| Denied attachment | Missing submission, local output on submission, wrong identity/settings/mode, stale fence, deleted input, cleanup and nonsucceeded provider state cannot attach. Pure denial conservation is useful; terminal lifecycle causes must be separated as in F1. |
| Worker responsibility | Future I4b must verify actual private bytes, reconstruct exact seed/settings/prompts/request digest, and preserve winner artifacts after uncertain commit using DB references. I5a's internal metadata API is not byte authentication; this documented future wiring is not an absence finding. |
| Quality/public | Completion always unverified. Existing local quality/public guards remain closed to hosted. I5b real-corpus/predicate integration is intentionally later, not a finding. |

## Source and test proof

Reviewer read-only hash checks exited 0: launch digest and accepted spec digest match; all eight worktree files match the immutable snapshot and d19bf297; there is no db/web/scripts/tests delta from d19bf297 to Source; all 91 protected previous-file hashes match, including DB001–007 and protected I1/I2/I3 files. `tests/replicate.integration.test.js` changes only migration count 7→8. Snapshot-array SHA256: `0d48ab6cb4243bb51389d55e62d5cd3e01a6e7ee421d19b6d937b9b23411ad04`.

| File | SHA256 |
|---|---|
| `db/008-replicate-evidence.sql` | `aa4251b74c230f4a28c20f3cde109b4cccc0e81864392448a8c125582e75f33d` |
| `scripts/migrate.js` | `fe51902ef782ae2ab1f0c17be997af70920556b4ef6e5672d734e21da0b3a432` |
| `web/replicate-evidence.js` | `a75b154af512ba629e0a1fe827603e11d6ceabc16efb499e1538055634feef73` |
| `web/jobs.js` | `1d849d356b7c31ed4d5c9c16b634da6ccfd7c0751d04d4e6ae50ae6b6705183f` |
| `tests/replicate-evidence.test.js` | `142b34971c86302e64872aa5c25bad7f6ee92bb6c3a6228686d96da38d360483` |
| `tests/replicate-evidence.integration.test.js` | `1d59de22e9c55d5c4aa48ff9cd54ac3a50cf5b78f5107970de985fd6d85cf85a` |
| `tests/replicate-evidence-fixtures.js` | `52acde6c010bad38901c5e45801ad9d19086457357074000257c96da7e3b5f20` |
| `tests/replicate.integration.test.js` | `9f9d2c5cd3a742d96fbae3c866739bb76c5d5fc17ac922d161a91e1ea98d1542` |

Existing runtime evidence was inspected, not rerun. `replicate-i5a-pg-runner.py`, compose record, binding log and summary bind execution to Node22.20.0/PG16 with exact read-only overlays; the in-container digest check reports 8/8 matching. Summary source d19bf297 has identical reviewed product bytes at Source. No Docker or provider process was started by this reviewer.

| Existing check | Result |
|---|---|
| `node --test --test-concurrency=1 tests/replicate-evidence.integration.test.js` | exit 0; 14 pass, 0 fail/skip/cancel |
| `node tests/replicate-lifecycle.integration.test.js` | exit 0; 18 pass, 0 fail/skip/cancel |
| `node tests/replicate.integration.test.js` | exit 0; 16 pass, 0 fail/skip/cancel |
| `node tests/jobs.integration.test.js` | exit 0; 21 pass, 0 fail/skip/cancel |
| `node --test --test-concurrency=1 tests/quality.integration.test.js` | exit 0; 7 pass, 0 fail/skip/cancel |
| Focused local evidence/jobs/provider/generation/quality units | exit 0; 33 pass, 0 fail/skip/cancel |
| Static build/syntax | exit 0; final PG-test syntax also recorded 0 |
| Disposable vendor-scalar guard mutation | baseline 0 → mutant 1 (unchanged oracle: Missing expected exception) → restored 0; restored production digest matches |
| PG cleanup | exit 0 |

Runtime records: `docs/telemetry/n8-20261002-1740/replicate-i5a-pg-summary.json`, `replicate-i5a-pg-binding.log`, five `replicate-i5a-pg-*-pg16.log` TAP logs, `replicate-i5a-checks.json`, `replicate-i5a-mutation.json` and variant logs. PG wall time: 134.69870968407486s. The earlier writer handback's pending PG entries are superseded by the coordinator's later source-bound PG records. Green results do not resolve F1 because the new oracle explicitly encodes the regression.

## Later gates and handoff

Coordinator's next bounded step: assign the F1-only correction in jobs.complete and affected new test expectations/handback, then rerun affected evidence/lifecycle/jobs PG checks on the corrected source and obtain independent F1 closure. This reviewer launched no continuation or other reviewer. No accepted revision is claimed for I5a until F1 closes.

I5b hosted quality/public integration and I4b worker/request reconstruction/uncertain-commit cleanup remain planned slices. Mandatory I6 send-CAS mutation, I7 full regression/canonical reconciliation and I8 actual shared-Docker browser after readiness preflight remain pending. E2E preflight here: not_applicable, read-only review with no E2E execution. Provider activation, real paid pilot, corpus/performance/billing proof and deployment remain separate unauthorized gates; external spend remains 0.

Applied local skill: `.claude/skills/project-work-companion/SKILL.md`, source/evidence handoff only. No product edits, tests rerun, network/provider calls, installs, Docker, commits/pushes, run-events changes or global configuration edits. Only this report and its unique receipt are written. Reviewer actual model/effort/token usage/cost remain null until host capture; no savings claim.

Finished-At: 2026-10-03T11:11:36.376929+00:00
Elapsed since first reviewer clock sample (11:06:20 UTC): 316.377s. Launch-to-artifact elapsed: 325.924s; host process elapsed: null pending capture. Both are below the 440s artifact deadline and 480s hard limit.

Status: completed
