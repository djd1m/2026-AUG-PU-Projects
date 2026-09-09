# Requirements Testability Analysis
Spec revision: sha256:f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da

Status: PASS
Stage: VALIDATE (PLAN implementability only)
Run: `20260909T211734Z-identity-program-partner`; work unit: `identity-validation`.
Profile: `compact-quality-first-v2`; risk: XL. Existing owner continuation approval applies.

## Summary

One feature-local story, US-001, has 11 explicit acceptance criteria. The final revised plan is implementable and has no unresolved blocker/high finding from this independent pass. Six evidenced design gaps were corrected by the coordinator during validation; the validator synchronized exact input bytes and did not author plan changes. PASS permits implementation with the serial contract-freeze prerequisite below; it does not establish any runtime AC as met.

All five role documents were read completely, then every coordinator amendment was read as a diff against those documents. Foundation auth/session/KDF/pool/SQL source, the current identity donor audit, global identity/program/partner/security/integrity/calendar requirements, applicable repository/project rules, model-routing policy, telemetry protocol, requirements-validator skill/scoring rubric and feature-report contracts were inspected.

## Results

| Story | Title | Score | INVEST | SMART | Status |
|---|---|---|---|---|---|
| US-001 | Trusted identity, draft program and consented participant access | 92/100 base | 5/6 | 5/5 | PASS |

INVEST: Independent 8/8 (bounded feature on existing foundation; no live N1/financial dependency), Negotiable 8/8 (outcomes fixed, implementation choices remain), Valuable 10/10 (explicit access and readable terms), Estimable 8/8 (routes, entities, limits, ownership and tests named), Small 0/8 (XL work; no evidence it fits one sprint), Testable 8/8. SMART: Specific 6/6, Measurable 8/8, Achievable 6/6, Relevant 5/5, Time-bound 5/5. Quality: Traceability 10/10, Completeness 10/10. These are rubric judgments, not measured quality metrics.

