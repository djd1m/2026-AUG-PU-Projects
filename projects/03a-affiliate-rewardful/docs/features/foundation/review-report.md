# Foundation independent final review
Reviewer family: codex
Spec revision: sha256:b235e4f6ae330459262df674668d5c9b283c660ba9a32f383851fc9398f92a89

Verdict: ACCEPT for the seven foundation criteria on the scoped evidence below. No unresolved blocker, high or medium source finding remains. The final combined `npm run verify` exited0, now preserved in runtime-checks.md. The coordinator must still run the report-contract check after importing this newly issued review.

RUN_ID: 20260909T192932Z-foundation. WORK_UNIT_ID: final-review.
Profile: compact-quality-first-v2; XL independent source/security/conformance review.
Requested model/effort: gpt-6-astra / high. Actual model/effort and token/cache/reasoning/cost counters: null; authoritative host metadata and usage are unavailable.

## Scope and evidence basis

Candidate runtime revision supplied by the coordinator: 4ff997d; final code/tooling checkpoint8b60a59, with unchanged application bytes and the addendum below. The original final-source-snapshot is historical. This review binds the later 52-entry acceptance-source-snapshot plus its four-entry tooling addendum, which supersedes the harness and root package hashes and adds adapter/test files. All 54 merged paths were hashed and matched at report creation. Specification bytes match the required revision.

The reviewer independently read the feature specification, pseudocode, architecture, refinement, validation report, completion evidence and implementation contract; inspected authentication/database source and tests, startup paths, manifests, Compose/Dockerfile, isolation/mutation harnesses and the completion adapter. Earlier unchanged core analysis is preserved in security-audit.md. Repository/project instructions and applicable risk, security, testing, Docker and receipt rules were applied. The model policy overrides the review skill's findings quota.

Runtime results below come from the coordinator's preserved runtime-checks.md and mutation-results.json, checked against the source and actual test assertions. This reviewer did not rerun tests, install dependencies, access the network or start containers. Source inspection, executed evidence and limitations are kept distinct.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-foundation-1 | met | Own lock/workspaces and declared scripts exist. Serial harness records typecheck, production Next build, effective Compose/port guards, migrations and tests passing. tests/workspace.test.ts launches the built app, checks exact HTTP200/no-store/alive body, semantic Russian shell and absent auth routes. Compose has a private internal network, own mounts/volume, no DB host port, loopback-only web publication and distinct explicit credentials. Actual rebuilt image startup/home/non-root checks later passed; see failed/retry distinction below. |
| AC-foundation-2 | met | migrate.integration.test.ts executes two concurrent real PostgreSQL runners, checks one schema effect/checksum row, repeats safely, rejects changed/missing later history before earlier new SQL, proves SQL/journal rollback and corrected retry, bounded advisory lock and legacy-journal refusal. Runner preflights complete history, uses per-file transactions and finally unlock/close. Integration passed; checksum-removal mutation failed an actual assertion; original bytes and schema were restored. |
| AC-foundation-3 | met | password.test.ts runs native Argon2id with distinct salts, correct/wrong verification, malformed hashes, explicit version/work-factor/output checks and invalid input assertions proving no adapter call. Supported-hash parsing caps native resources; code-point/UTF-8 bounds precede KDF. Passing unit evidence includes native Node22.22.0 smoke. Recorded timing/RSS is observational rather than a throughput or peak-memory guarantee. |
| AC-foundation-4 | met | kdf-admission.test.ts uses barriers to prove two active/eight queued, eleventh refusal, FIFO drain, failure/timeout recovery, canceled running work retaining its slot and deadline rejection before timer callback. Credentials saturation integration checks zero checked-out clients during blocked KDF and completes an independent DB query. Passing unit/integration evidence and a detected capacity mutation support behavior beyond test-title matching. |
| AC-foundation-5 | met | credentials.integration.test.ts proves generic wrong/disabled/missing/corrupt denial with one real-or-dummy verification per admitted valid attempt. Separate DB mutations disable/change the hash while successful KDF is paused; resumed verification creates no session. Hardened SQL locks User and checks enabled plus byte-identical snapshot before insertion. Integration passed; enabled-recheck removal was killed by the credential-race assertion. |
| AC-foundation-6 | met | auth-repository.integration.test.ts issues from real successful credentials and verifies HMAC-only persistence, exact24h lifetime, identity-only context, successful resolution, unknown token, idempotent double revoke, disabled user and exact expiry boundaries. Collision fails safely. Token/cookie unit tests supply canonical/randomness and secure-scope assertions. Integration passed; independent revocation and expiry removals were detected. |
| AC-foundation-7 | met | Config and startup tests reject absent/malformed values through all four declared serve commands; only build omits runtime validation. Cookie tests enforce Secure/HttpOnly/Lax/root/no-Domain. Actual app-role tests deny DDL/user writes/direct session INSERT/journal access/role escalation, inspect restricted function ACL/search_path and attempt hostile schema redirection. Expanded native/DB sentinel tests assert fixed sanitized diagnostics across console methods. Actual idle-backend termination child survives and emits only its fixed code. Unit/integration pass; startup-validation and idle-listener removal mutants are killed. |

