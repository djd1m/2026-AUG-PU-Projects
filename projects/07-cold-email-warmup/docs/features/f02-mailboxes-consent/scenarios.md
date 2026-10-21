# f02-mailboxes-consent — derived contract scenarios

These newly authored Given/When/Then scenarios derive only the unchanged legacy clauses. They are a test plan, not executable tests or runtime PASS. The entire quoted paragraph remains normative; Examples instantiate it and never remove other assertions. Existing canonical/security BDD remain inherited. Use literal executable witnesses and their limits from `05_completion.md`; each composite gate still needs its source-bound runtime/review evidence.

## SC-f02-mailboxes-consent-001

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-001`, legacy `AC-F02-1`. Exact acceptance paragraph:

> AC-F02-1: authenticated tenant can save/list/read/update own SMTP465/587 requiredTLS
> and IMAP993 TLS settings; API returns masked metadata only. Save sends0 messages,
> records configured/unverified or clearly labelled test state, never realverified.
> Foreign IDs404; no/forged/revokedsession401; badOrigin403 and0changes.

```gherkin
@AC-f02-mailboxes-consent-001 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-001
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the authenticated tenant saves, updates, lists or reads the mailbox settings for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: authenticated tenant can save/list/read/update own SMTP465/587 requiredTLS and IMAP993 TLS settings
  And the unchanged contract assertion holds: API returns masked metadata only.
  And the unchanged contract assertion holds: Save sends0 messages, records configured/unverified or clearly labelled test state, never realverified.
  And the unchanged contract assertion holds: Foreign IDs404
  And the unchanged contract assertion holds: no/forged/revokedsession401
  And the unchanged contract assertion holds: badOrigin403 and0changes.
  Examples:
    | case | expected |
    | valid own save update list read | 465or587SMTP and993IMAP mandatoryTLS; masked persistent state and0messages; configured-unverified or TESTlabel only; foreign404/session401/Origin403zerochanges |
    | foreign ID | 465or587SMTP and993IMAP mandatoryTLS; masked persistent state and0messages; configured-unverified or TESTlabel only; foreign404/session401/Origin403zerochanges |
    | forged session | 465or587SMTP and993IMAP mandatoryTLS; masked persistent state and0messages; configured-unverified or TESTlabel only; foreign404/session401/Origin403zerochanges |
    | wrongOrigin | 465or587SMTP and993IMAP mandatoryTLS; masked persistent state and0messages; configured-unverified or TESTlabel only; foreign404/session401/Origin403zerochanges |
```

## SC-f02-mailboxes-consent-002

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-002`, legacy `AC-F02-2`. Exact acceptance paragraph:

> AC-F02-2: AES256GCM freshnonce with external versioned credential key and AAD
> (tenant,mailbox,keyversion); DB/API/logs contain0 plaintext credentials. Tamper,
> wrongtenant/wrongmailboxAAD/unknownversion fail before transport; typed scrubbed
> provider failure contains0canary. Session and credential keys are distinct.

```gherkin
@AC-f02-mailboxes-consent-002 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-002
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the credential store encrypts a save or decrypts a transport credential and scrubs the adapter error for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: AES256GCM freshnonce with external versioned credential key and AAD (tenant,mailbox,keyversion)
  And the unchanged contract assertion holds: DB/API/logs contain0 plaintext credentials.
  And the unchanged contract assertion holds: Tamper, wrongtenant/wrongmailboxAAD/unknownversion fail before transport
  And the unchanged contract assertion holds: typed scrubbed provider failure contains0canary.
  And the unchanged contract assertion holds: Session and credential keys are distinct.
  Examples:
    | case | expected |
    | repeated encrypted save | freshAES256GCMnonce; distinct runtime session/credential keys; only ciphertext; failed AEAD0transport and0canary; provider error typed and scrubbed |
    | altered bit or tenant-mailboxAAD | freshAES256GCMnonce; distinct runtime session/credential keys; only ciphertext; failed AEAD0transport and0canary; provider error typed and scrubbed |
    | unknown key | freshAES256GCMnonce; distinct runtime session/credential keys; only ciphertext; failed AEAD0transport and0canary; provider error typed and scrubbed |
    | secret-bearing provider error | freshAES256GCMnonce; distinct runtime session/credential keys; only ciphertext; failed AEAD0transport and0canary; provider error typed and scrubbed |
```

