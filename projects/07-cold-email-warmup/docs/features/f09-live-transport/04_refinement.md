# F09 — refinement and required verification

All cases are planned; no runtime pass is claimed by this file.

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | absent grant, empty headers/range | deny grant; empty UID range requires valid EXAMINE/tagged proof | no manufactured completion |
| Max size |8192/8193 literal,1MiB+1 operation,64KiB+1 SMTP | exact bound accepted only if otherwise valid; overflow abort | byte counters before allocation |
| Concurrent access |20 claimers, quota3; revoke/stop/final commit race | quota≤3 and each lock ordering established | real PG barriers |
| Network failure | EOF after terminator, stalled final reply | unknown, retained quota, no retry | phase-aware outcomes |
| Complete negative DATA | final450/550 | definite rejection, no auto retry | separate post-DATA reason |
| Read-only UID gaps | sparse UID range, EXPUNGE, zero FETCH | tagged OK range proof; no sequence cursor | generation+UID only |
| Literal injection | literal contains fake tagged OK and CRLF | bytes remain header payload; no early completion | framing state |
| Reset/replay | new UIDVALIDITY, reused message ID, same enrollment | pause until full+tail; one semantic effect | existing unique reply_effect |
| Crash | before/after page commit and after submitting commit | atomic page; abandoned send unknown | durable recovery |
| Authority ABA | identical replace, stop/resume, stale publish | revision mismatch denies | monotonic CAS |
| Resource denial | six slots full, same mailbox concurrent, expired occupied row | no socket/no unbounded queue | occupied rows retain exclusion |
| Suspended owner | SIGSTOP after real socket open, lease expires | no replacement socket until observed close/confirmed exit | real processes and peer connection counts |
| Cleanup failure | DB down at release, parent restart, kill request without exit | slot remains occupied; later proof-bound CAS only | bounded recovery, unknown never retried |
| Rev1/rev2 syntax | both explicit capability sets | same finite subset succeeds | unsupported auth/extension rejects |
| Secret exception | credential and server canaries | typed reason only | sinks inspected |

## Testing Strategy

Unit: SMTP classes/phase matrix, MIME serialization/UTF-8 folding, dot transparency, bounded framing across every chunk split, valid/malformed literals, duplicate headers, UID integer limits, authority validation and enum-only errors. Literal threshold expectations use fixed numbers, not production constants.

Integration: real PostgreSQL16 schema13→14 preserves encrypted records/local history; no authority/consent/lease backfill. Two tenants, sender/recipient grant and capacity fences, UTC rollover and lower provider limits. Every stop writer BEFORE and AFTER final commit: consent revoke, mailbox pause/quarantine, complaint, suppression/unsubscribe, reply, campaign stop/version and capacity deactivate/expiry; add grant revoke/expiry/config replacement. Capture/page source changes reject stale owner.

E2E: actual production state machine with trusted explicit local TLS SMTP465/STARTTLS587/IMAP993 fixtures, socket-level transcripts and PG effects. Positive250, pre-DATA421/450/550, final450/550, body socket failure, missing final reply, cancellation and crash all distinct. Fake successful connect alone is insufficient. No host/browser installation. No UI change means browser not_applicable; if UI changes, coordinator runs companion preflight and existing Docker Playwright390/1440/keyboard/persistence under UI mutex.

Performance: assert protocol hard deadlines under slow trickle, write backpressure, bounded queues, zero owned active sockets/timers/listeners after cleanup and admission≤2/4 across processes. Timers are conditional on process scheduling and do not prove closure under OS suspension. Required real multi-process witness: owner A opens an actual local TLS socket, parent SIGSTOPs A, wait past its actual120s lease, then B attempts the same mailbox and all occupied SMTP2/IMAP4 slots. Observe peer-side simultaneous connections and assert no new admission/overlap while A is stopped; expiry alone must not free A. Send termination request but withhold exit proof and assert still blocked; then confirm exact A exit plus fixture socket closure, permit CAS release and prove B can connect. Also resume A into normal sealed-close acknowledgement and verify release only after underlying close. Use real process signals/time for this witness, not mocked deadlines. Test stale acknowledgement against replacement owner, DB release failure and recovery, parent restart with orphan, lost identity/cross-host proof absence and bounded cleanup failure. Assert a committed A SMTP attempt remains unknown with reserved quota and zero retries. Mutation restoring expiry-based reclaim must turn this witness red. Do not invent RSS/SLO numbers; F10/F14 load acceptance separate.

## Test Cases

```gherkin
Scenario: Happy path preserves actual acceptance and stops a reply
 Given independently granted sender and IMAP reader with valid consent and capacity
 When real local SMTP returns final DATA250 and IMAP returns a matching reply in a completed UID range
 Then the attempt is submitted and exactly one semantic stop effect commits with the cursor

Scenario: Error case remains unknown and scan remains paused
 Given a committed SMTP attempt and a mailbox whose UIDVALIDITY changes
 When the peer disconnects after the DATA terminator and the replacement scan fails its tail
 Then delivery is unknown with retained quota and zero retries
 And scan_complete remains false without partial page effects
```

Mutations must prove red guards for removed post-body ambiguity fence, UIDVALIDITY fence, atomic page transaction, grant revision, sender/recipient capacity/consent, TLS hostname check and receive limit. Use existing mutation facilities or bounded temporary patches restored to exact source; no new validator/engine. Required full existing suites, typecheck, lint, build and dependency/secret diff inspection remain mandatory. Repeat affected checks only after relevant corrections.

## Performance Optimizations

Index existing job/grant/cursor lookups; bounded numeric windows and fixed operation slots. No unbounded SEARCH result, history cache, connection pool across mailbox identities or extra queue service.

## Security Hardening

AEAD tenant/mailbox binding; public-IP pin and platform trust; immutable attempted message identity; source guards before mutation; enum-only audit. No auth downgrade or fixture config switch. Operation cancellation and resource cleanup are assertions, not comments.

## Accessibility

No interface change planned; existing accessible controls remain regression scope only. UI work would require explicit updated ownership and browser checks.

## Technical Debt

Finite common IMAP dialect and ASCII envelopes intentionally exclude broad provider support. Sparse UID windows can require many bounded retries. F10 must schedule incomplete attempts fairly; no shortcut is permitted to manufacture fresh polling. Body context, trusted arrival provenance and provider-specific authorization remain F11/F14/F15.