The complete AC quotations from `01_specification.md`, headings AC-identity-program-partner-1 through -11, appear in the table below and support nonzero Testable/Completeness. All include named scenarios with happy, error and edge/concurrency outcomes. This report's `Criterion scenarios` table supports Traceability; none of the three blocking-floor scores is zero. Security bonus +5 and growth-traceability bonus +5 are reported separately from the 100-point base, not presented as a runtime score. Global discovery seeds FR-GROWTH-001..004 survive in global Specification; their implementation is not silently added to this slice.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-identity-program-partner-1 | Scenario SC-US-001-1: Trusted bootstrap has no implicit user. Given an empty disposable pilot database and an offline request containing reviewed identity and N1-owner authority references with hashes, When bootstrap runs twice with the same request identity and then with conflicting evidence, and the app role attempts the bootstrap SQL, Then one draft with null owner and one owner grant exist, no user/session exists, same-request retry does not rotate or redisclose a raw token, conflicting request is rejected, and app authority is denied; And omitted identity/authority evidence creates nothing. |
| AC-identity-program-partner-2 | Scenario SC-US-001-2: Identity-bound signup survives races. Given a valid unused grant for an ASCII pilot email and two simultaneous signup attempts using its equivalent normalized spelling, When both submit valid passwords, or the grant is revoked/expires while KDF is paused, Then at most one user is created, its password is never overwritten, only a still-valid grant binds, and no membership is created by signup; And a foreign identity, malformed identity or client owner/scopes payload creates no privilege or second account. |
| AC-identity-program-partner-3 | Scenario SC-US-001-3: Login, CSRF and logout enforce the current session. Given enabled, disabled, absent and existing-account invited identities, When credentials are checked, an existing account binds its grant, missing/foreign/expired CSRF or Origin is submitted, or logout is followed by replay/exact expiry, Then admitted wrong/disabled/absent credentials share the same failure shape with real-or-dummy KDF, existing password remains unchanged, rejected CSRF causes no business mutation, and revoked/expired session grants no access; And successful cookies keep all foundation security attributes and logout DB failure preserves an explicit unavailable result. |
| AC-identity-program-partner-4 | Scenario SC-US-001-4: Authority and delegation are object-specific. Given the enrolled pilot owner, an operator explicitly granted read only, a partner and a foreign program fixture, When owner accepts its bound grant, delegates/revokes the operator, and each actor attempts foreign/configure/invite/payout-scope operations or used-grant replay, Then owner_id and owner membership commit together once, only permitted program operations succeed, uniform denial hides foreign objects, revoked operator remains revoked after replay, and no client-selected role/scope broadens authority; And an unaccepted grant issued by an owner whose authority was revoked cannot be accepted. |
| AC-identity-program-partner-5 | Scenario SC-US-001-5: Explicit versioned terms and calendar. Given an owned draft with no policy, one current policy and a later future policy fixture, When incomplete/default-looking inputs, two concurrent same-version edits, stale terms, a backdated version or an activation request with forged readiness are submitted, Then invalid inputs create no version, one concurrent edit wins, current terms remain selected until the future effective time, stale consent conflicts, and activation returns integration_not_ready; And a locked calendar fixture rejects timezone changes in active and paused states while all earlier versions remain byte-identical. |
| AC-identity-program-partner-6 | Scenario SC-US-001-6: Consent is an atomic membership boundary. Given an identity-only user bound to its own partner invitation and an effective policy whose full terms can be read, When it first attempts asset access, then two clients accept the same displayed policy concurrently, Then pre-consent access denies, one membership/consent/link/promo set and matching eligibility facts commit, invitation/grant are consumed together, and both successful responses reference identical objects with draft/not-ready labels; And an injected failure after any coupled write rolls all of them back, with the same invitation still usable. |
| AC-identity-program-partner-7 | Scenario SC-US-001-7: Existing identity and foreign or stale invitation. Given one user already belongs to another program and holds an invitation for this program, plus expired, revoked, foreign and stale-policy invitation fixtures, When the user logs in, previews and accepts its invitation or submits those invalid fixtures, Then the valid invite adds only its bound program membership without a new user/session role or password reset, existing memberships remain unchanged, invalid invites produce no membership/assets/consent, and returned terms/assets contain no foreign data. |
| AC-identity-program-partner-8 | Scenario SC-US-001-8: Suspension and historical eligibility survive replay. Given an accepted partner and link/promo with active facts at T1, When owner suspends at T2, revokes one asset at T3, reactivates at T4 and the partner retries the consumed invitation between/after transitions, Then T1 eligibility stays active, T2–T4 partner eligibility/access denies, T4 restores only partner read access, the revoked asset stays revoked, and replay creates no new fact, scope, membership or asset; And concurrent acceptance/suspension and repeated same-state requests serialize to valid projections without backdated/duplicate history. |
| AC-identity-program-partner-9 | Scenario SC-US-001-9: Admission is bounded across processes and restart. Given two application instances share a database and the configured fixed-cardinality admission rows, When concurrent same-source/identity failures exceed limits, attacker varies arbitrary keys/forwarding headers, one instance restarts, and unrelated admitted identities perform work, Then one shared limit applies before business validation, row count never exceeds its declared bound, restart does not reset windows, forged headers do not bypass limits, and allowed requests still complete within the finite queue/DB budgets; And DB outage, slow/oversized body and the eleventh KDF task fail without user/session/grant/membership writes or held KDF database leases. |
| AC-identity-program-partner-10 | Scenario SC-US-001-10: SQL privileges and safe output are enforced. Given actual app/migrator roles, hostile search_path, cross-program IDs, script-like terms and sensitive sentinel values, When direct table writes, PUBLIC function execution, unauthorized function calls, private reads and error paths are exercised, Then unauthorized SQL fails, constrained functions cannot create foreign authority or rewrite immutable policy/history, terms render as text, private results are no-store, and no sentinel secret/identity appears in logs or URLs. |
| AC-identity-program-partner-11 | Scenario SC-US-001-11: Browser onboarding is functional and honest. Given only disposable owner/partner fixtures and the built N3a application over a browser-valid secure origin, When owner enrolls/configures/invites and partner signs up/reads/accepts/copies assets using keyboard at 320/390/768/1440 widths, Then actions persist through reload, controls reflect server roles, labels/focus/errors remain usable without document overflow, displayed terms hash/version matches consent, and the draft visibly remains inactive with no invented balance or tracking result. |

## Confirmed findings and smallest corrections

Each item below was an evidenced gap in the initial or intermediate PLAN snapshot, not a reproduced runtime defect. All are resolved in the final input hashes below.

