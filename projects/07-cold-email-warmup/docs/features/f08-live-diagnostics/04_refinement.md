# F08 — edge cases and verification plan

## Edge Cases & Error Handling

| Case | Required behavior / witness |
|---|---|
| Empty input | Existing body/id/settings validators; no DNS/side effects. |
| Max size | Literal65536 response bytes accepted only if valid,65537 fails before concat;8192 line cap independent; split CRLF and huge single chunk exercise parser. Credentials retain existing bounded input. |
| Concurrent access | Duplicate mailbox attempt429 during admission; two processes can overlap, newer durable revision wins; stop and replacement during real network wait cannot resurrect evidence. |
| Network failure | Each protocol outcome retained; DNS/connect/TLS/greeting/auth phase codes; no native text; no auto retry. |
| STARTTLS injection | Required extension,220 boundary, reject plaintext leftovers and discard pre-TLS AUTH capabilities; never AUTH before trusted TLS. |
| IMAP unsolicited data | PREAUTH/unknown tags/literals/BYE or malformed frame fail typed; no mailbox open/read or compression. |
| Stop ABA / config rotation | Replacement with same fields, pause then later reconfiguration, shared complaint quarantine, revoked grant and new attempt each invalidate old result. |
| Timeout trickle | Total30s remains despite activity; assert peer close and no owned timers/listeners after settlement. |
| Disconnected client | Abort diagnostic sockets; do not grant capability based on late response. |
| Secrets | Password, username, server-text and base64 AUTH canaries absent in API/DB/log/DOM. TLS fixture transcript inspection remains in-memory test assertions, no raw secret artifact. |

## Testing Strategy

Unit: typed status mapping, finite parser framing, immutable deadline/cap literal assertions, grant validation, production fixture rejection and AEAD/canaries. Integration: actual TLS local servers exercise exact adapter, real PostgreSQL revision/lock/stop/rollback and additive migration. Parent witness must call real adapter tests, not duplicate a canned success. E2E: existing Docker Playwright1.63.0 only, desktop1440/mobile390, keyboard independent statuses and reload; explicit fixture mode, unchanged unchecked consents/capacity. Performance: admission2/process and1/mailbox returns429 for excess with no queued work, slow-trickle and overflow release resources; do not claim multi-instance global diagnostic concurrency from a process semaphore.

## Test Cases

Happy path: Given valid local TLS certificates for synthetic allowed hosts and distinct SMTP/IMAP canary accounts, When real production protocol states authenticate, Then both results succeed as protocol_fixture, transcripts omit DATA and mailbox access, DB has no new lease/consent/job.

Error case: Given SMTP valid TLS but535 auth failure while IMAP authenticates, When diagnosis completes, Then SMTP auth failed and IMAP auth ok persist independently with no secret or server text.

Security cases: wrong hostname/untrusted/expired certificate;587 missing extension/downgrade; mixed public/private DNS/rebinding; AAD swap; auth unsupported/PREAUTH; CRLF injection; malformed multiline/tag/continuation; EOF in every phase; exact byte caps; cancellation in DNS/connect/upgrade/auth; timeout with repeated fragments.

Concurrency cases: block global lock before final persistence; commit replacement, complaint quarantine, pause, newer attempt or grant revocation first; old result cannot update current evidence. Reverse ordering allows stored observation but subsequent stop immediately invalidates it and releases lease through existing path; submitting/unknown remain subject to old non-retry contract. Inject DB failure after result write and prove rollback.

## Optimizations and hardening

Reuse existing bounded DNS validation but never cache resolved peer across attempts; O(1) current mailbox diagnostic row needs no new index. No raw protocol logger. Phase budgets are fixed server policy. Isolate mutations removing hostname check, byte limit, and revision equality; actual corresponding tests must fail. Preserve all existing security and quota mutations required by integration scope. Accessibility uses existing semantic buttons/status live region, no color-only outcome. Technical debt is explicit: AUTH PLAIN only, no OAuth, no generalized protocol parser; broader auth/provider coverage and F09 send/UID work require new source contracts rather than opportunistic extensions.
