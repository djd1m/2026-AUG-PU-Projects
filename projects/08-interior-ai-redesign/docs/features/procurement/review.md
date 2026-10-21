# Procurement independent review and anti-drift
Reviewer family: codex
Spec revision: sha256:3ce7a6bdce65f2f76addcf6577b56376e69d9b9e4f9d583ce04bbb954b5f51f1
Run: 20261013T220722Z-procurement-5834
Work unit / attempt: procurement-review-1 / procurement-review-1
Source baseline: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4
Source manifest: sha256:18e3d79020ac404a937b7c888510643f94c9bc524242ed931f9a498fe4360ad5
Implementation receipt: sha256:8d666f9d445da968a31d417cb20117a6102727fd96bf01c486937f78b86ea422
Launch receipt: sha256:d5f981c497378c8a80ed545b37adcfd897e0e0f353661238aec68c34d859561a
Profile: compact-quality-first-v2; risk M with money/quantity integrity review
Requested model / effort: gpt-6-astra / high
Actual model / effort / usage / cost: null (host metadata and counters unavailable)
Fallback: null (no observed fallback; requested model is not evidence of actual routing)
Started: 2026-10-13T23:17:47.630448+00:00
Scope: read-only production/source review; sole project artifact written is this receipt.
Verdict: changes required in the procurement core; UI and integrated delivery gates remain pending.

## Evidence and limits

All 22 implementation-receipt file hashes matched before review probes. Requirements, pseudocode, architecture, refinement, root/project instructions, four project-local rules, model/telemetry policy and review/companion skills were read. The reviewer used direct technical criticism without a findings quota. Canonical repository `dz recall 'смета товары неизвестная стоимость подтверждение замена закупки'` returned the existing unknown-budget and design-reapproval lessons; no memory was changed.

Independent command `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/procurement` exited 0: 3 files, 19 tests passed, start 23:19:01 UTC, measured runner duration 3.14 s. These tests pass despite the defects below. The author receipt records a broader 99-test run before later procurement changes, then 19 affected tests, lint/typecheck/build and two actual mutations; this review does not promote the earlier 99-test result to a final-source full-suite claim or rerun unchanged successful build gates.

Independent probes used fresh PostgreSQL schemas through the existing test helper and pure production functions. No application source, fixture, migration, provider configuration, database service/container or historical record was edited. No provider fetch, paid call, browser E2E, public publishing or restart check was performed. Companion E2E preflight is `not_applicable`: these are in-process HTTP/repository/pure checks. Browser journey, restart/recovery, complete foreign-entity matrix and final integrated gates remain coordinator work.

## Spec conformance

These verdicts cover the reviewed core unless the criterion explicitly requires browser behavior. A core `met` is not a claim that the product UI or whole journey is accepted. Each acceptance criterion has one verdict below; literal test titles are included to distinguish test names from actual negative-oracle evidence.

