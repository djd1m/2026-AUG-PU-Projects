# Foundation — specification

Date: 2026-09-09. PLAN artifact; implementation and runtime verification are pending.
PROJECT_ROOT: `projects/03a-affiliate-rewardful`; toolkit: repository-root `.claude/`.
Profile: `compact-quality-first-v2`; lifecycle remains XL: PLAN → VALIDATE → IMPLEMENT → REVIEW.
The owner's «продолжай» approves the concrete implementation plan and independent foundation work; no repeated plan approval is required for this boundary.

## Product brief and boundary

Provide a runnable N3a workspace and independently testable authentication building blocks on an isolated PostgreSQL database. This is a prerequisite slice of project FR-AUTH-001 and NFR-SECURITY-001, not completion of either whole requirement or of onboarding US-013.

Implement: minimal Next application/liveness endpoint, TypeScript workspace, immutable migration mechanism, users/sessions schema, password KDF admission, identity credential verification, opaque session issuance/resolution/revocation and cookie serialization. Authentication service functions are internal modules exercised by tests; **no signup/login/logout/enrollment HTTP routes or public provisioning command in this slice**. Only health is exposed. This keeps request rate limiting, trusted identity enrollment and membership consent in their complete subsequent transaction boundary.

Defer: Membership/Program/grant/partner schema, authorization scope helpers (their trusted input producer does not exist), UI journeys, rate-limit database, worker, referral assets, N1 changes, ledger, payouts, N3a billing and monetary dogfooding. Future auth routes must implement rate-before-validation, bounded body reading, trusted proxy identity, CSRF/Origin and anti-abuse admission before using these primitives. No existing project-wide security scenario is claimed satisfied by an internal-only primitive.

N1 remains the first integration; YooKassa remains its provider; manual transfers remain due on the 5th for the previous calendar month. D7 is pending and untouched. No runtime donor imports, shared database, reused secrets, production deployment or actual payments.

## Functional requirements

### FR-foundation-1
N3a has its own lockfile and runnable web/db workspaces. Explicit commands install, typecheck, test, build, migrate and start. GET `/api/health` returns only process liveness, with no claim about database or monetary readiness. Container configuration isolates N3a and exposes no database host port.

### FR-foundation-2
Migration files are ordered and immutable after application. One runner holds a database advisory lock; each SQL file and its SHA-256 journal entry commit together. Changed or missing applied files and incompatible migration-journal shape fail before applying new files. Fresh apply, repeat and failed-apply recovery are deterministic. No implicit baseline or destructive down migration.

### FR-foundation-3
Password primitives use salted Argon2id, bounded input and generic credential denial. Credential verification selects an enabled user by identity hash, releases the connection before KDF, performs dummy verification for missing/disabled users, and rechecks enabled state plus unchanged password hash under lock immediately before session creation. Inputs cannot select roles or create accounts.

### FR-foundation-4
Sessions contain a user identity only. Generate 32 random bytes as an unpadded base64url token, store its domain-separated HMAC-SHA-256 only, expire after 24 hours without sliding renewal, and reject revoked/expired sessions and disabled users. Revocation is idempotent. Session operations never authorize access to a program.

## Non-functional requirements

### NFR-foundation-1
One process permits at most 2 active KDF operations plus 8 queued operations. Admission is FIFO, rejects the eleventh simultaneous operation before KDF, bounds queue wait to 5 seconds and releases slots on resolution/rejection. Waiting or executing KDF holds no DB client/transaction. A timeout cannot pretend that a still-running native hash has released CPU capacity.

### NFR-foundation-2
Missing/empty/malformed runtime DB URL or session secret fails closed; no built-in credential. Migration and application DB credentials are distinct. The app role cannot DDL, alter users or read migration-owner credentials. Cookie serialization is Secure, HttpOnly, SameSite=Lax, Path=/ with no Domain; tokens/passwords/identity hashes never enter logs. A named offline build may omit runtime secrets without authenticating or emitting cookies.

## Acceptance criteria and BDD

US-001: As an implementer, I can run and test the isolated foundation before introducing onboarding or financial operations. IDs below are feature-local and do not imply completion of project-wide stories.

### AC-foundation-1
Scenario SC-US-001-1: Runnable isolated workspace.
Given a clean checkout, declared Node runtime and an explicit isolated test environment,
When dependency install, typecheck, all foundation tests, build and start complete,
Then GET /api/health returns 200 with `{"status":"alive"}`, contains no secret or database-readiness assertion, and effective compose has no database ports or donor mounts/networks/volumes.

### AC-foundation-2
Scenario SC-US-001-2: Immutable and serialized migrations.
Given a fresh disposable database and two simultaneous migration runners,
When both apply the same ordered migrations and are then rerun,
Then each file has one matching checksum record and each schema effect exists once;
And changing or removing an applied file rejects before another migration runs;
And a deliberately failing unapplied migration leaves neither its schema effects nor journal row, and its corrected unapplied version can subsequently apply.

### AC-foundation-3
Scenario SC-US-001-3: Bounded salted password verification.
Given a valid password of 8–200 Unicode code points and at most 800 UTF-8 bytes,
When it is hashed twice and verified with correct, wrong and malformed-hash inputs,
Then distinct salts produce Argon2id encodings, only the correct password verifies, malformed hashes deny, and oversized/nonstring input invokes no KDF.

### AC-foundation-4
Scenario SC-US-001-4: Admission bounds survive contention and failure.
Given two blocked KDF operations and eight FIFO waiters using a controllable KDF adapter,
When an eleventh operation arrives, one waiter times out, and active operations resolve or throw,
Then the eleventh is rejected without KDF, the timed-out waiter never starts, active count never exceeds two, no slot leaks, and a later valid request succeeds;
And a simultaneous non-KDF database query completes while all KDF tasks are blocked.

### AC-foundation-5
Scenario SC-US-001-5: Credential failure and state race.
Given existing enabled, disabled and missing identity fixtures,
When wrong credentials are checked, or the enabled user is disabled/password-changed while successful KDF is paused,
Then wrong/disabled/missing cases return the same `invalid_credentials` shape with exactly one real-or-dummy verification for each admitted valid input, and a changed/disabled user gets no session after KDF resumes.

### AC-foundation-6
Scenario SC-US-001-6: Opaque identity session lifecycle.
Given an enabled fixture user and an explicit session secret,
When successful credentials create a session, it is resolved, revoked twice, or reaches exact expiry,
Then only its HMAC is stored, the raw token is 43 base64url characters, context contains user/session IDs and expiry only, both revocations are safe, and unknown/revoked/expired/disabled-user sessions deny; no request obtains a program role.

### AC-foundation-7
Scenario SC-US-001-7: Configuration and least privilege fail closed.
Given absent, empty, malformed and valid explicit configurations and the actual application database role,
When runtime auth initializes, cookies serialize, and application credentials attempt forbidden DDL/user writes,
Then bad configurations refuse, valid cookies carry all required attributes and no Domain, forbidden SQL is denied, and captured logs contain none of the supplied sensitive sentinel values; offline build alone may succeed without runtime secrets.

## Measurable success

Seven ACs must gain real executable evidence in IMPLEMENT and independent judgment in REVIEW. Source: our test journal and isolated database assertions. KDF concurrency/queue values are acceptance settings, not measured throughput. Market/growth/financial success is outside this slice.
