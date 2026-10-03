# F07 I1 implementation receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i1
Attempt-ID: replicate-i1-1
Source: 781d41e96dc143ea898d82747622f2b102f1888c
Launch-SHA256: 366f2c234ab6229f8f8b70f0bee3a43fd8636de581b60dbeb85b1595fe715a28
Finished-At: 2026-10-03T07:26:29.866404+00:00
Verdict: implementation ready for runtime/review

Profile: compact-quality-first-v2; substantive XL, accepted owner-approved plan; mechanical S/exit0 is only a lower bound.
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Model proof and usage are host-owned and unavailable here; prompt/model selection is not proof. No fallback or delegation. No savings claim.
Elapsed-Wall-Seconds: 1199.866 (observed worker start 2026-10-03T07:06:30Z to Finished-At; includes reading/checks/handoff)
Elapsed-From-Serialized-Launch-Seconds: 1212.285
Active-Wall-Seconds: null (no separate activity measurement)

Implemented only I1: immutable unique submission/prediction authority, committed preflight→submitting one-shot CAS, conservative atomic authorized-envelope reservation, existing consumed ticket binding/current-UTC replacement, liveness/hold/input checks, late-ID cleanup-only reconciliation, immutable conflict quarantine, monotonic status and ambiguous no-replay. No network I/O or automatic spend/ticket refund. Denials roll back the new submission, spend and ticket mutations; local preflight rejection leaves retry eligible without a false binding.

Changed product/tests (5 frozen paths): db/007-replicate.sql; web/provider-submissions.js; append007 in scripts/migrate.js; tests/replicate.integration.test.js; tests/provider-submissions.test.js. Existing fixture/controlnet evidence constraints/triggers and old tests are unchanged. Hosted evidence/mode changes are explicitly deferred to I5; no fake local provenance.

Host checks: Node20.20.2 syntax exit0, new unit2 pass, existing jobs5 pass, existing generation13 pass, git diff --check exit0. Initial root-cwd unit invocation failed MODULE_NOT_FOUND/exit1; corrected project-cwd run passed. No blanket skips. Node20 results do not constitute Node22 runtime acceptance.

Pending coordinator commands in PROJECT_ROOT on Node22/PG16:
- node tests/provider-submissions.test.js
- N8_TEST_DB_OWNERSHIP=n8-f07-replicate node tests/replicate.integration.test.js (dedicated TEST_DATABASE_URL injected; never print it)

Real PG tests are written, not run: isolated schema/PG16 assertion/ownership marker, pre007 representative evidence upgrade, actual PG lock barriers for CAS/envelope/hold/deadline races, zero/exhausted/mismatched authorization, SQL rollback including UTC ticket changes, immutability/uniqueness, late-ID/no revival, repeated/ambiguous observations and local preflight retry. Neither PG execution nor actual HTTP create counts, reclaim integration, meaningful transport mutant, hosted quality, browser E2E, full regression or independent review is claimed. FR2/FR3/FR6 and AC2/3/4/6/9 DB portions await real runtime verification; F07/MVP acceptance remains pending.

Snapshot: docs/telemetry/n8-20261002-1740/replicate-i1-snapshot.json
Snapshot-SHA256: b267430826faac366261c09eac31c8a1114b79d6ff76aa0297f811b1d9ac9973
Snapshot verifies 5 product/test hashes, 9 accepted plan/input hashes, source and launch identity; all rechecked before installing this receipt.
Checks: docs/telemetry/n8-20261002-1740/replicate-i1-checks.json
Handoff: docs/features/f07-replicate/i1-implementation.md (exact factory/locked APIs, safe codes, lock ownership, I2/I4/I5 obligations and pending gates)

Next accountable executor: parent coordinator, to verify frozen source, execute Node22/PG16 tests, obtain fresh review, then integrate only after receipt/review acceptance. Unit execution is finished; no background run is claimed. Canonical docs/run/events remain coordinator-owned. No commit/push, Docker/build/browser/hostDB/listener, paid calls, deployment, proxy, dependency or package/lock changes. Authorized external spend remains 0USD; agent usage/cost unknown, not zero.

Status: completed
