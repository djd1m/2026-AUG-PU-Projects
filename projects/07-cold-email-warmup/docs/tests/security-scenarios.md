# Corrective security and boundary scenarios — N7-V01..06

Complements [test-scenarios](../test-scenarios.md). All IDs are declared in Specification.md and claimed in Pseudocode.md. No execution is claimed.

## SC-US-001-3

```gherkin
@FR-n7-001 @security
Scenario: SC-US-001-3
  Given a fresh account registration creates a usable session and own mailbox
  When the owner logs out then logs in and logs out again
  Then both logout cookies fail subsequent mutations with401; own reads had200.
```

## SC-US-001-4

```gherkin
@FR-n7-001 @security
Scenario Outline: SC-US-001-4
  Given an authority from auth bypass Examples
  And concrete case <case> is selected
  When it mutates a mailbox
  Then 401 for no/forged/revoked session or403 for bad Origin and zero commits.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | no session | 401 |
    | forged session | 401 |
    | revoked session | 401 |
    | valid session, wrong Origin | 403 |
```

## SC-US-001-5

```gherkin
@FR-n7-001 @security
Scenario Outline: SC-US-001-5
  Given login attempts at the configured email/IP limits and KDF slots
  And concrete case <case> is selected
  When the next attempt or an unrelated allowed key runs
  Then boundary policy produces429/503 and an unrelated allowed key with a free slot can succeed.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | email attempt5 in15min, IP below ceiling, free KDF | admitted |
    | email attempt6 in15min | 429 |
    | IP attempt10 in1min, email below ceiling | admitted |
    | IP attempt11 in1min | 429 |
    | registration attempt5 in1hour | admitted |
    | registration attempt6 in1hour | 429 |
    | 2 active KDF slots, queue0 | 503 Retry-After1 |
    | unrelated email/IP below limits with1 free slot | successful login |
    | window boundary reset with valid request | admitted |
```

## SC-US-001-6

```gherkin
@FR-n7-001 @security
Scenario Outline: SC-US-001-6
  Given SQL syntax in requested mailbox id or oversized password
  And concrete case <case> is selected
  When a request is submitted
  Then 400 and no SQL execution outside parameter binding or KDF call.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | SQL syntax in mailbox id | 400, no SQL injection |
    | password801 UTF-8 bytes | 400, no KDF |
```

## SC-US-002-3

```gherkin
@FR-n7-002 @security
Scenario Outline: SC-US-002-3
  Given the ciphertext failure Examples contain a credential canary
  And concrete case <case> is selected
  When worker decrypts/connects
  Then zero transport calls for AEAD/AAD failure and no canary in API/DB plaintext/log/error.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | ciphertext bit changed | zero transport, no secret |
    | ciphertext from tenantA placed in tenantB | zero transport, no secret |
    | ciphertext moved to another mailbox same tenant | zero transport, no secret |
    | unknown key version | zero transport, no secret |
```

## SC-US-002-4

```gherkin
@FR-n7-002 @security
Scenario: SC-US-002-4
  Given an allowed transport returns a credential-bearing failure
  When error is reported
  Then only typed scrubbed code appears; canary absent in response/log.
```

## SC-US-003-3

```gherkin
@FR-n7-003 @security
Scenario: SC-US-003-3
  Given only current pool consent is granted and campaign consent absent
  When one pool and one campaign job reach dispatch
  Then pool may submit once, campaign calls0; changing campaign version invalidates only its consent.
```

## SC-US-003-4

```gherkin
@FR-n7-003 @security
Scenario Outline: SC-US-003-4
  Given claimed job is paused before final serialized transition
  And concrete case <case> is selected
  When each stop writer in Examples commits then dispatcher resumes
  Then conditional transition affects0 rows and transport calls0.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | sender consent revocation | 0 calls |
    | campaign version change | 0 calls |
    | campaign pause | 0 calls |
    | sender pool withdrawal | 0 calls |
    | recipient pool withdrawal | 0 calls |
    | reply effect | 0 calls |
    | unsubscribe suppression | 0 calls |
    | complaint quarantine | 0 calls |
    | mailbox eligibility disabled | 0 calls |
    | limit lowered below reserved quota | 0 calls |
```