| Criterion | Verdict | Exact evidence and limitation |
|---|---|---|
| AC-procurement-1 | met | `repository.ts:21`, `rows.ts:6`, `http.test.ts:13`, title `round-trips camelCase product DTO and blocked manual refresh with guard before body`; `calculator.test.ts:7`, title `AC-procurement-1/4 records provenance and calculates exact pack boundary`. Immutable manual provenance reaches the calculation DTO. UI display remains pending. |
| AC-procurement-2 | met | `packages/adapters/src/catalogue.ts:9`, `server/procurement.ts:11`, same HTTP title at `http.test.ts:13`: blocked/manualRequired, null fetched price, existing snapshot preserved; no runtime fetch exists. |
| AC-procurement-3 | met | `calculator.ts:8`, `repository.test.ts:9`, title `AC-procurement-3 preserves old snapshots and invalidates effective context after region change`; `calculator.test.ts:9`, title `AC-procurement-2/3 blocks refresh evidence and makes context mismatch, TTL and future stale`. Region/store/24h/future evidence checked. |
| AC-procurement-4 | not met | Literal 18 × 1.08 / 1.99 gives 10 packs in `calculator.test.ts:7`; `:8`, title `AC-procurement-4 ceils a value just above the pack boundary without float rounding`, also passes. However accepted inputs undercount another exact boundary: PR-01 below, `calculator.ts:33`. |
| AC-procurement-5 | met | `calculator.ts:27,33,42,44–47`; `calculator.test.ts:10` title `AC-procurement-5 keeps unmatched expected elements and unknown service/delivery scope`, and `:11` title `AC-procurement-5 keeps null pack coverage visible and unknown instead of inventing a quantity`. Whole-budget missing scope stays incomplete/null. Phase-local presentation still has PR-08. |
| AC-procurement-6 | not met | `calculator.test.ts:12`, title `AC-procurement-6 rejects incompatible units and overflow without mutating input`, covers only one unit mismatch and total overflow. PR-02 accepts a per-line overflow and area units for an object; PR-07 turns zero coverage into 503 rather than 422. |
| AC-procurement-7 | met | `calculator.ts:15–24`, `calculator.test.ts:13`, title `AC-procurement-7 derives named wall minus all openings and leaves GLB area unknown`: 9.35 m² literal result and GLB unknown confirmed. Floor case 18 m² is asserted at `:7`. Confirmation later cannot currently be edited; PR-04. |
| AC-procurement-8 | met | Immutable SQL trigger `001-initial.sql:121`; stored line copies in `repository.ts:32`; `repository.test.ts:7` title `AC-procurement-1/8/13 commits exact revisions and reproduces old budget after mutable line changes`. `calculator.test.ts:14`, title `AC-procurement-8 reproduces an immutable result without current rows`, calls a stored-result projection, not a second arithmetic implementation. It verifies retrieval/projection, not independent recomputation. |
| AC-procurement-9 | not met | `calculator.test.ts:15`, title `AC-procurement-9/10 separates known/scenario and compares a limit only for complete scope`, validates totals/limit. PR-03 proves edit/recalculate loses parent and delta, reserve-only delta is empty; PR-04 prevents quantity/waste edits altogether. |
| AC-procurement-10 | not met | No procurement input UI was in the 22-file implementation or current component search. `calculator.test.ts:15` only calls the pure function; it cannot establish native 1600 RUB input validity, exact UI minor conversion, controlled limit rerender or submit behavior. Explicitly pending coordinator UI/browser work. |
| AC-procurement-11 | met | `repository.ts:28–29`, `repository.test.ts:11`, title `AC-procurement-11/14 requires explicit substitution confirmation, validates fit, creates a draft and preserves history`: existing matched object replacement creates new catalog/design IDs, draft state, no approval, cloned lines and explicit recalc/reapprove flags. The separate unmatched-to-matched transition is broken (PR-05). |
| AC-procurement-12 | met | `repository.ts:25–27`, `repository.test.ts:7` checks complete-current-budget preview; `calculator.test.ts:16`, title `AC-procurement-12 partitions phase movement once and preserves grand total`. `repository.test.ts:10`, title `AC-procurement-12 enforces line CAS and unique design element without duplicate rows`, is sequential; independent transaction probe adds actual concurrent winner/409 evidence. Saved budget remains immutable/outdated. |
| AC-procurement-13 | met | `repository.test.ts:7` and `:11` titles above establish preserved old budget/design, explicit reason and draft replacement without old approval. Source `repository.ts:29,32` stores new revisions. Whole UI return-to-design journey is still unverified; broken recalculation comparison is separately covered by PR-03. |
| AC-procurement-14 | met | `repository.test.ts:11` proves unconfirmed replacement 409 and unchanged pointers; despite its title it does not test a bad fit. Independent `/tmp/procurement-review-transactions.mts` adds 100×100×100 replacement → 422 SCENE_INVALID with original design/version unchanged. Actual `validateScene` checks room bounds, opening clearance and rotated bounding boxes. |
| AC-procurement-15 | not met | `calculator.test.ts:17`, title `AC-procurement-15 exports immutable provenance and neutralizes leading-whitespace formulas/newlines/quotes`, and `http.test.ts:14`, title `exports the owned immutable revision with private download headers and foreign 404`, prove text neutralization/ownership/headers. PR-06 proves work/delivery/reserve amounts are serialized into the wrong column and totals are absent. |

