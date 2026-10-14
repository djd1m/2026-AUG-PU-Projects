# Independent production UI review — ui-review-1

RUN_ID: `20261013T202009Z-expanded-cjm-9f69`  
WORK_UNIT_ID: `ui-review-1`  
Project: `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign`  
Baseline: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4` plus dirty worktree manifest in `../telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/ui-review-1/start.json`.  
Profile: `compact-quality-first-v2`; requested model/effort `gpt-6-astra/high`; actual model, effort, usage and cost are unavailable (`null`).  
Launch: `2026-10-14T00:09:13.467245+00:00`; 30-minute attempt budget, 20-minute checkpoint.  
Verdict: **PASS for this bounded independent UI review. Confirmed findings corrected; full canonical journey and whole-product delivery remain coordinator gates.**.
Build: `docker:sha256:a5fc8e6e026202de422e86bad9004e48a943cc2d861120e30d10c8110a91a6d2`; Next build `oaNRtcaVQPEfmRdmeRafv`.
Launch-SHA256: `16bed34ad402e2f225f3ee07a7a37f9dca00b4d88ba98f1541f4cb50e8287201`
Finished-At: `2026-10-14T00:30:35.917810+00:00`

## Scope and method

Product source is read-only for this reviewer. Scope covers RoomEditor, SpacePanel, ReferencesPanel, DesignPanel, ProductsPanel, BudgetPanel, SharingPanel, JobsCard, BillingPanel, SceneViewport, API client, before/after compositor, CSS, and viewer implementation. The coordinator owns fixes and whole-journey E2E. This receipt does not promote backend tests into browser acceptance.

Read root/project CLAUDE, project-local rules, applicable fallback/configuration/long-job rules, model and telemetry policies, Specification, targeted scenarios, Architecture, and project-work-companion evidence contracts once. The docs-only mechanical ROUTE exited 0/tier T; substantive review retains the enclosing consequential integration checks. Canonical Russian/bilingual `dz recall` returned approval-invalidation, unknown-budget, and bounded-review lessons; these were applied without memory mutation.

No container start/restart, paid calls, live provider changes, public deployment, private credential output, or product-source writes are authorized by this review. Focus/input-preservation probes may intercept typed 422 responses locally; these establish client behavior only, not server validation.

## Findings from the first source pass

| ID | Severity / status | Evidence and user impact | Narrow correction / closure |
|---|---|---|---|
| UI-01 | Blocker, closed: build5 succeeds | `SpacePanel.tsx`, AssetUpload error paragraph referenced `errorRef` from the enclosing sibling component's inaccessible scope. `evidence/docker-build-4.txt` records TS2304 at `(20,1440)` and build exit 2. | Coordinator added AssetUpload's own ref/effect. Build5 succeeded; see `docker-build-5.txt`. |
| UI-02 | Medium, closed in source and focused browser probes | `SpacePanel.tsx` initializes `mode='manual'`; its shell effect restores only manual dimensions/openings. Saved GLB asset, anchor coordinates, measured lengths, tolerance and floor-area fields have no saved defaults. Reload therefore presents default manual dimensions; switching GLB presents empty calibration fields despite saved data. Violates saved-plan restoration in SC-US-023-1. | Restore saved mode and GLB calibration inputs on shell identity changes, preserving local input after typed failures. Verify a GLB reload with nondefault anchors/area. |
| UI-03 | Medium, closed in source and focused browser probes | `ProductsPanel.tsx` never collects/sends optional product `dimensionsM`; replacement confirmation has only generic text and ignores the server's `difference`. UI-created furniture replacements therefore cannot carry known changed dimensions, and cannot display the old/new dimensions required by SC-US-011-1. | Add optional explicit dimensions for piece goods and show selected replacement differences. Absent dimensions must remain unknown; do not invent fit. |
| UI-04 | Medium, closed in source and focused browser probes | Product picker labels `p.freshness==='fresh'` as «проверен» using the immutable snapshot field. `PgProcurement.listProducts` returns that stored value; it does not recompute context/24h freshness. A different region/store or expired snapshot therefore retains the confirmed UI label despite SC-US-009-3 and settings copy. Budget core correctly computes effective freshness separately. | Derive visible freshness from current region/store/time and the snapshot's provenance. Verify changed region and >24h snapshot. |
| UI-05 | Medium, closed by source correction; delayed-race probe not repeated | `ProductsPanel.mutate` calls `await refresh(); await load()`, where `load` captures the old `currentDesignId`. Replacement refresh launches a new-props load, but the trailing old closure can subsequently `setDesign` to the prior revision. The old design may then be displayed as the active purchase context. Server CAS/current-design guards protect persistence. | Avoid committing superseded loads; use latest current ID/request sequence or let the version effect own post-mutation load. Delayed old-design response is a bounded reproduction. |
| UI-06 | Medium cursor defect corrected; pending-intent issue adjudicated non-blocking | `JobsCard` computes `pending` for polling but does not disable the preview/submit journey while a job is queued/running. Each preview assigns a fresh idempotency key, allowing an additional intent rather than recovery of the active request. After submit, its `allPages('/jobs')` call omits `cursor`, unlike other job reads and the server contract; >50 jobs produce repeated-page failure. Manual default hides the form. | Gate new intent while pending and use the server's cursor mode consistently. Keep manual/live-off claims scoped; this finding needs no paid call. |

## Coordinator correction pass (source closure)

At 00:15 UTC the reviewer narrowly inspected the changed code: AssetUpload owns its error ref; GLB mode/asset/anchors/lengths/tolerance/area hydrate from immutable shell identity; product dimensions are parsed with existing decimal validation; native replacement confirmation shows old/new name, price and dimensions, keeping unknown dimensions explicit; picker/list use `effectiveFreshness` with current region/store/time; ProductsPanel removes the trailing stale closure, aborts superseded reads and commits its three responses together; job post-submit reads use `cursor`. This was source closure; subsequent build5 and focused browser results are recorded below.

The coordinator adjudicated UI-06 pending-new-intent as an explicit accepted design: separate UUID intents each require a fresh exact preview and consent, while retries of the same intent preserve its key and server caps apply. Root long-running-job guidance suggested disabling a duplicate request while active, but the reviewed domain permits multiple distinct consented intents. No one-active-job invariant is asserted by this review, and no further modal/pending-mode polish is requested. Cursor misuse remains the confirmed and corrected portion.

## Source observations that support the intended behavior

- Manual/demo/live and payment-off copy does not promise photorealistic output. Catalogue/Pinterest limitations are stated explicitly.
- `composeBeforeAfter` receives scene captures and a mode label only; project name, reference notes, measurements and budget data are not passed into the compositor. Server provenance/privacy protections are covered by the separate F6 review.
- `capturePair` uses one camera, detaches controls, clears inertia and renders before/after sequentially, restoring the prior mode afterwards. This is source evidence, not independent pixel/camera runtime proof.
- Native product price input uses `type=number`, `min=0`, `step=0.01`; conversion calls `rubToMinor`. The limit is controlled and recalculates comparison each render, with incomplete budgets explicitly uncertain.
- Manual dimensions, reference error drafts, and budget inputs use preserved state; plan/reference/budget error paragraphs have focus hooks. Focused browser verification passed as detailed below.
- Manual WebGL failure renders a 2D plan and an explicit failure message. Design inputs remain outside the viewer. GLB fallback explicitly avoids claiming an extracted wall plan.

## Browser evidence and practical limits

Ready preflights `preflight.json`, `preflight-2.json`, and `preflight-3.json` bind unchanged source hashes, exact image5/Next build, ready HTTP 200, local synthetic fixture and command. Credentials stayed in private `.runtime` files; none are copied here. Reviewer context blocked non-origin egress and intercepted design-view telemetry and form writes. Only local login sessions and GET reads reached the application. No product mutation, restart, paid call or external publication was performed.

| Evidence | Result |
|---|---|
| `browser-results.json`, attempt1 | Driver failed before project reads: exact password label omitted helper text. Corrected to prefix label. Preserved failure; no app defect. |
| `browser-results-2.json`, attempt2 | Saved manual dimensions PASS. Driver focus assertion then matched both the intended error and Next's hidden route announcer. Narrowed role+text selector; preserved failure. |
| `browser-results-3.json`, attempt3 | Exit 0, 20/20 focused checks PASS. Successful unchanged manual-restore assertion from attempt2 was not repeated. |
| `design-1440-3.png`, `design-390-3.png`, `webgl-fallback-390-3.png` | Independently opened and visually inspected. Responsive cards/steps remain within the viewport; manual mode and unavailable-3D messages are explicit; fallback plan and editor remain usable. |

Coverage: actual Tab traversal and Enter activation of all six step buttons at 1440px and 390px; visible focus; `document.scrollWidth <= innerWidth` on all twelve states; intercepted typed-422 errors preserve plan/reference/budget input and receive focus; saved manual dimensions, GLB asset/first anchor/measured length, budget reserve/limit restore from real persisted fixtures; a native 1600 RUB submit produces exactly 160000 minor units and all three optional product dimensions; an intercepted read response retaining `fresh` but dated >24h old is visibly stale; forced WebGL initialization failure leaves a manual 2D plan and enabled save action.

The typed-error and stale-date probes are explicitly client fixtures, not claims of server rejection or persisted stale data. Native product submit was captured and rejected locally without creating a product. The GLB fixture used the production parser and persisted calibration prepared by the coordinator; this review verified its first-anchor/source restoration, while remaining saved defaults were inspected in source. The manual fixture has no furniture objects; fallback object-editor placement was source-reviewed, not tested with a nonempty object list.

SC-US-018-1 is supported for step navigation and the tested form submits, not a claim that this reviewer repeated every create/export/share/revoke action using only the keyboard. SC-US-022-1 passes the forced manual-viewer failure scope. SC-US-023-1 passes the observed manual/GLB/budget restoration and typed-error client behavior; persisted reference round-trip belongs to the coordinator's full journey. Actual replacement persistence/approval invalidation, same-camera export pixels, sharing/revocation/privacy, and complete-limit arithmetic remain bound to that standalone E2E and prior backend evidence. UI-05 was closed by eliminating the old closure and aborting superseded reads; this review does not invent an observed pre-fix race or a delayed-response runtime pass. No WCAG certification, photorealism, actual paid AI or live payment success is claimed.

## Delivery and telemetry

Review changes are confined to this report and fresh evidence under `docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/ui-review-1/`. `start.json` preserves initial source identity; `source-closure.json` records the narrow corrections and image config digest; `finish.json` records measured elapsed time, retries and unavailable model/usage/cost fields.

Elapsed including instructions, coordination, fixture wait and two driver corrections: **21.37 minutes**. Active time is unavailable because a complete classified wait ledger was not captured. Requested model/effort `gpt-6-astra/high`; actual model/effort/tokens/cost `null`, unavailable from host metadata. Two driver corrections; no model switch or optional full review repeat. Savings are not established.

Status: completed
