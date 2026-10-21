# Design independent review
Reviewer family: codex
Spec revision: sha256:b643c102b0b1c970627ec475db08ec16cb02b89ee976464d06769ae5e22fd3ff
RUN_ID: 20261013T220722Z-design-5c13
WORK_UNIT_ID: design-review-1
Attempt: design-review-1
Source commit: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4 (dirty project; manifest binds reviewed feature bytes)
Source manifest: tests/design/artifact-manifest.json; sha256:16487ecb6d6ea15b037917ad721e1be2c2a426d83e7f231cce49eed88ef19a9c; all 33 entries verified
Trace: /home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/features/design/review.md
Launch: docs/telemetry/p-replicator/20261013T220722Z-design-5c13/review-launch.json; absent before launch
Started: 2026-10-13T23:04:58.305940+00:00 (coordinator prelaunch clock)
Requested model/effort: gpt-6-astra / high
Actual model/effort: null / null; exact host metadata unavailable, request is not proof
Usage/cost: null; host counters unavailable, no token or monetary estimate
Profile/risk: compact-quality-first-v2 / XL (spend, immutable geometry, ownership, dispatch fencing)
Scope: independent source/code/tests review; source read-only; only this receipt written in project
E2E preflight: not_applicable — repository tests/offline HTTP/NullEngine probes, not browser or deployed-runtime E2E
Verdict: changes required; 1 HIGH + 3 MEDIUM confirmed findings; mandatory integration gates pending

## Findings

### DESIGN-R2 — HIGH — changed rates can authorize a request above its saved reservation

**Confirmed code defect.** `packages/db/src/design/lifecycle.ts:15` compares the immutable reservation to the current job cap and computes `requestCeiling` against that current cap. It never compares the newly calculated ceiling with the money actually held for this admitted job. `packages/domain/src/design/provider.ts:21` only enforces the supplied current cap.

Independent PostgreSQL counterexample, `/tmp/n8-design-review-cost.mts`, called real `preview → submit → claim → markDispatched`, with an isolated `freshDb()` schema, no provider/network call:

```json
{"reservedAtAdmission":100,"currentCeiling":228,"dispatchAuthorized":true}
```

Admission used the supplied test configuration. A restarted jobs instance retained the model and maxTokens but used input rate 100000 and job/account/global caps 1000/2000/4000. It authorized a request whose known conservative ceiling exceeded its saved 100 microUSD reservation. This defeats the promised conservative reservation before spending; subsequent overrun detection is too late. The existing test `changed live config is rejected before outbound and overrun blocks another account` (`tests/design/jobs.test.ts:23`) tests an already-recorded overrun, not a changed configuration before dispatch.

**Fix code:** require the recomputed request ceiling to fit the immutable saved reservation before marking dispatch. Reject and release through the existing pre-dispatch failure path; do not silently increase the reservation or alter consent. Add the queued-job rate/cap-change regression, assert no dispatch mark/POST and once-only release in both ledgers. Keep the source money invariant.

### DESIGN-R1 — MEDIUM — GLB request advertises an invalid surface

**Confirmed code defect.** `packages/domain/src/design/provider.ts:17` hardcodes GLB `geometry.surfaceIds` to `['scan']`. Real imported descriptors contain identifiers such as `mesh:0:primitive:0` (`packages/adapters/src/asset-parser-worker.mjs:38`), and `validateScene` accepts only those descriptor IDs (`packages/domain/src/design/scene.ts:18`). The AI cannot correctly address a material surface from the advertised catalog of surfaces.

Independent pure-code probe `/tmp/n8-design-review-probe.ts`, building the actual request and validating a response that uses its advertised surface:

```json
{"actualSurfaceIds":["mesh:0:primitive:0"],"advertisedSurfaceIds":["scan"],"result":"SCENE_INVALID"}
```

The shipped GLB domain test uses synthetic `['scan']`, so it cannot detect this producer/consumer mismatch. **Fix code:** transmit the immutable descriptor's actual surface IDs, retaining the text-only/no-asset/no-URL request boundary; add a descriptor-shaped request-to-validator test. Do not invent semantic walls or claim GLB fit.

### DESIGN-R3 — MEDIUM — accepted cylinders render as boxes

