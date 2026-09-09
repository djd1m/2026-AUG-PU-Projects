# Identity, program and partner — specification

Date: 2026-09-09. PLAN, not implemented evidence. Source baseline: `6d643a1fe2854a3664f8ce1877039ddcac8f803b`.
PROJECT_ROOT: `projects/03a-affiliate-rewardful`; shared toolkit: repository `.claude/`.
Profile `compact-quality-first-v2`; XL lifecycle PLAN → VALIDATE → IMPLEMENT → REVIEW.
The existing owner approval («продолжай») covers this continuation; D7 remains undecided.

## Product brief and boundary

An independently verified pilot owner can enroll, configure a draft N1 program, invite an operator or partner, and obtain explicitly consented partner membership and personal assets. Existing foundation identity/KDF/session primitives remain the base. This slice adds the missing trusted producers of program authority and their minimal functional HTTP/browser journey.

N1 remains the first integration, YooKassa its provider, and external manual transfers remain due on the 5th for the previous calendar month. No N1 code, connection/bridge, attribution, ledger, tax, payout, business dashboard, public referral redirect or platform-leads/D7 implementation belongs here. A generated partner link/code is an issued asset, not proof of tracking or commission readiness.

Draft enrollment is deliberately supported: owner can configure terms and partners can consent/read their own assets before integration. Every relevant response/page states `program_status=draft`, `integration_status=not_ready`; activation returns `integration_not_ready`. No client readiness boolean or migration fixture makes production activation available.

## Functional requirements

### FR-identity-program-partner-1
An offline pilot bootstrap, executable only with separately held provisioning/migrator authority, creates one tenant/program draft and one expiring owner grant after explicit operator-reviewed identity and N1-owner authority evidence. It creates no User, password or Session. Program.owner_id stays null until owner grant acceptance sets owner and membership atomically. Raw grant is delivered outside N3a; no email service or automatic mailbox verification is claimed. Bootstrap has no HTTP endpoint and is never run on a real identity by this implementation task.

### FR-identity-program-partner-2
Signup requires a valid identity-bound enrollment grant; it creates only an identity account/session and binds the grant. Existing accounts log in and bind the same invitation without duplicate user or password reset. Roles/scopes/program ownership come only from trusted grants. Hash identity using one fixed versioned normalization at bootstrap, issue, signup and login; raw email is never persisted/logged. Recheck grant validity and user state after KDF before committing; duplicate registration cannot replace credentials.

### FR-identity-program-partner-3
Login/logout and identity-only session reads use foundation Argon2id, hash-only 24-hour sessions and generic credential failure. All browser mutations, including login/signup/logout, require exact configured Origin and session- or anonymous-context-bound CSRF proof. Invalid/expired/revoked sessions never authorize enrollment or a program. Logout revokes before clearing the cookie; a DB failure reports unavailable rather than claiming logout succeeded.

### FR-identity-program-partner-4
Every program object is authorized against current server membership. Owner receives fixed scopes `{read,configure,invite,payout,tax,reconcile}` for its program; this slice exposes only read/configure/invite operations. Only an active owner can issue operator/partner grants. Operator grant scopes are an explicit nonempty subset of `{read,payout,tax,reconcile}` and issuer scopes; configure/invite and owner grants cannot be delegated through HTTP. Partner has exactly `{read}` and its own partner ID. Revocation immediately prevents access and replay cannot restore or widen membership.

### FR-identity-program-partner-5
Owner saves a complete immutable policy version using expected latest version, explicit percentage in integer basis points 1–10000, attribution days 30/60/90, conflict rule `explicit_promo_else_last_valid_cookie`, `every_eligible_payment`, `lifetime`, RUB, timezone and readable plain-text terms. No rate, terms, acknowledgement or calendar default is silently submitted. Effective time is server-now or an explicit future UTC instant, never retroactive; future terms cannot be accepted early. Draft timezone may change only before calendar lock; once locked it stays immutable, including paused state. Activation is fail-closed pending real N1 readiness and creates no fake connection.

### FR-identity-program-partner-6
Owner issues an identity-bound expiring partner invitation/placeholder or operator grant, with evidence reference and one-time token. Own enrollment preview is session-only, binds to that identity and displays exact current effective terms for partner consent. Explicit acceptance of those terms atomically activates Partner, inserts read-only Membership, one link and one promo, consumes invitation/grant and records consent and initial eligibility facts. Stale terms conflict without side effects; repeated/concurrent acceptance returns the same owned result only while current authority/access remains valid.

