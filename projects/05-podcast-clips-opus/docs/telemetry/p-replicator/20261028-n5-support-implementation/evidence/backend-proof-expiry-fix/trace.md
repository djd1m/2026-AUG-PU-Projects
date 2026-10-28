# Proof session expiry after token lock correction
RUN_ID:20261028-n5-support-implementation
WORK_UNIT_ID:support-backend
Attempt-ID:proof-expiry-fix-01
Source-Revision:c54a013a9ce671b00a9cdca2b5ed3261824ee42d
Baseline-Revision:835aafcb121cf03186bc5ec308774807719d28ae
Root-Candidate-Revision:68a2943a (independent review packet)
Spec-SHA256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf
Canon-SHA256:560c11ea0d182d6078a3ae285b3475bbae97f2643066e83a26026f91b6644f3a
Original-Launch-SHA256:f5b949d88177aee59e4140136c97d3b9d8d147d32376fc68975cb9f67c5f6631
Correction-Launch:root confirmed cold-review P2; additional bounded10min after context handoff
Finished-At:2026-10-28T02:52:20.477115+00:00
Observed-Elapsed-Seconds:163.477
Verdict:PASS for scoped proof-expiry correction; integrated acceptance remains root-owned

Confirm now rechecks BOTH issuer/current sessions with clock_timestamp() after token FOR UPDATE returns. Session hashes deduplicated; count of active matching account sessions must equal expected count. Existing account→sessions→token locks remain; post-wait query takes no new row locks. Current-account/email/purpose/unused/token-expiry conditional consume unchanged; no network/bcrypt added to transaction.
Real PostgreSQL regressions independently expire issuer and confirming sessions while an external transaction locks a long-lived proof token. pg_stat_activity establishes actual wait on token query after earlier authority locks; PostgreSQL pg_sleep waits past DB session expiry, blocker releases, confirmation must refuse without proof write or token consume. Existing account-lock case retained.
Old code:exit1,2failed/22passed, both returned true after expired session. Fixed:24/24PASS,0skipped,13.36s. DB build,web typecheck,lint,diff-check exit0. No full web build.
Red-Receipt:/tmp/n5-support-backend-checks-20261028/proof-expiry-01/red.json
Red-Receipt-SHA256:a741a5ff792bd7003d8dcafb189ab2aa6da96ef007e3ba73394987fd81d0af17
Green-Checks:/tmp/n5-support-backend-checks-20261028/proof-expiry-01/checks.json
Green-Checks-SHA256:6c3f4fb9fa91c20aea91205d228c399e606055212b1207354ee2b5544b7659fd
JSON records private0600 logs and hashes.
Source hashes:
- projects/05-podcast-clips-opus/packages/db/src/support-email.ts:SHA256 9331ef138369d427219d5cbcd519f9a8ca2c083bcdc59949976be5ca3fbb2506
- projects/05-podcast-clips-opus/tests/support-email.integration.test.ts:SHA256 c1e9f2d0c5506d077262078098210fa36a8717a0d538dd3c0de8c520cbd4bc4d
Commit:c54a013a9ce671b00a9cdca2b5ed3261824ee42d
Worktree:clean at handoff
Requested model:gpt-6.1-sol medium; actual model/usage/cost:null,host metadata unavailable.
Next executors:root verifies/merges and runs integrated acceptance; same backend worker now starts separately authorized combined15min admin attempt(stage,exact cursor precision,existing grant/debit ledger read), with distinct commit/receipt. No admin source touched during this proof attempt. No production credentials/mail/paid calls/newservices.
endStatus: completed
Status: completed
