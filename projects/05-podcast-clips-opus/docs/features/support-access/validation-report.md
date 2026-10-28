# Requirements Testability Analysis
Spec revision: sha256:ef2525b933e75661ae3ee0965741933555b4387da321a7b40547e184f4f41edf

Verdict: READY for the approved local implementation scope. No blocking requirement defects found.
This validates the plan, not implementation, mailbox delivery, a live helpdesk pilot, erasure at the vendor, or deployment.

RUN_ID: `20261028-n5-support-implementation`.
WORK_UNIT_ID: `support-plan-validation`.
Source revision: `01db46886c9e8b29f0f1fa199f136d8a026f6fd1`.
Launch-SHA256: `bb0071872cd0b5b3b81f9efc85e161d6df9bd649725e487f1748b1958f628b03`.
Repository: `/tmp/n5-acquisition-analytics-20261026`.
Feature: `projects/05-podcast-clips-opus/docs/features/support-access/`.

## Summary

Four stories, 11 distinct ACs, 11 named primary BDD scenarios, all ACs traced. No Testable, Completeness or Traceability floor is zero. All six planner hashes match the launch manifest. Source HEAD matches the assigned revision; the existing dirty files are approval/scope/telemetry only and are not implementation evidence.

The frozen documents describe mechanical L and substantive XL because new recovery/staff authority crosses a security boundary. Owner approval of the concrete local scope was supplied by the coordinator. This validator requests no new scope or permissions. Build revision is not applicable: no support implementation exists yet.

## Results

| Story | Scope | INVEST /50 | SMART /30 | Quality /20 | Base /100 | Security bonus | Final /100 | Status |
|-------|-------|------------|-----------|-------------|-----------|----------------|------------|--------|
| US-001 | Email proof, recovery, bounded transport/admission | 46 | 30 | 20 | 96 | +5 | 100 | READY |
| US-002 | Enrolled operator, read-only diagnostics | 42 | 25 | 20 | 87 | +5 | 92 | READY |
| US-003 | Official widget identity/context/lifetime | 42 | 30 | 20 | 92 | +5 | 97 | READY |
| US-004 | Russian mobile UI and local evidence | 42 | 25 | 20 | 87 | +5 | 92 | READY |

Average base score: 90.5/100. Average final score: 95.25/100. Security bonus is applied outside the base rubric and the displayed final score is capped at 100. Growth traceability: not applicable (+0); this feature has no acquisition/adoption objective and the project has no `docs/product-discovery-brief.md`. Absence is not a penalty.

## INVEST analysis

Weights in order are Independent 8, Negotiable 8, Valuable 10, Estimable 8, Small 8, Testable 8.

| Story | Independent | Negotiable | Valuable | Estimable | Small | Testable | Reason for deductions |
|-------|-------------|------------|----------|-----------|-------|----------|-----------------------|
| US-001 | 8 | 8 | 10 | 8 | 4 | 8 | Largest bounded unit spans proof/reset, admission, transport and races; avoid treating it as a trivial form task. |
| US-002 | 0 | 8 | 10 | 8 | 8 | 8 | A new staff grant depends on US-001 current-email verification. Existing verified accounts cannot be assumed. |
| US-003 | 0 | 8 | 10 | 8 | 8 | 8 | Identified mode depends on US-001 proof; disabled/anonymous modes are independently buildable. |
| US-004 | 0 | 8 | 10 | 8 | 8 | 8 | Journey evidence depends on the other three stories. |

Negotiable means layout and implementation choices remain open inside the accepted boundaries; mandatory security invariants are intentionally fixed. Dependencies are explicit sequencing, not blockers. Each story has user value, finite APIs/fields and concrete acceptance text quoted below.

## SMART and quality analysis

| Story | Specific /6 | Measurable /8 | Achievable /6 | Relevant /5 | Time-bound /5 | Traceability /10 | Completeness /10 |
|-------|-------------|---------------|---------------|-------------|---------------|------------------|------------------|
| US-001 | 6 | 8 | 6 | 5 | 5 | 10 | 10 |
| US-002 | 6 | 8 | 6 | 5 | 0 | 10 | 10 |
| US-003 | 6 | 8 | 6 | 5 | 5 | 10 | 10 |
| US-004 | 6 | 8 | 6 | 5 | 0 | 10 | 10 |

