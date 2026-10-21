# design — algorithms

Logical data/ports/API source: ../../Pseudocode.md (original derivation hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59; current integration binding in ../../source-versions.md). No second model list/schema.

### Algorithm: ValidateAndRenderScene
REQUIREMENT: `FR-design-1`
REQUIREMENT: `AC-design-1`
REQUIREMENT: `AC-design-2`
REALISES: SC-US-006-1, SC-US-006-2
INPUT: shell, preset/manual/provider SceneProposal, catalog. OUTPUT: valid scene/view status or 422.
0. For owner catalog registration command: GuardRequest + CAS, validate bounded positive dimensions/primitive and same-project optional product snapshot; insert new immutable ObjectDefinition ID into bounded Project.sceneCatalog. AI responses cannot enter this command; field changes require new ID.
1. Reject unknown keys, nonfinite/transformed shell, wrong shellId/hash, unknown material surface or catalogId, changed catalog dimensions, excessive objects. Material edits only change permitted material fields.
2. Manual room: compute rotated object AABBs, test inside shell and against door/window exclusion rectangles and other object boxes; report bbox_checked with explicit non-engineering limitation. GLB: skip unsupported semantic fit and mark unconfirmed, never fabricate collision clearance.
3. Viewer loads immutable geometry and adds objects/material layer; initial and design camera identical for comparison. Assert shell object transforms/hash unchanged before persist; fallback to plan/measurements on WebGL error.
COMPLEXITY: O(objects² + geometry load), ≤200 objects.


### Algorithm: ReviseAndApprove
REQUIREMENT: `FR-design-2`
REQUIREMENT: `NFR-design-1`
REQUIREMENT: `AC-design-3`
REQUIREMENT: `AC-design-4`
REQUIREMENT: `AC-design-5`
REALISES: SC-US-007-1, SC-US-007-2, SC-US-007-3
INPUT: actor, parent design, expectedVersion, proposed scene or approval. OUTPUT: new revision/approval or conflict.
1. Read owned Project + shell; validate scene outside transaction against immutable hash. Transaction locks owned Project; compare version/current shell and recheck referenced IDs in same project.
2. IF new design/style selection/history restore, insert immutable content, parentId/changeReason, state draft; supersede prior active design without editing its content. Set currentDesignId, clear currentBudgetId, increment version. Shopping view warns until current design approved, regardless of previous approval.
3. IF approval, require confirmed shell, current hash and valid scene; set approvedAt/state for that revision via conditional update and increment project version. New shell or design invalidates approval by current pointer, history retained. RETURN current snapshot.
COMPLEXITY: O(scene validation), constant short transactional writes.


### Algorithm: SubmitAndRunProposal
REQUIREMENT: `FR-design-3`
REQUIREMENT: `NFR-design-2`
REQUIREMENT: `AC-design-6`
REQUIREMENT: `AC-design-7`
REQUIREMENT: `AC-design-8`
REQUIREMENT: `AC-design-9`
REQUIREMENT: `AC-design-10`
REQUIREMENT: `AC-design-11`
REALISES: SC-US-008-1, SC-US-008-2, SC-US-008-3, SC-US-008-4, SC-US-008-5, SC-US-008-6
INPUT: actor, shell/style/reference text, idempotency key, expectedVersion. OUTPUT: job/status or capability/budget refusal.
1. Validate startup config (manual/demo/live, key/caps/rate ceiling/output limit). Live model allowlist starts with current candidate `google/gemini-4-argon`; alternatives require explicit config/eval, never silent fallback. Preview transmitted text; require explicit consent per job. No files/remote links/code execution/tools in initial provider path.
2. Transaction lock stable global spend mutex (Postgres advisory transaction lock independent of day) → Account → Project → global/account-day SpendBudget → Job, consistent in admission/release/settlement/archive; recheck owner/current shell/archive/billingHold and creditsAvailable≥1. Lookup existing key/hash BEFORE mutable eligibility/credit/cap conditions; same hash returns existing job even after success/archive/shell change, mismatched body→409. Only new keys check current eligibility. Immutable requestBody/consentHash and origin version/design are saved at admission; no worker rebuild of mutable references/catalog. Count ALL live Job admissions for UTC-day: ≥5 account or ≥20 global→429 BUDGET_EXHAUSTED before any new job; no queued defer or cheaper fallback. Calculate conservative request ceiling from complete serialized bounded text request bytes/output max + explicit rate overhead; refuse if above per-job cap. Reserve full per-job cap in BOTH ledgers considering outstanding previous-day reservations; move one credit available→held; insert queued Job with exact snapshot input.
3. Worker selects queued row using SKIP LOCKED; lease fence increments, leaseUntil set, transaction closes. Recheck config, deadline, project eligibility. Under stable spend mutex→Account→Project→budgets→Job atomically recheck fence/state/current shell/active account+project/no billingHold/expiry and set requestDispatchedAt once. This commit is dispatch authorization linearization: archive/refund before mark prevents it; after mark is in-flight. Send saved requestBody bytes only. Dispatch one bounded OpenRouter POST with strict JSON schema, require_parameters, max_tokens, no redirects, 30s timeout. Transport failure after dispatch → uncertain, keep holds; no auto retry/reclaim dispatch.
4. Parse bounded response and ValidateAndRenderScene. Transaction conditional on job fence/state: successful valid response creates DRAFT DesignRevision only if current shell still matches; otherwise fail STALE_INPUT without applying scene. Recheck active project/account/billingHold at completion; archive suppresses scene application. If same shell but origin version/design changed, append detached draft and do not replace current design/budget pointers. Record usage actual or null; reconcile reservation only with reliable total usage/cost, else retain and flag uncertain cost. Successful scene consumes held credit; definite failed scene releases credit (spent provider money still recorded).
5. Crashed lease before dispatch can requeue with max 3 lease attempts; after dispatch always uncertain. Sweep prevents forever queued jobs, releases pre-dispatch holds once. Unknown external completion/cost requires operator reconciliation, never guessed zero. Demo jobs use explicit fixture labels and no spend/credits; manual creates no job. Usage view derives own admissions/caps and held/known/unknown from Jobs/SpendBudget, distinguishes reservations from billed amounts; global readonly query is operator-only.
COMPLEXITY: O(input bytes + scene validation); indexed queue admission, bounded one external call.


#### Supporting procedure: ReconcileJob
Supports SubmitAndRunProposal and its NFR-cost-1 declaration.
REALISES: SC-US-008-4
INPUT: local operator only, jobId, expectedFence/state=uncertain, evidenceId, terminal outcome, actualMicroUSD, usage?, valid scene? OUTPUT: audited once-only settlement.
Use explicit local script with separate operator DB credentials, never public API. Require evidenceId nonempty and known nonnegative actual cost; unknown cost cannot release reservation. Lock stable mutex→Account→Project→both origin-day ledgers→Job; reject changed fence/state or conflicting repeated evidence. Settle account/global holds identically, record actual usage or null, consume credit only valid succeeded scene (detached if newer work, suppress if archived); definite failed releases held credit. Conditional transition once + audit retains evidenceId/outcome/fence without request payload. No network/redispatch. actual cost above reservation is recorded as overrun/hold and disables admission until operator raises verified safe caps; never clamp invoice to reservation.