## SC-US-003-5

```gherkin
@FR-n7-003 @security
Scenario Outline: SC-US-003-5
  Given final submitting transition committed before the same stop writers
  And concrete case <case> is selected
  When stop commits before socket call
  Then at most that one in-flight attempt may send; every later job is canceled and UI explains boundary.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | sender consent revocation | in-flight<=1, later0 |
    | campaign version change | in-flight<=1, later0 |
    | campaign pause | in-flight<=1, later0 |
    | sender pool withdrawal | in-flight<=1, later0 |
    | recipient pool withdrawal | in-flight<=1, later0 |
    | reply effect | in-flight<=1, later0 |
    | unsubscribe suppression | in-flight<=1, later0 |
    | complaint quarantine | in-flight<=1, later0 |
    | mailbox eligibility disabled | in-flight<=1, later0 |
    | limit lowered | in-flight<=1, later0 |
```

## SC-US-004-3

```gherkin
@FR-n7-004 @security
Scenario: SC-US-004-3
  Given two distinct opted-in tenants and disclosure consent
  When local SMTP exchange fixture renders a message and B reads it
  Then B sees sender/header/test body as disclosed, but foreign dashboard/API/private campaign/credentials access returns404.
```

## SC-US-004-4

```gherkin
@FR-n7-004 @security
Scenario: SC-US-004-4
  Given a warmup thread already has its single reply or pair daily thread
  When scheduler replays either event
  Then zero additional reply/thread jobs and total thread length<=2.
```

## SC-US-005-4

```gherkin
@FR-n7-005 @security
Scenario Outline: SC-US-005-4
  Given each injection or missing-field Example
  And concrete case <case> is selected
  When preview/start runs
  Then invalid template/header yields400 and0 jobs; personalization renders as escaped text.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | missing personalization field | 400;0 jobs |
    | CRLF Bcc subject | 400;0 jobs |
    | script markup in template | 400;0 jobs |
    | img tag as personalization value | escaped literal; no img execution |
```

## SC-US-005-5

```gherkin
@FR-n7-005 @security
Scenario: SC-US-005-5
  Given quota at23:59 UTC and lower provider limit
  When final transition runs after00:00 with concurrent workers
  Then current-day reservation obeys lower limit and no previous-day token bypasses it.
```

## SC-US-005-6

```gherkin
@FR-n7-005 @security
Scenario Outline: SC-US-005-6
  Given proven pre-DATA failure versus ambiguous failure
  And concrete case <case> is selected
  When retry clock reaches configured boundaries
  Then max3 total attempts within120s for proven failure,0 retries for ambiguous.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | definite pre-DATA transient at attempts1 and2 | delay5s then30s |
    | definite pre-DATA transient attempt3 | terminal, no attempt4 |
    | elapsed120s before next attempt | terminal |
    | ambiguous DATA timeout | unknown_delivery;0 retries |
    | crash after submitting without pre-DATA proof | unknown_delivery;0 retries |
```

## SC-US-006-3

```gherkin
@FR-n7-006 @security
Scenario Outline: SC-US-006-3
  Given reply R already has one semantic effect under old UIDVALIDITY
  And a paused rescan under new UIDVALIDITY has committed cursor C and fixed high-water H
  And the next page contains R at a new UID and a previously unseen reply S
  When the page writes observations, reply effects and next cursor C2 in one transaction
  And a crash occurs at <crash_boundary> before restart
  Then durable cursor and page effects are <durable_state>
  And restart continues the same rescan run with unchanged high-water H from <resume_cursor>
  And after replay R has exactly1 total effect and S has exactly1 total effect
  And transport calls remain0 until all pages through H and a successful same-validity tail poll complete
  Examples:
    | crash_boundary | durable_state | resume_cursor |
    | after page writes but BEFORE transaction COMMIT | cursor C; no new page observations or effects; R remains1 and S remains0 | C; replay entire uncommitted page |
    | AFTER page transaction COMMIT | cursor C2; page observations durable; R remains1 and S becomes1 | C2; any repeated delivery adds0 effects |
```