## SC-f02-mailboxes-consent-003

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-003`, legacy `AC-F02-3`. Exact acceptance paragraph:

> AC-F02-3: operator-allowlisted normalized hostname only; public-IP resolution,
> reject loopback/private/linklocal/metadata/reserved/IPv4mapped forms and mixed
> unsafeDNS; TLS peername preserved and selectedIP pinned in connector contract.
> Revalidate at each connection, not only save. SMTPconnect<=10s,total<=30s and
> IMAP<=30s. Local test adapter is explicitly test, no arbitrary network bypass.

```gherkin
@AC-f02-mailboxes-consent-003 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-003
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the connector resolves the allowlisted endpoint again, validates every address, pins the selected IP and performs bounded TLS I/O for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: operator-allowlisted normalized hostname only
  And the unchanged contract assertion holds: public-IP resolution, reject loopback/private/linklocal/metadata/reserved/IPv4mapped forms and mixed unsafeDNS
  And the unchanged contract assertion holds: TLS peername preserved and selectedIP pinned in connector contract.
  And the unchanged contract assertion holds: Revalidate at each connection, not only save.
  And the unchanged contract assertion holds: SMTPconnect<=10s,total<=30s and IMAP<=30s.
  And the unchanged contract assertion holds: Local test adapter is explicitly test, no arbitrary network bypass.
  Examples:
    | case | expected |
    | public allowlisted DNS | reject every unsafe form before I/O; normalize allowlisted host; re-resolve each connection, pin public IP preserve peername; connect10s,total30s,IMAP30s; fixture TEST only |
    | localhost or mixed unsafe answer | reject every unsafe form before I/O; normalize allowlisted host; re-resolve each connection, pin public IP preserve peername; connect10s,total30s,IMAP30s; fixture TEST only |
    | IPv4mapped or reserved IPv6 | reject every unsafe form before I/O; normalize allowlisted host; re-resolve each connection, pin public IP preserve peername; connect10s,total30s,IMAP30s; fixture TEST only |
    | TLS timeout | reject every unsafe form before I/O; normalize allowlisted host; re-resolve each connection, pin public IP preserve peername; connect10s,total30s,IMAP30s; fixture TEST only |
```

## SC-f02-mailboxes-consent-004

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-004`, legacy `AC-F02-4`. Exact acceptance paragraph:

> AC-F02-4: separate affirmative versioned pool and campaign consent persisted
> with actor/time/scope/version/revokedat. Registration/save grantneither. Pool
> consent binds disclosure sender/header/testbody. Campaign permission binds its
> current contentversion and recipient-set fingerprint; unknown/foreigncampaign404.
> Pool-only doesnotauthorize campaign, recipient/contentexpansion invalidates only
> campaign consent. Do not invent an unscoped boolean sendEnabled.

```gherkin
@AC-f02-mailboxes-consent-004 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-004
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the owner explicitly grants or revokes one versioned pool/campaign consent or edits its recipient/content snapshot for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: separate affirmative versioned pool and campaign consent persisted with actor/time/scope/version/revokedat.
  And the unchanged contract assertion holds: Registration/save grantneither.
  And the unchanged contract assertion holds: Pool consent binds disclosure sender/header/testbody.
  And the unchanged contract assertion holds: Campaign permission binds its current contentversion and recipient-set fingerprint
  And the unchanged contract assertion holds: unknown/foreigncampaign404.
  And the unchanged contract assertion holds: Pool-only doesnotauthorize campaign, recipient/contentexpansion invalidates only campaign consent.
  And the unchanged contract assertion holds: Do not invent an unscoped boolean sendEnabled.
  Examples:
    | case | expected |
    | registration or save | first two grant neither; persistactor-time-scope-version-revocation; peer disclosure required; only current campaignfingerprint grants; expansion invalidates campaign only; foreign404 |
    | explicit pool-only grant | first two grant neither; persistactor-time-scope-version-revocation; peer disclosure required; only current campaignfingerprint grants; expansion invalidates campaign only; foreign404 |
    | recipient or content expansion | first two grant neither; persistactor-time-scope-version-revocation; peer disclosure required; only current campaignfingerprint grants; expansion invalidates campaign only; foreign404 |
    | foreign campaign | first two grant neither; persistactor-time-scope-version-revocation; peer disclosure required; only current campaignfingerprint grants; expansion invalidates campaign only; foreign404 |
```