AC1–5 specify seven-day sessions, bcrypt cost10, 24h/1h tokens, 8s SMTP, four sends, 4096 bytes, 5/30/5 hourly quotas, 60s cooldown and 10000-row bounds. AC6–7 define exact membership predicates and 25/20-row limits but do not promise a staff latency target. AC8–10 define 60s JWT exchange authority and disclose the separate 10h vendor idle default. AC11 defines 360px/desktop and measurable evidence, with no response-time promise. Missing latency targets for US-002/004 are nonblocking; do not invent an SLA. Completeness scores reflect happy paths, errors and concurrency/edge cases already present in AC text and refinement. Traceability is the following table; no implementation test is claimed.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-support-access-1 | Preserve N5 credentials tenant and one-time signup grant |
| AC-support-access-2 | Enforce closed mail modes and bounded SMTP transport |
| AC-support-access-3 | Confirm current email once across devices under live issuer authority |
| AC-support-access-4 | Reset password without enumeration login proof or credit escalation |
| AC-support-access-5 | Bound request admission and serialize token authority |
| AC-support-access-6 | Require current staff membership at SSR API and DB layers |
| AC-support-access-7 | Return only bounded read-only staff diagnostic DTOs |
| AC-support-access-8 | Identify official widget only after verified explicit opt-in |
| AC-support-access-9 | Preview owned safe context and guard every staff deep link |
| AC-support-access-10 | Clear local widget identity and disclose independent vendor lifetime |
| AC-support-access-11 | Demonstrate Russian mobile recovery support and staff states |

## Acceptance text scored

Verbatim excerpts below are the complete AC bodies from `01_specification.md`, under each named heading. These are the evidence for nonzero Testable and Completeness scores; planned tests or scenario names alone are not that evidence.

### AC-support-access-1 — 01_specification.md

> SC-US-001-1 — Given an existing or new account, when registration/login/proof/reset run,
> then bcrypt cost 10, seven-day HMAC session cookie and original tenant remain compatible;
> registration grants exactly 30 trial credits once in credits mode; proof/reset grant none.

### AC-support-access-2 — 01_specification.md

> SC-US-001-2 — Given absent, malformed, test or SMTP configuration, when issuing mail,
> then disabled makes no transport call and UI says mail unavailable; unknown/incomplete
> explicit mode fails configuration; test is refused outside isolated test runtime and
> captures only synthetic messages; SMTP requires explicit host/port/TLS/auth/from, uses
> validated TLS, an 8-second total deadline, at most four active sends and no automatic
> retry after uncertain delivery. No implicit Resend/provider/localhost sender fallback.
> Network IO runs after DB commit; SMTP acceptance is never labelled mailbox delivery.

### AC-support-access-3 — 01_specification.md

> SC-US-001-3 — Given a logged-in account requesting proof, when its fragment link is opened
> on another device and the user logs in as that SAME account then explicitly confirms POST,
> then current email is verified once. Original issuing session must remain active; another
> account, logout/revoked/expired issuing or confirming session, changed email, expired,
> replayed or superseded token fails. GET never verifies or logs in. Token is 32 random
> bytes; only SHA-256 digest stored, TTL 24 hours. No browser-chosen email/account/session.

### AC-support-access-4 — 01_specification.md

> SC-US-001-4 — Given known or unknown email, when forgot is requested, then valid requests
> have the same 202 body/status for missing account, cooldown, quota or delivery failure
> and disclose delivery uncertainty; response does not await SMTP (bounded after-response send,
> no durable delivery promise). Given a valid reset fragment, explicit POST changes
> bcrypt password, consumes the one-hour one-use token, revokes ALL N5 sessions and all
> outstanding proof/reset tokens atomically; old password and replay fail, new login works.
> No auto-login, new account, email-proof upgrade or loss of existing membership/credits.

### AC-support-access-5 — 01_specification.md