**Confirmed integration code defect.** Catalog schema permits `box|cylinder` (`packages/domain/src/design/scene.ts:8`), but `packages/viewer/src/types.ts:3` provides neither primitive nor catalog resolution, and `packages/viewer/src/renderer.ts:47` always calls `MeshBuilder.CreateBox`. `RoomPlan` also draws all objects as rectangles. The persisted catalog therefore loses its visual primitive semantics at the viewer boundary.

Independent actual renderer probe `/tmp/n8-design-review-cylinder.mts` used Babylon `NullEngine` and `BabylonRoom.setDesign`; supplying a cylinder definition produced 24 vertices and only four distinct X/Z positions (the box corners). No browser result is inferred from NullEngine.

**Fix integration code:** resolve the immutable catalog definition into a viewer-specific object containing its primitive, render the selected primitive with exact declared dimensions, and preserve the domain scene's strict contract. Cylinder width/depth may require explicit elliptical scaling. Add a viewer regression and confirm in the pending browser design journey; do not weaken permitted catalog primitives to hide the defect.

### DESIGN-D1 — MEDIUM — normative API table does not match callable design/job routes

**Confirmed source drift.** `docs/Pseudocode.md`, API Contracts design/job rows, differs from `apps/web/src/server/design.ts:6` and the route files:

| Source table | Actual implementation |
|---|---|
| design body field `reason` | strict body requires `changeReason` |
| job body `{style,referenceIds,consent,inputText}` | `{input:{shellId,style,referenceIds,inputText},consentHash,consent:true}` |
| no preview contract | POST `/api/projects/:p/jobs/preview` returns exact requestBody/consentHash |
| GET `/api/projects/:p/jobs/:j` | GET `/api/jobs/:j`, account-owned |
| missing restore/read/list entries | POST restore; GET revision, catalog and project jobs exist |
| approve `{}` body | approval and restore handlers require headers but do not consume JSON body |

**Fix source by logged judgment:** document the actual, stronger consent snapshot contract and exact route/body shapes; retain If-Match, owner/Origin/rate-before-body, replay ordering and strict unknown-key checks on consumed JSON. Record before/after hashes and source-version propagation. A client following the current table would hit missing routes or validation errors; silently accepting both incompatible shapes is unnecessary. The older feature pseudocode parent hash should be refreshed with a source-version note, not presented as current after earlier SPACE table correction.

## Spec conformance

Each criterion is listed once. `met` is limited to the inspected/tested boundary; it does not close the separate mandatory production/browser gates below. Unknown integration evidence is not a pass.

