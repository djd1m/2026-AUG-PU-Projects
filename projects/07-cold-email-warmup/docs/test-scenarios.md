# Test scenarios — planned BDD acceptance

These are requirements, not execution receipts. Additional correction scenarios: [security-scenarios](tests/security-scenarios.md). Total catalog:54 named scenarios, including explicit case tables.

## SC-US-001-1

```gherkin
@FR-n7-001 @happy-path
Scenario: SC-US-001-1
  Given два tenant
  When A запрашивает mailbox B
  Then 404 без данных B.
```

## SC-US-001-2

```gherkin
@FR-n7-001 @edge-case
Scenario: SC-US-001-2
  Given revoked session
  When API mutation
  Then 401 и ноль изменений.
```

## SC-US-002-1

```gherkin
@FR-n7-002 @happy-path
Scenario: SC-US-002-1
  Given allowlisted TLS endpoint
  When save connection
  Then secret сохранён только AEAD ciphertext с tenant/mailbox AAD, API возвращает masked metadata.
```

## SC-US-002-2

```gherkin
@FR-n7-002 @edge-case
Scenario: SC-US-002-2
  Given localhost/private IP/credential canary
  When connection attempt
  Then forbidden host заблокирован, secret отсутствует в error/log/response.
```

## SC-US-003-1

```gherkin
@FR-n7-003 @happy-path
Scenario: SC-US-003-1
  Given нет warmup consent или campaign consent
  When dispatcher
  Then transport calls=0 даже при подключённом ящике и active campaign.
```

## SC-US-003-2

```gherkin
@FR-n7-003 @edge-case
Scenario: SC-US-003-2
  Given отзыв согласия
  When queued job проверяется
  Then canceled; a job whose final serialized transition to submitting already committed may still send; it cannot be recalled, even before the socket call. This boundary is shown explicitly.
```

## SC-US-004-1

```gherkin
@FR-n7-004 @happy-path
Scenario: SC-US-004-1
  Given 30 active eligible opted-in mailboxes
  When pool metric
  Then count=30; invited/disconnected/quarantined/revoked excluded.
```

## SC-US-004-2

```gherkin
@FR-n7-004 @edge-case
Scenario: SC-US-004-2
  Given менее 2 разных tenant eligible
  When pair scheduler
  Then waiting и 0 exchange jobs; dashboard/API не перечисляет чужие ящики.
```

## SC-US-005-1

```gherkin
@FR-n7-005 @happy-path
Scenario: SC-US-005-1
  Given 20 concurrent claims and daily remaining quota=3
  When worker reserves
  Then <=3 accepted reservations суммарно warmup+campaign.
```

## SC-US-005-2

```gherkin
@FR-n7-005 @edge-case
Scenario Outline: SC-US-005-2
  Given missing field/header CRLF or unsafe markup
  And concrete case <case> is selected
  When preview/start
  Then validation error и 0 message jobs; plain text + escaped preview.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | missing required field | 400;0 jobs |
    | CRLF Bcc in subject | 400;0 jobs |
    | unsafe markup in template | 400;0 jobs |
```

## SC-US-005-3

```gherkin
@FR-n7-005 @security
Scenario: SC-US-005-3
  Given SMTP ambiguous timeout
  When retry scheduler
  Then unknown_delivery требует reconciliation, automatic resend=0.
```

## SC-US-006-1

```gherkin
@FR-n7-006 @happy-path
Scenario: SC-US-006-1
  Given matched In-Reply-To/References and sender
  When ingestion
  Then enrollment replied, queued steps canceled, next dispatch sends 0.
```

## SC-US-006-2

```gherkin
@FR-n7-006 @edge-case
Scenario: SC-US-006-2
  Given IMAP cursor replay/UIDVALIDITY change
  When ingestion retries
  Then transport observations may repeat under new UIDs, but semantic reply/stop effect is unique per mailbox+enrollment; mailbox stays paused until full bounded rescan and successful tail poll; stale poll blocks sends.
```

## SC-US-007-1

```gherkin
@FR-n7-007 @happy-path
Scenario: SC-US-007-1
  Given any generated letter
  When rendered
  Then visible unsubscribe link + signed opaque List-Unsubscribe and one-click POST.
```

## SC-US-007-2

```gherkin
@FR-n7-007 @edge-case
Scenario: SC-US-007-2
  Given unsubscribe repeated/concurrent with pending job
  When processed
  Then tenant suppression persists idempotently and job cannot dispatch.
```

## SC-US-007-3