> SC-US-001-5 — Given parallel issuance/consumption and requests with forged origin or huge
> body, when handled, then pre-body IP limiter runs first; mutations require exact configured
> Origin; JSON is strict and <=4096 bytes; normalized email <=254 and password 8 chars/72
> UTF-8 bytes. Persisted admission enforces literal 5/email-purpose/hour, 30/IP/hour,
> 5/email-IP-purpose/hour, 60-second cooldown with atomic shared locks. Unknown email also
> uses admission. Admission/token storage each cap at 10000 rows with bounded pruning;
> exactly one current token/account/purpose and one consumer win; expiry is
> rechecked with DB wall clock after lock wait. No token/password/cookie/SMTP credential in
> logs, analytics, query URLs or referrers; fragment is immediately removed from browser
> history and held only in memory. Sensitive responses are private/no-store/no-referrer.

### AC-support-access-6 — 01_specification.md

> SC-US-002-1 — Given empty or revoked operator membership, ordinary/anonymous/expired/
> revoked sessions or forged role/account input, when SSR/API/DB read is attempted, then
> all deny with 404. An active session AND active DB `support_operator(account_id)` are
> required at each layer/read transaction. Public email allowlists never bootstrap staff.
> A process-only privileged command grants only to an existing active verified account and
> revokes by immutable account UUID with required
> actor/reason and durable audit in the same transaction; no public/browser grant route exists. Current
> shared owner DB credentials remain privileged; no SQL/RCE isolation or new RLS is claimed.

### AC-support-access-7 — 01_specification.md

> SC-US-002-2 — Given real staff membership, when searching exact UUID/email or paging
> accounts (25/page, stable server cursor), then show account/status/current proof/plan,
> credit balance, latest 20 ledger entries, latest 20 payments (ID/status/amount only),
> latest 20 videos/jobs (ID/status/failure/stage/times). Exact-email search uses a guarded POST body, never URL/referrer/access-log search text.
> SQL DTO projections exclude password,
> session/token digests, raw logs, source media/transcript, object keys and payment secrets.
> A staff read records actor/target/action/time without sensitive search bodies. Staff UI
> has no balance/plan/payment mutation or media download capability; mutation POSTs are denied.

### AC-support-access-8 — 01_specification.md

> SC-US-003-1 — Given `N5_SUPPORT_MODE=disabled|test|libredesk` (default disabled), when
> opening support, then disabled makes no remote/script/JWT request and explains availability;
> test is visibly synthetic and isolated; libredesk requires explicit HTTPS base URL/inbox UUID.
> Anonymous/unverified visitors may start only an unlinked conversation; N5 does not send
> real email or offer account-history lookup. Identified mode is explicit opt-in and issues
> HS256 JWT only after fresh active N5 session plus verified CURRENT email, with server-read
> `external_user_id=account.id`, email, neutral first_name, exp <=60 seconds, no `user_id`.
> Browser actor/email/role overrides never affect claims; signing secret stays server-side.
> Fixture tests distinguish two verified accounts and an email-only legacy contact from an
> unverified impostor. Actual vendor history isolation remains a pinned-pilot obligation.

### AC-support-access-9 — 01_specification.md

> SC-US-003-2 — Given an optional video UUID, when support context is requested, then server
> checks current account ownership; foreign/nonexistent video both return 404. Include only
> account UUID for identified users, video UUID, safe status/failure code and timestamp after
> user preview/consent; anonymous drafts omit account identity. No automatic files/transcript,
> keys/cookies/prompts/raw logs. Context Link template uses only external_user_id UUID to
> `/admin/support/accounts/{id}`; arbitrary query/token/conversation/email never grants access
> or bypasses staff checks. No encrypted-bearer login or webhook needed for this scope.

### AC-support-access-10 — 01_specification.md

> SC-US-003-3 — Given logout, observed account switch, reset, revoke or account erasure, when
> N5 revalidates support authority, then it stops issuing identified JWT/context; the browser
> calls `Libredesk.logout()`, removes widget state and never reuses the previous account JWT.
> Open widget rechecks N5 on visibility/focus and before identification. N5 reset/erasure
> invalidate tokens immediately; erasure removes local email proof and support mapping.
> Vendor session is independent (documented default idle 10 hours); neither JWT expiry nor
> browser logout proves remote-session revocation. Deployment checklist must explicitly test
> that limitation, account mapping and helpdesk deletion/attachments/indexes/backups; no claim
> of global vendor revoke or GDPR/PDn erasure from local fixtures. Until real retention/contact
> policy is set, pilot uses synthetic data only; default sends no real data to helpdesk.

