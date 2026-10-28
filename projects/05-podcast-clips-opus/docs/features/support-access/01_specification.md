# Support access — frozen implementation scope

PLAN only, 2026-10-28. Source: `1f0befb75bd193c5282b273a6007f3997733cab5`.
RUN_ID: `20261028-n5-support-implementation`. `/feature` AUTO, SPARC-mini five-role map.
Mechanical ROUTE: L, exit 1 (new migration/public paths); substantive tier: XL
(new staff/recovery authority). Owner continuation authorizes this concrete implementation;
no new spend, accounts, production deployment, provider dispatch or VM expansion.

## Product Brief and limits

N5 users need recovery and a support entry; staff need a small read-only account/job card.
Reuse N1 token flows, N3 guards, N6b DB staff membership, N4 compact forms/cards, N5 reads,
and the official Libredesk widget. Preserve bcrypt, HMAC `__Host-n5_session`, tenant
boundaries, ledger and the existing 30-credit signup grant. No generic admin framework,
custom ticket engine, staff money writes, retry commands, uploads, SSO or webhooks.
The demo proves local application code and transport/API boundaries with synthetic users.
Real mailbox delivery, real Libredesk pilot/capacity/restore/deletion, and RF deployment
are separate acceptance stages. Missing runtime settings must remain visible.

## Stories and acceptance criteria

US-001: As an N5 account holder, I can confirm my current email and recover a password.

### FR-support-access-1
Keep current registration/login behavior and credentials; proof is an added authority.
### AC-support-access-1
SC-US-001-1 — Given an existing or new account, when registration/login/proof/reset run,
then bcrypt cost 10, seven-day HMAC session cookie and original tenant remain compatible;
registration grants exactly 30 trial credits once in credits mode; proof/reset grant none.

### FR-support-access-2
Mail configuration is closed: `N5_MAIL_MODE=disabled|test|smtp`, default disabled.
### AC-support-access-2
SC-US-001-2 — Given absent, malformed, test or SMTP configuration, when issuing mail,
then disabled makes no transport call and UI says mail unavailable; unknown/incomplete
explicit mode fails configuration; test is refused outside isolated test runtime and
captures only synthetic messages; SMTP requires explicit host/port/TLS/auth/from, uses
validated TLS, an 8-second total deadline, at most four active sends and no automatic
retry after uncertain delivery. No implicit Resend/provider/localhost sender fallback.
Network IO runs after DB commit; SMTP acceptance is never labelled mailbox delivery.

### FR-support-access-3
Verification is one-use, explicit and account-bound, including cross-device use.
### AC-support-access-3
SC-US-001-3 — Given a logged-in account requesting proof, when its fragment link is opened
on another device and the user logs in as that SAME account then explicitly confirms POST,
then current email is verified once. Original issuing session must remain active; another
account, logout/revoked/expired issuing or confirming session, changed email, expired,
replayed or superseded token fails. GET never verifies or logs in. Token is 32 random
bytes; only SHA-256 digest stored, TTL 24 hours. No browser-chosen email/account/session.

### FR-support-access-4
Recovery changes a password without silently creating login or proof authority.
### AC-support-access-4
SC-US-001-4 — Given known or unknown email, when forgot is requested, then valid requests
have the same 202 body/status for missing account, cooldown, quota or delivery failure
and disclose delivery uncertainty; response does not await SMTP (bounded after-response send,
no durable delivery promise). Given a valid reset fragment, explicit POST changes
bcrypt password, consumes the one-hour one-use token, revokes ALL N5 sessions and all
outstanding proof/reset tokens atomically; old password and replay fail, new login works.
No auto-login, new account, email-proof upgrade or loss of existing membership/credits.

### FR-support-access-5
Protect admission, parsing, tokens, and shared state under failure/concurrency.
### AC-support-access-5
SC-US-001-5 — Given parallel issuance/consumption and requests with forged origin or huge
body, when handled, then pre-body IP limiter runs first; mutations require exact configured
Origin; JSON is strict and <=4096 bytes; normalized email <=254 and password 8 chars/72
UTF-8 bytes. Persisted admission enforces literal 5/email-purpose/hour, 30/IP/hour,
5/email-IP-purpose/hour, 60-second cooldown with atomic shared locks. Unknown email also
uses admission. Admission/token storage each cap at 10000 rows with bounded pruning;
exactly one current token/account/purpose and one consumer win; expiry is
rechecked with DB wall clock after lock wait. No token/password/cookie/SMTP credential in
logs, analytics, query URLs or referrers; fragment is immediately removed from browser
history and held only in memory. Sensitive responses are private/no-store/no-referrer.

US-002: As an explicitly enrolled support operator, I can inspect a minimal N5 account.

