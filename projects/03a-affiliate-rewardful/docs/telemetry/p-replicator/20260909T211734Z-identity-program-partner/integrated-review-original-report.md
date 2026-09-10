# Identity, program and partner — integrated security review

Reviewer family: codex
Spec revision: sha256:f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da
Review status: changes required; full feature acceptance is not established.
Scope: integrated source review against all five feature documents, validation report, frozen service contract and core execution receipt. No minimum finding quota was imposed.

## Findings

### IR-01 — Medium — eligibility evidence contains a fabricated digest

`packages/db/migrations/004_onboarding_helpers.sql:98` writes the same `{reference:'server:onboarding:v1', sha256:64 zeroes}` into every eligibility fact. This is not a digest of the referenced evidence or a particular server event. `valid_evidence` checks syntax, so the placeholder survives as apparently valid immutable provenance. Issue, consent, suspension/reactivation and asset revocation all call this helper. Their actor/time/status records are real; the evidence digest is fabricated. This violates the declared EvidenceRef semantics and the logical provenance contract. It is not proof of false payment or payout: those modules remain out of scope.

Reproduce on the existing disposable accepted-partner fixture: select evidence from the partner's invited/active facts and its two asset facts. Every SHA equals `repeat('0',64)` irrespective of actor/subject/time. The exact insertion branch was independently read and checked here; a new database recomputation probe was requested from the coordinator and has not been executed by this reviewer.

Smallest correction: define a versioned canonical server-event payload from persisted fields, store a resolvable event/reference ID and compute its actual SHA-256; alternatively attach real referenced event evidence. Test recomputation from stored fields, distinct-event provenance, replay stability and absence of sentinel hashes. No external identity material needs to be exposed.

### IR-02 — Medium — object lookup precedes authentication and exposes existence

`apps/web/src/lib/http/handler.ts:84` accepts any canonical random session-cookie token as a hash for protected reads; it does not resolve that token first. `packages/db/migrations/008_onboarding_reads.sql:25`, `:35` and `:50` then lock the requested program before checking the session. `lock_program` returns enrollment_unavailable for a missing program, while an existing program proceeds to lock_identity and returns unauthorized for the same invalid session. HTTP maps these outcomes to 404 versus 401. Invalid or expired sessions can therefore distinguish an existing program UUID from a nonexistent one and acquire its row lock before authentication. No authenticated access or terms/assets disclosure was found; the defect is the existence oracle and unauthorized lock acquisition.

Concrete reproduction: use one freshly generated canonical 43-character session cookie that has never been issued; request `/api/programs/{known-fixture-id}` and `/api/programs/{random-id}` (also members/partner-assets). The current source yields 401 and 404 respectively. Existing core PostgreSQL tests verify known-program plus random session hash gives unauthorized; the counterpart follows directly from the earlier missing-program branch. A mounted paired-response probe is still requested from the coordinator, not claimed run here.

Smallest correction: reject invalid current sessions before object existence/locking, with a uniform unauthorized result, while retaining the final locked fresh-time check for authorized operations. Protect the SQL-facing public entry points as well as HTTP if direct app-role calls remain part of the security acceptance boundary. Initial validation must not introduce an inverted session/program lock order; a nonlocking preliminary identity check plus the existing locked recheck is one option. Add existing/missing program pairs for absent, random, expired and revoked tokens; use another client to prove invalid sessions do not wait on the target program lock. Valid authenticated foreign-object requests should retain uniform 404.

### IR-03 — Medium — historical precreation state contradicts the frozen algorithm

`packages/db/migrations/007_onboarding_partner.sql:92` returns unknown whenever a selected partner/asset fact is missing. The accepted `TransitionPartnerAndResolveHistory` step 4 explicitly requires instants before invitation/asset creation to be ineligible, reserving unknown for missing expected history. `onboarding-partner.integration.test.ts` currently asserts unknown for the year 2000 on newly created fixtures, so that passing test encodes the wrong oracle. This can route provably precreation activity into future attribution review instead of denying it; no current monetary misallocation is claimed.

Smallest correction: use the authoritative partner/asset creation bounds to return ineligible before existence. Continue returning unknown where facts should already exist but are missing or inconsistent. Add before-partner-creation, after-partner/before-asset-creation and deleted postcreation-fact tests; retain inclusive boundary and historical suspension/revocation checks.

## Earlier findings verified corrected

- HTTP-UI-01: all four sensitive forms now have explicit POST method. Actual-component server-render tests passed, preventing default native GET fallback at the markup boundary. JavaScript-disabled browser submission is part of the coordinator's pending browser run.
- HTTP-UI-02: suspended partners with revoked membership retain the owner reactivation control; the suspended label takes precedence. Actual-component server-render regression passed. A full suspend/reload/reactivate browser journey remains useful integration evidence.
- HTTP-UI-03: shared ProgramState no longer asserts that assets have already been issued. Actual-component rendering confirms neutral draft/integration wording.