## Findings closed and security judgment

SA-01, medium, idle pool error: the production pool now installs its error listener at construction and emits only database_idle_connection_error. The actual-backend termination child and detected listener-removal mutation close the missing asynchronous outage case. The initial audit's provisional password-disclosure concern was explicitly retracted: pg hides password fields; no password leak was established.

SA-02, medium, malformed URL escapes: runtime validation now decodes username/password/host/database components and rejects malformed escapes/control characters with a stable error. Regression cases exercise the originally accepted %ZZ URL. Degenerate all-identical session secrets also refuse; this heuristic is not proof of entropy, which still comes from fresh random generation.

SA-03, medium, declared serve-command bypass, found in this final pass: workspace dev/start previously invoked Next directly. All four declared root/workspace serve commands now dispatch through the validated wrapper. Eight subprocess cases cover missing/malformed config, bound the child lifetime and remove its process group. An actual startup-validation-removal mutation fails the test. Source plus passing restored execution close the finding.

The SQL authority boundary remains narrow: qualified objects, fixed trusted search path, null/length rejection, locked enabled/current-hash check, transactional issue, and PUBLIC EXECUTE revocation in the creation migration. The trusted application can read hashes and invoke the issuer; resistance to compromise of that trusted DB credential is not claimed. Internal identity primitives do not confer program authority. No auth HTTP routes, enrollment, tenant authorization or money operation was accepted as implemented.

## Infrastructure, tooling and observed results

The passing serial startup-correction run used namespace n3a-foundation-8d9f0eececa5:10 unit tests,13 integration/smoke tests and8 detected behavioral mutants, with original source untouched and schema restored. The reviewed mutation harness requires real failed assertion records and exit1, hashes original/mutant bytes, checks originals remain unchanged, and restores its disposable schema. Its namespace/credential boundary is explicitly test-only.

The Docker image was built as manifest-list SHA345124d4f7fd5b1426b5299eb475531c1a1fdf3f6e720aa4b51ca219f64a4c2a (config SHA490a517fd259fe8e9463dbcda7483b590cdcd91a957bb7ef273a17a66b4209fd). First startup failed ENOSPC and that harness invocation exited1. After scoped cleanup, the coordinator's separate retry used the same already-built image, passed infra/port/startup/liveness/Russian-home/non-root checks and exited0. This satisfies the image build/start gate through separate preserved attempts; the failed attempt is not relabeled green. Runtime application bytes were unchanged; later tooling changes are separately pinned.

Compose db/web have restart policies; one-shot test is intentionally exempt. Harness cleanup now enables both app/test profiles within its exact random namespace. Successful corrected scoped cleanup was observed in the image retry; no donor resource or production deployment was involved. Private disposable volumes are retained.

The pinned upstream completion checker duplicated its project-document prefix. The adapter checks version and full upstream SHA, makes exactly two path-variable substitutions in a temporary copy and preserves validation logic and role inputs. It never edits vendor files. Real-checker tests establish original failure, corrected pass, missing mapping exit1, malformed mapping exit2, restored pass, unchanged vendor hash and temporary cleanup. Two integrated tooling tests passed; completion, traceability, report-revision and criterion-scenarios individually passed. Review-family/spec-conformance checks against this newly issued report remain the coordinator's subsequent integration step if required by the final aggregate gate.