```gherkin
@FR-n7-007 @security
Scenario: SC-US-007-3
  Given authenticated complaint record
  When accepted
  Then recipient suppression + sender mailbox quarantine, queued work canceled.
```

## SC-US-008-1

```gherkin
@FR-n7-008 @happy-path
Scenario: SC-US-008-1
  Given no valid observation
  When dashboard
  Then reputation unknown and share-after-improvement disabled.
```

## SC-US-008-2

```gherkin
@FR-n7-008 @edge-case
Scenario: SC-US-008-2
  Given two same-source comparable observations
  When owner records verified improvement with dates/denominator/source evidence
  Then report shows raw values and provenance; no causal warmup claim.
```

## SC-US-009-1

```gherkin
@FR-n7-009 @happy-path
Scenario: SC-US-009-1
  Given duplicate payment callback/request
  When verified provider state
  Then one immutable intent, at most one entitlement grant; redirect alone grants zero.
```

## SC-US-009-2

```gherkin
@FR-n7-009 @edge-case
Scenario: SC-US-009-2
  Given no configured sandbox provider
  When checkout
  Then explicit unavailable state, no fake success and no live provider call.
```

## SC-US-010-1

```gherkin
@FR-GROWTH-001 @growth @happy-path
Scenario: SC-US-010-1
  Given verified comparable improvement
  When explicit share
  Then 1 anonymous report link/copy event; no mailbox email/credentials.
```

## SC-US-010-2

```gherkin
@FR-GROWTH-001 @growth @edge-case
Scenario: SC-US-010-2
  Given unknown/stale/incomparable evidence
  When share
  Then no fabricated improvement report; explicit unavailable reason.
```

## SC-US-010-3

```gherkin
@FR-GROWTH-001 @growth @security
Scenario: SC-US-010-3
  Given another tenant observation
  When forged share id
  Then 404 and no report. ADR-003.
```

## SC-US-011-1

```gherkin
@FR-GROWTH-002 @growth @happy-path
Scenario: SC-US-011-1
  Given valid code/cookie
  When first verified sandbox conversion
  Then one attribution snapshot is recorded before entitlement grant.
```

## SC-US-011-2

```gherkin
@FR-GROWTH-002 @growth @edge-case
Scenario: SC-US-011-2
  Given blocked cookies
  When explicit valid code
  Then attribution works.
```

## SC-US-011-3

```gherkin
@FR-GROWTH-002 @growth @security
Scenario Outline: SC-US-011-3
  Given self-referral/tampered cookie/replayed callback
  And concrete case <case> is selected
  When attribution or payment event is processed
  Then no fraudulent attributed conversion. Explicit code wins only if valid; invalid code errors visibly, never silently falls back. ADR-004.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | self-referral code | 0 attributed conversions |
    | tampered attribution cookie | 0 fraudulent conversions |
    | replayed successful payment event | count unchanged |
```

## SC-US-012-1

```gherkin
@FR-GROWTH-003 @growth @happy-path
Scenario: SC-US-012-1
  Given free entitlement
  When shared report rendered
  Then 1 badge shown.
```

## SC-US-012-2

```gherkin
@FR-GROWTH-003 @growth @edge-case
Scenario: SC-US-012-2
  Given paid entitlement expires
  When next report view
  Then badge returns.
```

## SC-US-012-3

```gherkin
@FR-GROWTH-003 @growth @security
Scenario: SC-US-012-3
  Given client forges paid flag
  When report render
  Then server entitlement keeps badge. Unsubscribe cannot be removed by entitlement.
```

## SC-US-013-1

```gherkin
@FR-GROWTH-004 @growth @happy-path
Scenario: SC-US-013-1
  Given partner creates code
  When 2 unique eligible conversions
  Then counts=2, duplicate provider event adds 0.
```

## SC-US-013-2

```gherkin
@FR-GROWTH-004 @growth @edge-case
Scenario: SC-US-013-2
  Given inactive code
  When entered
  Then explicit rejection.
```

## SC-US-013-3

```gherkin
@FR-GROWTH-004 @growth @security
Scenario Outline: SC-US-013-3
  Given own account/replayed event/cross-tenant access
  And concrete case <case> is selected
  When conversion count queried
  Then fraud adds 0 and foreign details absent.
  And the precise result is <expected>
  Examples:
    | case | expected |
    | own-account referral | 0 eligible conversions |
    | replayed provider event | count unchanged |
    | foreign-tenant dashboard request | 404; no details |
```