| Criterion | Result | Source → implementation → named evidence / remaining boundary |
|---|---|---|
| AC-design-1 | not_met | Immutable shell/domain preservation passes `preserves measured shell and exact catalog dimensions` (`tests/design/scene.test.ts:9`); renderer overlays and before/after share a camera. Cylinder semantics fail DESIGN-R3. Actual style/furniture save/reload, before/after camera and browser shell invariance remain pending. |
| AC-design-2 | met | Strict unknown fields/shell hash/catalog dimensions, rotated AABB bounds, opening clearance, object separation: `validateScene` in `packages/domain/src/design/scene.ts:23`, transaction rollback in `revisions.ts:25`; named tests `rejects shell edits, URI, changed dimensions and foreign surfaces` and `rotated AABB room bounds, opening clearance, object collisions` (`scene.test.ts:10`, `:11`). Domain rejection is 422 SCENE_INVALID; production HTTP status seam remains pending. The collision fixture repeats one ID, so its rejection does not alone prove the overlap branch; static branch inspected. |
| AC-design-3 | unverifiable | Revision/current-pointer invalidation exists in `packages/db/src/design/revisions.ts:17` and space shell write. `ownership, concurrent CAS, immutable approval and restore new draft` (`revisions.test.ts:7`) proves retained immutable content/new draft. Quantity recomputation or unknown quantities across changed shell belongs to procurement integration and has no completed evidence in this review. |
| AC-design-4 | met | `lockOwnedProject` checks version under project row lock; create/restore/approve bump version atomically. `ownership, concurrent CAS, immutable approval and restore new draft` (`revisions.test.ts:7`) runs competing connections and permits one write. Source branch produces VERSION_CONFLICT for the loser; no overwrite path. |
| AC-design-5 | unverifiable | Restore/new style inserts draft, supersedes old active revision, clears current budget, keeps immutable content. Same named revision test (`revisions.test.ts:7`) verifies fresh ID/parent/draft/null approval. Browser purchasing warning and style/history UI transitions remain pending integration. |
| AC-design-6 | unverifiable | `manual mode makes no provider request; demo is explicit fixture without credits or spend` (`jobs.test.ts:20`) passes; manual creates no job, demo fixture is labelled. Browser visible exact manual label, saved presets and browser no-egress spy remain pending. |
| AC-design-7 | met | `all live key/cap/rate/model/output/guardrail fields mandatory; ordered integer caps; no egress` (`tests/foundation/config.test.ts:17`) passes; `malicious definite response releases credit but records known provider spend` (`jobs.test.ts:15`) verifies no successful malicious scene. Adapter proof/redirect/body/deadline tests (`provider.test.ts:15`, `:16`) pass. DESIGN-R2 separately blocks the live reservation guarantee after a config change. |
| AC-design-8 | met | Closed SKIP LOCKED claim and once-only mark/fence tested by `single claim dispatch known cost and stale completion fence` (`jobs.test.ts:13`). Five-account and global-twenty caps tested by `admission count races across connections reserve exactly five account jobs` (`jobs.test.ts:11`) and `global twenty admissions cap across independent accounts under contention` (`races.test.ts:12`). Actual separate worker processes/startup remain pending integration. |
| AC-design-9 | unverifiable | `post-dispatch crash stays uncertain with holds, never automatic redispatch` (`jobs.test.ts:17`), max-three predispatch leases (`jobs.test.ts:16`), and operator reconciliation (`jobs.test.ts:18`) pass under controlled clock/DB state. Durable algorithm is present. Actual worker process termination/restart and watchdog composition have not been executed; those mandatory runtime gates remain open. |
| AC-design-10 | met | `offline HTTP fixture runs complete real-PG worker path once and reconciles both ledgers` (`provider.test.ts:18`) uses the actual HTTP adapter + actual PgJobs + runOneJob: exact saved bytes, one POST, one draft, consumed credit, both ledgers 31 microUSD, no external provider network. This proves the specified offline path only. |
| AC-design-11 | met | `exact consent + replay before archive, caps, credit and version, with mismatched replay rejected` (`jobs.test.ts:10`); `late same-shell output creates detached draft and preserves newer manual pointer/budget` (`jobs.test.ts:14`); both archive/refund before/after mark barrier cases (`races.test.ts:10`, `:11`); `database admission snapshot immutable while lifecycle fields remain writable` (`jobs.test.ts:22`); foreign pre-body HTTP guard (`http.test.ts:5`). All pass. Full billing/refund and browser composition remain separate integration gates. |

## Anti-drift

### Forward: source → code → tests

- **Geometry/catalog:** source's immutable shell IDs/hash and same-project append-only definitions map to strict domain schemas, `validateScene`, `PgDesigns`, SQL immutable triggers and combined revision bound. Exact canonical decimal triples are compared elementwise; manual fit uses rotated AABBs with 0.9m opening exclusion; GLB stays unconfirmed. Bounds/immutability/CAS tests exercise real PostgreSQL. No shell transforms, scripts, executable material fields or arbitrary fetch targets are admitted. GLB surface transport and cylinder renderer diverge as reported above.
- **History/ownership:** project-owned queries and composite FKs protect scalar IDs. Reference arrays and catalog snapshot IDs are checked inside the owning transaction; server chooses catalog UUID/source. No provider-selected actor is accepted. All revision paths, including detached completion, use the project-wide shell+design+budget bound of 100. A reference array schema bound of 100 is not a project admission allowance: actual references remain capped by the space repository. Approval requires current confirmed shell/hash; restore creates a new draft. UI consequences await integration.
- **Credits/money:** stable spend mutex 80913001 → Account → Project → global/account origin-day ledgers → Job is shared by admit/settle/release/reconcile/archive; claim only briefly locks a job then closes before broader locks. Five/twenty UTC admissions count all live admitted rows; prior-day unresolved reservations remain in cap calculation. Credit moves available→held→consumed/released once. Invalid definite scene records known spend while releasing credit. Unknown cost remains null and held; full overrun is recorded and blocks admission. DESIGN-R2 is the concrete pre-dispatch changed-rate exception to this otherwise coherent path.
- **Dispatch/fence/replay:** same actor/key/inputHash replay precedes mutable eligibility; foreign project ownership is checked before body consumption without preemptively rejecting an owned archived replay. Immutable request bytes/consent/origin design+version and 120s expiry persist at admission. SQL migration003 rejects changed admission fields, cleared dispatch marker and decreasing fence. Mark is the authorization commit before outbound; no network occurs while holding the DB transaction. Max three predispatch claims and no automatic redispatch after a marker are tested. Later same-shell manual work causes detached draft instead of pointer overwrite.
- **Provider/privacy:** fixed bounded GET key proof checks finite daily limit, remaining funds and BYOK inclusion before mark; one strict-schema POST with require_parameters/allow_fallbacks=false, max_tokens, 32KiB request, 256KiB response, deadline and redirect refusal. Payload contains text dimensions/preferences/catalog; no uploaded bytes or automatic reference URL fetch. Fixture request injection is test-only. Candidate model configuration is explicit; no claim of live model availability or quality is made.