## Spec conformance

Verdicts apply to the exact reviewed snapshot and available evidence. A met functional criterion does not mark the whole release gate passed. Core PostgreSQL execution is attributed to the supplied source-matching core receipt; this reviewer independently read the test/source and ran the combined unit suite, but did not start a database namespace. Additional refinement scenarios and named mutations remain mandatory even where an AC's direct functional outcome is met.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-identity-program-partner-1 | met | Bootstrap SQL creates program/grant/receipt without User/Session; offline function ACLs deny app access. Core receipt reports real PostgreSQL no-user/null-owner, same/conflicting receipt, evidence, mode0600, symlink, reissue-chain and both acceptance/reissue orders. Process crash after commit before delivery is an additional refinement gate still not injected. |
| AC-identity-program-partner-2 | met | Core enrollment suite reports concurrent normalized registration with one winner, foreign identity denial and grant revocation/expiry while KDF is paused, with zero held app leases. SQL final checks forbid overwrite and membership creation. Normalization/password unit checks passed locally. |
| AC-identity-program-partner-3 | met | Local HTTP/CSRF/config/session/KDF units pass; core receipt includes real credential current-state checks, logout/mutation SHARE ordering and fresh post-lock expiry. Cookies retain security attributes and logout outage returns explicit 503 without clearing. Mounted secure-cookie browser proof remains part of AC11; IR-02 separately affects unauthorized object lookup. |
| AC-identity-program-partner-4 | met | SQL derives owner/operator/partner authority from current memberships and trusted grants; PUBLIC/internal/bootstrap access is denied. Core tests cover operator configure denial, scope ceiling, revocation replay, owner/member rollback and issuer current state. Both concurrent issuer-revocation orders remain an additional refinement gate, not supplied evidence. |
| AC-identity-program-partner-5 | met | Core policy tests report same-version single winner, current/future terms/timezone pairing, scheduled-boundary stale consent and locked paused calendar denial; guard itself is status-independent. Activation always authorizes then returns integration_not_ready. Local strict policy/rate tests passed. |
| AC-identity-program-partner-6 | met | Core consent suite reports matching concurrent results and rollback at partner, membership, both assets, each fact, grant/invitation consumption and audit boundaries, followed by successful retry. IR-01 is a separate evidence-integrity defect in those committed facts and must be corrected. |
| AC-identity-program-partner-7 | met | Core second-program existing-identity test binds and consents without new user/session, preserving prior membership/assets. Final identity/issuer/grant checks and frozen policy selection deny foreign/unbound/stale/expired/revoked acceptance. UI normal payloads match the frozen service contract. |
| AC-identity-program-partner-8 | not met | Main suspend/replay/reactivate/revoked-asset/history cases pass in supplied core evidence, and UI reactivation rendering is fixed. IR-03 contradicts the mapped historical algorithm before creation. Full acceptance/suspension two-client interleavings and same-time ordering probe remain unexecuted acceptance evidence. |
| AC-identity-program-partner-9 | unverifiable | Local 16-handler/no-queue, streamed body, CSRF, forwarding and KDF bounds pass. Core reports actual fixed8193/global300/source60/identity10 counters. Two repository objects sharing one pool and a new repository do not prove two app processes plus process restart; those probes and integrated overload/deadline behavior remain pending. |
| AC-identity-program-partner-10 | not met | App/PUBLIC ACLs, qualified SECURITY DEFINER references, safe nested DTO decoding, allowlisted errors and local no-store/sentinel checks are supported. IR-02 violates authentication-before-object-lookup; IR-01 violates declared evidence semantics. Real built-DOM escaping/log/URL checks are not yet supplied. |
| AC-identity-program-partner-11 | unverifiable | All 19 Next API mounts now map to the protected runtime. Local actual-component regressions pass and no fabricated balances/activation are present. Root's secure-origin built-app browser run is in progress; no finished source-bound four-width/persistence/consent/copy receipt is available to this reviewer. |

## Integrated boundary assessment

The runtime factory now composes one global promise/pool/password service across route bundles. The process HTTP guard runs before lazy initialization; native dummy initialization is bounded by the existing KDF singleton. Durable admission uses completed queries before reading request bodies or entering credential work. The fixed unknown-source slot is the explicitly accepted pilot tradeoff; forwarding headers cannot create identity. Body cancellation does not await a hostile producer and does not release native KDF capacity early.

