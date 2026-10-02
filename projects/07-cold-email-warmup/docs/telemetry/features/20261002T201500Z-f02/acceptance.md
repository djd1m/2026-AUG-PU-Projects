# F02 acceptance

All six AC accepted at source b8abcd53 (product correction9d10a6b0). Initial independent
Astra review supported AC1/2/4/5 and found one P2 reserved IPv6 defect in AC3.
Sol correction preserved full regression; fresh exact-file Astra ACCEPT closes R1.
Required delivered-file check exit0. Code completion and wrapper status remain
separate: correction600s timeout had a committed terminal receipt; first targeted
review180s and delivery90s attempts produced no file and were NOT accepted.
Replacement fresh review152.915s exit0 delivered report and receipt.

| AC | Accepted evidence |
|---|---|
| AC-F02-1 | Initial review: masked persistence, tenant/Origin/auth, save0transport; realPG |
| AC-F02-2 | Initial review: AEAD/AAD/version/key separation, canary failures0transport |
| AC-F02-3 | R1 final review: IANA allocated ranges, reserved/mixed0adapter, TLS/pinning contract |
| AC-F02-4 | Initial review: separate versioned consent, exact campaign snapshot invalidation |
| AC-F02-5 | Initial review: lock-first seven writers, rollback and scoped queued cancellation |
| AC-F02-6 | Corrected10unit14PG/typecheck/lint/build/security, meaningful mutations; both reviews |

Source/build hashes and raw logs live in evidence/r1; image38ba08e3e736… and
snapshotc8f2c91a37f6… are exact in sol-r1-receipt.md. Reviewer runtime metadata
confirms Astra high, both product authors Sol6.1 high. Native coordinator and
aggregate billing unknown; no savings claim. Full accepted-result elapsed in
run.json includes failures and coordination, not just model generation.

This accepts local mailbox/consent API persistence. Live SMTP/IMAP activation,
dispatch(F03), ingestion/public unsubscribe(F04), billing/growth(F05), full UI(F06)
and deployment are not accepted by this receipt. verified_test is not provider
verification; no reputation/inbox evidence invented.