| ID | Severity | Evidence and consequence | Smallest correction present in final plan |
|---|---|---|---|
| VAL-01 | high | Initial `02_pseudocode.md` AdmitAndProtectRequest step 1 began with a durable DB query. Foundation `packages/db/src/pool.ts` limits leases to 10 with deadlines; the KDF queue starts later. No HTTP cardinality bound preceded pool waiting or lazy initialization. | Process singleton admits at most 16 handlers with zero queue before runtime/DB/body, including CSRF GET; release only after work settles. `03_architecture.md` Data Architecture and `04_refinement.md` adversarial case 8 require seventeenth-request rejection without DB/body activity. |
| VAL-02 | high | Initial bootstrap step 1 opened/refused output before receipt lookup, so the same request with its original existing output path failed instead of returning IDs. Postcommit delivery failure referred to offline revoke/reissue without defining a usable operation. | Receipt lookup precedes exclusive/no-follow mode0600 output creation, with token/output excluded from input hash. Explicit reissue mode names predecessor/program/new request/evidence and reuses the private output protocol; same-request replay never rotates or rediscloses. See bootstrap algorithm and completion operational contract. |
| VAL-03 | high | Initial mutation lock order omitted Session while foundation `AuthRepository.revokeSession` updates only `sessions.revoked_at`. A read/check without a conflicting session lock does not establish the serial outcome required by refinement case 3. | Authorization session FOR SHARE, then sorted involved users and memberships, with fresh locked rechecks; KEY SHARE explicitly insufficient. Existing-session revocation is separate from credential issuance to avoid reversed nesting. Real two-client both-order tests are required. |
| VAL-04 | medium | Initial PolicyVersion omitted timezone while saving a future policy changed mutable Program.timezone; current policy selection alone could not preserve the current terms/calendar pair. | Immutable PolicyVersion.timezone; derive terms and timezone from the same effective version, Program fields are caches until canonical calendar lock. Active/paused lock and future-boundary tests remain explicit. |
| VAL-05 | high | Intermediate reissue used only the pilot advisory lock, whereas HTTP acceptance used program/grant locks; it also did not reject an already replaced predecessor. Ownerless prechecks could race acceptance or allow a second usable replacement. | Receipt replay first, then pilot advisory → program → predecessor lock; require ownerless program and nonrevoked, unconsumed current receipt-chain tip. Revoke/replace atomically, test acceptance in both serial orders and repeated predecessor under a new request. |
| VAL-06 | high | Intermediate fresh-time rule applied to session checks, but policy `now` and history still used pre-wait statement time. A wait crossing scheduled effectiveness could select old consent terms; statement time alone cannot guarantee ordered fact history. | After all prerequisite locks capture one decision_at=clock_timestamp, recheck session/grant/authority/policy/state and use it for consent, facts, audit and now-policy. Explicit future must exceed it; clock rollback before latest fact fails without writes. Refinement case 5 covers wait crossing and rollback. |

## Coupled invariant assessment

- Trusted authority: bootstrap produces no User/Session; grant signup binds identity only. SQL acceptance supplies owner/membership atomically; HTTP cannot mint owner scope. Existing identities retain credentials and unrelated memberships.
- Revocation/replay: program lock serializes issuer/membership/grant mutations. Consumed replay verifies current matching authority; revoked operators and suspended partners cannot resurrect. Accepted memberships survive issuer loss according to their own status, while unconsumed grants and replay still check issuer. Partner reactivation restores only read; independent asset revocation survives.
- SQL tenancy and privilege: the plan requires tenant/program composite ownership constraints across grant, invitation, membership, partner, asset and policy, plus narrow SECURITY DEFINER functions with qualified references and atomic PUBLIC revocation. Foundation app user/session reads and session revoked_at UPDATE remain explicitly inherited; no new protected-table DML is promised. Actual FK/check/function/role behavior requires PostgreSQL tests, not this textual assessment.
- Time/consent/history: one post-lock decision instant, exact effective policy ID/hash, immutable timezone/terms, matching consent and atomically created assets/facts. Same-state transitions and consumed replay add no history; missing historical evidence remains unknown.
- Admission/secrets: HTTP 16/0, durable 8193 fixed rows and KDF 2/8/5s are distinct limits; admission transaction ends before streamed body/KDF. Unknown peer is conservative; forwarding headers cannot choose identity. Stable separate identity/admission keys, domain-separated CSRF binding, exact Origin, current session validation and sanitized/no-store outputs are explicit.
- Scope: draft/not_ready and activation refusal remain mandatory. No N1 runtime imports, live bootstrap, financial processing, production deployment, message delivery, referral redirect or D7 implementation is authorized by this validation.

## Serial implementation prerequisites and verification limits

The architecture service table is a design commitment, not a claim that compiled contracts already exist. Before dependent HTTP/UI writers begin, core and coordinator must freeze and compile `packages/db/src/onboarding-contract.ts`: complete program/policy/member/asset DTOs, discriminated results and errors, pagination/cursor format, evidence input shape, exact method inputs and the snake_case HTTP mapping. Resolve the provisional `getMe/getProgram/listMembers` result details and error-to-status/message mapping there. Redispatch after any contract change. This serial gate is already part of architecture/completion handoff and is not a reason to repeat owner approval.

Runtime review must prove every composite FK and ownership relation using actual roles; check post-lock authority and issuer revocation in both orders; kill the named guard mutations; measure real bounded admission and secure-cookie browser onboarding. Global NFR-PERFORMANCE-001 still supplies the interactive-read p95 ≤500 ms target; no measured latency is claimed here. The discovery source hashes document donor reuse but do not substitute for provenance of the eventual copied code.

