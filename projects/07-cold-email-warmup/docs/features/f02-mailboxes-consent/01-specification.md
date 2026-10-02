# F02 — encrypted mailbox settings and separate consent persistence

Exact inherited scope: Specification FR-n7-002, FR-n7-003 storage/authority and
safety-v1 serialization; Pseudocode identity steps4–6 and consent steps1–2.
Independent design validation closed V01/V02/V04/V05. No new product contract.
Dispatcher execution/races belong F03; this slice must supply the actual shared
transaction helper and durable data used by it, not declare dispatch accepted.

AC-F02-1: authenticated tenant can save/list/read/update own SMTP465/587 requiredTLS
and IMAP993 TLS settings; API returns masked metadata only. Save sends0 messages,
records configured/unverified or clearly labelled test state, never realverified.
Foreign IDs404; no/forged/revokedsession401; badOrigin403 and0changes.
AC-F02-2: AES256GCM freshnonce with external versioned credential key and AAD
(tenant,mailbox,keyversion); DB/API/logs contain0 plaintext credentials. Tamper,
wrongtenant/wrongmailboxAAD/unknownversion fail before transport; typed scrubbed
provider failure contains0canary. Session and credential keys are distinct.
AC-F02-3: operator-allowlisted normalized hostname only; public-IP resolution,
reject loopback/private/linklocal/metadata/reserved/IPv4mapped forms and mixed
unsafeDNS; TLS peername preserved and selectedIP pinned in connector contract.
Revalidate at each connection, not only save. SMTPconnect<=10s,total<=30s and
IMAP<=30s. Local test adapter is explicitly test, no arbitrary network bypass.
AC-F02-4: separate affirmative versioned pool and campaign consent persisted
with actor/time/scope/version/revokedat. Registration/save grantneither. Pool
consent binds disclosure sender/header/testbody. Campaign permission binds its
current contentversion and recipient-set fingerprint; unknown/foreigncampaign404.
Pool-only doesnotauthorize campaign, recipient/contentexpansion invalidates only
campaign consent. Do not invent an unscoped boolean sendEnabled.
AC-F02-5: grants/revokes/mailboxstate/limits/campaignversion changes acquire SAME
transaction advisory lock(7,1) FIRST before eligibility reads/mutations. Revoke
cancels queued/claimed jobs and pool membership atomically; submitting stays
in-flight. Minimal canonical campaign/job/member schema needed by these writers
may be added now; scheduling/SMTPdispatch not part of this slice. Defaults10/day,
pilotceiling30 and providerlowerlimit applied; no silentlimit escalation.
AC-F02-6: focused unit and realPG integration prove above, including ciphertext
substitution,0transport/canary, two tenants, distinct scopes/version invalidation
and revocation queue state. F01 auth regression only where server/config/schema
changes affect it; typecheck/lint/build/securityscan pass. Runtime remains local.

Live provider connection/sending unapproved; local adapter verification must
say test. Do not store fake inbox/reputation observations. Full mailbox UI F06;
API persistence is product behavior, not a mocked backend.