Core criterion count: 10 met, 5 not met, 0 unverifiable under the explicitly bounded core interpretation. This is not a feature-delivery count: UI and mandatory integration gates are pending.

## Anti-drift

Forward trace: product provenance → immutable snapshots; quantity/unknown/reserve → calculator; history/phase/replacement → repository; owner export → guarded HTTP and CSV. Reverse trace: all 22 delivered files serve these declared capabilities; no retail fetch/crawler, additional service, payment path or public budget share was introduced. Provider inability is accurately represented as blocked/manual-required. The API uses `POST products/:snapshotId/refresh`, camelCase DTOs, `expectedLineVersion`, `phasePreview`, `reason` input and `/budgets/:budgetId/export`, consistent with the current source tables. Parent future UI must use these actual fields.

The forward test trace is incomplete despite the implementation receipt's “all 15 … covered” sentence. A pure calculator test cannot certify a native form; the fit test title does not exercise an invalid fit; the CAS test is sequential; the CSV test only checks text/header substrings; the overflow test misses the line bound; the tiny boundary test misses intermediate-precision loss. None of these names is an adequate negative oracle for its entire claimed frame. Findings below use production code, literal expected results and actual PG/HTTP outcomes.

### PR-01 — HIGH — Decimal precision changes exact packaging

Location: `packages/domain/src/procurement/calculator.ts:5,33`.

Both public schemas accept manual quantity `1.000000000001`, waste `0.000001` percent, and pack coverage `1.000000010001`. Exact need is `1.00000001000100000001`; it is greater than one pack, so the literal expected count is **2**. Actual result is **1** pack / 160000 minor. Decimal's default 20 significant digits discard the positive tail before `ceil`. The existing ceil→floor mutation and simple boundary test do not catch this class.

Recommendation: use a locally cloned Decimal constructor with enough precision for all declared quantity/percentage/coverage bounds, or exact scaled-integer rational arithmetic. Do not alter the global Decimal configuration. Add the literal two-pack oracle and retain the original 18 m²/boundary guards.

Reproduction (from project root):

```sh
node --import tsx --input-type=module <<'JS'
import {baseContext} from './tests/procurement/fixture.ts';
import {calculateBudget} from './packages/domain/src/procurement/index.ts';
const c=baseContext();
c.lines[0].quantitySource='manual';
c.lines[0].baseQuantity='1.000000000001';
c.lines[0].wastePct='0.000001';
c.snapshots.values().next().value.coverage='1.000000010001';
console.log(calculateBudget(c).linesSnapshot[0].packs); // actual 1; expected 2
JS
```

### PR-02 — HIGH — Numeric/unit boundary is weaker than the source contract

Locations: `calculator.ts:20–35`; normative `docs/Specification.md:163` and feature pseudocode CalculateBudget step 1.

A valid unit price 200000000000 and ten packs produce `lineMinor=2000000000000`, exceeding the stated **10^12 per-line** bound without rejection. Code compares the line amount against **10^14**, the aggregate bound. Separately an object element with manual confirmed quantity can use an m²/pack product and produce `complete=true`; code checks sale/base consistency but never checks whether the element is an object. The declared rule requires piece/piece for objects.

Recommendation: enforce a distinct per-line cap before aggregation and validate the element-kind/unit matrix before calculating. Add accepted-boundary and just-over-boundary tests, plus object+m² negative coverage. Probe evidence: `line-money-limit` in `/tmp/procurement-review-probes.mts`; `objectWithAreaUnit` in `/tmp/procurement-review-units.mts`.

