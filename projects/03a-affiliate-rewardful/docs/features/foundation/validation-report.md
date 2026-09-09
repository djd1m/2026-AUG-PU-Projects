# Requirements Testability Analysis
Spec revision: sha256:b235e4f6ae330459262df674668d5c9b283c660ba9a32f383851fc9398f92a89

Verdict: READY WITH CAVEATS — foundation implementation may proceed.
Date: 2026-09-09. RUN_ID: `20260909T192932Z-foundation`; WORK_UNIT_ID: `foundation-validation`.
Profile: `compact-quality-first-v2`; XL independent consequential plan challenge and requirements validation.
Requested model/effort: `gpt-6-astra` / `xhigh`; actual model/effort and usage: null (execution metadata unavailable).

## Summary

One feature-local story and seven acceptance criteria reviewed. Core score: **96/100**. No blocking floor applies; no confirmed blocker/high plan finding remains. This is readiness for implementation, not evidence that any criterion is implemented or that tests/build passed.

Inputs: all five foundation documents; project `Specification.md` FR-AUTH-001/NFR-SECURITY-001 and growth trace; project `Pseudocode.md` AuthenticateSession and User/Session; project `Architecture.md` security/resource boundaries; corrected `docs/discovery/foundation-donor-audit.md`. The specification bytes match the assigned SHA. Root/project instructions, complexity/security/resource rules and requirements-validator scoring/report contracts were applied.

The accepted boundary is runnable Next workspace, immutable isolated database setup, and internal identity/session primitives. No signup/login/logout/enrollment HTTP route, public provisioning, Membership, financial runtime or N1 modification is included. Owner approval already covers this concrete slice. D7 stays pending; N1, YooKassa and manual transfers on the 5th remain unchanged.

## Results

| Story | Title | Core score | INVEST | SMART | Quality | Status |
|---|---|---|---|---|---|---|
| US-001 | Run and test the isolated foundation before onboarding or finance | 96/100 | 46/50 | 30/30 | 20/20 | READY WITH CAVEATS |

Security adjustment: +5, because authentication, bounded KDF, sensitive-data handling, secret configuration and actual DB-role denial are specific. Growth adjustment: +5 at project traceability level: all four seed IDs FR-GROWTH-001 through FR-GROWTH-004 in `docs/product-discovery-brief.md` survive verbatim in project `docs/Specification.md`. They do not become foundation implementation obligations. These +10 adjustments are reported outside the 100-point core rubric; the unadjusted score already clears readiness.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-foundation-1 | SC-US-001-1: Runnable isolated workspace |
| AC-foundation-2 | SC-US-001-2: Immutable and serialized migrations |
| AC-foundation-3 | SC-US-001-3: Bounded salted password verification |
| AC-foundation-4 | SC-US-001-4: Admission bounds survive contention and failure |
| AC-foundation-5 | SC-US-001-5: Credential failure and state race |
| AC-foundation-6 | SC-US-001-6: Opaque identity session lifecycle |
| AC-foundation-7 | SC-US-001-7: Configuration and least privilege fail closed |

## Acceptance evidence for the blocking floors

The following are actual AC quotations from `01_specification.md`, heading `Acceptance criteria and BDD` and the individual AC headings. They establish Testable and Completeness; the table above establishes Traceability. These are requirements, not observed results.

AC-foundation-1:
> Then GET /api/health returns 200 with `{"status":"alive"}`, contains no secret or database-readiness assertion, and effective compose has no database ports or donor mounts/networks/volumes.

AC-foundation-2:
> Then each file has one matching checksum record and each schema effect exists once;
> And changing or removing an applied file rejects before another migration runs;
> And a deliberately failing unapplied migration leaves neither its schema effects nor journal row, and its corrected unapplied version can subsequently apply.

AC-foundation-3:
> Then distinct salts produce Argon2id encodings, only the correct password verifies, malformed hashes deny, and oversized/nonstring input invokes no KDF.

AC-foundation-4:
> Then the eleventh is rejected without KDF, the timed-out waiter never starts, active count never exceeds two, no slot leaks, and a later valid request succeeds;
> And a simultaneous non-KDF database query completes while all KDF tasks are blocked.

AC-foundation-5:
> Then wrong/disabled/missing cases return the same `invalid_credentials` shape with exactly one real-or-dummy verification for each admitted valid input, and a changed/disabled user gets no session after KDF resumes.

AC-foundation-6:
> Then only its HMAC is stored, the raw token is 43 base64url characters, context contains user/session IDs and expiry only, both revocations are safe, and unknown/revoked/expired/disabled-user sessions deny; no request obtains a program role.