### FR-support-access-6
Separate staff entitlement from all customer and email identities.
### AC-support-access-6
SC-US-002-1 — Given empty or revoked operator membership, ordinary/anonymous/expired/
revoked sessions or forged role/account input, when SSR/API/DB read is attempted, then
all deny with 404. An active session AND active DB `support_operator(account_id)` are
required at each layer/read transaction. Public email allowlists never bootstrap staff.
A process-only privileged command grants only to an existing active verified account and
revokes by immutable account UUID with required
actor/reason and durable audit in the same transaction; no public/browser grant route exists. Current
shared owner DB credentials remain privileged; no SQL/RCE isolation or new RLS is claimed.

### FR-support-access-7
Offer bounded read-only account search and diagnostic cards.
### AC-support-access-7
SC-US-002-2 — Given real staff membership, when searching exact UUID/email or paging
accounts (25/page, stable server cursor), then show account/status/current proof/plan,
credit balance, latest 20 ledger entries, latest 20 payments (ID/status/amount only),
latest 20 videos/jobs (ID/status/failure/stage/times). Exact-email search uses a guarded POST body, never URL/referrer/access-log search text.
SQL DTO projections exclude password,
session/token digests, raw logs, source media/transcript, object keys and payment secrets.
A staff read records actor/target/action/time without sensitive search bodies. Staff UI
has no balance/plan/payment mutation or media download capability; mutation POSTs are denied.

US-003: As a customer or visitor, I can reach support with minimal problem context.

### FR-support-access-8
Use the official Libredesk widget with an explicit identity boundary.
### AC-support-access-8
SC-US-003-1 — Given `N5_SUPPORT_MODE=disabled|test|libredesk` (default disabled), when
opening support, then disabled makes no remote/script/JWT request and explains availability;
test is visibly synthetic and isolated; libredesk requires explicit HTTPS base URL/inbox UUID.
Anonymous/unverified visitors may start only an unlinked conversation; N5 does not send
real email or offer account-history lookup. Identified mode is explicit opt-in and issues
HS256 JWT only after fresh active N5 session plus verified CURRENT email, with server-read
`external_user_id=account.id`, email, neutral first_name, exp <=60 seconds, no `user_id`.
Browser actor/email/role overrides never affect claims; signing secret stays server-side.
Fixture tests distinguish two verified accounts and an email-only legacy contact from an
unverified impostor. Actual vendor history isolation remains a pinned-pilot obligation.

### FR-support-access-9
Attach safe context and make operator deep links require ordinary N5 staff authority.
### AC-support-access-9
SC-US-003-2 — Given an optional video UUID, when support context is requested, then server
checks current account ownership; foreign/nonexistent video both return 404. Include only
account UUID for identified users, video UUID, safe status/failure code and timestamp after
user preview/consent; anonymous drafts omit account identity. No automatic files/transcript,
keys/cookies/prompts/raw logs. Context Link template uses only external_user_id UUID to
`/admin/support/accounts/{id}`; arbitrary query/token/conversation/email never grants access
or bypasses staff checks. No encrypted-bearer login or webhook needed for this scope.

### FR-support-access-10
Handle independent N5/helpdesk lifetimes and data retention honestly.
### AC-support-access-10
SC-US-003-3 — Given logout, observed account switch, reset, revoke or account erasure, when
N5 revalidates support authority, then it stops issuing identified JWT/context; the browser
calls `Libredesk.logout()`, removes widget state and never reuses the previous account JWT.
Open widget rechecks N5 on visibility/focus and before identification. N5 reset/erasure
invalidate tokens immediately; erasure removes local email proof and support mapping.
Vendor session is independent (documented default idle 10 hours); neither JWT expiry nor
browser logout proves remote-session revocation. Deployment checklist must explicitly test
that limitation, account mapping and helpdesk deletion/attachments/indexes/backups; no claim
of global vendor revoke or GDPR/PDn erasure from local fixtures. Until real retention/contact
policy is set, pilot uses synthetic data only; default sends no real data to helpdesk.

US-004: As a mobile user or reviewer, I can understand and demonstrate each support state.

### FR-support-access-11
Small Russian UI and reproducible local demo without a new service engine.
### AC-support-access-11
SC-US-004-1 — Given 360px and desktop screens, when using support, email confirmation,
forgot/reset and staff cards, then labelled forms, keyboard/focus/error/pending/success
states and disabled/test/unavailable messages are visible without horizontal overflow.
Links exist from login, dashboard and failed-video view; verified status and current
support contact display only real configured values. Local E2E covers two customers and
one separately enrolled operator, explicit POST, wrong account, reset/logout, staff denial,
safe context and widget unavailable/fixture response. Required existing tests/lint/build,
real-PostgreSQL concurrency/security tests, relevant red/green guards, responsive and
source-bound lifecycle gates pass before local delivery is called complete.

## Acceptance exclusions and delivery

Do now: application code/migration, adapter wiring, bounded local SMTP TLS boundary tests,
official API-shaped widget fixture tests, browser demo, docs and independent review.
Do later with configured runtime: real send/receive, real widget conversation/reply/history,
remote revocation/retention/deletion, co-resident RU VM capacity and backup/restore, deploy.
Do not label later items passed, simulate grants in production, pull large images, expose
DB ports or let SSD available space fall below 2 GiB. Root owns final integration/checks.