### PR-03 — HIGH — Editing a line disconnects the next budget from its comparison

Locations: `packages/db/src/procurement/repository.ts:17,24–26,29,32`; `calculator.ts:40`.

Actual sequence: create complete budget → phase PATCH (clears current budget pointer) → explicit recalculate. The second budget has `parentId=null` and `delta=[]`, although the saved first budget contains the same element in another phase. Price/replacement/design changes also clear the only pointer used to locate previous input. Even when `previous` is provided directly, changing only reserve from 10% to 20% yields empty delta because reserve inputs are excluded from `deltas`.

Recommendation: distinguish historical comparison predecessor from current-valid-budget pointer; select a deterministic owned predecessor under the project lock, or carry an explicit owned previous budget ID. Include reserve/configuration changes in meaningful delta records alongside stable element/cost/unit changes. Preserve the required current-pointer invalidation. Add DB edit→recalculate parent/delta test and reserve-only literal delta test.

### PR-04 — HIGH — Existing quantities cannot be corrected or confirmed

Locations: `packages/domain/src/procurement/schemas.ts:15`; `repository.ts:25–26`.

PATCH accepts only phase, selection, retained reason, snapshot and confirmation. `linePatchShape.safeParse({baseQuantity:'2',expectedLineVersion:1}).success` is false. The unique `(project,design,element)` constraint prevents replacing a line via a second create. Thus an existing manual/GLB unknown quantity cannot later acquire quantityConfirmed/sourceShellId, and an entered quantity/waste cannot be revised through the accepted API. This blocks the specified quantity-change→recalculation flow.

Recommendation: extend the guarded CAS patch with the declared editable quantity basis/confirmation/quantity/waste fields, validate shell ownership/unit compatibility, invalidate the current budget, and retain previous immutable inputs. Add an unknown→confirmed and quantity→new-total workflow test. This is a code fix within accepted scope, not a reason to remove the scenario from the specification.

### PR-05 — HIGH — Replacement silently drops the requested selection

Locations: `repository.ts:25,28–29`.

Actual request on an existing unmatched line: `{snapshotId:<owned product>,selection:'matched',confirmReplacement:true,expectedLineVersion:1}`. Response contains the new snapshot ID but `selection:'unmatched'`. `patchLine` branches to replacement before applying fields; the clone SQL copies old `selection`, retained reason and phase. The chosen item stays unknown/excluded and combined phase changes are silently discarded.

Recommendation: define and apply the complete requested next-line state transactionally, or reject unsupported combinations explicitly before mutation. Linking an unmatched element must result in a matched line; do not silently acknowledge a different operation. Preserve mandatory design reapproval for appearance/dimension changes. Add the exact unmatched→matched and combined-field cases.

### PR-06 — HIGH — CSV exports non-product money under the wrong header

Locations: `packages/domain/src/procurement/csv.ts:5,7–8`.

For a confirmed work row of 100000 minor, parsed CSV maps `price_rub='1000.00'` and `amount_rub=''`. Delivery and reserve use the same wrong position. `confirmed`/`estimate` cost kind lands in the product `freshness` column. A consumer summing `amount_rub` omits every service, delivery and reserve amount. The export also has no known/scenario grand-total rows to preserve the specified totals explicitly.

Recommendation: build rows by named columns or correct their explicit indices; encode service/delivery/reserve amounts in `amount_rub`, cost kind in a clear named field, and export the snapshot totals/unknown state. Add CSV parsing assertions against an immutable revision containing known, estimated, unknown, retained, service, delivery and reserve rows; substring escaping tests alone are insufficient. Keep existing quote/newline/formula defenses and private headers.

### PR-07 — MEDIUM — Expected input/ownership failures become service outages

Locations: `repository.ts:21,24,28–29`; `schemas.ts:5,11`; `apps/web/src/server/http.ts:72–75`.

