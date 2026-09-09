# Requirements Testability Analysis
Spec revision: sha256:cd341f862dfb710a859fe42600cd4856f939d20f0a4646d5415a0e2b887175a8
Verdict: READY
RUN_ID: 20260909T135340Z-f3-access-8b71
WORK_UNIT_ID: access-validate-1
Reviewed commit: cb52e24
Reviewer family: codex

## Scope and evidence
Read-only requirements validation of projects/03-affiliate-rewardful/docs/features/f3-access-onboarding/01_specification.md, 02_pseudocode.md, 03_architecture.md, 04_refinement.md and 05_completion.md, plus approved docs/plans/f3-access-and-provider-setup.md and donor/N3 source. Used root .claude/skills/requirements-validator/SKILL.md and references/feature-report-contracts.md and scoring-system.md. Specification bytes were hashed directly. No implementation tests or actual external acceptance are claimed. No source edits, deployment, secret inspection or additional agents.

## Summary
One aggregate story US-001, four named feature scenario groups, twelve acceptance criteria. READY for IMPLEMENT: the specified outcomes have observable success/refusal boundaries and feasible isolated test mechanisms. No confirmed requirement blocker. This verdict is permission to implement the frozen behavior, not a claim it already works.

## Results
| Story | Title | Base score | Security bonus | INVEST | SMART | Status |
|-------|-------|------------|----------------|--------|-------|--------|
| US-001 | Enter and recover N3 accounts while preserving business authority | 94/100 | +5 (99 adjusted) | 46/50 | 28/30 | READY |

Rubric judgement, not a measured security probability: Independent8 (feature can ship without another new feature), Negotiable8 (implementation has room within explicit safety constraints), Valuable10 (entry/recovery), Estimable4 (bounded code scope but live credentials/consent timing unavailable), Small8 (bounded single-feature increment using donors), Testable8. SMART Specific4 (UI wording such as clear/understandable is partly qualitative), Measurable8 (explicit outcomes and canonical numeric caps), Achievable6, Relevant5, Time-bound5 (24h/1h/10min/8s/60s specified). Quality Traceability10 and Completeness10 based on the table and quoted AC below. Security+5 for explicit authority/input/secret/tenant/provider constraints. Growth+0: this access increment adds no acquisition obligations; accepted referral feature remains regression scope. No blocking-floor value is zero.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-f3-access-onboarding-11 | SC-ACCESS-11 — Recipient chooses activation password; attacker preregistration and simultaneous activation cannot acquire or duplicate account |
| AC-f3-access-onboarding-12 | SC-ACCESS-12 — Legacy recovery preserves identity and atomically revokes cookie, agent and referral access |
| AC-f3-access-onboarding-13 | SC-ACCESS-13 — Purpose, version, expiry, replacement and scanner/replay proof matrix |
| AC-f3-access-onboarding-14 | SC-ACCESS-14 — Uniform recovery output with durable quotas and unrelated SQL progress during mail stall |
| AC-f3-access-onboarding-21 | SC-ACCESS-21 — Four-host PKCE callback binding and one-use claim under hostile or repeated callback |
| AC-f3-access-onboarding-22 | SC-ACCESS-22 — Stable external identity with all-account email collision refusal and concurrent first login |
| AC-f3-access-onboarding-23 | SC-ACCESS-23 — Independent fresh password/OAuth linking, stale proof refusal and safe unlink |
| AC-f3-access-onboarding-24 | SC-ACCESS-24 — Session-and-email contact proof; sticky enforced security-only access across outage/restart |
| AC-f3-access-onboarding-31 | SC-ACCESS-31 — A–D desktop/mobile keyboard flows, transient fragments and late-response cleanup |
| AC-f3-access-onboarding-32 | SC-ACCESS-32 — Operator follows source-dated guides and implemented routes without false adapter/live claims |
| AC-f3-access-onboarding-41 | SC-ACCESS-41 — Authority races, injection/tenant/brute-force probes and mutation/regression gates |
| AC-f3-access-onboarding-42 | SC-ACCESS-42 — Additive rollout preserves records, isolation and revocation-compatible rollback |

## BDD scenario detail
SC-ACCESS-11: Given attacker submits a victim email/name, When victim activates using a password chosen only in the explicit completion POST, Then attacker knows no working password and no earlier session exists. Given two completions or registration racing Yandex/account creation, When transactions finish, Then exactly one account/organization is created or losing completion refuses; pending token never mutates an occupied account. GET is read-only. Unconfigured sender refuses registration uniformly.