### Reverse: code → source semantics

- No new runtime dependency or cross-project business import was introduced by design. Pure domain exports and app-level concrete provider wiring follow accepted architecture; viewer package placement is already logged in DRIFT-003.
- Append-only ObjectDefinition registration, current confirmed approval, archived replay, immutable input SQL trigger, token-overhead configuration and local uncertain reconciliation all strengthen or implement explicit source obligations; they are not scope expansion.
- Current reliable-cost settlement also permits `succeeded`/`failed` jobs whose cost stayed unknown, and an intermediate null credit outcome. This implements the stronger no-guessed-credit and unknown-cost obligations; source `ReconcileJob` headline mentioning only uncertain is narrower than its required use cases. Coordinator should describe the accepted input states/null outcome in the operator command contract during its pending integration, retaining expected-state/fence and evidence checks.
- DESIGN-D1 is actual API drift. Correct source shape/paths with a logged decision; do not weaken normative consent, ownership, money or geometry rules. DESIGN-R1/R2/R3 require code fixes.

## Evidence and limitations

Independent executions:

1. `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/design --maxWorkers=1`: exit0, 34/34 tests in 6 files, start 2026-10-13T23:06:19Z, runner duration10.15s. PostgreSQL tests used separate fresh schemas and did not skip. Secrets were never printed.
2. `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/foundation/config.test.ts --maxWorkers=1`: exit0, 3/3, start23:09:22Z, duration253ms.
3. Three independent temporary probes reproduced the GLB surface mismatch, changed-rate under-reservation, and actual renderer cylinder loss. Their full behavioral outputs are recorded above. The first money-probe launch as `.ts` failed before execution because tsx selected CJS for an imported top-level-await module; rerun as `.mts` executed successfully. That launcher error is not a product result.
4. All33 author manifest entries matched. Mutation evidence JSON and restored source hashes checked: shell-hash and dispatch-once mutants each exited1 and restored originals. Mutations were not rerun because this reviewer has read-only source ownership.

Author receipt reports lint/typecheck/build exit0; these were read, not independently rerun. Author's isolated complete suite was 58pass/1 stale copied config fixture failure, then affected config3pass. Neither that partial recovery nor the independent34pass is represented as a passing final full integrated suite.

Shared dependencies inspected separately: viewer renderer sha256 `0f5f6e569ead6daa1add6eeabe33e43747edaab8a334a17f77913d1dff6781d3`; viewer types `bd7f773e71e02680f3ddaa0ee0525c055984c5d5a7feabbb36837ebb385911b1`; migration003 `f7ba9286a0e2dc55fd1dc8ddbc3f25be66eb5ca06402efaa3bc60fbe5d302aed`; live config `673be7cf1abafea2740ba20fd6d0366473a4bf93e27ed013fd29e1f75e8d4614`. Global Specification `7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd`; Pseudocode `1d25bc13918dba5af5b6a483cacc1fa96ba4c3dfd324abcef67a0fb82c2847c8`; Architecture `1a902141862ccbfa411fb853460506a3238b8e6c10ba70a774ea1ba822f6b99c`; frozen canon `70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d`.

Mandatory pending coordinator gates: complete design UI/catalog/viewer connection; browser saved style/object/history/approval and purchase warning; 390px/desktop/manual no-egress/camera comparison; production HTTP typed error boundaries; usage dashboard + /api/me own aggregation; executable shared worker/watchdog, actual process restart/no redispatch; operator reconciliation and readonly global usage entrypoints with proper credentials; complete integrated lint/typecheck/build/test and accepted performance/recovery checks. At review time worker has jobs.ts/watchdog.ts but no runtime index, and these UI/operator surfaces are explicitly still being integrated. These are accepted-scope delivery blockers, not reasons to rewrite the backend review or to call them out of scope.

