# N8 Phase 2 — validator-pseudocode receipt

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-pseudocode-1`
- TRACE_PATH: `/tmp/n8-validator-pseudocode-20261013/projects/08-interior-ai-redesign/docs/validation/validator-pseudocode.md`
- Launch UTC: `2026-10-13T21:29:28.326033+00:00` (coordinator telemetry event `validator-pseudocode-start`).
- Repository revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; project documents are untracked inputs, so the hashes below bind the reviewed bytes.
- Profile/stage: `compact-quality-first-v2` / `VALIDATE`; substantive project tier `XL`. This unit is a bounded, docs-only pseudocode review. E2E preflight: `not_applicable`.
- Requested model/effort: `gpt-5.6-sol` / `high`. Actual model, actual effort and fallback: `null` because no host-authoritative execution metadata was exposed.
- Token/cost usage and available spend: `null`; no attempt-exclusive provider counters or budget telemetry were exposed. No savings claim is made.
- Memory precheck: Russian `dz recall "псевдокод реализуемость алгоритмы пользовательские сценарии согласованность данных API N8" --project /home/2026-AUG-PU-Projects --limit 5 --no-semantic` returned no matching patterns.

## Exact sources reviewed

| Source | SHA-256 |
|---|---|
| `docs/Pseudocode.md` | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| `docs/Specification.md` | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| `docs/Architecture.md` | `84535d8d3e854041f9a76accea581a56cb4b13841dcc2ef5010e9f01687ffbf3` |
| `docs/Refinement.md` | `117df54fc7fa7bfda66ce576c756dfe0d23556097034ed0b801046c5ccf39c67` |

The selected project has no `CLAUDE.md`. I also read the three supplemental surface declarations (`long-job-contract.md`, `model-cost-contract.md`, `webhook-contract.md`) where they affect algorithm implementability.

## Verdict and score

**Pseudocode verdict: NEEDS WORK before implementation.** Mechanical identity coverage is exact: **21/21 requirement headings, 45 unique source SC, 45 unique `REALISES` claims, no missing/extra/duplicate SC IDs**. That establishes naming traceability only. Seven source scenarios still lack enough state, command or orchestration semantics for an implementer to produce one unambiguous result.

Role-bounded score: **68/100**. This is an implementability score for this lens, not a second INVEST/SMART score.

| Dimension | Score | Evidence |
|---|---:|---|
| Machine-key and SC traceability | 20/20 | Deterministic extraction found 21 keys and an exact 45↔45 SC set; `Pseudocode.md` → `## Scenario Coverage` records the same claim. |
| Semantic story/SC realization | 12/20 | Most flows have a concrete algorithm, but the seven rows below are only partially realized. |
| Data reproducibility and invariants | 10/20 | Immutable shell/design concepts are strong; budget snapshots omit state required to reproduce totals/deltas. |
| Algorithm determinism and failure paths | 14/20 | CAS/fences/decimal arithmetic are useful; idempotent replay ordering and several transition commands remain ambiguous. |
| API/command implementability | 12/20 | Main owner routes exist; refresh, metrics, reconciliation and procurement reads are not assigned a callable surface. |

Known architecture findings already registered by `validator-architecture`—rate-before-parse, bcrypt's raw 72-byte boundary, archive/dispatch/completion linearization, refund object distinction, export/share provenance, aggregate asset limits, and physical FK/embedded-reference mapping—were not rescored here.

## Findings and targeted corrections

### PSEUDO-01 — HIGH — A legitimate job replay can fail before the idempotency record is returned

`SubmitAndRunProposal` step 2 checks current shell/archive/billing hold and `creditsAvailable≥1` before matching an existing `(projectId,idempotencyKey,inputHash)`. A retry of a successfully admitted job can therefore return a new eligibility error after its credit was held/consumed, after the shell changed, or after the project was archived, instead of returning the original job promised by the same step and by `long-job-contract.md`.

Correction: after authenticating ownership and validating the bounded request enough to compute its canonical hash, look up and lock the idempotency row first. Same key + same hash returns the existing job regardless of later mutable admission conditions; same key + different hash returns 409. Only a genuinely new key proceeds through current shell, account, caps, credit and reservation admission. Add retries after success, after shell change, after archive and with zero available credits.

### PSEUDO-02 — HIGH — `BudgetRevision` cannot reproduce its own phase totals, completeness or exact delta

`BudgetLine` contains only `lineId`, snapshot copy, quantity/waste and calculated amounts/reason. The calculation depends on `elementId`, `selection`, `retainedReason`, `quantitySource`, `sourceShellId`, `phase` and `fit`, yet those fields are only on the mutable `ShoppingLine`. An immutable revision cannot use a later mutable row to prove why an element was retained/unmatched, which phase owned its subtotal, which shell supplied quantity, or how an exact cross-revision delta matched the same element. `reserveBaseMinor` is also accepted from the API as a raw client amount although the algorithm describes a visible selected base; no equality check or base policy is defined.

Correction: make each embedded budget line a complete immutable value with stable `elementId`/scope identity and all calculation/provenance fields; define deterministic delta matching by stable element and cost-row IDs. Replace client-controlled `reserveBaseMinor` with a small base enum whose amount is computed server-side, or validate an explicit custom base against a named visible policy and store that policy. Golden serialization/read-back tests should recompute totals, phase subtotals, unresolved count, completeness, reserve and delta without querying current `ShoppingLine` rows.

### PSEUDO-03 — HIGH — Material quantity basis is under-specified and can apply floor area to walls

