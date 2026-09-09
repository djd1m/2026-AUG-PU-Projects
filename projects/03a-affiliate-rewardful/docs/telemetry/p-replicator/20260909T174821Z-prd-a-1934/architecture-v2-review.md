# N3a independent architecture v2 review

RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: architecture-v2-review
Input worktree: `/tmp/n3a-review-architecture-v2`
Input commit: `30ff86ac1203a98838ee16f1566e0cc1e606593d`
Profile: compact-quality-first-v2; risk XL (money/tax/cutover).
Requested model/effort: gpt-6-astra / xhigh.
Actual model/effort: null / null; no host-authoritative execution attestation is exposed to this worker. Fallback: null, no observed switch; no global configuration change.
Usage/input/output/reasoning/cached tokens/cost: null; host counters unavailable. No estimate or saving claimed.
Started_at/elapsed_wall_ms/active_wall_ms: null; worker-entry clock was not captured. Coordinator may report its measured dispatch interval; no duration is reconstructed.
Independence: separate bounded reviewer; did not author the candidate documents. Read and assessed the original findings and correction receipt against the frozen candidate. No provider independence asserted.

## Verdict

**NEEDS WORK** before architecture acceptance: one remaining high recovery-calculation defect and one medium canonical-scope contradiction. These are planning-contract findings, not failed application tests. The principal CH-01/02/04 corrections are present in algorithm steps and physical constraints. CH-03 is corrected for the intended narrowed runtime but still conflicts with FR-PROGRAM-001. CH-05 now has a reachable reservation replacement transaction, but its already-inclusive recovery calculation remains unsafe.

The accepted scope remains CJM A, N1 first, YooKassa, separate N3a, manual external transfers on the 5th for the preceding calendar month, and audited reuse of N1/N2. Old N3 and its production permissions remain outside scope. No code, deployment, provider call or actual transfer is authorized by this receipt.

## Actionable findings

### ARV2-01 — HIGH: already-inclusive recovery counters are reused as pre-transfer calculation inputs

Locations: `Pseudocode.md:195-196` (CalculateAndPrepareTax steps 3-4), `Pseudocode.md:210-212` (ConfirmManualTransfer reconciliation steps 4-6); `Refinement.md:84` (R1 currently tests only amounts absent from opening/counters).

Step 5 correctly distinguishes whether current counters already include the external transfer and can apply a zero incremental update. However, it first derives the corrected tax snapshot using CalculateAndPrepareTax rules under the current guards/YTD. Those rules compute `T(Y+B)-withheld` and NPD `known total+gross` unconditionally. Zeroing the subsequent counter update does not remove this second inclusion from the preceding calculation. There is no named historical pre-transfer base/withheld/NPD aggregate input or reconstruction rule. Accountant evidence is required in general prose, but the called calculation still names current counters.

Concrete synthetic counterexample using Refinement's own two-band rule and minor units: before the transfer, base239900000 and withheld31187000; transfer base200000 has correct withheld28000 and resulting base240100000/withheld31215000. If recovery evidence already includes this transfer in opening/current counters, the called formula instead computes `T(240300000)-31215000=30000`. It produces a different historical tax receipt even if final counter increments are zero. An NPD analogue: a reconciled aggregate239990000 already includes this transfer20000; the unconditional candidate240010000 falsely exceeds the document's240000000 limit. Both examples use the document's synthetic arithmetic; they make no independent tax-law claim.

Consequence: the recovery path can record an incorrect calculated/withheld result or stay blocked despite sufficient evidence. This affects late/expired and cross-year reconciliation and restoration with already-inclusive opening balances. Locks and per-counter inclusion evidence prevent concurrency double updates but do not resolve this arithmetic error.

Bounded correction: distinguish (a) immutable, evidence-backed inputs immediately before the actual historical transfer, used only to reconstruct its approved calculation and eligibility, from (b) current counter inclusion evidence, used only to decide each once-only delta. Require observed gross/withheld/net to reconcile with the approved historical receipt, preserving discrepancies as exceptions. Apply the distinction to withholding and NPD. Add inclusive, absent and mixed-per-counter variants of R1 with a progressive-threshold crossing, NPD near-limit case, retries/concurrency and rollback. Do not attempt an unsupported subtraction from current totals if other historical payments or deductions intervened.

### ARV2-02 — MEDIUM: canonical FR-PROGRAM-001 still requires modes deliberately removed to close CH-03

Locations: `Specification.md:15-18` versus `Specification.md:27`; `Pseudocode.md:18`, `Pseudocode.md:54`, `Pseudocode.md:79`, `Pseudocode.md:147-149`; ADR-004 and implementation-plan D2.

FR-PROGRAM-001 still requires owner selection of `first payment only`/`every eligible payment` and an explicit finite month count or lifetime. The same specification's FR-PROGRAM-002, PRD and runnable PolicyVersion enum/validation now permit only every-eligible-payment/lifetime. Following FR-PROGRAM-001 literally would reintroduce the chronological entitlement problem that the v2 correction intentionally removed, while following the algorithm would fail this surviving canonical requirement.