AC-foundation-7:
> Then bad configurations refuse, valid cookies carry all required attributes and no Domain, forbidden SQL is denied, and captured logs contain none of the supplied sensitive sentinel values; offline build alone may succeed without runtime secrets.

Testable=8/8: the quoted assertions can distinguish pass/fail. Completeness=10/10: successful startup/verification/session use, invalid input/configuration, denied credentials/SQL, failing migrations, contention, state races and exact expiry are present across the story. Traceability=10/10: all seven declared AC IDs appear exactly once in `Criterion scenarios`, with names declared by the specification. No uncovered ID.

## INVEST and SMART scoring

| INVEST criterion | Points | Evidence and judgment |
|---|---|---|
| Independent | 8/8 | Isolated fixture users and DB allow delivery before enrollment, N1 or D7; normal dependencies between foundation modules do not require another product slice. |
| Negotiable | 8/8 | Scope and security invariants are fixed; implementation organization and measured native tuning remain reviewable decisions. |
| Valuable | 10/10 | The story states the benefit: establish a runnable, testable foundation before onboarding and financial operations. |
| Estimable | 4/8 | Scope, ownership and donor closure are concrete; native-package/container compatibility and measured KDF overhead remain implementation uncertainty. |
| Small | 8/8 | One coherent prerequisite slice with two domain tables, one public health contract and internal services; no complete onboarding or money module. |
| Testable | 8/8 | Seven actual AC quotations above supply observable assertions. |

| SMART criterion | Points | Evidence and judgment |
|---|---|---|
| Specific | 6/6 | Concrete outputs, permissions, token format, failure shapes and deliberately deferred routes; no unresolved vague success adjective. |
| Measurable | 8/8 | 2 active/8 waiting, eleventh refusal, 5-second queue bound, 8–200 code points/800 bytes, 32-byte tokens and 24-hour expiry. Boolean SQL/rollback/log assertions are also observable. |
| Achievable | 6/6 | Bounded primitives and PostgreSQL transactions/roles support the requested behavior; no unbounded availability or throughput promise. |
| Relevant | 5/5 | Every criterion contributes to the stated isolated-foundation benefit. |
| Time-bound | 5/5 | Five-second admission expiry, strict exact session expiry and finite DB acquisition/lock/statement budgets provide execution timing context. |

## BDD coverage and supplementary security scenarios

The seven named scenarios in `01_specification.md` supply the primary Given/When/Then definitions. `04_refinement.md` supplies cancellation, native rejection, corrupt hash, unavailable DB and transactional failure edges. The following supplementary scenarios make attack and resource-boundary expectations explicit for implementation; they refine existing ACs without adding product scope.

```gherkin
Scenario: auth bypass produces no identity or program authority
  Given no mounted authentication HTTP routes and an enabled fixture identity
  When credentials are wrong or an unknown token is resolved
  Then no identity context or session is issued
  And no caller-supplied role or program scope is accepted
  And direct session INSERT using the application role is denied

Scenario: malformed and injection-shaped inputs remain data
  Given application-role repository connections and the internal Hash32 boundary
  When a non-Hash32 identity or a malformed token is submitted
  Then validation denies before repository SQL
  When a supported password contains SQL or HTML metacharacters
  Then verification treats those characters as password data
  And queries use bound values with no SQL or markup execution
  And captured diagnostics disclose none of the supplied sentinels

Scenario: temporary objects cannot redirect privileged issuance
  Given an untrusted database role and attacker-controlled schema or temporary objects
  When it attempts to call or redirect issue_session_if_current
  Then PUBLIC execution is denied
  And allowed application execution resolves only the intended qualified objects
  And null or stale password snapshots cannot create a session

Scenario: saturated KDF does not occupy the shared database pool
  Given two blocked native tasks and eight queued credential attempts
  When a separate non-KDF query executes and an eleventh attempt arrives
  Then the query completes and the eleventh attempt never invokes KDF
  And checked-out DB clients are not retained by blocked or queued KDF tasks
  When a running caller cancels before native completion
  Then its active slot stays occupied until the underlying task settles

Scenario: committed credential changes defeat a paused successful verifier
  Given successful password verification is paused before session issuance
  When a second connection changes the password hash or disables the user and commits
  And the verifier resumes and reaches the locked state recheck
  Then no session row is committed and no raw token is returned

Scenario: permission restrictions exist as soon as the function is published
  Given migration 001 creates the privileged issuance function
  When that migration commits before subsequent migrations run
  Then PUBLIC cannot execute the function and the app cannot directly insert sessions
```

