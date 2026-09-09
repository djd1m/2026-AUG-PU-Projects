# Specification — f3-access-onboarding

Approved plan: ../../plans/f3-access-and-provider-setup.md. /go → /feature AUTO; XL account trust-boundary change (router lower bound L). Existing product/architecture/research reused; no new product discovery or scaffold. User authorized implementation and sequential deployment after accepted referral feature.

## Scope

Reuse project01 email.ts, password-reset.ts, sso.ts and route patterns. Adapt SQL/identity rather than copy project01 accounts/projects/session-secret model. Verification at registration is new. New API registration needs configured mail; existing F2 accounts can still log in while enforcement is off. Internal legacy identity.register remains a test/provisioning primitive, never a production HTTP bypass. No credentials or customer data are copied. Five provider guides only: no new CloudPayments adapter, payout automation or tax engine.

### AC-f3-access-onboarding-11 — Registration after email ownership

Given an unregistered email; When email+name registration is requested and the recipient explicitly submits the activation token with a new password; Then one verified account and one empty organization are created atomically, no preselected attacker password or email-link session is accepted, and retries cannot create duplicates.

### AC-f3-access-onboarding-12 — Existing account recovery and preservation

Given an existing F2 account; When its valid reset token is submitted with a new password; Then preserve its IDs/memberships, verify that email, increment account version and invalidate every old session, agent and referral credential atomically. Existing unverified accounts are never silently marked verified.

### AC-f3-access-onboarding-13 — Purpose-bound one-time email tokens

Given register/reset/contact flows; When a token is replayed, used for another purpose/account/email/version, expires during a lock wait, or is superseded; Then no credential or verification state changes. GET/scanner navigation only renders UI; tokens travel in fragments and are never logged or stored in browser persistence.

### AC-f3-access-onboarding-14 — Bounded honest mail requests

Given any syntactically valid known or unknown email; When requesting mail; Then content/status does not reveal account existence or promise delivery, configured outages remain generic, absent configuration returns uniform unavailable, issuance uses literal durable quotas and cooldown, and external IO holds no SQL connection.

### AC-f3-access-onboarding-21 — Yandex code and browser proof

Given an exact approved HTTPS origin; When Yandex login starts and returns; Then code flow uses PKCE S256, random single-use state and host-only browser cookie bound to origin/intent with ten-minute TTL. Wrong state/cookie/origin, expired/replayed code, denial, absent email or malformed provider response never yields an account session.

### AC-f3-access-onboarding-22 — External identity without email auto-link

Given a provider external ID; When login completes; Then unique(provider,external_id) determines the account, first concurrent login creates one empty organization, repeat login reuses it, and an occupied email never auto-links even for a passwordless account. Provider email remains unverified contact and provider access token is transient server-only.

### AC-f3-access-onboarding-23 — Explicit link and safe unlink

Given an authenticated verified local account; When it freshly proves its password and independently completes Yandex authorization; Then bind only an unbound external identity to that same account/version/session. Unlink requires fresh password proof and preserves a valid password login; an SSO-only account cannot remove its last login method. Revoked/expired sessions or version changes during provider wait refuse the operation.

### AC-f3-access-onboarding-24 — SSO-only email and verification enforcement

Given an SSO-only account; When it verifies its contact using both its current authenticated session and an email token; Then mark that contact verified without auto-login or identity merge; only previously verified SSO contacts permit password recovery. Once operator enables verification policy, all business/session-agent/connector authorization requires verified email even after mail outage or restart; security/recovery UI remains accessible.

### AC-f3-access-onboarding-31 — Shared accessible account UI

Given A–D account pages on desktop and mobile; When registration, activation, forgot/reset, resend/contact confirmation, Yandex login/link/unlink or errors occur; Then clear understandable forms, keyboard navigation, exact status and late-response guards work without leaking token/password/key data. Unconfigured providers are explicit; shared code is reused.

### AC-f3-access-onboarding-32 — Provider setup documentation

Given an operator using the documentation index; When setting up YooKassa, historical Yandex.Kassa/split/payouts, CloudPayments, Resend or Yandex ID; Then five detailed source-dated guides name real N3 config and exact callback routes, test/live and error/rotation steps, distinguish documented CloudPayments from an implemented adapter, and never claim unavailable live acceptance.

### AC-f3-access-onboarding-41 — Security and resource regression

Given concurrent completions, reset/login/link and cross-tenant/agent activity; When bounded providers/DB/KDF fail or contend; Then consistent lock ordering and post-wait proof checks preserve authority; meaningful mutation tests and full backend, A–D UI, account and official protocol regression pass.

### AC-f3-access-onboarding-42 — Compatible deployment and evidence

Given current F3 referral deployment; When additive auth schema and backend/UI are rolled out; Then preserve existing records and referral semantics, keep all DB ports unpublished on backend-only internal networks with random secrets, and report isolated provider E2E separately from actual external acceptance. Once new credential states exist, rollback only to access-compatible code or forward-fix; never downgrade persisted enforcement.

## Scenarios and measurement

US-001: securely enter the existing N3 account and preserve its business authority. SC-US-001-1 covers AC11–14; SC-US-001-2 covers AC21–24; SC-US-001-3 covers AC31–32; SC-US-001-4 covers AC41–42. Explicit Given/When/Then appear in each criterion. Sources: persisted account/token/session rows — наша БД; provider request contracts and UI — ручное измерение: isolated HTTP and Firefox assertions; measured usage — наш журнал from host records. No savings or delivery-time target invented.