Coordinator reported a separate production SPACE malformed-GLB error-class/bundling seam (503 vs422) under correction. This review does not certify its closure or extrapolate source-level HTTP tests to a production-build pass.

No paid/external provider calls, no public release, no source mutation, no delegation, no historical telemetry edits. No artificial finding quota was used. One concrete correction pass plus narrow independent closure is required; final feature acceptance remains blocked until the findings and mandatory runtime gates are closed.

Ended: 2026-10-13T23:12:15.336303+00:00
Elapsed wall milliseconds: 437030 (launch through receipt; active/wait split unknown)
Telemetry: docs/telemetry/p-replicator/20261013T220722Z-design-5c13/; actual model, effort, tokens and cost unavailable/null. No measured efficiency comparison.
Status: completed

## Narrow independent closure — design-review-closure-1

This appended closure supersedes the four finding verdicts above only at the boundaries stated here. Original findings, counterexamples and original AC judgments are preserved byte-for-byte. Feature delivery is still blocked by pending mandatory integration evidence.

RUN_ID: 20261013T220722Z-design-5c13  
WORK_UNIT_ID / attempt: design-review-closure-1  
Source commit: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; dirty bytes bound by closure input/output manifests.  
Profile / risk: compact-quality-first-v2 / XL, inherited spend and dispatch fencing risk.  
Requested model/effort: gpt-6-astra / high. Actual model/effort, tokens and cost: null; host metadata unavailable.  
Prior report SHA-256: 34f53e0b5e65d220eaae52dfcf78aec99a51380bdde3c8646da0f39656928287.  
Scope: R1/R2/R3 corrections and D1 API contracts; no new whole-project review or source mutation.  
Companion preflight: not_applicable; repository PostgreSQL tests and Babylon NullEngine/SSR checks, no deployed or browser E2E.

### Finding decisions

| Finding | Closure verdict | Concrete inspected evidence |
|---|---|---|
| DESIGN-R2 HIGH | closed at pre-dispatch repository/worker boundary | `JobLifecycle.markDispatched` recalculates the exact saved request's ceiling under current config and compares it with the immutable original reservation before setting `request_dispatched_at`. Domain failure goes through existing transactional release and marks failed. New queued repricing regression passes. Independent worker probe admitted100, recalculated228, performed one local budget-proof stub and zero provider completion calls; repeated mark twice, rejectBeforeDispatch and sweep preserved exactly one release: credits available30/held0, account/global held0/settled0, no dispatch timestamp. No additional reservation or consent rewrite. |
| DESIGN-R1 MEDIUM | closed at descriptor/request/validator boundary | `buildRequest` uses `surfaceIds(shell)` from immutable GLB descriptor. `DESIGN-R1 GLB provider advertises immutable mesh IDs that its response validator accepts` passes with `mesh:0:primitive:0`; reply using this advertised ID validates and remains fit=unconfirmed; invented floor is rejected. Parser emits these IDs and viewer resolves the same mesh/primitive pointers. No files, remote assets or semantic floor inference added to request. |
| DESIGN-R3 MEDIUM | closed at presentation projection/actual mesh/plan boundary | `DesignPanel` resolves primitive from immutable catalog into separate `ViewerScene`; persisted strict `SceneProposal` is unchanged. `BabylonRoom.setDesign` calls production `createObjectMesh`, cylinder uses actual CreateCylinder with independent width/depth scaling. NullEngine regression obtains more than24 vertices, world dimensions2×1×1 and bottomY0; real RoomPlan SSR produces ellipse. Actual browser save/reload, camera and rendering journey remains mandatory pending. |
| DESIGN-D1 MEDIUM | closed for normative API contract mismatch | Corrected table now documents changeReason; owned GET individual revision; catalog GET/POST with server ID/source; preview input and exact requestBody/consentHash; strict submit `{input,consentHash,consent:true}`; account-owned GET `/api/jobs/:j`; restore and approval empty bodies. Compared with actual design handlers and route files. No compatibility aliases or weakened owner/Origin/CAS/consent guards. Coordinator added omitted individual revision GET during this closure; final Pseudocode hash b392a6218eed9ca257a1cc0d18f0a8d32d625f0d46ac68dd77681dbd4b3279f8 and current source-versions binding agree. |