### AC-support-access-11 — 01_specification.md

> SC-US-004-1 — Given 360px and desktop screens, when using support, email confirmation,
> forgot/reset and staff cards, then labelled forms, keyboard/focus/error/pending/success
> states and disabled/test/unavailable messages are visible without horizontal overflow.
> Links exist from login, dashboard and failed-video view; verified status and current
> support contact display only real configured values. Local E2E covers two customers and
> one separately enrolled operator, explicit POST, wrong account, reset/logout, staff denial,
> safe context and widget unavailable/fixture response. Required existing tests/lint/build,
> real-PostgreSQL concurrency/security tests, relevant red/green guards, responsive and
> source-bound lifecycle gates pass before local delivery is called complete.

## BDD scenarios

The scenario names are deliberately identical to the Criterion scenarios cells. They are executable test intent for implementation, not recorded PASS results. Synthetic fixtures and isolated PostgreSQL/Redis are required; no provider dispatch is authorized.

```gherkin
Feature: Approved local support access

  Scenario: Preserve N5 credentials tenant and one-time signup grant
    Given existing legacy and credits-mode accounts and a fresh synthetic registration
    When registration, login, email proof and password reset are exercised
    Then bcrypt cost is 10 and the HMAC __Host-n5_session lifetime is seven days
    And the original account and tenant remain the same
    And only the new credits-mode registration receives exactly 30 trial credits once
    And proof, resend, reset and replay produce zero extra grants

  Scenario Outline: Enforce closed mail modes and bounded SMTP transport
    Given an isolated synthetic transport boundary with <configuration>
    When email issuance runs
    Then <outcome>
    And no network operation holds a database transaction
    And SMTP acceptance is never presented as mailbox delivery
    Examples:
      | configuration | outcome |
      | absent or disabled mode | no transport call and unavailable UI |
      | unknown mode or incomplete SMTP settings | explicit configuration failure |
      | test mode outside isolated runtime | configuration refusal |
      | isolated test mode | only synthetic message capture |
      | invalid TLS or missing required STARTTLS | send fails closed |
      | operation exceeding 8000ms including trickle replies | transport closes by total deadline |
      | four active sends and a fifth request | active sends never exceed four |
      | ambiguous final SMTP reply | unknown result and zero automatic retries |

  Scenario Outline: Confirm current email once across devices under live issuer authority
    Given a 32-byte proof fragment issued for account A with a 24-hour digest record
    And the opening browser removes the fragment immediately without persisting it
    When <action>
    Then <outcome>
    And GET never verifies or creates a session
    Examples:
      | action | outcome |
      | another device logs in normally as A, reopens link and explicitly POSTs while issuer remains active | verifies A once |
      | device logged in as B explicitly POSTs | refused without modifying either account |
      | issuer or confirming session is revoked or expired | refused |
      | email changes, purpose differs, or token is expired or superseded | refused |
      | two consumers POST concurrently | exactly one succeeds |
      | token expires while waiting for the account lock | refused after database wall-clock recheck |

  Scenario Outline: Reset password without enumeration login proof or credit escalation
    Given <precondition>
    When a valid forgot request or explicit reset POST is processed
    Then <outcome>
    Examples:
      | precondition | outcome |
      | known email, unknown email, cooldown, persisted quota, or delivery failure | identical 202 body/status without awaiting SMTP |
      | a valid one-hour reset token | password changes atomically with token consumption and all N5 session/token revocation |
      | old password, old session, reset replay, or superseded token | no renewed access |
      | old-hash login races with reset | no old-hash session survives the committed reset |
      | successful reset with prior proof, membership and ledger | no auto-login, proof upgrade, new account or credit change; ordinary new-password login works |

  Scenario Outline: Bound request admission and serialize token authority
    Given concurrent requests using shared IP, email and email-IP-purpose keys
    When <case>
    Then <outcome>
    And inputs, body reads and expensive work occur outside identity transactions
    Examples:
      | case | outcome |
      | oversized streamed body with missing or forged Content-Length | rejected at 4096-byte bound |
      | missing or forged Origin, unknown JSON fields, bad email, or oversized UTF-8 password | rejected before token mutation |
      | many different emails share one IP | literal 30-per-hour aggregate enforced atomically |
      | same email uses many IPs | literal 5-email-purpose-per-hour enforced atomically |
      | same email-IP-purpose with resend bursts | 5-per-hour and 60-second cooldown enforced |
      | unknown email is requested | admission still records and enforces quota |
      | token/admission storage reaches 10000 records | bounded pruning or uniform closed refusal, never cap overrun |
      | Redis or database admission is unavailable | fail closed with no token or mail side effect |
      | purpose token replacement races with consumption | one current token and at most one winning consume |
    And response cache/referrer headers prevent sensitive caching or referrers
    And logs and analytics contain no token, password, cookie or SMTP credential

  Scenario Outline: Require current staff membership at SSR API and DB layers
    Given <authority>
    When SSR, API and a direct support-store read transaction inspect an account
    Then <outcome>
    Examples:
      | authority | outcome |
      | ordinary, anonymous, expired or revoked session | 404 |
      | missing or revoked operator membership | 404 |
      | forged browser actor, role, account or email-allowlist input | 404 |
      | active N5 session and active DB operator membership | guarded read is permitted |
      | membership revoked between outer check and next read transaction | next transaction denies |
    When the privileged process command grants to an active verified existing account
    Then membership and required actor/reason audit commit together
    And grant to unverified or inactive accounts fails without an audit/membership partial write
    And revoke by immutable UUID works without requiring current email proof
    And there is no public grant route and no claim of isolation from owner DB credentials

  Scenario: Return only bounded read-only staff diagnostic DTOs
    Given a separately enrolled active support operator and more than 25 synthetic accounts
    When exact UUID or exact email search and stable server-cursor paging are used
    Then email search is a guarded POST body and never a URL or referrer
    And each page contains at most 25 accounts with stable created_at and id ordering
    And account detail has at most 20 ledger entries, 20 payment summaries and 20 jobs
    And SQL projections exclude password/session/token hashes, raw logs, object keys and payment secrets
    And reads record only actor target action and time
    And attempted balance, plan, payment, retry and media-download mutations are denied

  Scenario Outline: Identify official widget only after verified explicit opt-in
    Given <mode and authority>
    When support is opened and identity is requested
    Then <outcome>
    Examples:
      | mode and authority | outcome |
      | absent or disabled support configuration | no remote script, network or JWT and unavailable UI |
      | test mode outside isolated runtime | refused |
      | configured isolated fixture mode | visibly synthetic API-shaped response |
      | live mode with non-HTTPS base URL or invalid inbox UUID | configuration refusal |
      | anonymous or unverified account with a legacy same-email vendor fixture contact | unlinked conversation only, no real email or history lookup |
      | active verified current-email account A after explicit opt-in | server-built HS256 external_user_id=A, email, neutral first_name, expiry at most 60s |
      | browser overrides email, external identity, user_id, actor or role | overrides never affect claims and user_id is absent |
      | verified A switches to verified B | fresh B claims only after A state is cleared |
    And signing secret never reaches the browser
    And fixture outcomes are not evidence of real vendor contact matching or history isolation

  Scenario Outline: Preview owned safe context and guard every staff deep link
    Given a customer or anonymous visitor preparing support context
    When <action>
    Then <outcome>
    Examples:
      | action | outcome |
      | current account requests its owned video UUID | preview has only allowed IDs, status, safe failure code and timestamp |
      | foreign or nonexistent video UUID is requested | identical 404 |
      | anonymous visitor drafts context | no account identity included |
      | user has not consented after preview | no automatic context attachment |
      | ordinary user follows operator UUID deep link with invented query or token | staff 404 |
      | real operator follows external_user_id UUID link | ordinary SSR API DB guards still apply |
    And no file, transcript, object key, prompt, cookie or raw log is attached

  Scenario Outline: Clear local widget identity and disclose independent vendor lifetime
    Given identified account A has an open fixture widget
    When <event> is observed during focus, visibility, re-identification or logout navigation
    Then identified JWT and context issuance stop unless fresh N5 authority succeeds
    And Libredesk.logout is called and A settings, JWT and local widget state are removed
    And account B cannot reuse A identity
    Examples:
      | event |
      | logout |
      | account switch |
      | password reset |
      | N5 session or staff/account authority revoke |
      | account erasure |
    And N5 reset invalidates local proof/reset tokens immediately
    And erasure removes local proof and any support mapping
    And documentation discloses independent vendor session default idle 10h
    And no local test asserts global remote revoke or vendor attachment/index/backup deletion
    And pilot remains synthetic until real contact and retention policy are configured

  Scenario: Demonstrate Russian mobile recovery support and staff states
    Given 360px and desktop browsers with two customers and one separately enrolled operator
    When login, dashboard and failed-video links reach recovery and support
    Then labelled forms expose keyboard focus, pending, error and success states without horizontal overflow
    And disabled, test, unavailable and real configured-contact states are distinguishable
    And explicit POST, wrong account, reset/logout, staff denial and owned context are demonstrated
    And widget unavailable and fixture responses are exercised
    And required full tests, lint, typecheck, build, PostgreSQL races, mutations, responsive and lifecycle gates have source-bound receipts before local delivery

  @security
  Scenario: Reject authentication bypass and privilege forgery
    Given an anonymous caller or an ordinary customer with forged body roles and actor UUID
    When email-confirm, staff detail or identified-widget authority is requested
    Then no email proof, operator entitlement or identified JWT is granted
    And staff access remains 404 across SSR API and DB store

  @security
  Scenario Outline: Reject SQL XSS and command injection at support boundaries
    Given an untrusted <input> is submitted through a supported field
    When request validation or display runs
    Then parameters remain data and are never SQL fragments, markup or commands
    And invalid UUID, token, cursor and closed-schema fields are refused
    And permitted displayed data is safely escaped with no execution
    Examples:
      | input |
      | SQL quote-and-OR payload in exact search |
      | script markup in email, context or failure text |
      | shell metacharacters in operator reason or identifier |

  @security
  Scenario: Reject cross-account resource and proof access
    Given synthetic customers A and B with distinct sessions and videos
    When B submits A proof token, video UUID, actor UUID or widget claim override
    Then current account authority remains B and A is not disclosed or modified
    And missing and foreign video IDs both return 404
    And only an actually enrolled operator can intentionally inspect an allowed customer DTO

  @security
  Scenario: Bound brute force without revealing email existence
    Given unknown and known synthetic email addresses under parallel attempts
    When pre-body IP limits or persisted 5/30/5 quotas and cooldown are reached
    Then pre-body admission prevents unbounded body and expensive work
    And valid forgot requests denied by persisted email quota or cooldown keep the same 202 body
    And cap and concurrency tests run against real PostgreSQL rather than a sequence-only mock
```

