# F09 derived acceptance scenarios
Spec revision: sha256:6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9
Source revision: fbc4232548cefc441cf7cf5e9a5b321eef80b825

All cases are prospective BDD obligations, not executed runtime tests. Each outline supplies happy/error/edge/abuse witnesses. F09-V1 is a requirements design finding, not a claimed runtime failure.

## Criterion scenarios
| Criterion | Scenario | Source SHA256 |
|---|---|---|
| AC-f09-live-transport-001 | Scenario Outline: F09 scoped authority precedes every side effect | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-002 | Scenario Outline: F09 final commit orders stops and quotas | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-003 | Scenario Outline: F09 SMTP accepts only complete final DATA250 | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-004 | Scenario Outline: F09 delivery ambiguity never becomes retry proof | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-005 | Scenario Outline: F09 IMAP proves numeric UID range coverage | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-006 | Scenario Outline: F09 reset and replay preserve atomic semantic stops | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-007 | Scenario Outline: F09 hostile framing and resource ownership stay bounded | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-008 | Scenario Outline: F09 credentials and evidence modes remain isolated | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |
| AC-f09-live-transport-009 | Scenario Outline: F09 acceptance binds parent witness to exact source | 6e10f17fd5373c92a8725d6298827265f6b5082d8c37bba45777c3d7a7a756e9 |

## AC-f09-live-transport-001
```gherkin
Scenario Outline: F09 scoped authority precedes every side effect
  Given a mailbox and independently configured operator capability
  And <condition>
  When publication or transport authorization is attempted
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | current CAS revision, matching tenant endpoints fingerprint and future expiry | publish grants only requested smtp_submit or imap_headers; no consent readiness lease or jobs created |
    | error | only diagnostic grant or verified_test exists | deny before decrypt DNS and socket |
    | error | grant absent expired revoked or wrong configuration | deny before decrypt DNS and socket |
    | edge | identical settings replacement or stop-resume ABA follows snapshot | transport_revision mismatch denies stale snapshot |
    | abuse | old privileged file is published after a newer revoke | expected revision conflicts; revoke remains current |
    | abuse | foreign mailbox or missing configured operator capability | zero authority writes and zero sockets |
```

## AC-f09-live-transport-002
```gherkin
Scenario Outline: F09 final commit orders stops and quotas
  Given a claimed job with current sender and pool recipient readiness consent and grants
  And <condition>
  When the final transition competes with an eligibility writer
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | final commit wins before stop | at most the committed attempt runs outside the transaction |
    | error | stop grant revoke config change or capacity expiry wins first | zero adapter calls |
    | error | either pool participant lacks current IMAP grant consent active lease or complete poll under60s | block sender before submitting |
    | edge | global lock waiter crosses UTC midnight or provider cap is lowered | recheck DB clock and current shared quota default10 ceiling30 lower provider cap |
    | edge | crash follows submitting commit before adapter call | recover unknown_delivery retain reservation and never requeue |
    | abuse | cancel immediately before COMMIT submission | synchronous beforeCommit guard rolls back with zero adapter calls |
```

## AC-f09-live-transport-003
```gherkin
Scenario Outline: F09 SMTP accepts only complete final DATA250
  Given an authorized committed attempt and real local TLS SMTP peer
  And <condition>
  When the native SMTP state machine submits bounded MIME
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | 465 verified TLS with advertised PLAIN and complete final250 | one MAIL one RCPT one DATA; accepted receipt has stable persisted Message-ID |
    | happy | 587 advertises STARTTLS and accepts verified upgrade | post-TLS EHLO precedes AUTH; final250 establishes acceptance |
    | error | missing STARTTLS wrong certificate or unexpected AUTH success code | no AUTH on unsafe transport and no message acceptance |
    | error | MAIL250 or RCPT251 but missing final DATA reply | do not label accepted |
    | edge | body32KiB subject200Unicode and wire64KiB exact bounds | accept otherwise valid input with base64 lines<=76 and valid folded encoded subject |
    | abuse | CR LF NUL header injection nonASCII envelope or one byte over bound | reject before network; local sink alone retains LOCAL TEST label |
```

## AC-f09-live-transport-004
```gherkin
Scenario Outline: F09 delivery ambiguity never becomes retry proof
  Given a persisted attempt with stable message identity and quota reservation
  And <condition>
  When a protocol outcome or recovery is processed
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | complete DATA250 then QUIT or close failure | persist accepted once; cleanup does not erase acceptance |
    | error | timeout disconnect cancellation malformed final reply after first body write may begin | unknown_delivery retains quota and zero further submissions |
    | error | final450 or550 after body | definite rejection with no auto retry and no no_data_submitted proof |
    | edge | proven pre-body transient421 or network failure | max3 attempts within120s with5s/30s delays; each total<=90s finalwait<=30s prebodyphase<=10s |
    | edge | outcome persistence fails or stale attempt result arrives | recovered submitting remains unknown and no repeat external call |
    | abuse | TLS auth protocol or configuration failure offered as transient | permanent failure cannot acquire retry proof |
```

