# F08 — derived BDD scenarios

Spec revision: sha256:a3ad1300fde78f396c850627e9fd833391d3a572214801315519b92ad197a0a8
Derived during independent VALIDATE, not executed tests. Each heading below is an exact selector in validation-report.md. Background: own authenticated tenant, valid Origin, configured mailbox, separate unchecked consent and no new capacity lease. Authorized fixtures use explicit test construction, actual TLS and production protocol states; production authority remains disabled unless independently granted.

```gherkin
Feature: F08 bounded independent diagnostics

  Scenario Outline: F08 authority and ownership precede side effects
    Given the diagnostic request has <condition>
    When POST diagnostics reaches the normal application boundary
    Then it returns <status> before credential decryption and DNS or sockets
    And unauthorized requests create no diagnostic writes
    Examples:
      | condition | status |
      | no operator grant despite saved credentials and allowlist | 503 live_provider_disabled |
      | forged or revoked session | 401 |
      | wrong Origin | 403 |
      | another tenant mailbox UUID | 404 |
      | expired grant | 503 live_provider_disabled |
      | grant with wrong endpoint tuple, scope, tenant or mailbox | 503 live_provider_disabled |

  Scenario: F08 fixture authority cannot be supplied by a caller
    Given production main is constructed without the test connector
    When HTTP input or environment attempts to choose a fixture connector, CA or evidence mode
    Then no fixture bypass is enabled and no unauthorized connection occurs
    And a test-only constructor can authenticate against actual local TLS as protocol_fixture

  Scenario Outline: F08 DNS and TLS reject unsafe peers before authentication
    Given an authorized diagnostic attempt encounters <condition>
    When its production connection path runs
    Then <boundary> is observed with a typed scrubbed failure and no retry
    Examples:
      | condition | boundary |
      | zero DNS answers or more than 32 answers | no socket |
      | any private, mixed unsafe or invalid-family DNS answer | no socket |
      | untrusted, expired or wrong-host certificate | no AUTH |
      | TLS below 1.2 | no AUTH |
      | SMTP587 lacks STARTTLS, rejects upgrade or retains plaintext bytes | no AUTH |

  Scenario: F08 pin survives DNS rebinding and discards pre-TLS capabilities
    Given a fresh safe DNS answer and a resolver that would return a private IP next
    When the adapter connects and SMTP587 upgrades on the same socket
    Then the actual dial uses only the chosen numeric address and original hostname verification
    And no second hostname resolution or reconnect occurs
    And post-TLS EHLO must advertise AUTH PLAIN regardless of pre-TLS advertisement
    And production rejects the loopback endpoint used by the isolated fixture seam

  Scenario Outline: F08 SMTP and IMAP outcomes remain independent
    Given verified TLS peers produce SMTP <smtp> and IMAP <imap>
    When both diagnostic operations run under their shared deadline
    Then both per-protocol TLS and auth outcomes are retained independently
    And only SMTP235 or exact authentication-command tagged IMAP OK proves auth
    And the API returns 200 for completed per-protocol authentication outcomes
    And transcript verbs contain no MAIL, RCPT, DATA, BDAT, SELECT, EXAMINE, FETCH, APPEND, STORE or IDLE
    And no state, lease, consent, quota or job is enabled by success
    Examples:
      | smtp | imap |
      | AUTH PLAIN success on 465 | AUTH=PLAIN success on 993 |
      | AUTH PLAIN success after mandatory STARTTLS on 587 | AUTH=PLAIN success |
      | 535 auth rejection | exact a2 OK |
      | 235 success | a2 NO or BAD |
      | unsupported AUTH mechanism | PREAUTH unsupported |
      | second 334 challenge or wrong response code | wrong tag or unsolicited BYE |

  Scenario Outline: F08 resources cancel and settle exactly once
    Given a running production diagnostic encounters <condition>
    When its phase, shared request deadline, byte guard or abort fires
    Then each DNS/connect/TLS/greeting/auth phase ends within 10 seconds and the request within 30 seconds including DNS
    And raw and TLS sockets are destroyed, owned timers and listeners are removed and admission is released
    And no retry, queued work, late socket creation or late success publication occurs
    Examples:
      | condition |
      | stalled DNS followed by late resolution |
      | stalled raw connect, TLS handshake, greeting or auth |
      | slow trickle that never finishes a response |
      | 65537 response bytes in one chunk or across chunks |
      | 8193 line bytes including an incomplete line |
      | malformed CRLF, SMTP multiline or unsolicited IMAP literal |
      | request disconnect or abort during each operation phase |
      | simultaneous timeout, peer error and success callbacks |

  Scenario: F08 exact byte boundaries and admission remain bounded
    Given valid protocol frames at 65536 total bytes and 8192 bytes per line including split CRLF
    When the byte parser processes them
    Then limits are checked before concatenation or decoding and no valid boundary frame fails solely for size
    When two process requests are active or one request already owns the same mailbox
    Then an excess request returns 429 without sockets or a waiting queue
    And subsequent requests can be admitted after cleanup
    And measured owned handles return to zero without claiming hard RSS or JavaScript zeroization guarantees

  Scenario Outline: F08 current revision fences every stale completion
    Given an actual TLS diagnostic is blocked before final persistence
    When <writer> commits before it under the global advisory lock
    Then finalization takes advisory_xact_lock(7,1) before row locks and reads database clock after that lock
    And compares tenant, monotonic revision, attempt UUID, nonstopped state and current config/grant fingerprint and expiry
    And rejects stale results with 409 mailbox_changed or 503 for disabled grant
    And cannot revive evidence, capacity, consent or jobs
    Examples:
      | writer |
      | credentials or endpoint settings replacement |
      | replacement with identical settings |
      | any settings update including daily limit |
      | stop then resume or reconfigure ABA |
      | complaint suppression quarantine through shared cancelMailbox |
      | another process begins a newer attempt |
      | operator grant/config revocation, rotation or expiry while waiting for lock |

  Scenario: F08 grant revocation is ordered with final publication
    Given diagnostics have read the current grant fingerprint
    And final persistence is blocked before or after acquiring the global lock
    When an operator revokes or replaces that grant before the publication linearization point
    Then the pending result cannot commit as current verified evidence
    And a grant change ordered after successful publication immediately invalidates its current eligibility
    And the implementation declares one authoritative revision and the serialized ordering used by both operations
    And reading a mutable file before lock acquisition alone cannot satisfy this scenario

  Scenario: F08 transaction ordering and rollback preserve stop semantics
    Given a diagnostic starts and finishes in short eligibility transactions with network outside them
    When a new attempt begins
    Then old success is immediately noncurrent
    When final persistence succeeds before a later stop
    Then that stop invalidates evidence and releases capacity while cancelling only queued and claimed jobs
    And submitting and unknown delivery keep their existing semantics
    When persistence throws before commit
    Then no partial result survives rollback

  Scenario Outline: F08 AEAD and secret canaries never escape
    Given <condition>
    When diagnosis and its error handling complete
    Then <outcome>
    And API, DOM, DB diagnostic metadata, logs, telemetry and exception text contain no credential or hostile-server canary including encoded AUTH forms
    And persisted fields are explicit allowlisted enums and opaque revision metadata only
    And existing AEAD tenant/mailbox/version binding and Argon2id parameters remain unchanged
    Examples:
      | condition | outcome |
      | tampered ciphertext, unknown key or foreign AAD | no socket opens |
      | server error containing password, username or body canaries | scrubbed typed failure |
      | native TLS or socket error containing secret canaries | scrubbed typed failure |
      | valid authentication followed by cleanup | credential references are released |

  Scenario: F08 injection does not cross a trust boundary
    Given SQL, XSS or command-like text in mailbox labels or hostile server responses and CRLF or NUL in credential/host inputs
    When save, diagnosis and status rendering execute
    Then invalid structured inputs are rejected before connection
    And accepted text is parameterized or rendered as text with no SQL, shell or HTML execution
    And no raw response text reaches any public or persistent diagnostic sink

  Scenario Outline: F08 UI reports evidence mode and current state truthfully
    Given a mailbox has <state>
    When its owner views and reloads details at desktop 1440 or mobile 390
    Then SMTP and IMAP each show mode, TLS/auth result, checked time when available and typed explanation
    And pending, disabled, stale and never-run results are distinguishable and unusable as current verification
    And keyboard operation, busy duplicate-click prevention and secret-free live announcements work
    And capacity/waiting and unchecked separate consents remain independent
    And logout or session change prevents a late response from repopulating the new session
    Examples:
      | state |
      | independently successful and failed protocol outcomes |
      | pending, disabled, stale or never-run diagnostics |
      | successful protocol_fixture diagnostics |
      | legacy local_test verification |
      | successful separately authorized external live_provider evidence |

  Scenario: F08 acceptance uses real fixtures and preserves regressions
    Given actual local TLS SMTP465, SMTP587 and IMAP993 fixtures, PostgreSQL16 and the production adapter
    When the source-bound test named live diagnostics enforce pinned TLS without DATA runs
    Then positive, hostile, cancellation and revision-race scenarios above have actual witnesses
    And migration schema12 to schema13 preserves encrypted data and state without verified evidence, lease or consent backfill
    And old-app compatibility and rollback are checked
    And disabling hostname enforcement, receive cap or revision equality makes the corresponding actual guard fail
    And restored source passes unit, PostgreSQL, security, dispatch, billing, capacity, typecheck, lint and build checks
    And relevant Docker browser runs after read-only companion preflight
    And global30, lease120, null mailbox plans, campaign3/10, TEST100minorRUB/30days, current UTC quota and unknown_delivery no-blind-retry remain intact
    And no external provider, F09 transport or whole expanded-MVP acceptance is claimed from local fixtures
```