SC-ACCESS-12: Given an old password account with memberships and issued cookie/agent/referral credentials, When valid reset commits, Then IDs/memberships remain, email becomes verified, version increments, and all three former credentials refuse subsequent requests including cached result retrieval. Given reset versus password change/login contention, Then only current-version proof can issue or mutate. Given stale reset, Then no partial revoke/password change occurs.

SC-ACCESS-13: Given live tokens for register/reset/contact, When each is presented to wrong endpoint, wrong session/account/email/version or after replacement/expiry/use, Then no mutation occurs. Given a lock held across expiry, When completion acquires it, Then final actual-time check refuses. Given same-token concurrent explicit POSTs, Then at most one succeeds. Given GET email scanner or fragment navigation, Then no token consumption occurs. Assert request target/log/referrer/storage contain no email token.

SC-ACCESS-14: Given known, unknown and ineligible passwordless email addresses, When mail request occurs, Then response content/status is identical and does not claim delivery. Given disabled config, Then all addresses get uniform unavailable before lookup/issuance. Given failed configured provider, Then generic accepted/uncertainty remains. Given admitted quota boundaries5/hour email,30/hour peer,5/hour pair and60s cross-purpose cooldown, When concurrent requests exceed them, Then durable committed counters/cooldown refuse excess. Given stalled send, Then unrelated SQL completes without waiting on send; eight-second deadline/cap4/64KiB/no-redirect bounds are tested independently.

SC-ACCESS-21: Given each approved HTTPS origin and matching browser cookie, When start/callback executes against isolated provider, Then authorization uses S256 and exchange carries original verifier plus saved exact redirect URI. Given wrong cookie/state/Host, other origin, expired flow, malformed/no-email profile, denial or duplicate callback, Then no login session issues and valid attempts are atomically consumed. Given concurrent callback copies, Then only one reaches provider IO. Deadline applies across both provider responses and their bodies, not independently to each fetch. Host forwarding stays fixed-target proxy transport; saved allowlisted origin alone supplies redirects.

SC-ACCESS-22: Given known provider/externalID, When provider email changes to another valid value, Then same account is used. Given a new externalID with email occupied by password OR passwordless account, Then no identity is linked and no session created. Given parallel first logins for the same new identity, Then one account/org/membership/identity exists without orphan loser rows. Given different identities sharing email, Then uniqueness/collision refusal prevents merge. Provider token is absent from stored rows/browser responses/logs.

SC-ACCESS-23: Given verified password account and independent valid Yandex proof, When explicit link completes, Then identity is attached only to saved account/version/session. Given current-password failure, already-foreign identity, expired/revoked source session or changed account version while provider waits, Then link refuses. Given passwordless last identity, Then unlink refuses; after verified-contact reset creates password, fresh-password unlink succeeds, bumps version and revokes credentials. Repeat same-account link is idempotent; concurrent login/link/unlink is checked for deadlock-free consistent lock ordering and current proofs.

SC-ACCESS-24: Given unverified SSO account, When anonymous recovery is requested, Then no reset token is issued. Given both its current authenticated session and matching contact token, When explicit confirmation succeeds, Then only its contact becomes verified, with no merge/password/session issuance. Given another session or stale version, Then confirmation refuses. Given persisted enforcement=true, When mail is disabled or backend restarts with config=false, Then business cookie/agent/referral access remains denied for unverified account while me/logout/contact/reset remain accessible. Given enforcement=false and existing F2 account, Then existing login still works without fabricating verified state. Test internal provisioning cannot be selected through HTTP registration.

SC-ACCESS-31: Given each A–D page at1440/390 widths, When user completes registration/activation/login/forgot/reset/contact/link/unlink using keyboard, Then labels/status/action flow is usable and horizontal overflow is absent. Given token fragment, Then script promptly removes it into transient memory without consuming until POST. Given logout/context replacement during delayed response, Then password/token/agent/referral secrets stay cleared and no old workspace reappears. Unverified policy routes render security UI before any business request. Missing/failed providers render distinguishable setup/uncertainty states.