Mandatory security scenarios supplement the full AC quotations:

- Auth bypass — Given expired/revoked/foreign session and guessed object IDs, When preview/accept/configure is called, Then no private data or domain write succeeds (AC-3/4/7/10).
- Input injection — Given script-like terms and SQL-shaped values plus a hostile search_path, When values reach SQL/rendering, Then parameters remain data, terms render as text, and no foreign or privileged operation occurs (AC-10).
- Cross-tenant access — Given two programs and distinct partners, When one participant submits foreign IDs, Then uniform denial exposes no foreign terms/assets and creates no relation across the boundary (AC-4/7/10).
- Brute force — Given two instances and arbitrary source/identity keys, When concurrent attempts cross durable limits or 16 HTTP slots, Then a shared finite rejection occurs before protected work and row cardinality remains 8193 (AC-9).

No runtime tests, build, database migrations, containers, browser journey or mutation experiments were executed by this validator. Planned test names in refinement are future evidence, not passing tests. Real identity verification/private delivery and later N1/financial/production gates remain outstanding.

## Document checks

- PASS, exit 0: `node /tmp/n3a-build/projects/03a-affiliate-rewardful/scripts/check-pipeline-completion.mjs /tmp/n3a-identity-validate/projects/03a-affiliate-rewardful --report-revision --criterion-scenarios --traceability`. Pinned project adapter checked report revision and criterion scenarios for both feature contours; traceability: project 36/36, foundation 13/13, identity-program-partner 22/22, zero gaps/inconclusive.
- PASS, exit 0: `node .claude/hooks/check-growth-trace.cjs projects/03a-affiliate-rewardful`; all four global growth seeds traced. This is carry-forward evidence only.
- PASS: independent Python format check found 11 unique declared/table AC IDs, matching SHA header within first 20 lines, regular non-symlink report and documents below 500 lines.
- PASS, exit 0: `git diff --check`. Runtime checks deliberately unexecuted at PLAN validation.

## Input snapshot

Base commit: `fbe919593e9d7de1218047e09d8da97d124d2c34`, plus the following coordinator-owned PLAN bytes. Document prose also identifies the earlier accepted foundation source; neither label substitutes for these exact hashes.

| Input | SHA-256 |
|---|---|
| 01_specification.md | `f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da` |
| 02_pseudocode.md | `85f820c5237e0d56ce15e6fa4578b5049fc0d62d2d5e5662e3dffc042625db61` |
| 03_architecture.md | `c48fda7bcf48300a88a006bbeb1e887ddb3e0b89b179e6a759713e91047f02a4` |
| 04_refinement.md | `cabfbc15caf3c23c8136617bf8fa855254a5d89a7c3188b6079b6ce901e4a64e` |
| 05_completion.md | `880259fe23b9c6d3da84f96f6795216f833efe3d360d4d96e3bcd470cbd5abd6` |
| docs/discovery/identity-donor-audit.md | `54430e50a3b1c837b62837ab770aed816d93a0a19ed9f51e45bdf9514d9cecf4` |
| packages/db/src/auth-repository.ts | `e3d6e39815a00076a7dd4015f6192d83755680c5592d0e0f2d335f4c7e806636` |
| packages/db/src/pool.ts | `b56c60405ebb74cc2d2750aa9934623e417195483fef4ffadbdc58e88b3f3394` |
| packages/db/migrations/001_identity_sessions.sql | `70106a564616aa1df6f2cf5f4df2aef72ef4fffc114d6e9647652c171cef56cc` |
| packages/db/migrations/002_runtime_grants.sql | `7dbded87c61478ddb2ee03dafa5c8d660cdb3dc376579b93e120234fd4a56b6e` |
| apps/web/src/lib/auth/credentials.ts | `8c8bd8d70d722d89bd2a14d09a47c8232bb3721ca4fb3e8177646f9fd0ea670e` |
| apps/web/src/lib/auth/session.ts | `dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262` |
| apps/web/src/lib/auth/kdf-admission.ts | `d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e` |

## Telemetry

Requested model/effort: `gpt-6-astra` / `high`; actual_model, actual_effort, usage and cost: null, because this host supplied no attesting execution or billing metadata. No model switch is claimed from a textual selection. Coordinator prelaunch event began this attempt at 2026-09-09T21:36:05.835966Z; measured receipt completion and elapsed wall time are in the work-unit trace. Active time is null because no independent active/wait interval instrumentation is available. Savings are not established.

Receipt: `docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/identity-validation.md`.