Node engine metadata now consistently requires >=22.12.0, matching the Vitest5 floor; target Node22.22.0 is supported. Standalone npm audit recorded0 known vulnerabilities. This is a point-in-time advisory result. Earlier dependency resolver failure, overlapping-build smoke failure, lost mutation terminal output and ENOSPC attempt remain disclosed in telemetry rather than converted to passing evidence.

## Limitations and handoff

- Final combined npm run verify exited0: typecheck,10 unit tests,build,traceability,2 tooling tests and all4 checker modes passed. The coordinator must run and record the check of this newly integrated review report before lifecycle completion.
- No production deployment, browser layout/accessibility certification for the full app, N1/YooKassa integration, onboarding/authorization or monetary behavior is established.
- Native smoke observations and bounded accounting tests do not establish a production load/SLO or whole-process maximum memory bound. Capacity is per process.
- Runtime logs/results are coordinator-preserved observations; this source reviewer did not independently launch their commands. The image-retry script lies outside the assigned candidate read scope; its hash and results are recorded in runtime-checks.md, and its implementation was not independently inspected here.
- Source changes outside the merged hash set or changes to the seven-criterion specification require reassessment. The shared telemetry record remains coordinator-owned.

## Evidence hashes

Paths below are relative to the candidate project. Hashes bind this review's evidence reads; future additions to run telemetry do not retroactively change the reviewed record.

```text
b9e7702da7e192b510fec2e9184952a21af00f37d4c8a4e56e4de9d57dc720be  docs/telemetry/p-replicator/20260909T192932Z-foundation/acceptance-source-snapshot.json
1152215bcb52c98ba24a135c02c4dbf98f9ee3de0b6a2731288c598c1c54aab8  docs/telemetry/p-replicator/20260909T192932Z-foundation/acceptance-tooling-addendum.json
c37ab5cc65d6b0483a1c3586dbc03e53286dc60e64a3022e68d3e3df5d8bfcec  docs/telemetry/p-replicator/20260909T192932Z-foundation/runtime-checks.md
92e1522a584b7f28a5e6d27bae4d2e33d5299fe4d61cd24ca961fe47697997a8  docs/telemetry/p-replicator/20260909T192932Z-foundation/mutation-results.json
3a5903ef900ea5407a95160172ae8da893fa0ad118593eb732c7cf417347a335  docs/telemetry/p-replicator/20260909T192932Z-foundation/completion-adapter.md
b235e4f6ae330459262df674668d5c9b283c660ba9a32f383851fc9398f92a89  docs/features/foundation/01_specification.md
6b9e8692d2d0b6789cc3a29eee666ef8158f40f3659a7a5e3b9fb914cfe88f23  docs/features/foundation/02_pseudocode.md
0d55c0338b9663a672ea8a5c6d2c19210f7c4ee495811f7c382f129d429a4cd0  docs/features/foundation/03_architecture.md
7b03879fc0264c5392cc2997c1d636fd9acc035654da650479722aa8cd839abc  docs/features/foundation/04_refinement.md
d934f719b923fec5c85ad5aaf50b0dc0121346e5fcc492a110beeddafe4f8507  docs/features/foundation/validation-report.md
5d563b1d49b794c7898f54b85ce62179e61951b63534cfcaab34c87955582b97  docs/features/foundation/05_completion.md
30bfab6c7459af5c7df8da2fd28922214db50b0dbf17d8fdf610bf7c6a821bdc  docs/foundation-contract.md
```

Merged source binding:52 original entries with4-entry addendum,54 unique paths verified. The addendum supersedes only scripts/run-foundation-integration.mjs and package.json, and adds scripts/check-pipeline-completion.mjs and tests/pipeline-completion.test.mjs. All original runtime source hashes continue to match.

Completed at 2026-09-09T21:11:35.673221+00:00. Elapsed 1123.98 seconds from the coordinator-recorded final-review start; includes waiting for required evidence. Token usage/cost remain null; no numerical savings claimed.