## Critical feasibility and security review

- **Existing auth and credits:** `apps/web/src/server/auth.ts` already uses bcrypt10 and seven-day random-token/HMAC sessions. `auth-handler.ts` enforces `__Host-n5_session`, 4096 streamed bytes and 8-character/72-byte password constraints. `auth-store.ts` grants trial only from successful new credits-mode registration, and `createSession` checks the unchanged password hash under `FOR SHARE`. Reset can serialize through the account lock and preserve that invariant; no auth transplant is needed.
- **Shared resources:** `packages/db/src/index.ts` configures pool max10, 3000ms connection wait and 5000ms statement timeout. Pseudocode excludes bcrypt/network/body reads from identity transactions and requires stable admission-key and account/session/token lock order plus DB-clock expiry after waits. A global cap still needs atomic enforcement in the eventual implementation; the explicit 10000-cap AC and concurrent test already require it. No claim that the code now implements it is made.
- **Erasure:** `apps/web/src/server/erasure.ts` already serializes on the account, changes status and revokes sessions. New proof/token/mapping cleanup is an explicit integration seam. Erasure completion and vendor deletion are different obligations.
- **Staff:** SSR/API plus transaction-local DB predicates are coherent for the current shared owner credential. They guard application access, not malicious SQL/RCE under that credential. The privileged CLI alone grants/revokes, grant requires active verified existing account, and audit commits atomically. No RLS redesign is needed or claimed.
- **Privacy:** exact email search is POST body, diagnostic queries use explicit fields and bounded limits, context checks session-account ownership, and fragments never enter query strings. Actual `routeCategory` in `apps/web/src/lib/acquisition-analytics.ts` is a closed allowlist excluding all proposed support/recovery/admin pages; a wholesale analytics rewrite is not justified.
- **External contracts:** reused pinned research names official Nodemailer SMTP and official Libredesk Live Chat/Context Links. Libredesk stable source pin is `5668a2a2c503b9304404d8f3620131b2990cbb99` (v2.9.0). Existing audited `helpdesk-options.md` explains required JWT claims, forbids positive browser `user_id`, and records first-adoption email-only history joining. Fresh current-email proof plus server-built immutable UUID claims is an appropriate local boundary. Remote matching/isolation remains unverified until the pinned pilot; no new vendor capability is inferred.
- **Defaults and data:** both adapters are disabled by default. No mail/helpdesk/RU runtime/contact settings exist. Test fixtures must be isolated and synthetic. Required TLS and total SMTP deadline are stronger than merely setting one library socket timeout; the transport tests include trickle responses, invalid certificates and a fifth concurrent send.
- **Lifecycle:** the Phase1 completion file explicitly says PLANNED and uses PENDING test paths. This is acceptable plan input and cannot satisfy the Phase3 completion contract. Real source-bound test files/titles, mandatory full checks and independent review remain required before delivery. No implementation or E2E gate is declared passed by this report.