`SceneProposal.materials` can address multiple surfaces, while `CalculateBudget` derives every `quantitySource=floor_area` line from the shell's single `floorAreaM2`. A wall or ceiling coating can therefore receive floor area. `Specification.md` also says GLB material area is entered separately, but neither `ShellRevision`, `ShoppingLine`, the line API nor the budget input carries a per-surface measured area and provenance.

Correction: define a quantity basis such as `floor_area | wall_area | surface_area | manual`, bind it to the exact element/surface and source shell, and provide the measured/derived area plus provenance. For a rectangular room, specify wall-area derivation and opening subtraction; for GLB keep non-manual area unknown until an explicit user-confirmed value exists. Restrict each base/sale unit combination to a named matrix. Tests must show floor tile uses 18 m² while wall material does not silently reuse 18 m².

### PSEUDO-04 — HIGH — Required product behaviors have no callable command/read surface

The API table has only POST product snapshots and POST/PATCH shopping lines. It has no catalogue refresh command for `SC-US-009-2`, no GET for shopping lines/product history needed to reopen the procurement step, and no metrics read or documented operator query for `RecordGrowth`/`SC-US-015-2`. The state machine permits `uncertain → succeeded|failed`, but no reconciliation algorithm defines evidence, authorization, fence checks, credit settlement and both SpendBudget ledgers; saying “operator reconciles” does not give an implementable transition.

Correction: add the smallest explicit surfaces: product resolve/refresh returning `Snapshot|ManualRequired|Blocked`; paged owned product/line reads; a local read-only growth-count query or owner-authorized metrics endpoint; and a non-public audited job-reconcile command with immutable evidence ID, expected state/fence, actual cost/usage semantics and atomic account/global reservation settlement. Public/admin endpoints are unnecessary for the approved local scope.

### PSEUDO-05 — MEDIUM — Several `REALISES` claims need orchestration or persisted state

| Criterion | Missing semantic link | Targeted correction |
|---|---|---|
| `SC-US-004-1` | The flow reencodes an image but does not explicitly create/persist the promised safe thumbnail/normalized output before `ready`. | Define original and normalized/thumbnail keys, atomic readiness condition and cleanup for both. |
| `SC-US-006-1` | The scenario changes camera/view and says the choice is saved; no camera/view state belongs to `DesignRevision`. | Persist a bounded canonical camera preset/pose, or narrow the SC so only style/material/object choices are persisted. |
| `SC-US-007-1` | `ReviseAndApprove` clears `currentBudgetId` but neither recalculates quantities nor marks each derived quantity unknown/outdated. | Define the orchestration result after shell/design change and when recalculation occurs. |
| `SC-US-009-2` | The blocked refresh behavior exists as prose in `RecordProductSnapshot`, but no API command invokes it. | Add the resolve/refresh command from PSEUDO-04. |
| `SC-US-010-3` | “Exact delta” has no stable matching rule or complete immutable prior inputs. | Apply PSEUDO-02's stable identities and delta rules. |
| `SC-US-011-2` | Phase edit clears the current budget; the promised changed phase subtotals/unchanged grand total are not produced until an unspecified later calculation. | Return a deterministic preview or atomically append a recalculated budget revision; state which behavior the SC expects. |
| `SC-US-015-2` | `RecordGrowth` can count internally, but no consumer surface distinguishes observed zero from storage-unavailable unknown. | Add the read-only count surface and typed `known(count)|unknown(reason)` result. |

These seven are partial coverage, not missing IDs; the other 38 SC have a plausible direct algorithm path subject to the independent architecture/acceptance findings.

### PSEUDO-06 — MEDIUM — Boundary cardinalities conflict with the declared entities/API

- `Reference` allows both `assetId` and `sourceURL` to be absent or present, while the specification requires an uploaded image **or** an HTTPS link. Enforce exactly one source and derive `rightsConfirmed` consistently from that source.
- `RecordProductSnapshot` says it validates a same-project element, but `ProductSnapshot` and `POST /products` contain no `elementId`. Remove that check from snapshot creation and perform it when a versioned line binds snapshot to element, or add an explicit binding input.
- Image/GLB normalization is described as separate original and normalized copies, but `StorePrivateAsset` moves one temp object and treats `normalizedKey` as optional. Define which kinds require normalized output and refuse `ready` until all required objects and metadata exist.

### PSEUDO-07 — LOW — Two complexity/boundedness claims are stronger than the model

Project archive is described as bounded by project/account caps, but Jobs and ShareLinks have no lifetime count cap; both can grow over many days. Growth aggregation is called indexed and bounded, while `AuditEvent` has no declared `(kind, project/account, created_at)` count index or bounded reporting interval. Use set-based/batched archive operations with suitable indexes and a bounded reporting window/index, or remove the unsupported boundedness claims.

## Implementation handoff

Apply the four HIGH corrections as short amendments to the existing data types, algorithms and API table, then recheck only the affected SC and data round trips. No new workflow engine or general validator is needed. Retain the current CAS/fence, immutable revisions, exact decimals, private storage and fail-closed provider decisions.

No project source was edited; only this isolated receipt was written. Paid inference, payment calls and public actions were not performed.

Finished UTC: `2026-10-13T21:34:32.065152138Z`; elapsed from coordinator launch: `303739` ms. Active time is `null` because complete exclusion intervals were not available. Final source recheck matched all four hashes above. Receipt check: regular non-symlink file, `12200` bytes before this terminal-evidence addition, terminal marker last.

Status: completed