### FR-identity-program-partner-7
Owner can revoke unused grants, revoke operator membership, suspend/reactivate an accepted partner, and revoke an individual asset. Transitions append server-dated eligibility/audit facts and update projections in one transaction; no historical backdating/deletion. Suspension blocks partner portal access and future eligibility without erasing consent/assets; reactivation restores exactly the fixed partner read scope and preserves independently revoked assets. Replay of consumed invitation never reactivates a suspended/revoked membership. History resolves status at a supplied past instant for the future attribution module.

### FR-identity-program-partner-8
Minimal responsive pages allow login, token-based signup/join, readable consent, owner policy/invitation/member management and partner own asset display. Form actions call the real protected API and show text errors/states. Invite token is pasted/submitted in a body, not a URL/query/log. Owner sees a freshly issued token only in the immediate response for manual delivery; subsequent reads do not reveal it. No balances, tracking counts or activation success are simulated.

## Non-functional requirements

### NFR-identity-program-partner-1
Admission is durable and shared across web instances, bounded in storage cardinality and applied before body validation; an additional bounded identity bucket protects credentials after shape parsing. Enforce body/read deadlines and retain foundation KDF limits 2 active/8 queued/5 seconds with no held DB client during hashing. DB/admission outage fails closed, counters survive restart, forged forwarding headers do not select a new rate-limit identity. Numerical limits are acceptance settings in architecture, not measured capacity claims.

### NFR-identity-program-partner-2
The actual `n3a_app` role retains no direct user INSERT/password/enabled mutation or schema authority. New protected tables have no direct application mutation grants: narrow SECURITY DEFINER operations validate session/grant/ownership and commit coupled changes. Fixed search_path, schema-qualified references and PUBLIC EXECUTE revocation publish atomically with each function. Composite ownership constraints and append-only facts remain effective under hostile SQL/search_path and cross-program IDs.

### NFR-identity-program-partner-3
Secrets, identity hashes, raw emails/passwords/grants/sessions and private evidence content never enter logs, URLs, rendered diagnostics or telemetry. Return sanitized errors and audit IDs/reason codes, bound and escape plain text, no-store all private/enrollment responses. UI works by keyboard, labels/focus/text status remain available at widths 320/390/768/1440 without horizontal document overflow. Tests bind exact source SHA and distinguish planning, isolated runtime and external readiness.

## User story and acceptance criteria

US-001: As the pilot owner or invited participant, I can obtain only my explicitly granted access, understand the terms and set up a draft program safely. Feature-local SC IDs below do not replace project-level US IDs.

### AC-identity-program-partner-1
Scenario SC-US-001-1: Trusted bootstrap has no implicit user.
Given an empty disposable pilot database and an offline request containing reviewed identity and N1-owner authority references with hashes,
When bootstrap runs twice with the same request identity and then with conflicting evidence, and the app role attempts the bootstrap SQL,
Then one draft with null owner and one owner grant exist, no user/session exists, same-request retry does not rotate or redisclose a raw token, conflicting request is rejected, and app authority is denied;
And omitted identity/authority evidence creates nothing.

### AC-identity-program-partner-2
Scenario SC-US-001-2: Identity-bound signup survives races.
Given a valid unused grant for an ASCII pilot email and two simultaneous signup attempts using its equivalent normalized spelling,
When both submit valid passwords, or the grant is revoked/expires while KDF is paused,
Then at most one user is created, its password is never overwritten, only a still-valid grant binds, and no membership is created by signup;
And a foreign identity, malformed identity or client owner/scopes payload creates no privilege or second account.

### AC-identity-program-partner-3
Scenario SC-US-001-3: Login, CSRF and logout enforce the current session.
Given enabled, disabled, absent and existing-account invited identities,
When credentials are checked, an existing account binds its grant, missing/foreign/expired CSRF or Origin is submitted, or logout is followed by replay/exact expiry,
Then admitted wrong/disabled/absent credentials share the same failure shape with real-or-dummy KDF, existing password remains unchanged, rejected CSRF causes no business mutation, and revoked/expired session grants no access;
And successful cookies keep all foundation security attributes and logout DB failure preserves an explicit unavailable result.

### AC-identity-program-partner-4
Scenario SC-US-001-4: Authority and delegation are object-specific.
Given the enrolled pilot owner, an operator explicitly granted read only, a partner and a foreign program fixture,
When owner accepts its bound grant, delegates/revokes the operator, and each actor attempts foreign/configure/invite/payout-scope operations or used-grant replay,
Then owner_id and owner membership commit together once, only permitted program operations succeed, uniform denial hides foreign objects, revoked operator remains revoked after replay, and no client-selected role/scope broadens authority;
And an unaccepted grant issued by an owner whose authority was revoked cannot be accepted.