## Nonblocking contract clarification

**C1 — preserve forgot response precedence.** `AC-support-access-4` explicitly requires the same 202 body/status for valid forgot requests refused by cooldown or persisted email/IP/email-IP-purpose quota. `02_pseudocode.md` also has a generic API error summary saying “limiter429”. Treat AC4 as the more specific rule: generic pre-body IP admission may return429 before valid intent exists; once a valid forgot body reaches persisted admission, quota/cooldown/storage-full refusals must be translated to the same202 outcome. Do not expose known-account membership through a quota-dependent response. The BDD above makes the priority explicit. This is a focused implementation/test instruction, not new scope and not a request to change the frozen specification.

The explicit opt-in required by AC8 must be a distinct user action before the `{}` support-session request can select identified mode; an automatic page-open request must remain anonymous. API request shape alone is not proof of opt-in. This is already an AC, and must be checked in the browser evidence.

## Gate accounting and limits

Actual checks in this validation attempt: source HEAD equality; trusted launch SHA equality; all six planner SHA equalities; reading all 11 ACs and algorithms; mapping every AC to a named BDD scenario; targeted source review of auth/store/erasure/pool/analytics; required policy/skill/report-contract review. Report structure is checked separately in the terminal trace.

The coordinator supplied an accepted native Phase1 support-only gate result (22/22 bidirectional keys); this validator does not relabel that as a gate it executed. Root `scripts/check-pipeline-gaps.sh` is the older project-wide wrapper and does not expose the feature report options; this validator does not use it as a substitute for the native packaged report gate. Root must run the actual native report-revision and criterion-scenarios gate after placing this report in the feature evidence location. Full code tests, real PostgreSQL concurrency, transport boundary tests, browser, mutations and responsive checks are not applicable to this read-only plan-validation stage and are not PASS claims.

Fresh independent requirements validation used no author conversation or coding history, no subagents, no installation, no provider dispatch, no secret reads, no project edits, no commit/push and no deploy. Requested model/effort: `gpt-6.1-sol`/`high` per launch. Host-confirmed actual model and usage/cost are unavailable and remain null. Active time and billed token counters are not inferred. The coordinator owns telemetry at `projects/05-podcast-clips-opus/docs/telemetry/p-replicator/20261028-n5-support-implementation/`.

Next authorized step: native report gates followed by bounded implementation against this exact specification. No further owner decision is required for this accepted local scope. Any real provider pilot or deployment remains a separate acceptance stage.
