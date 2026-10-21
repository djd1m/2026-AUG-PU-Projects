# F05 completion

A1–A6 accepted at9944b189 (`review-a.md`); B1–B6 accepted after F1/F2 correction atf0fb8556 (`review-b-r1.md`). Entire F05 accepted12/12. Final fullPG109/unit27/restored11, three concrete mutantsRED,canary/sourceimage80inputs PASS. F06 cabinet/full browser/docs/PR remains mandatory. No live SMTP, real charge or deployment approval implied.

## Criterion coverage

| AC id | Test file | Test title |
|---|---|---|
| AC-A1 | tests/billing-integration.test.ts | A1 concurrent free/team mailbox limits and post-lock expiry, existing edit retained |
| AC-A2 | tests/billing-integration.test.ts | A2 explicit priority, cookie failure reasons, self/inactive and tenant404 |
| AC-A3 | tests/billing-integration.test.ts | A3 parallel HTTP idempotency, immutable payload, crash recovery and disabled zero-state |
| AC-A4 | tests/billing-integration.test.ts | A4 canonical mismatch, unavailable503, bounded callback, stale cancel/expiry barriers |
| AC-A5 | tests/billing-integration.test.ts | A4/5 HTTP canonical success, frozen attribution, replay fixed expiry, two buyers and cancellation |
| AC-A6 | tests/billing-integration.test.ts | F05 A1–A6 real PostgreSQL HTTP and canonical race gates |
| AC-B1 | tests/evidence-integration.test.ts | B1 owner input manual provenance unknown and no external source IO |
| AC-B2 | tests/evidence-unit.test.ts | B2 exact 7days/+1ms, 28days/+1ms, equal UTC windows, future and reasons |
| AC-B3 | tests/evidence-integration.test.ts | B3 concurrent explicit share yields ONE report/event and payload409 |
| AC-B4 | tests/evidence-integration.test.ts | B4 EVERY view current TEST entitlement, expiry and committed revocation |
| AC-B5 | tests/evidence-integration.test.ts | B5 own aggregate counts explicit idempotent copy/link and bounded histories |
| AC-B6 | tests/evidence-integration.test.ts | F05 B1–B6 real PostgreSQL HTTP evidence and public report gates |

Additional HTTP29/30 raw-count/ratio check, current clock after waiting share lock, immutable evidence/whitelist privacy, aggregate cap1000/200/600 and accessible historical HTML are in evidence-integration/unit. Billing conversion2/replay/self/inactive tenant scenarios remain in accepted full regression. Actual commands/exits and immutable source/build/image map belong to `docs/telemetry/features/20261003T010600Z-f05/sol-b-r1-receipt.md` and fresh `astra-b-r1-receipt.md`; pending never means pass. No whole-cabinet UX claim.