### AC-identity-program-partner-5
Scenario SC-US-001-5: Explicit versioned terms and calendar.
Given an owned draft with no policy, one current policy and a later future policy fixture,
When incomplete/default-looking inputs, two concurrent same-version edits, stale terms, a backdated version or an activation request with forged readiness are submitted,
Then invalid inputs create no version, one concurrent edit wins, current terms remain selected until the future effective time, stale consent conflicts, and activation returns integration_not_ready;
And a locked calendar fixture rejects timezone changes in active and paused states while all earlier versions remain byte-identical.

### AC-identity-program-partner-6
Scenario SC-US-001-6: Consent is an atomic membership boundary.
Given an identity-only user bound to its own partner invitation and an effective policy whose full terms can be read,
When it first attempts asset access, then two clients accept the same displayed policy concurrently,
Then pre-consent access denies, one membership/consent/link/promo set and matching eligibility facts commit, invitation/grant are consumed together, and both successful responses reference identical objects with draft/not-ready labels;
And an injected failure after any coupled write rolls all of them back, with the same invitation still usable.

### AC-identity-program-partner-7
Scenario SC-US-001-7: Existing identity and foreign or stale invitation.
Given one user already belongs to another program and holds an invitation for this program, plus expired, revoked, foreign and stale-policy invitation fixtures,
When the user logs in, previews and accepts its invitation or submits those invalid fixtures,
Then the valid invite adds only its bound program membership without a new user/session role or password reset, existing memberships remain unchanged, invalid invites produce no membership/assets/consent, and returned terms/assets contain no foreign data.

### AC-identity-program-partner-8
Scenario SC-US-001-8: Suspension and historical eligibility survive replay.
Given an accepted partner and link/promo with active facts at T1,
When owner suspends at T2, revokes one asset at T3, reactivates at T4 and the partner retries the consumed invitation between/after transitions,
Then T1 eligibility stays active, T2–T4 partner eligibility/access denies, T4 restores only partner read access, the revoked asset stays revoked, and replay creates no new fact, scope, membership or asset;
And concurrent acceptance/suspension and repeated same-state requests serialize to valid projections without backdated/duplicate history.

### AC-identity-program-partner-9
Scenario SC-US-001-9: Admission is bounded across processes and restart.
Given two application instances share a database and the configured fixed-cardinality admission rows,
When concurrent same-source/identity failures exceed limits, attacker varies arbitrary keys/forwarding headers, one instance restarts, and unrelated admitted identities perform work,
Then one shared limit applies before business validation, row count never exceeds its declared bound, restart does not reset windows, forged headers do not bypass limits, and allowed requests still complete within the finite queue/DB budgets;
And DB outage, slow/oversized body and the eleventh KDF task fail without user/session/grant/membership writes or held KDF database leases.

### AC-identity-program-partner-10
Scenario SC-US-001-10: SQL privileges and safe output are enforced.
Given actual app/migrator roles, hostile search_path, cross-program IDs, script-like terms and sensitive sentinel values,
When direct table writes, PUBLIC function execution, unauthorized function calls, private reads and error paths are exercised,
Then unauthorized SQL fails, constrained functions cannot create foreign authority or rewrite immutable policy/history, terms render as text, private results are no-store, and no sentinel secret/identity appears in logs or URLs.

### AC-identity-program-partner-11
Scenario SC-US-001-11: Browser onboarding is functional and honest.
Given only disposable owner/partner fixtures and the built N3a application over a browser-valid secure origin,
When owner enrolls/configures/invites and partner signs up/reads/accepts/copies assets using keyboard at 320/390/768/1440 widths,
Then actions persist through reload, controls reflect server roles, labels/focus/errors remain usable without document overflow, displayed terms hash/version matches consent, and the draft visibly remains inactive with no invented balance or tracking result.

## Traceability and success

Project sources: FR-AUTH-001, FR-PROGRAM-001/002, FR-PARTNER-001, NFR-SECURITY-001 and NFR-INTEGRITY-001; project SC-US-013-1..6, SC-US-001-1..3, SC-US-002-1..3, SC-US-006-4 and historical SC-US-003-4. This slice supplies identity/membership/policy/history prerequisites; N1 activation, historical attribution and monetary outcomes remain future tests.

Success: all 11 local ACs receive executable evidence and independent review. Source: our isolated DB/browser/test records. Actual pilot identity verification/delivery, live activation, D7 and financial outcomes are not inferred from fixtures.