All nineteen non-health mounts are force-dynamic Node routes, await Next params and pass the expected action/parameters into createApi. No added bootstrap endpoint, N1 call, financial module, readiness override or referral redirect exists. The hydrated client requests match the frozen snake_case contract. Session and grant tokens have separate domains, identity normalization/HMAC is stable, and no raw session is serialized in normal JSON. Cookie/CSRF current-context rotation, explicit logout failure, safe errors and plain React terms rendering remain intact.

SQL operations use parameterized calls with narrow SECURITY DEFINER interfaces and fixed search_path; helpers are not PUBLIC/app executable. Program/grant/partner/session/user/membership lock ordering, fresh post-lock decision time, immutable consent, role/scope tuple checks, coupled transactions and replay denial were read across migrations003..010. Existing founder schema001/002 remains unchanged. Composite constraints bind partner/asset/policy/grant/membership relations to their program. App has no new protected-table DML/read grants. No arbitrary role escalation, client-selected actor authority or cross-program data-return path was found beyond the existence oracle in IR-02.

`lock_identity` currently locks every member/user in a program, including revoked memberships, and program reads take the program UPDATE lock. Work is O(program membership), not O(page size), despite paginated output. This is a scaling/measurement limitation, not a measured outage or quota finding. No new speculative limit is prescribed. The project interactive-read p95 target has not been measured on a declared-size dataset; gather that evidence before making capacity claims or deciding whether to narrow locks.

## Executed and supplied evidence

- Independently executed `npm test -- --reporter=dot`: exit0, 45/45 tests in13 files, start 2026-09-10 08:50:05 UTC, measured duration9.39s. This configuration excludes PostgreSQL/workspace integration.
- Independently executed `npm run typecheck`: exit0.
- Independently executed manifest/route/form/SQL-branch check: exit0; all128 declared inputs match, nineteen non-health mounts are dynamic Node handlers, four explicit POST forms verified, exact IR-01/IR-03 branches confirmed.
- Independently executed `git diff --check`: exit0. No runtime/test source was edited by this reviewer.
- Supplied `identity-core-resume.md`: source-matching core delivery and final isolated harness reports unit30/30 and PostgreSQL+workspace37/37 on its earlier core contour, plus build/infra/migration checks. Its own limitations explicitly exclude full integrated HTTP/UI browser, process restart, named mutations and several further interleavings. These are attributed execution receipts, not this reviewer's reruns.
- The integrated mutation inventory currently adds seven HTTP/UI experiments to the foundation runner. The full required onboarding SQL guard mutation set has no delivered result here. Passing aggregate test counts cannot replace killed guard evidence; failed setup/import/checksum cases must not be counted as semantic mutation kills.

## Required follow-up before acceptance

Correct IR-01..03, bind changed bytes to a new manifest and repeat affected plus required regressions. Supply finished combined typecheck/build/unit/PostgreSQL/workspace/browser receipts and named SQL/HTTP mutation results with actual killing assertions. Add actual two-process/restart admission; postcommit private-handoff failure/recovery; acceptance/suspension and issuer-revocation interleavings; consumed replay past expiry; and precreation/missing-history distinctions. Preserve source hashes and keep temporary credentials/screenshots free of secrets. The existing browser script covers core owner/partner happy paths and fixed native-form fallback, but is not itself evidence until it passes against the built app.

No whole-feature acceptance, live bootstrap, production deployment, real N1/YooKassa integration, tracking, payment, tax, manual transfer or D7 outcome is claimed. All review findings are bounded to this source snapshot.

## Source and telemetry binding

RUN_ID `20260909T211734Z-identity-program-partner`; WORK_UNIT_ID `integrated-review`. Profile `compact-quality-first-v2`, riskXL. Exact integrated input manifest: `docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/integrated-inputs.json`, SHA-256 `04f353a9568556c933ac46f56bd8757cf85cb50e5527f3acac106dec278740dd`,128 entries, independently verified with zero mismatches. Manifest contains all five feature documents, frozen DTO contract, integrated runtime/routes/UI/SQL and tests; a supplied asset/input hash is not a claim of exhaustive semantic review of that file. Existing security rules/skill were applied from the prior bounded review.

Frozen contract SHA-256 `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511`; spec revision above. Core receipt SHA-256 `85726d3ca2a4f6e5eabad7ca8b6623b904e1475ad1c3ea70bf839562c6332a92`. The128-entry manifest is the authoritative per-file source inventory for this report; none changed during local checks.

Requested model/effort `gpt-6-astra` / `high`. Actual model/effort, token counts and cost null because no host-attested execution/billing metadata was supplied. No fallback or measured savings asserted. Coordinator prelaunch event at `2026-09-10T08:47:34.860595+00:00` records this receipt path absent. Measured end `2026-09-10T08:56:44.907795+00:00`; elapsed wall `550047`ms; active wall null because independent active/wait measurement is unavailable. Terminal receipt is written atomically and completed status denotes completed review delivery, not passed feature acceptance.