Actual HTTP probes: line `sourceShellId` from another project → raw PG 23503 → **503 UNAVAILABLE**, expected indistinguishable 404; product `coverage:'0'` passes Zod → raw PG 23514 → **503**, expected 422. At 100 catalog entries, replacement is correctly rolled back by the project CHECK but returns raw 23514/503 rather than the domain capacity response. No cross-project write or catalog-overflow persistence occurred; the relational defenses work.

Recommendation: verify non-null source-shell ownership before INSERT; require strictly positive known coverage; check catalog capacity under the lock before appending. Assert the correct statuses and unchanged rows/pointers. Avoid broad PG-error mapping that could conceal unrelated defects.

### PR-08 — MEDIUM — Later known row erases an unknown phase subtotal

Location: `calculator.ts:44`.

Add unmatched `a-unmatched` before the resolved floor in the same finishing phase. Result: `{knownMinor:1600000,scenarioMinor:1600000,unresolvedCount:1}`. The unknown row sets scenarioMinor to null; the later resolved row uses `scenarioMinor ?? 0` and restores a number. Whole-budget scenario remains null, but the phase display presents an apparently priced scenario despite an unresolved row.

Recommendation: keep phase scenario null once any unresolved row occurs, regardless of sorting. Add the same inputs in both relevant sort orders and assert null plus the known subtotal. This preserves known/unknown separation rather than hiding the known part.

## Probe commands and dispositions

Project root for every command: `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign`.

| Probe | Command / SHA-256 | Observed disposition |
|---|---|---|
| Boundary/history/CSV transitions | `node --env-file=.runtime/test.env --import tsx /tmp/procurement-review-probes.mts`; SHA `548e51d6e22ccc9206c08e62c7e10cce9eb74eebd89b1b92c832b9b4bd5b2257` | Exit 0, eight diagnostic observations, defects reproduced; exit 0 is harness completion, not acceptance. |
| Unit and editable-quantity contract | `node --import tsx /tmp/procurement-review-units.mts`; SHA `7ae8001d7ed5bd171bcb078dd4fe6b1228c4d43b8a4d04fc73610960f231dca3` | Exit 0, two diagnostic observations, defects reproduced. |
| Transactions and HTTP | `node --env-file=.runtime/test.env --import tsx /tmp/procurement-review-transactions.mts`; SHA `4b2a4c7aff5290aa0437d80f3675f6ad445b787d145bd3ccf6de24d1f99067ee` | Final exit 0, five observations. Invalid fit rejected422 with unchanged pointer/version; actual concurrent same-version commands give one success and one409; foreign-shell/coverage become503; catalog cap holds at100 but emits raw23514. Initial harness run exited1 because catalog error was uncaught; only the temporary diagnostic catch was corrected, then rerun. |
| Exact decimal multiplication | Inlined PR-01 command plus explicit `productInputShape` and `lineInputShape` checks on the same inputs | Both schemas true; actual1, literal expected2. An earlier exploratory waste below the schema's supported canonical decimal range was excluded from evidence. |

The three `/tmp` scripts are temporary reproducibility aids, not committed tests or delivery artifacts. Findings include exact inputs/outcomes above so they remain actionable after temporary-file removal. No further broad review or new validator is requested.

## Integration decision and closure boundary

Core acceptance is **blocked by PR-01 through PR-08**. Owner-authorized autonomous implementation permits the coordinator to correct code or, for an actual source contradiction, amend source with an explicit before/after decision. These findings favor code corrections; do not weaken numeric limits, native-input behavior, ownership status or unknown-cost rules to make existing tests green. Log finding IDs, decisions, changed source hashes and affected checks. After concrete corrections, perform one narrow author-separated closure over these findings and affected tests.