SC-ACCESS-32: Given documentation index and each of five guides, When operator follows routes/config/schema against current code, Then names, origins, supported events and test/live distinction agree. Given CloudPayments or payout guide, Then it explicitly avoids claiming an implemented N3 adapter/automatic payout. Given absent external credentials, Then isolated tests are not presented as delivered email or actual Yandex consent evidence. Validate links and dates; this is documentation consistency, not external approval-time proof.

SC-ACCESS-41: Given SQL/HTML/command metacharacters in all public string fields, When requests reach boundaries, Then SQL stays parameterized, HTML remains text/escaped, and no command is invoked. Given another membership ID/contact token or agent/referral key, Then no cross-account/tenant data or authority leaks. Given parallel invalid/valid auth inputs, Then body/input/KDF/provider limits constrain work. Given intentional mutations of reuse/expiry/purpose/version/no-autolink/state/PKCE/enforcement, Then corresponding guards fail, restored candidate passes full backend and required browser/protocol suites. DB lock barriers explicitly test expiry and proof changes during waits; no timing-only race assumption.

SC-ACCESS-42: Given populated prior database, When migration and sequential backend/A–D rollout execute, Then records/memberships/referral semantics remain, database has no host port and only authorized internal networks/secrets exist. Given new nullable-password/enforcement states, When rollback is considered, Then only access-compatible code or stopped-ingress forward-fix is allowed. Persisted policy/version/revocations are not downgraded. Test separate provider stubs on isolated environment and report actual public smoke independently.

## Trust-boundary challenge outcome
The frozen plan addresses the donor hazards recorded in /tmp/n3-access-donor-challenge.md. No email auto-link for ANY state, no pre-registration password authority, verified-contact-only SSO recovery, no mail-token auto-session, and all credential families bound to account version are explicit and consistent across specification/pseudocode/architecture. The old donor SQL-held KDF and cookie-only state consumption are not copied. Four saved exact origins plus unchanged forwarded Host equality are compatible with the fixed backend proxy destination. Shared8s provider profile deadline fits within existing frontend12s timeout when local work is bounded; do not accidentally implement8s separately per leg. Sticky policy and security-only sessions preserve recovery without granting business authority. Test-only identity.register is explicitly outside production HTTP. Approved rollback does not restore pre-access code after new states.

## Implementation review focus, nonblocking
- Account/key/identity locking descriptions require one concrete lock order at implementation; serialize provider key before competing account/identity transitions and repeat after-wait checks. Include login/link/unlink races, no orphan account on conflict, and callback consumption before IO.
- Guard every authority path, including authenticateAgent and cached MCP/A2A/referral results; UI policy status is not authority.
- Existing frontend rewrites Host and existing UI immediately loads business data; both are known required edits, not evidence that the plan is already implemented.
- Provider .json() parsing requires bounded streamed bytes within the same deadline; fetch timeout alone is insufficient if body stalls.
- UI clarity remains a partly qualitative criterion. Concrete labels, keyboard flow, error distinctions and browser assertions above provide reviewable acceptance; no fabricated usability percentage is required.
- Current full backend baseline stated as118 is contextual, not a permanently fixed test count; retain all actual baseline tests plus additions. Live external acceptance remains NOTPERFORMED until credentials/consent exist, as explicitly accepted in the plan.

## Acceptance criteria quoted for scoring
Source:01_specification.md, exact headings and Given/When/Then text:

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

## Canonical refinements accepted before implementation
The coordinator identified two concrete clarifications after initial review. Apply both to02_pseudocode.md while keeping the validated specification unchanged: (1) email_flows has a global10000 live-row cap, with expired/used-row cleanup, in addition to the one-row/email/purpose key; durable limiter bounds alone do not bound24h pending-flow accumulation. This implements AC14/41 bounded resource intent. (2) Existing-identity OAuth login must re-read that identity binding after locking the account, so a concurrent unlink cannot authorize via a stale pre-lock lookup. This implements AC22/23/41 current-authority intent. These are required implementation refinements within existing AC, not a new product decision or a finding that blocks the unchanged specification. Include the cap and unlink/login race in acceptance tests.

## Evidence limits and handoff
Requirements-only gate. No test, build, deployment or actual email/Yandex success was executed by this work unit. Frozen specification must be rehashed if edited and this validation repeated for changed requirements. Terminal receipt written as regular non-symlink file via atomic rename. Requested role/model Astra high per parent dispatch; actual-model and usage metadata beyond the agent context are not independently available here, so token/cost measurements are null rather than estimated.
Status: completed