Before/after source proof: original author manifest binds lifecycle `2a2f496ef6de9578bda30ed5c00f74dcd0cf939634146828f8c46cb4144d6911` → `521fffaedaf67ef500cbcab7b67a4ca7bfd885b1319ab771b913a47f276875d5`; provider `8272014d085040b7020b6b9d76896234402174a0de2b2d6a8fe2d8c1871502f6` → `a8e02128852e11c4fc66ba19d98a14dfd03c4efac7b75d42c61e2bc08b9f9818`. Original review binds renderer `0f5f6e569ead6daa1add6eeabe33e43747edaab8a334a17f77913d1dff6781d3` → `7ae61899b97a0e1e3a833a0096f5a54c336f66f666547b5e7267f385192a76b0`, viewer types `bd7f773e71e02680f3ddaa0ee0525c055984c5d5a7feabbb36837ebb385911b1` → `4044472b6e734b6ccfabd386dfe6cccab3fece8bf2e39ae5b3672e0d7dd36ef6`. Pseudocode at original review `1d25bc13918dba5af5b6a483cacc1fa96ba4c3dfd324abcef67a0fb82c2847c8` → first correction `407824005319b4ba4fe6d4a83fcdfdb33d7d1005a1b138c916088891a9ea1d1d` → final hash above. Decisions DRIFT-011–014 explain code versus prose corrections. Full current hashes are in the closure output manifest; original manifests were not rewritten.

### Current AC ledger

One verdict per AC below; `met` means the stated source/repository boundary only. Unchanged prior evidence is explicitly inherited rather than silently rerun. Mandatory runtime gaps still prevent whole-feature acceptance.

| Criterion | Verdict | Evidence and remaining boundary |
|---|---|---|
| AC-design-1 | unverifiable | R1/R3 corrected; fresh measured-shell preservation, strict scene and actual cylinder/plan tests pass. Presentation resolves immutable catalog primitive. Browser style/furniture save/reload, same camera comparison and shell invariance remain pending. |
| AC-design-2 | met at repository boundary | Fresh `rejects shell edits, URI, changed dimensions and foreign surfaces` and bounds/opening checks pass; strict scene untouched. Original immutable revision rollback evidence inherited. Production HTTP422 and browser intact previous scene remain pending; original duplicate-ID collision-fixture caveat remains. |
| AC-design-3 | unverifiable | Original immutable history/new-shell invalidation evidence inherited. Procurement quantity recomputation versus unknown after changed shell requires its integration evidence. |
| AC-design-4 | met at repository boundary | Original real-PG competing CAS/new revision/restore test and unchanged `revisions.ts` evidence inherited. This narrow correction changes no revision CAS implementation. |
| AC-design-5 | unverifiable | Original restore/new draft/no inherited approval evidence inherited. Browser history/style change and purchasing warning require coordinator integration check. |
| AC-design-6 | unverifiable | Fresh manual-no-provider/demo-labelled test passes. Actual browser manual label, persisted preset and network spy remain mandatory pending. |
| AC-design-7 | met at repository boundary | Original strict startup config evidence inherited; fresh malicious-response validation passes; R2 new guard and independent zero-POST repricing probe close the discovered reservation gap. Paid model availability, quality or live inference are not certified. |
| AC-design-8 | met at repository boundary | Fresh single-claim/fence and account-five contention tests pass; original global-twenty race evidence inherited. Actual separate worker process execution remains coordinator runtime gate. |
| AC-design-9 | unverifiable | Fresh max-three predispatch lease, postdispatch uncertain/no redispatch, holds and operator reconciliation tests pass under real PG and controlled clock. Process termination/restart and runtime watchdog are not exercised here. |
| AC-design-10 | met at offline fixture boundary | Original provider HTTP + real-PG full worker success test evidence inherited. Affected corrections do not alter HTTP adapter/settlement implementation; this closure adds zero-POST failure-path evidence. No actual paid provider result inferred. |
| AC-design-11 | met at repository boundary | Fresh exact consent/replay, immutable admission and late detached result tests pass; original archive/refund barriers and foreign pre-body guard evidence inherited. Full billing/browser composition remains separate pending gate. |

### Executed evidence and delivery limitations