The author receipt's claim that all 15 criteria are covered must be qualified: the native UI criterion is unimplemented, and test titles overstate several negative frames. Preserve the receipt as evidence of that original source state; append coordinator disposition rather than rewriting historical claims. Root-owned UI, controlled RUB/limit behavior, whole journey/restart and the final cross-owner/entity matrix are pending accepted-scope work. This review does not wait for those artifacts and cannot certify them in advance.

Confirmed findings: 6 high, 2 medium, 0 critical. No findings were fabricated to meet a quota. Rejected suspicion: catalog overflow persistence is prevented by the existing DB CHECK; only error classification is a finding. Unknown known-defects-missed/regression counts remain null. No claim of model savings is possible without measured usage/baseline.

Completed: 2026-10-13T23:25:40.107361+00:00
Measured elapsed from prelaunch allocation: 472.476913 seconds. Active wall time: null (no separately measured wait intervals). 25-minute checkpoint and 40-minute stop budget were not reached.
Telemetry owner: coordinator; passport `docs/telemetry/p-replicator/20261013T220722Z-procurement-5834/run.json`. Final report digest is computed externally after terminal write; no self-referential digest.

Status: completed

## Narrow independent closure — procurement-review-closure-1

This append-only closure supersedes the original core verdict for the corrected source identified below. The original review bytes and original findings remain intact above. No full-project research, new product implementation, global configuration change or optional polish was performed.

Run: `20261013T220722Z-procurement-5834`; work unit / attempt: `procurement-review-closure-1`. Requested model/effort: `gpt-6-astra` / high; actual model/effort, tokens, cost and fallback evidence remain null because the host exposes no confirming metadata. Profile remains `compact-quality-first-v2`. The fresh launch record was allocated at `2026-10-13T23:46:07.950989+00:00`. The existing repository memory lessons were recalled once; no memory or historical telemetry was changed.

Input correction receipt SHA-256: `b0f7ecf3fa4282e42dd0990f958735ac3f5aee4d869a559a4835c777ae1090a5`. Prior review SHA-256: `411d6c1aea34c7355279afbab4baf5f3c52274e642a176ce14c4bf2f1df5f68a`. All **7/7** corrected source/test files matched the correction receipt's final hashes before testing. Its original receipt and the three original `/tmp` diagnostic scripts were preserved unchanged.

### Closure results

**PR-01 through PR-08 are closed: 8/8.** No original high or medium finding remains open on this candidate. This accepts the bounded procurement core corrections; browser UI, whole journey, restart/recovery and final integration/performance gates are still pending and are not certified by this closure.