## SC-f02-mailboxes-consent-005

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-005`, legacy `AC-F02-5`. Exact acceptance paragraph:

> AC-F02-5: grants/revokes/mailboxstate/limits/campaignversion changes acquire SAME
> transaction advisory lock(7,1) FIRST before eligibility reads/mutations. Revoke
> cancels queued/claimed jobs and pool membership atomically; submitting stays
> in-flight. Minimal canonical campaign/job/member schema needed by these writers
> may be added now; scheduling/SMTPdispatch not part of this slice. Defaults10/day,
> pilotceiling30 and providerlowerlimit applied; no silentlimit escalation.

```gherkin
@AC-f02-mailboxes-consent-005 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-005
  Given two isolated tenants, controlled clock/barriers and explicit local TEST fixtures; real transports and charges disabled
  And the concrete case is <case>
  When the consent/mailbox/limit/campaign writer acquires lock(7,1) FIRST and commits the corresponding stop mutation for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: grants/revokes/mailboxstate/limits/campaignversion changes acquire SAME transaction advisory lock(7,1) FIRST before eligibility reads/mutations.
  And the unchanged contract assertion holds: Revoke cancels queued/claimed jobs and pool membership atomically
  And the unchanged contract assertion holds: submitting stays in-flight.
  And the unchanged contract assertion holds: Minimal canonical campaign/job/member schema needed by these writers may be added now
  And the unchanged contract assertion holds: scheduling/SMTPdispatch not part of this slice.
  And the unchanged contract assertion holds: Defaults10/day, pilotceiling30 and providerlowerlimit applied
  And the unchanged contract assertion holds: no silentlimit escalation.
  Examples:
    | case | expected |
    | revoke before final | FIRSTsame lock7,1 across all writers; queued-claimed canceled and membership withdrawn atomic; submitting staysinflight; default10,minprovider/pilot30; no escalation |
    | already submitting | FIRSTsame lock7,1 across all writers; queued-claimed canceled and membership withdrawn atomic; submitting staysinflight; default10,minprovider/pilot30; no escalation |
    | lowered providerlimit | FIRSTsame lock7,1 across all writers; queued-claimed canceled and membership withdrawn atomic; submitting staysinflight; default10,minprovider/pilot30; no escalation |
    | campaign edit | FIRSTsame lock7,1 across all writers; queued-claimed canceled and membership withdrawn atomic; submitting staysinflight; default10,minprovider/pilot30; no escalation |
```

## SC-f02-mailboxes-consent-006

Source: `01_specification.md` heading `AC-f02-mailboxes-consent-006`, legacy `AC-F02-6`. Exact acceptance paragraph:

> AC-F02-6: focused unit and realPG integration prove above, including ciphertext
> substitution,0transport/canary, two tenants, distinct scopes/version invalidation
> and revocation queue state. F01 auth regression only where server/config/schema
> changes affect it; typecheck/lint/build/securityscan pass. Runtime remains local.

```gherkin
@AC-f02-mailboxes-consent-006 @derived-contract @happy-path @edge-case @error-handling
Scenario Outline: SC-f02-mailboxes-consent-006
  Given an immutable candidate source/build snapshot and the required scoped heavy-test/browser grant
  And the concrete case is <case>
  When the authorized mailbox verification procedure executes focused unit/realPG, affected auth regression, typecheck/lint/build and security gates for <case>
  Then the required outcome is <expected>
  And the unchanged contract assertion holds: focused unit and realPG integration prove above, including ciphertext substitution,0transport/canary, two tenants, distinct scopes/version invalidation and revocation queue state.
  And the unchanged contract assertion holds: F01 auth regression only where server/config/schema changes affect it
  And the unchanged contract assertion holds: typecheck/lint/build/securityscan pass.
  And the unchanged contract assertion holds: Runtime remains local.
  Examples:
    | case | expected |
    | ciphertext substitution and two tenants | unit and realPG verify0transport/canary,separate scopes and stopstate; affected F01 authregression and type/lint/build/security mandatory; failed gate prevents local acceptance |
    | scope invalidation and queued revoke | unit and realPG verify0transport/canary,separate scopes and stopstate; affected F01 authregression and type/lint/build/security mandatory; failed gate prevents local acceptance |
    | failed regression guard | unit and realPG verify0transport/canary,separate scopes and stopstate; affected F01 authregression and type/lint/build/security mandatory; failed gate prevents local acceptance |
```

Operational gate: failed/missing command, missing source binding or absent independent review keeps acceptance pending. A negative gate is a failed acceptance attempt, never a fabricated runtime result.
