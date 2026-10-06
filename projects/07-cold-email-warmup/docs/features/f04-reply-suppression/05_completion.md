# F04 completion gates

Status: planned. A0/6 B0/6. Acceptance requires both bounded independent reviews and all source-bound mandatory checks. F03 source accepted2ff44de2, prior history preserved. Subsequent F05 billing/evidence/growth and F06 cabinet/fullDockerbrowser/PR delivery remain required; do not end autonomous pipeline at this checkpoint.

## Criterion coverage
| Criterion | Test file | Test title |
| --- | --- | --- |
| AC-f04-reply-suppression-001 | tests/replies-integration.test.ts | A1 exact sender + own tenant/mailbox references; no/malformed/reused IDs |
| AC-f04-reply-suppression-002 | tests/replies-integration.test.ts | A2 concurrent duplicate page/effect has no partial writes or budget advance |
| AC-f04-reply-suppression-003 | tests/replies-integration.test.ts | A3 stale page/tail and second validity reset cannot complete current run |
| AC-f04-reply-suppression-004 | tests/replies-integration.test.ts | A4 exact twenty pages, explicit retry preserves H/run/cursor; crash restart same attempt |
| AC-f04-reply-suppression-005 | tests/replies-integration.test.ts | F04a real PG reply matching, durable rescan, crash atomicity and stop serialization |
| AC-f04-reply-suppression-006 | scripts/check-f04a-heavy.sh | npm run build |
| AC-f04-reply-suppression-007 | tests/suppression-integration.test.ts | B1 exact30day expiry boundary and corrupted job binding zero business writes |
| AC-f04-reply-suppression-008 | tests/suppression-integration.test.ts | B2 pool optout globally withdraws intended recipient, preserves sender and in-flight |
| AC-f04-reply-suppression-009 | tests/suppression-integration.test.ts | B3 complaints operator auth, closed absent config, durable dedup bound payload and 0 writes |
| AC-f04-reply-suppression-010 | tests/suppression-integration.test.ts | B4 concurrent 31st request 429 counts failures and ignores forwarded IP |
| AC-f04-reply-suppression-011 | tests/suppression-integration.test.ts | B5 default/missing/failure pause, empty explicit complete, reset and incomplete explicit retry |
| AC-f04-reply-suppression-012 | scripts/check-f04b-final.sh | python3 scripts/check-f04b-mutation.py |

## Coverage limits and current status

Each row is one existing literal executable witness, not proof of its entire composite AC or of a rerun. Full unit/integration/build/type/lint/meaningful mutation/security/canary/license/donor/source-image and fresh-review procedures remain required by the original clauses and historical receipts. Build-script guard phrases cover only the named command path; they do not independently prove licenses, acceptance or delivery. Additional existing same-feature tests and accepted receipts remain normative. Source paragraphs are quoted in `scenarios.md`; derived BDD describes the remaining procedure conditions. Prior completion bytes: `history/05_completion.pre-contract-coverage.md`, sha256:8d1e07eaff504470fb92c20acb0db9b52e6b8a1e0011e078696088c24d9dfddf. No original completion prose outside the archived/replaced F05 table was removed.
