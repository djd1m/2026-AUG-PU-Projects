# Pseudocode — f3-access-onboarding

## Data Structures

Append accessMigration after identity/referral migrations. accounts.password_hash becomes nullable; add email_verified_at timestamptz nullable. user_sessions add authenticated_at timestamptz (historical created proof unknown/null). email_flows: email text, purpose register/reset/contact, token_hash unique text, account_id nullable UUID FK, version nullable int, name nullable text, issued_at/expires_at/used_at timestamptz; PRIMARY KEY(email,purpose). At most one row per email/purpose; random32byte token stored SHA256 only. access_limits: key text PK, count int, expires_at and next_at timestamptz; hashed keys, max10000 rows after expired cleanup. oauth_flows: state_hash text PK, browser_hash text, verifier text (short-lived private PKCE secret), origin text, intent login/link, account_id nullable UUID, version nullable int, session_hash nullable text, expires_at/created_at timestamptz; max10000 live rows. Consume by DELETE RETURNING. sso_identities: provider text='yandex', external_id text, account_id UUID FK, created_at; PK(provider,external_id), UNIQUE(account_id,provider). access_policy singleton id=1, verification_required boolean DEFAULT false; persisted true is never automatically reset by config.

## Core Algorithms

### Algorithm: Email issuance and bounded delivery

REQUIREMENT: `AC-f3-access-onboarding-11`
REQUIREMENT: `AC-f3-access-onboarding-14`

REALISES: SC-US-001-1
INPUT: purpose, exact approved origin, validated email/name, socket peer; contact additionally current session.
OUTPUT: generic `{accepted:true,message}` or uniform MAIL_UNCONFIGURED/503 (HTTP masks 5xx to UNAVAILABLE).
STEPS: Require configured sender before account lookup. Shared request admission records all syntactically valid requests: email max5/hour, peer max30/hour, pair max5/hour, email cooldown60seconds across purposes; atomic short SQL admission, bounded10000 rows, fail-fast contention. For registration nonexistent account only: issue pending token, name bounded100chars, TTL24h. Existing account registration response stays generic. Reset token TTL1h only for existing password account OR SSO account with verified contact. Contact token TTL24h requires authenticated SSO-only account, binds current email/account/version. Lock account before flow row when account exists, replace prior flow hash and expiry. Commit then send bounded escaped text/HTML link `<origin>/account#access=<purpose>&token=<opaque>`. No provider IO inside SQL; failures preserve generic response, never claim delivery. GET never consumes. New issuance invalidates old token. Pending register flow cannot set an existing account password.
COMPLEXITY: constant indexed rows plus capped expired cleanup.

### Algorithm: Complete email proof and revoke

REQUIREMENT: `AC-f3-access-onboarding-12`
REQUIREMENT: `AC-f3-access-onboarding-13`

REALISES: SC-US-001-1
INPUT: purpose token, new password for register/reset; current session for contact.
OUTPUT: completed with ordinary login required for register/reset; contact verified without new session.
STEPS: Validate token shape/purpose; lookup candidate without lock, never trust it as final authority. Admit bounded KDF outside SQL. Transaction uses account FOR UPDATE before flow FOR UPDATE; re-read every purpose/email/account/version/unused/expiry after locks. Registration serializes normalized email, requires still absent account, atomically consumes token and creates account/password/verified email + one realState tenant/membership; unique email resolves races by refusing. Reset sets Argon2 hash, verifies email, increments version, marks old sessions/agent/referral credentials revoked, consumes token in SAME commit. Old cached agent results still authorize current version before return. Contact resolves current session after account lock, matches account/email/version, consumes token and verifies contact; no password or session issued. Before commit repeat actual now() expiry/session checks; rollback on any stale proof. No pending token creates session by itself.
COMPLEXITY: constant indexed account/flow plus bounded credential updates.

### Algorithm: OAuth start and code resolution

REQUIREMENT: `AC-f3-access-onboarding-21`
REQUIREMENT: `AC-f3-access-onboarding-22`