- `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/design/jobs.test.ts tests/design/scene.test.ts tests/design/primitive.test.ts --maxWorkers=1`: exit0, 3 files, 21/21 tests (jobs15, scene5, primitive1), start23:50:51UTC, duration10.81s. Log `docs/telemetry/p-replicator/20261013T220722Z-design-5c13/design-review-closure-1-tests.log`.
- `node --env-file=.runtime/test.env --import tsx docs/telemetry/p-replicator/20261013T220722Z-design-5c13/design-review-closure-1-probe.mts`: exit0. Full independent probe source and safe JSON output retained beside the tests log. It executes actual PgJobs and runOneJob on a fresh migrated PostgreSQL schema; no skipped DB tests, secrets printed, actual provider requests or existing project data changes.
- Input manifest binds bytes before tests; output manifest verifies executable reviewed inputs stayed unchanged through this closure. Only coordinator API prose changed during review. Prior author-manifest comparisons preserve historical hashes and identify changed inputs rather than falsely revalidating that old manifest.
- Applied dz lessons: one full review followed by concrete focused closure (`teach:deae300b63174339`); preserve pre-body ownership while replay precedes mutable eligibility (`teach:f8472c8058ed7124`); purchasing warning after new design remains a real acceptance condition (`teach:8552f9d9f133292e`). No new optional polish, delegation, full-suite repeat or product-source mutation.

**Still pending, owned by coordinator:** annotate old canon phrase “GLB semantic surface scan” with opaque descriptor IDs after the active writer completes and bind resulting source hash; preserve original feature-pseudocode derivation hash while labelling it historical rather than “exact current”; execute actual browser/manual no-egress/390px/desktop/saved scene/history/approval/purchasing/camera checks, production HTTP typed errors, real worker restart/watchdog and operator/usage entrypoints, full integrated lint/typecheck/build/test plus required performance/recovery. Existing original pending list is not closed by these21 repository tests. No claim about Docker build completion or actual paid models.

Result: 4/4 assigned finding corrections closed at the reviewed boundaries, no additional product finding in this narrow pass. Mandatory full-feature E2E/integration acceptance remains pending. Historical source annotations are tracked above and must not be silently claimed complete.

Started: 2026-10-13T23:49:47.915098+00:00  
Ended: 2026-10-13T23:53:22.408184+00:00  
Elapsed wall milliseconds: 214493; active/wait split null, no authoritative intervals.  
Telemetry: docs/telemetry/p-replicator/20261013T220722Z-design-5c13/; exact actual model/effort, usage and cost unavailable. No efficiency comparison.
Status: completed

## AC-design-9 actual process-crash closure — worker-crash-review-1

The earlier process-termination qualification is now closed by
`tests/design/process-crash.test.ts` and `tests/design/crash-worker.fixture.mjs`.
The independent reviewer read both files and production dispatch/sweep code once;
`evidence/worker-process-crash-1.txt` records the actual targeted **1/1 PASS,1.38s**.
No reviewer rerun and no new full suite were performed: the prior **229/229** run
and this separate added test must not be described as a full230-test execution.

The first real child process runs production `runOneJob` against a fresh migrated
PostgreSQL test schema. Its injected offline provider emits IPC only after the
awaited durable `markDispatched`; the parent verifies running state, sends actual
SIGKILL, and asserts the signal exit. A second new process invokes production
`PgJobs.sweep` and `runOneJob`: the same job becomes uncertain with null actual
cost and held credit; claim=false and provider calls=0. Actual SQL asserts global
and account reservations100+100, settled0+0 and account credits29/held1. Thus no
result is fabricated, holds are preserved, and no automatic redispatch occurs.

The lease deadline is advanced by **test clock+46seconds** across the45-second
lease. This proves a real process kill/restart with controlled watchdog time;
it does not claim a46-second wall-clock outage, real provider crash, network or
paid-provider experiment. The child calls `PgJobs.sweep` directly; the runtime
`sweepJobs` wrapper delegates exactly that method. Cost-null is asserted directly;
usage remains unknown by source inspection because sweep changes only state/error/
lease fields and never supplies usage, rather than a new raw-usage assertion.

Production source is unchanged and its four dispatch/watchdog/job/lifecycle hashes
match the established final image9 manifest. New files are tests only and postdate
the image build. Detailed source/evidence SHA256 and this bounded pass's elapsed,
profile and null usage are in `evidence/worker-crash-review-1/receipt.md` beneath
RUN_ID `20261013T202009Z-expanded-cjm-9f69`. Canonical bounded-closure memory applied;
companion preflight not_applicable for source/evidence review. This closes only
the process-crash gap; earlier historical review statements remain preserved.