| Finding | Disposition | Inspected correction and independent evidence |
|---|---|---|
| PR-01 | closed | `calculator.ts:6,36`, `schemas.ts:5`: local Decimal clones, precision80; no global mutation. `calculator.test.ts:9`, exact title `PR-01 preserves the accepted positive tail before exact pack ceil`, and the independent original input now yield literal **2** packs / 320000 minor. |
| PR-02 | closed | `calculator.ts:4,33,38`: 10^12 line cap distinct from 10^14 aggregate cap, piece/piece object matrix. `calculator.test.ts:14`, title `PR-02 enforces the line-money boundary and piece-only object matrix`, and independent probes verify line overflow422 and object+m²422. Exact accepted line boundary remains covered. |
| PR-03 | closed | `repository.ts:18,33` loads deterministic owned historical predecessor independently of current pointer; `calculator.ts:43` includes reserve/limit keys. `repository.test.ts:8` asserts parent and `line:floor` delta after phase edit/recalculation; `calculator.test.ts:18`, title `PR-03 records reserve-only configuration delta`, plus independent literal10→20 reserve delta pass. |
| PR-04 | closed | `schemas.ts:16`, `repository.ts:26–28` permit quantity source/shell/confirmation/base/waste under CAS. `repository.test.ts:9`, title `PR-04 confirms and revises quantity through line CAS, preview and immutable recalculation history`, passes. The independent probe additionally crosses a pack boundary with manual20/waste0: 10→11 packs, 1760000 minor, predecessor preserved and original budget still10 packs. |
| PR-05 | closed | `repository.ts:26,29–30` builds the requested next state and writes it into the new draft target line. `repository.test.ts:14`, title `PR-05 applies matched selection and combined line fields to the replacement draft`, and independent unmatched→matched plus phase/quantity request preserve every checked field and require reapproval/recalculation. |
| PR-06 | closed | `csv.ts:9,19–26` uses named columns, explicit cost_kind, amount_rub and total rows. `calculator.test.ts:22`, title `PR-06 places scope and reserve money in amount_rub and exports immutable totals`, and parsed independent export verify work1000.00, reserve1750.00, scenario19250.00 under the correct headers. Existing quote/newline/formula and owner-export protections remain green. |
| PR-07 | closed | `repository.ts:15,25–26,29` checks owned shells/catalog capacity before writes; `schemas.ts:12` requires positive known coverage. Tests titled `PR-07 rejects foreign shells and zero coverage before writes with typed statuses`, `PR-07 returns catalog capacity conflict before substitution SQL and preserves state`, and `PR-07 maps zero coverage to 422 and foreign source shell to private 404 without mutation` pass. The unchanged original transaction probe now observes actual foreign-shell HTTP404, coverage HTTP422 and capacity409/CATALOG_LIMIT with100 entries preserved. |
| PR-08 | closed | `calculator.ts:47` never restores a null phase scenario while adding known amounts. `calculator.test.ts:20`, title `PR-08 keeps a phase scenario unknown in either stable-id ordering`, and independent a-/z-unmatched fixtures both give known1600000, scenario null, unresolved1. |

### Checks actually executed in closure

1. `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/procurement` — exit0, **3 files / 30 tests passed**; started `23:46:33 UTC`, runner duration **5.04 s**. Run once against this corrected source. This is not a whole-repository final-suite claim.
2. `node --env-file=.runtime/test.env --import tsx /tmp/procurement-review-closure-probes.mts` — exit0. Ten named groups cover all eight original findings, exact UI conversion seam and the 200-line arithmetic/golden check. Script SHA-256 `5efa97ea40b3a3f9f95cc880267f0f8eedcfe99ecea4656b8d063e58851acda7`.
3. `node --env-file=.runtime/test.env --import tsx /tmp/procurement-review-transactions.mts` — exit0, unchanged original SHA `4b2a4c7aff5290aa0437d80f3675f6ad445b787d145bd3ccf6de24d1f99067ee`. Five observations: bad-fit422 with unchanged pointer/version; one concurrent update succeeds and the other returns409; foreign-shell404; zero-coverage422; catalog-cap409 with100 entries retained.

The new closure probe reuses the original inputs but changes the oracle to the required corrected literal behavior. In particular, original line-overflow and object-unit probes previously printed accepted values; closure now explicitly expects422, allowing subsequent checks to run. The original defect scripts remain untouched with SHA `548e51d6e22ccc9206c08e62c7e10cce9eb74eebd89b1b92c832b9b4bd5b2257` and `7ae8001d7ed5bd171bcb078dd4fe6b1228c4d43b8a4d04fc73610960f231dca3`. No acceptance oracle was weakened.

The 200-line production fixture independently matches literal **known67590000**, **reserve6759000**, **scenario74349000**, unresolved0, complete=true and SHA-256 `68cc701bbef68ae50b85aee1eaccc0511a3e6f629ccd82f1b8dfee4bacc3108c`. Arithmetic: 100 material rows17440000 + 100 object rows50000000 + explicit service/delivery150000 =67590000; reserve10%=6759000. This closure checks arithmetic and identity, not timing. The author's corrected-source benchmark reports p95 8.333744ms over1000 samples after50 warm-ups, but no new performance/browser claim is made here. Author lint/build/typecheck and precision80→20 red mutation remain attributed to `correction-receipt.md` and were not unnecessarily repeated.