REALISES: SC-US-001-2
INPUT: POST exact Origin `{intent:'login'|'link',currentPassword?}`, browser-binding cookie; callback GET code/state.
OUTPUT: start URL and browser cookie, then same-origin /account redirect plus host-only session only on valid login.
STEPS: Require enabled Yandex and one of four exact HTTPS N3 origins. Create32byte state, browser random32bytes, PKCE verifier32bytes/challengeSHA256base64url; store state/browser hashes and10minute flow, cap10000 rows/expiry cleanup and durable admission. Start links validate fresh password outsideSQL then store current verified account/version/session proof. Callback uses saved origin, exact comparison with HTTP Host forwarded unchanged by frontend (never derive destination from Host); cookie hash and state must match. Atomically consume flow before provider IO, callback denial also consumes valid attempt. Exchange code+client credentials+verifier+exact saved redirect_uri; fetch profile; both within ONE8second deadline/concurrency4, bounded64KiB bodies and no redirects. Require external ID/email. Transaction locks provider external identity key, existing account then identity; recheck original flow expiry after IO. Existing externalID resolves sameaccount independent of provider email. New identity with occupied email refuses regardless of password presence. Otherwise atomically create nullable-password/unverified-contact account, one empty tenant/membership and external identity. Unique keys and serial transaction prevent duplicate accounts. Provider token never persists. New login issues version-bound session with authenticated_at, no API token disclosure.
COMPLEXITY: indexed identity/account lookups plus bounded provider IO.

### Algorithm: Link unlink and enforcement

REQUIREMENT: `AC-f3-access-onboarding-23`
REQUIREMENT: `AC-f3-access-onboarding-24`

REALISES: SC-US-001-2
INPUT: verified current account/session and independent current-password proof for link/unlink; contact email proof for SSO-only.
OUTPUT: explicit linked/unlinked/verified or refusal.
STEPS: Link completion takes current account lock then resolves original saved session/current version and verification; fresh original session and flow checked after waits. Existing external identity bound elsewhere never moves; sameaccount idempotent, one provider/account. Unlink verifies current password outsideSQL, then locks/revalidates current account/version/session and requires non-null valid password, deletes identity, increments version and revokes all old credentials atomically; requires subsequent normal login. SSO-only must verify contact with BOTH session and email token, then set password through reset before unlink. Provider email never automatically proves local email. At startup optional verificationRequired=true persists irreversible policy bit after explicit configured-mail readiness; false config cannot downgrade stored true. All business identity.resolveUser/resolveAgent and referral connector authorization enforce verified email before accessing or replaying results; security me/logout/reset/contact routes remain usable. Mail outage cannot disable policy.
COMPLEXITY: indexed current proofs and bounded revoke updates.

### Algorithm: Shared UX and provider operations

REQUIREMENT: `AC-f3-access-onboarding-31`
REQUIREMENT: `AC-f3-access-onboarding-32`

REALISES: SC-US-001-3
INPUT: shared account UI, provider status and immutable API contract.
OUTPUT: accessible actual states and five operational guides.
STEPS: GET access-status returns mailConfigured/yandexConfigured/verificationRequired (no secrets). Public forms separate email+name registration from password login; fragment token consumed into transient memory then removed via replaceState, only explicit form POST completes. Unverified enforcement uses security surface without business requests. Keep abort/context guard and reset passwords/tokens on completion/logout/replacement. Yandex start URL navigates top-level browser. Link/unlink security forms require password proof, contact verification requires current session. Display unavailable config distinctly from provider temporary delivery uncertainty. Guides cite official docs/date, adapt project01 configuration to secret JSON N3, four exact callbacks, only implemented routes and delivery/verification distinctions. CloudPayments remains docs-only.
COMPLEXITY: bounded DOM/requests and no browser credential persistence.

### Algorithm: Regression and deployment

REQUIREMENT: `AC-f3-access-onboarding-41`
REQUIREMENT: `AC-f3-access-onboarding-42`