## AC-f09-live-transport-005
```gherkin
Scenario Outline: F09 IMAP proves numeric UID range coverage
  Given a granted IMAP993 reader with explicit rev1 or rev2 AUTH=PLAIN and EXAMINE proof
  And <condition>
  When it fetches UID lo:hi headers through the captured horizon
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | valid requested literal and UID in either FETCH item order followed by matching taggedOK | advance only through min(horizon,cursor+100); no body or Seen change |
    | happy | gaps EXPUNGE or zero matching FETCH with exact taggedOK | numeric range is complete independent of sequence numbers |
    | error | NO BAD BYE EOF truncated literal wrong tag NIL missing UID or duplicate UID | no page cursor or freshness publication |
    | edge | cursor equals captured horizon | fresh successful EXAMINE provides empty-tail proof without invalid FETCH |
    | edge | UIDNEXT horizon shrinks or UIDVALIDITY changes on next connection | reject old proof and restart paused generation |
    | abuse | server embeds fake taggedOK in literal or returns UID outside range | payload cannot complete command; reject malformed page |
```

## AC-f09-live-transport-006
```gherkin
Scenario Outline: F09 reset and replay preserve atomic semantic stops
  Given a poll owner bound to grant mailbox revision and current rescan identity
  And <condition>
  When a completed protocol page is applied
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | matching sender and sent References or In-Reply-To in tenant scope | observation unique semantic stop and cursor commit atomically |
    | error | crash before page COMMIT | no cursor or semantic effect persists |
    | error | grant revoke mailbox stop newer poll owner or config replacement wins before page mutation | stale completion publishes neither freshness nor effects |
    | edge | crash after COMMIT followed by replay or reset with reused Message-ID | existing semantic mailbox/enrollment effect remains unique |
    | edge | UIDVALIDITY reset or failed tail at20pages/120s | sending stays paused until full captured horizon plus fresh fixed tail completes; explicit retry only |
    | abuse | Date or INTERNALDATE supplied by an attacker | store only local observed/complete times; never claim trusted arrival |
```

## AC-f09-live-transport-007
```gherkin
Scenario Outline: F09 hostile framing and resource ownership stay bounded
  Given production parsers and six durable transport slots shared by multiple processes
  And <condition>
  When input admission cancellation or owner recovery is exercised
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | fragmented and coalesced valid literal payload within8192bytes and1MiB total | parse exactly once; success releases socket timers listeners and owned slot |
    | error | literal8193 control8193 operation1MiB+1 or SMTP64KiB+1 | abort before excess allocation and commit no partial page |
    | error | slow trickle stalled drain DNS completion after abort or duplicate terminal callback | remaining total deadline bounds active work; no late connect write or publish |
    | edge | global2SMTP/4IMAP occupied or same protocol/mailbox active | deny extra admission with zero sockets and no waiting queue |
    | abuse | NUL duplicate scalar ambiguous From more than50 references or nested framing injection | reject rather than truncate potentially stopping evidence |
    | edge | owner is OS-suspended with established socket past120s lease while another process claims same slot | slot must remain unavailable until old socket closure or owner termination is proven; current PLAN lacks this proof (F09-V1) |
```

## AC-f09-live-transport-008
```gherkin
Scenario Outline: F09 credentials and evidence modes remain isolated
  Given tenant-bound AEAD envelopes and trusted production or explicit fixture constructors
  And <condition>
  When transport decrypts connects and records results
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | authorized fixture uses explicit local CA and dial injection | receipt mode protocol_fixture; local sink mode local_test; no live_provider claim |
    | error | wrong AAD unknown key or tampered envelope | zero sockets and typed scrubbed error |
    | error | malicious peer echoes plaintext or base64 PLAIN credential canary | canaries absent from API logs receipts metadata and errors |
    | edge | production constructor is built from normal loadConfig HTTP main | no fixture resolver CA or dial selector is reachable |
    | abuse | HTTP or environment attempts fixture mode bypass | reject without creating transport authority |
    | abuse | forged session wrong Origin foreign tenant SQL header or command injection | existing auth/tenant and bounded input controls deny with no cross-tenant writes; no new public auth endpoint |
```

## AC-f09-live-transport-009
```gherkin
Scenario Outline: F09 acceptance binds parent witness to exact source
  Given a candidate commit spec digest Node22.20.0 build and real TLS plus PostgreSQL fixtures
  And <condition>
  When independent acceptance evaluates criterion witnesses
  Then <expected>
  Examples:
    | kind | condition | expected |
    | happy | all nine criteria full regressions typecheck lint build canaries mutations pass | accept only exact source-bound local F09 evidence |
    | error | parent test absent or named title missing | PhaseIII completion fails; never invent runtime PASS |
    | error | only mocks or missing PG crash and concurrency assertions | reject runtime acceptance despite structural report success |
    | edge | migration13to14 with existing encrypted records and local history | preserve data with zero grant consent or active-lease backfill |
    | abuse | mutation removes ambiguity UID generation transaction grant capacity TLS or receive fence | corresponding fixed guard must fail before original bytes restored |
    | edge | UI unchanged and external live accounts not authorized | browser not_applicable; F10 F11 F14 F15 and external pilot remain separately pending |
```

The parent witness must be tests/expanded-mvp-03.test.ts with literal title `ambiguous SMTP and UID reset preserve recovery safety`. Existing authentication throttling remains regression scope; F09 adds no public authentication endpoint. Grant file parsing is bounded16KiB with unknown keys and injection rejected; admission exhaustion never queues unauthenticated external work.