## SC-US-006-4

```gherkin
@FR-n7-006 @security
Scenario Outline: SC-US-006-4
  Given wrong sender, foreign mailbox, unrelated References or missing Message-ID Example
  And concrete case <case> is selected
  When reply ingestion runs
  Then only matching own recipient+References produces one semantic stop; all foreign/unrelated cases stop0.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | valid own References and expected sender; no Message-ID | semantic effect1 |
    | valid own References and expected sender; malformed Message-ID | semantic effect1 |
    | wrong sender | 0 stops |
    | reference owned by another mailbox | 0 stops |
    | reference owned by another tenant | 0 stops |
    | unrelated References | 0 stops |
    | same valid reply under new UIDVALIDITY | effect total1 |
```

## SC-US-006-5

```gherkin
@FR-n7-006 @security
Scenario Outline: SC-US-006-5
  Given poll age59.999s,60s or60.001s and incomplete rescan Example
  And concrete case <case> is selected
  When final submitting guard runs
  Then only age<60s with complete poll/rescan authorizes dispatch.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | complete poll age59.999s | allowed |
    | complete poll age60s | blocked |
    | complete poll age60.001s | blocked |
    | incomplete rescan with page progress | blocked |
    | future poll timestamp | blocked |
    | 20pages reached but high-water not covered | blocked |
    | rescan120s exceeded | blocked |
```

## SC-US-007-4

```gherkin
@FR-n7-007 @security
Scenario Outline: SC-US-007-4
  Given valid unsubscribe GET, forged token, wrong-purpose token or unauthenticated complaint Example
  And concrete case <case> is selected
  When public route is requested
  Then GET changes0 rows; bad token denied; unauthenticated complaint401 and0 suppression rows.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | valid token GET | confirmation;0 writes |
    | forged token POST | 400;0 writes |
    | session-purpose token POST | 400;0 writes |
    | unauthenticated complaint POST | 401;0 writes |
```

## SC-US-007-5

```gherkin
@FR-n7-007 @security
Scenario Outline: SC-US-007-5
  Given warmup initial, warmup reply or campaign step message
  And concrete case <case> is selected
  When renderer runs
  Then each includes visible unsubscribe body and both one-click headers.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | warmup initial | body link and both headers |
    | warmup reply | body link and both headers |
    | campaign step | body link and both headers |
```

## SC-US-008-3

```gherkin
@FR-n7-008 @security
Scenario Outline: SC-US-008-3
  Given observation age7days or7days+1ms and mismatched/future window Example
  And concrete case <case> is selected
  When share guard evaluates
  Then exact7days comparable qualifies; stale/future/incomparable share is denied.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | latest age exactly7days, comparable baseline within28days | share allowed |
    | latest age7days+1ms | share blocked |
    | baseline28days+1ms before latest | share blocked |
    | different source or unit | share blocked |
    | unequal window duration | share blocked |
    | overlapping observation windows | share blocked |
    | future latest timestamp | share blocked |
    | denominator29 | counts only |
    | denominator30 | ratio permitted |
```

## SC-US-009-3

```gherkin
@FR-n7-009 @security
Scenario: SC-US-009-3
  Given local provider fixture is configured with team100 minor RUB and valid attribution
  When operator simulates payment success and server fetches fixture canonical state
  Then exactly1 test entitlement and1 attributed test conversion follow verified matching snapshot.
```

## SC-US-009-4

```gherkin
@FR-n7-009 @security
Scenario Outline: SC-US-009-4
  Given redirect-only, wrong amount/currency, duplicate or reordered event Example
  And concrete case <case> is selected
  When billing adapter reconciles independent local provider state
  Then redirect/mismatch grants0, duplicates grant<=1 and stale state cannot resurrect entitlement.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | redirect without canonical success | 0 grants |
    | canonical amount mismatch | 0 grants |
    | canonical currency mismatch | 0 grants |
    | canonical metadata mismatch | 0 grants |
    | duplicate succeeded events | 1 grant total |
    | stale succeeded after canonical canceled/expired | no resurrection |
```
