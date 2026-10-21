# UI furniture replacement closure — ui-replacement-1

RUN_ID: `20261013T202009Z-expanded-cjm-9f69`  
WORK_UNIT_ID: `ui-replacement-1`  
Profile: `compact-quality-first-v2`; requested `gpt-6-astra/high`; actual model/effort/usage/cost unavailable (`null`).  
Image: `docker:sha256:a870f8779ea77c2aaad8aadbc6b67f97a71c6f2f2c797e965927b9297c4fbace`  
Next build: `wfhm1wAXdEYLGdlYzhuhc`  
Source manifest: `../telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/ui-replacement-1/launch.json`; final drift: none.  
Launch-SHA256: `5693d0dfb7aaf1f637b307a745c640e72d7a10a903b9a7d63de4f9ef5fbe7602`  
Finished-At: `2026-10-14T01:11:06.105348+00:00`  
Verdict: **PASS — actual UI furniture replacement, explicit reapproval and budget/history invariants.**

## Bounded scope and authorization

This is the requested final composition closure for F4/SC-US-011-1 and SC-US-011-3, not a repeat of the prior 21-check UI review. Existing root/project instructions and policies remain applied. Canonical `dz recall` returned the unknown-budget and design-reapproval lessons; both guided assertions. The explicit-file mechanical route was S/exit0; substantive scope is a focused E2E extension within the already accepted consequential feature. No product source was changed.

The script reuses `productBody` and `budgetBody` from `tests/procurement/db-fixture.ts`; the actual public API invokes production PgDesigns, scene validation and procurement repositories. Only a newly created synthetic project under the preauthorized synthetic owner is mutated. Prior reviewer/manual/GLB fixtures are untouched. Browser non-origin traffic is aborted. Credentials remain in the existing private `.runtime/ui-review-owner-2.json`; they are neither printed nor copied to evidence. No live provider call, payment, public deployment or container restart occurred.

## Exact evidence

Command `node scripts/e2e-replacement.mjs 1` exited **0** on the final image6. Ready preflight records HTTP200, source hashes, image/Next identity, allowed fixture effects and command before browser execution. Five named steps in `evidence/ui-replacement-1/result-1.json` all passed:

1. Existing synthetic owner logs in to the final production app.
2. Production API creates an isolated 4.5×4×2.7m manual shell, a measured box furniture object 0.5×0.8×0.5m, approved design, and two manual snapshots: **2000 ₽ / 0.5×0.8×0.5m** and **2500 ₽ / 0.6×0.8×0.5m**. The floor is explicitly retained with a reason. Known work1000 ₽, delivery500 ₽ and reserve10% yield a complete **3850 ₽** original budget (literal385000 minor units).
3. Actual ProductsPanel selection and keyboard submit open the native replacement confirmation. The captured text explicitly shows old→new names, prices and dimensions. After acceptance, the real PATCH returns `approvalRequired=true`, `recalculateRequired=true`, `dimensionsChanged=true`. The current design pointer changes to a new draft with `approvedAt=null`, parent=original design, new0.6m width; `currentBudgetId=null`. The UI displays the reapproval warning and new product.
4. An independent API read confirms the original scene remains byte-for-byte structurally equal; its status becomes superseded while historical approval time is retained. The entire original BudgetRevision DTO is unchanged.
5. Actual DesignPanel keyboard submit explicitly approves the new variant; BudgetPanel keyboard submit records the replacement reason and calculates **4400 ₽** (literal440000 minor units). The current pointers select that approved design/new budget, and history contains exactly two budgets with the original DTO still unchanged.

There were **zero browser page errors and zero attempted external destinations**. No intercepted replacement response or local mocked domain result is used: the full replacement writes and invariant reads exercised the actual server. Fixture setup used API calls; the consequential replace/approve/recalculate actions used production UI controls. `replacement-draft-1.png` and `replacement-budget-1.png` were independently opened and visually inspected.

`node --check scripts/e2e-replacement.mjs` and `npx --no-install eslint scripts/e2e-replacement.mjs --max-warnings 0` exited0. Broader unchanged suites and builds were not rerun; the coordinator owns their final gates. There was one attempt, no retry and no discovered product defect.

## Delivery and measurement

Owned additions: `scripts/e2e-replacement.mjs`, this receipt, and fresh `evidence/ui-replacement-1/` artifacts. Runtime fixture project ID is recorded in `result-1.json`; no preexisting project was modified.

Elapsed from the first observed task clock01:06:09UTC through receipt: **4.95 minutes**, including recall, source inspection, preparation, browser execution and handoff. The launch record was created after preparatory reads; elapsed deliberately includes that earlier measured interval. Active time, actual host model/effort, token usage and cost remain unavailable rather than estimated. No savings claim.

Coordinator handoff: image7 is being rebuilt for a native Sharp export-adapter correction outside this replacement scope. The coordinator explicitly directed that unchanged replacement checks not be repeated. This receipt remains bound to actual image6; it makes no image7 execution claim. The overall final-source handoff must preserve this scope distinction.

Status: completed