Cross-tenant security scenario: not applicable to this slice because no tenant/program data or authorization operation exists. Identity context without role/scope must be proved; it is not cross-tenant authorization proof. HTTP brute-force/rate-limit scenario: not applicable because no auth endpoint is mounted. Internal saturation tests above are required; they do not replace the future request-level rate/CSRF/body/proxy contract.

## Consequential plan challenge

**Privilege/race correction is sufficient in the plan.** A SELECT-only app role could not itself take the proposed User row lock: PostgreSQL requires UPDATE privilege for locking SELECT variants. The revision instead places lock, current enabled/password comparison and session INSERT inside the narrowly granted function, while withholding direct INSERT and User writes. This preserves the atomic recheck without broadening the app's table write authority. [PostgreSQL 16 SELECT privileges](https://www.postgresql.org/docs/16/sql-select.html).

**The function is an authority boundary, not a second credential verifier.** The trusted app can read password hashes and call the issuer, so a compromised app DB credential could invoke it with a current snapshot. The scoped requirements promise safe internal service behavior and least privilege, not resistance to compromise of the trusted issuer. Do not describe the function as independently proving that KDF ran. No public caller reaches this boundary in foundation.

**Resource ownership is bounded.** The queue is singleton per process; there are at most two started task closures and eight waiters. Snapshot lookup releases its client before KDF. Post-KDF issuance is a short transaction, with finite pool/lock/statement budgets. Holding a queue slot through that bounded transaction is conservative and does not violate the upper CPU bound. Cancellation cannot release a still-running native task's capacity. The planned independent query and checked-out-client observations are stronger than a sequential queue test.

**Race semantics are coherent.** A credential mutation committed before the locked recheck prevents issuance. A mutation that occurs after issuance takes the normal serial order; later resolution checks enabled state. Password change does not retroactively invalidate all existing sessions under this slice's stated contract. Future password mutation must preserve locking discipline; an implementation test must use separate actual DB connections.

**Migration and donor seams are bounded.** Full-inventory history preflight occurs before new SQL; per-file SQL and checksum share a transaction; advisory serialization has a finite acquisition budget. The corrected audit attributes checksums/baseline to N2, not N1. Removing donor baseline, choosing explicit Argon2id and selecting 24-hour expiry are documented adaptations. No donor runtime connection or account schema is inherited.

## Remaining findings and implementation caveats

| ID | Severity / disposition | Evidence and required handling |
|---|---|---|
| FV-01 | Low; implementation caveat, not a plan blocker | Foundation already requires no PUBLIC execution and hostile-search-path testing. Implement CREATE FUNCTION and PUBLIC revocation in the same migration transaction, without waiting for migration 002. Use only trusted lookup schemas, qualified objects and a safe pg_temp position; check null inputs and byte-identical hash comparison explicitly. |
| FV-02 | Low; evidence pending | The deterministic adapter cannot establish native Argon2 memory/time or target-image compatibility. Preserve real native smoke, encoding/work-factor checks and timing/RSS observations; preserve full actual-role, race and pool-resource tests and mandatory mutations before acceptance. |
| FV-03 | Low; interpretation caveat | `05_completion.md` names umbrella tests for multi-part ACs. Each named executable test must actually execute all material assertions or reference substantive supporting tests; a matching title alone must not earn conformance. |

FV-01 follows PostgreSQL guidance: a SECURITY DEFINER function needs a trusted search path, and creation plus privilege restriction should be atomic to avoid a public execution window. [PostgreSQL 16 safe SECURITY DEFINER functions](https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

No specification repair or new owner approval is required before implementation. The caveats translate existing security and validation requirements into concrete implementation checks. A failure of those checks would block foundation acceptance.

## Verification performed and limits

- Exact specification SHA checked against the assignment: match.
- All seven AC declarations, named scenarios, corresponding algorithms and planned test targets reviewed; table coverage complete.
- Semantic challenge covered privileged SQL, state races, KDF admission/cancellation, DB clients/timeouts, migration failure/history, configuration/logging and scope boundaries.
- Core blocking-floor artifacts are quoted and mapped in this report.
- No implementation, dependency install, runtime/database test, build, mutation or deployment was performed by this validation work unit. Packaged report-format checks are recorded separately by the coordinator or receipt.

Actual model/effort, token counters and cost remain null because authoritative execution/usage metadata is unavailable. Elapsed time is recorded only where timestamps are measured; no inferred token usage, cost or savings is reported. Экономия пока не установлена.
