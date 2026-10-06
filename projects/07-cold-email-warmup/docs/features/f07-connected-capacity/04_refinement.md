# F07 — Refinement and failure paths

| Case | Required behavior / discriminating check |
|---|---|
| Two tenants compete for final slot | Real PG barrier, one active, other durable waiting, global count30 |
| Duplicate activation | One mailbox unique row; renewal only, never second slot |
| Expiry exactly now / waited behind lock | expires_at>post-lock now strict; no claim/final send on equality |
| Deactivate then stale renew |404 for foreign; own missing lease409; no resurrection |
| PUT during activation/verification | Existing envelope/state compare retained; release atomically; fresh verification required |
| Paused/quarantined with consent | Shared cancelMailbox deletes lease in same transaction; activation409; consent cannot overwrite mailbox state or lease |
| Complaint at capacity30 | complaintClient → cancelMailbox releases immediately; next tenant activation gets freed slot, no expiry wait |
| Capacity loss after claim | final fence0 calls; movable claim expires/requeues safely; no quota refund after submitting |
| Recipient pool capacity lost | Both sides checked; pair not allocated/claimed/submitted |
| DB error after lease write | Entire transaction rollback; configured record and consent preserved |
| Missing capacity table/row |503/fail closed, no fallback unlimited active |
| Global lease30 with all same tenant | Cap holds; tenant fairness deliberately F10, no promise in F07 |
| Revoke only one consent | That scope blocked; lease is no substitute for remaining authority |
| Existing installation upgrade | No auto lease grant; explicit activation required; data/history intact |
| Foreign pagination and mutations | WHERE tenant everywhere; no ciphertext, foreign404 before DNS |
|101+ records and session change | Bounded pages; late previous-session response ignored/cleared |
| Expired billing entitlement | Connected create still succeeds; active campaign3 cap remains |
| Rate/body abuse | Reuse SuppressionStore.charge thresholds and body byte cap, no new framework |

Source observations requiring explicit implementation fixes: MailboxStore.list is
currently unbounded; SessionClient returns only data, so use a data page object
and update every caller, not metadata ignored by the client. PLANS mailboxes3/10
is asserted by billing tests and must change only for mailbox policy. Existing
fixtures set mailbox.state='verified_test' directly; add explicit capacity seed/
activation to those fixtures, preserving test intent and original safety assertions.
Do not bypass the new predicate by accepting missing leases in local_test.

Queue semantics: deactivate returns claimed jobs to queued and clears movable
reservation; queued work remains held by missing lease. Explicit reactivation may
resume still-current authorized jobs. Pause/quarantine/PUT retain existing job and
consent cancellation. Expiry alone does not undo committed submissions or quota.
Renew is trusted only after rechecking current verification/state and existing
unexpired lease; browser retries activation explicitly after stale renewal.

Read total and page are best-effort contemporaneous reads, not a snapshot promise
under concurrent additions. Stable created_at,id ordering plus fixed dataset tests
prove traversal; no duplicate/omission guarantee under arbitrary concurrent edits.
Keyset after-cursor uses own immutable created_at/id anchor, no arbitrary maximum
page number. Browser retains a bounded previous-cursor stack or offers next and
first page controls; no eager whole-tenant fetch.

No new general validator. Reviewer must inspect semantic linkage and races;
traceability names alone cannot prove these invariants.

## F07-VAL-001 — complaint release regression (pending runtime test)

SC-F07-Q refines SC-US-201-3 / AC-f07-connected-capacity-003 and the existing
planned capacity integration test assignment in 05_completion.md. Implement in
`tests/capacity-integration.test.ts` as
`complaint quarantine immediately releases capacity for another tenant`.
Given30 unexpired active leases, a verified waiting mailbox owned by another
tenant, and a claimed job for the mailbox to be quarantined; When authenticated
complaint handling commits through complaintClient → cancelMailbox and the
waiting tenant explicitly activates before the old120s expiry; Then the old
mailbox is quarantined with no capacity lease, the waiting mailbox is active,
and global unexpired count is30. Existing consent/pool/job cancellation is
committed with quarantine; stale renew of the quarantined mailbox returns409,
and its claimed job cannot cross final fence (transport calls0). An injected
transaction failure rolls back quarantine and release together. A final send
committed before complaint retains only the already documented in-flight bound;
submitting/unknown reservations are never refunded or retried by release.

This is a concrete planned real-PG scenario, not an executed acceptance result.
Revoking one consent scope alone may retain capacity; it never substitutes for
mailbox quarantine or revives permission to send.