Bounded correction: replace FR-PROGRAM-001's stale mode/finite wording with the accepted pilot restriction and retain any deferred modes only as explicitly out-of-pilot scope. Align the nearby recurring-limit phrase if necessary. Recheck the canonical requirement against the enum and validation. This is a small source correction, not a request to implement first-only/finite reconciliation.

## Original finding closure audit

| Finding | Disposition at frozen input | Concrete proof and limits |
|---|---|---|
| CH-01 — period refund convergence | Closed at planning-contract level | PostRefund steps3-5 (`Pseudocode.md:161-163`) recompute all immutable refund facts sorted by occurred_at/provider ID, derive per-basis-month cumulative marginal targets, append signed differences and run prefreeze reconciliation. Revision hash excludes local delivery IDs; Registry semantic hash is separate from audit history (`:180`). Refinement contains30/30 and50/50 permutations, including the positive reallocation branch. Program/parent locks and unique(revision,basis_month) bind the transaction. Frozen months retain their prior rows and route new corrections forward. Runtime permutation/concurrency/hash tests remain planned. |
| CH-02 — historical eligibility | Closed at planning-contract level | EligibilityFact stores server-dated immutable lifecycle history; consent/asset activation and subsequent changes append facts (`:93-94`). CaptureAttribution steps3-5 (`:107-109`) resolve registration/capture-time facts, preserve fact IDs and payload hash, reject invalid explicit promo without cookie fallback. PostPayment uses that decision for renewals (`:145-149`), regardless of current revocation. SC-US-003-4 names delayed delivery/revocation. Actual temporal-query implementation remains untested. |
| CH-03 — late earlier payment | Runtime correction present; package closure pending ARV2-02 | PolicyVersion and PostPayment permit every eligible payment/lifetime only. A late earlier verified payment changes min first_paid_at and does not invalidate existing commission, even with rounded commission0. The removed first-only/finite chronology problem is therefore unnecessary in the intended pilot, but the canonical FR still requests it. |
| CH-04 — all-model tax reservation | Closed for ordinary preparation; recovery caveat ARV2-01 | Persistent PayerYearGuard unique(payer,person,year) is distinct from per-base YTD; every model checks and persists active_preparation_id in the preparation commit (`:194-197`). A second request after the first commits also sees the reserve. NPD uses declared total plus confirmed income not covered by its evidence; confirmation advances internal income once (`:209`). SC-US-007-4 requires cross-program/base/model and sequential/concurrent checks. Historical recovery must additionally fix ARV2-01. |
| CH-05 — expired/year-change replacement | Reservation dead end corrected; full closure pending ARV2-01 | observe accepts optional preparation under the closed gate; sorted old/actual year locks, supersession and one new confirmation are explicit (`:207-212`). No release/reacquire gap; unrelated reservations cannot be stolen; expiry at report time does not invalidate a historically valid transfer. R1 supplies failure-before-commit, retry/concurrency and absent-preparation oracles. The remaining historical calculation flaw prevents full recovery acceptance. |

## Calendar, transaction and scope checks

The 5th is now the transfer deadline, with immutable due_date and no weekend shift (FR-PAYOUT-001, ADR-005). CalculateAndPrepareTax step1 explicitly permits a late catch-up preparation only with owner approval, reason and a current/future planned date, preserving the original deadline. Actual late transfers go through observe and evidence reconciliation; ordinary confirmation accepts the due date. This is a reachable exception path once ARV2-01 is corrected. Late recording of a transfer made on the 5th is evaluated against the actual transfer time. Refinement's calendar acceptance distinguishes actual4/5/6 from reporting6. Tests should exercise the approved catch-up preparation as well as an unexpected late fact when this code exists; the missing execution is a future gate, not another high finding.

RecoveryGate shared-lock/check spans payment/refund/reallocation/freeze/ordinary preparation/confirmation commits; restore changes it exclusively. Closed-gate observation and narrowly authorized evidence reconciliation preserve outside facts. ReconcileAndRecover stages missing source facts while closed, reviews an explicit replay manifest, reopens only after transfer/counter evidence reconciliation, and keeps freeze blocked until missing facts replay. This is an explicit source/transfer recovery boundary; no bank operation is replayed. Actual restore/lock tests remain required.

The physical architecture continues to separate N1-owned billing/outbox/provider credentials from the N3a ledger and N2 donor code. Local billing+outbox, receipt+business effect, registry+allocation+carry and preparation/confirmation+guard updates have explicit atomic boundaries. N1 adapter availability, cutover/legacy-writer disposition and full cross-project regression are declared implementation dependencies, not falsely completed capabilities. This review did not re-audit changing N1/N2 source or external provider facts.

