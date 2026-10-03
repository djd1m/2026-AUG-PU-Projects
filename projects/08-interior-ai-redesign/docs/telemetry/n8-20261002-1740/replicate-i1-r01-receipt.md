# F07-I1-R01 correction receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i1-r01
Attempt-ID: replicate-i1-r01-1
Source: e5a37bf12d2024502e093a5feb738ea868a1d948
Launch-SHA256: 61b5e264690758b4999edc7d1e220898037ce087cb1db08a71ce6e778a855502
Launch: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i1-r01-launch.json
Finished-At: 2026-10-03T07:49:19.604766+00:00
Verdict: test correction ready for PG/fresh review
Profile: bounded TEST-ONLY; hard 600 seconds; target receipt 540 seconds
Elapsed-Actual-Seconds: 187.230 (UTC launch created_at to receipt preparation)
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: unknown (no host confirmation available)
Actual-Effort: unknown (no host confirmation available)
Usage: unknown
Cost: unknown
Fallback: none invoked

Corrected test: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/tests/replicate.integration.test.js
Test-SHA256: 46a81a01707373d248b784bacf8edabdc978bcb5e41aed5f023f3c07adacb004
Correction: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/features/f07-replicate/i1-r01-correction.md
Correction-SHA256: 16ecca1c30c7b2f24456fb58c12a79822a0fca8705bb05a75e2d22afa608c6cc
Snapshot: /tmp/n8-replicate-i1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-i1-r01-snapshot.json
Snapshot-SHA256: 74324433570ec15d44445c4dbfeba2cb17640b098966f1eb8d78de4bb20641cc
Spec-SHA256: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad

One new real-PG barrier case advances the trusted clock from 2026-10-03T23:59:50Z to 2026-10-04T00:00:10Z only after two actual PG lock waits. Assertions require one authorization/one no-replay, one provider submission, 300000 reserved, two tickets/one superseded, current consumed ticket bound to job/submissions, unchanged attempt/fence/deadline and four literal daily counts of one. Prior tests/helper are byte-identical; all four protected files match the original I1 snapshot and source revision. No production change.

Executed checks: Node22 v22.20.0 confirmed; `/tmp/n8-node22 --check tests/replicate.integration.test.js` exit 0; `git diff --check` exit 0; launch SHA256/source/snapshot/prior-case/spec verification exit 0.

Pending: new real-PG case and fresh independent review. No PostgreSQL run was executed locally; earlier supplied 15/15 does not validate the new case. Coordinator owns the next step after this frozen receipt, using dedicated PostgreSQL 16 and TEST_DATABASE_URL from /tmp/n8-replicate-i1/projects/08-interior-ai-redesign:

```sh
N8_TEST_DB_OWNERSHIP=n8-f07-replicate /tmp/n8-node22 --test tests/replicate.integration.test.js
```

No delegation, paid calls, Docker, browser, dependency changes, host PostgreSQL/listeners, mutations, commits, push or run-event writes. I6 mandatory transport mutation remains later. Only test/correction/snapshot/receipt paths were written. Available usage/cost and host model measurements remain unknown.

Status: completed