### Updated acceptance dispositions

These are updated dispositions for this candidate; the original table remains a historical review of the earlier source. Unchanged core criteria retain their cited original evidence and were rerun in the30-test suite. User-visible whole-journey evidence remains a separate delivery gate.

| Criterion | Updated verdict | Evidence |
|---|---|---|
| AC-procurement-1 | met (core) | Original provenance/immutable snapshot tests remain green; source unchanged. |
| AC-procurement-2 | met (core) | Blocked/manual-required HTTP test remains green; no provider fetching added. |
| AC-procurement-3 | met (core) | Region/store/TTL/future/immutable history tests remain green. |
| AC-procurement-4 | met (core) | Original10-pack/boundary tests and PR-01 exact two-pack regression pass. |
| AC-procurement-5 | met (core) | Unknown scope and null coverage remain incomplete; PR-08 now preserves phase unknownness too. |
| AC-procurement-6 | met (core) | Original invalid input tests plus PR-02 line/unit and PR-07 typed422/404 boundaries pass. |
| AC-procurement-7 | met (core) | Floor18/wall9.35/GLB-unknown tests pass; PR-04 now supports later explicit quantity confirmation. |
| AC-procurement-8 | met (core) | Stored immutable budget retrieval/projection and independent original-budget-after-edit checks pass; not a claim of a second calculation engine. |
| AC-procurement-9 | met (core) | Known/scenario/limit tests and corrected quantity, phase, parent and reserve delta workflows pass. |
| AC-procurement-10 | unverifiable (browser gate pending) | UI now exists. `ProductsPanel.tsx:16` has native price min0/step0.01; `BudgetPanel.tsx:9,12–15` uses controlled limit state and immediate comparison; `commerce-ui.ts` calls rubToMinor. `calculator.test.ts:23`, title `PR-UI converts native RUB input to exact minor units`, and independent conversion prove1600→160000. Actual browser validity, submit and rerender have not been run by this reviewer. |
| AC-procurement-11 | met (core) | Matched-object replacement test and PR-05 full next-line state preserve draft/reapproval behavior. |
| AC-procurement-12 | met (core) | Phase partition/preview tests and unchanged original concurrent CAS probe pass. |
| AC-procurement-13 | met (core) | Old budgets/designs and new change reasons persist; PR-03 reconnects historical parent/delta. Browser return journey remains pending. |
| AC-procurement-14 | met (core) | Missing confirmation409 and independent bad-fit422 preserve pointers/version. |
| AC-procurement-15 | met (core) | Correct named CSV amounts/totals plus unchanged escaping, owner404 and private headers verified. |

Updated bounded count: **14 core met, 0 not met, 1 browser criterion unverifiable**. Native UI source was read only for the previously missing criterion: BudgetPanel SHA `bf523aa75e90a2a4fb649b1dd918dbb43e4a4459030f4e07594997c6ab1bd114`; ProductsPanel SHA `8ba3dbed58561e9cc671a737350f4f69e514ef69fbf8c626ca63ccfc6ab96e2c`. These are inspected-source receipts, not UI test receipts.

No additional correction round is requested for PR-01..08. Continue to the already-required root-owned browser and integration delivery gates. Companion preflight remains `not_applicable` for this closure's pure/PG/in-process HTTP checks; a fresh source/build/environment preflight is required before the coordinator's actual E2E. No external provider calls, paid spend, service restart, public publication or production-data mutation occurred.

Closure completed: 2026-10-13T23:49:27.942424+00:00. Measured elapsed including coordination/reading/checks: **199.991435 seconds**. Active time: null (no separately measured wait intervals). The15-minute checkpoint and20-minute stop budget were not reached.
Fresh closure telemetry: `docs/telemetry/p-replicator/20261013T220722Z-procurement-5834/procurement-review-closure-1-result.json`. Usage/cost null; no savings claim.

Status: completed