**Owner caveat D7:** lead-only own-platform enrollment/assets/qualified-lead tracking is expressly an unapproved proposed narrowing of incentivized dogfooding (PRD§4, Specification FR-GROWTH-001/SC-US-009-4, ADR-008, implementation-plan D7). It must remain a caveat for the owner's XL decision. It is neither an already accepted scope change nor completed monetary platform dogfooding. No extra finding is invented for this accurately disclosed decision.

## Verification and measurement limits

Read all eight assigned candidate documents and both prior receipts; compared algorithm/data/physical/state contracts at the named boundaries. An independent exact-integer in-memory arithmetic probe verified the recovery threshold counterexample: prior withheld31187000, historical transfer tax28000, included withheld31215000, erroneously reapplied tax30000; the NPD inclusive total case also reproduces the false crossing. This is a document arithmetic probe, not application/test code or a runtime test.

Tracked worktree was clean before writing this receipt. No app code, test file, container, network research, build, migration, PostgreSQL/concurrency/mutation/browser test, commit, push or subagent was performed. Runtime gates have not passed merely because their scenarios are named. Only this terminal receipt is authored. Input hashes below bind findings to the reviewed frozen candidate; a later correction needs its own validation.

## Input SHA-256

| Input path relative to worktree | SHA-256 |
|---|---|
| `CLAUDE.md` | `3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241` |
| `projects/03a-affiliate-rewardful/CLAUDE.md` | `464f44d8227f8d703e9c8f09a55afd66015482162d7c928983ed043fcabf29e2` |
| `docs/development/model-routing.md` | `cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9` |
| `docs/development/model-routing-telemetry.md` | `22ba852701d2c78b372cb07ed9b53f4227799ff6f8dc9c57849c09d0c35829cd` |
| `.claude/rules/complexity-router.md` | `422a1d1952f7755c1ea772b33e9e41e1bd78a239af8a0a490f03bc48eb4e0c70` |
| `.claude/rules/swarm-file-evidence.md` | `c71a216dbc3fd633c30949823ceac354f8439b96279a1a8dd606afb1b3ef5c45` |
| `.claude/rules/feature-adr-conventions.md` | `a20293e040686646e9271c16b64fbe5a47645a7717d4de13e9e130ea1c77b815` |
| `.claude/rules/incoming-webhooks.md` | `92f3de02814ed0610df644acf554f4b41b2bae2f9d281695e2e217a1d6558e84` |
| `.claude/rules/guard-must-be-able-to-fail.md` | `7b4ce52be26f4fb9950a117c014fdc1aa6987ef46eb4b5b2daea1ae5e9191d5c` |
| `.claude/rules/security-operation-order.md` | `02c4ec35e724db1c2001c7070037b565802087af76d2349a447fda1d454f03bd` |
| `.claude/rules/shared-resource-verification.md` | `f8c2d0b4151dcfbe244babc110300b64eb4a449d5531800af169f296a908f4ac` |
| `.claude/rules/fail-closed-defaults.md` | `dde3be22d932418dacb52364b744979a95fc98ca14e1b6917a6d952b261827b3` |
| `.claude/rules/model-routing-local.md` | `11ce29df7bdb96f00ecd3c3204ac91cc3fa045865652563c617e61186085521d` |
| `projects/03a-affiliate-rewardful/docs/PRD.md` | `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8` |
| `projects/03a-affiliate-rewardful/docs/Specification.md` | `7457c9f705230ad34b7b55ec32774e1aba3276f683be7c5af55f3825af8fe23e` |
| `projects/03a-affiliate-rewardful/docs/Pseudocode.md` | `37a0f6bf97b7d3f03c9d1ac7a0123deff33e8117f58de1e6749cd1ba2831ca9f` |
| `projects/03a-affiliate-rewardful/docs/Architecture.md` | `1620e4c6f6164934fc86713f6a2e1fb2c399ffe09abe90fc8f161c67a859a20f` |
| `projects/03a-affiliate-rewardful/docs/ADR.md` | `dface016ec4d2b7b990ee52f5499dffc47763ca308c71e8adb30638b38fce886` |
| `projects/03a-affiliate-rewardful/docs/C4_Diagrams.md` | `c26db5800db7ec38b683681dd6a2a38330c8f7732391dd688b34064b18b33113` |
| `projects/03a-affiliate-rewardful/docs/Refinement.md` | `ad876b61b80ea4d83dcb29b8ddcf0665439a3d0ab922b79c7b08f9fb81c19bf9` |
| `projects/03a-affiliate-rewardful/docs/implementation-plan.md` | `9856b2380d966ee93650711d730709c64082e7199a5c035a391e7207fdfb9403` |
| `projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/challenge-v1.md` | `2a2bf86d9c0a3c7e2aacdc42a4f905af4441c288e495d60ac2032454e68b219c` |
| `projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v2.md` | `8af30e5125c04d99813fa5e7020adc3be6734894b076b83204a5feb1ad70a024` |

Finalized_at: 2026-09-09T19:05:09.135627+00:00
Findings: blocker0; high1; medium1. Verdict: NEEDS WORK. Review work unit completed; plan acceptance is not granted.

Status: completed