REALISES: SC-US-001-4
INPUT: frozen source candidate and existing referral deployment.
OUTPUT: source-bound gate evidence, rollout or explicit unmet condition.
STEPS: Full backend regression with explicit in-test SQL races, provider contract/failure tests, UI A–D desktop/mobile including scanner/replay and logout late responses, public CJM/account/protocol smoke, targeted mutations for purpose/reuse/expiry/revoke/no-autolink/state/PKCE/enforcement. Test providers isolated only, never public token retrieval routes. Additive migration preserves IDs and nullable hash supported. Existing F2 accounts remain login-capable until operator explicitly enables enforcement; new registration requires configured mail. Public smoke provisions dedicated disposable test account through internal backend/container only when external mail unavailable, never exposes a production HTTP bypass. Production config secret `.runtime/access.json` enabled providers only if valid; no copied secrets. DB internal no published port all environments; check ports before up. Backend then A–D sequentially, enforcement after actual mail-readiness. After new states, use compatible image/forward-fix, never old F2/F3 code that can bypass enforced access or connector refund rules.
COMPLEXITY: bounded test work, no per-request provisioning daemon.

## API Contracts

All added writes POST require exact Origin, JSON and bounded body. GET `/api/account/access-status` → `{mailConfigured,yandexConfigured,verificationRequired}`. POST `/api/account/register` `{email,name}`; `/forgot` `{email}`; `/activate` `{token,password}`; `/reset` `{token,password}`; `/contact-email` `{}` current session; `/verify-contact` `{token}` current session. Register/forgot generic `{accepted:true,message}`; activate/reset `{completed:true,loginRequired:true}` without Set-Cookie. Existing login/me/logout/password routes retained; me adds emailVerified/verificationRequired/hasPassword/yandexLinked. POST `/api/account/yandex/start` `{intent,currentPassword?}` returns `{url}` with `n3_oauth` HttpOnly Secure SameSite=Lax host-only cookie600s. GET `/api/account/yandex/callback?code&state` only accepts saved exact origin/browser proof, redirects savedorigin/account after success, clears OAuth cookie. POST `/api/account/yandex/unlink` `{currentPassword}` clears all credentials incl cookie. Error responses standard `{error:{code,message}}`,5xx masked; safe UI errors can use fixed fragment code without provider detail.

## Internal integration contract

Provider worker owns ONLY `shared/identity/providers/{resend,yandex,http}.mjs` and `tests/access-providers.test.mjs`. Exports `createResend({config,fetchImpl=fetch})` with `.configured` boolean and `.send({to,subject,text,html})`; config `{enabled,apiKey,from}`. `createYandex({config,fetchImpl=fetch})` with `.configured`, `.authorizationUrl({state,verifier,redirectUri})`, `.profile({code,verifier,redirectUri}) -> {externalId,email}`; config `{enabled,clientId,clientSecret}`. Production endpoints fixed, injected fetch for isolated tests ONLY, no configurable provider URL. `.profile` entire exchange+userinfo shared8s deadline, max4 active, eachbody64KiB; `.send`8s/max4/64KiB. Invalid enabled config throws sanitized error; disabled explicit no fallback; credentials never returned. PKCE uses SHA256(verifier) base64url and S256. SDK dependency unnecessary as donor uses fetch. Worker validates provider official docs, no database logic.

Coordinator owns access schema/service/config, identity account lifecycle exports, HTTP adapters, root application integration, compose/test harness and telemetry. UI worker owns shared/ui/account/* after terminal earlier workers, plus own tests; docs worker owns ONLY five new provider guides. Config file `N3_ACCESS_CONFIG_FILE` JSON `{mail:{enabled,apiKey,from},yandex:{enabled,clientId,clientSecret},verificationRequired:false}` (secret values absent in examples). Default both disabled; startup validates enabled configs before drop privilege. Full role map fixed as filenames in this folder.

## Scenario Coverage

Scenarios in01_specification.md:4 · claimed by an algorithm:4.
Not claimed by any algorithm: none.
Claimed by an algorithm but absent from specification: none.

## Error Handling Strategy

Generic known/unknown email responses and bounded paths; no assertion of delivery. Current trust proof before every state change and after waits. No literal provider response text in errors, no session from mail URL, no email identity merge. Contact proof/recovery retained during enforced business lockout.
