# N3a architecture correction3 independent closure

RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: architecture-v3-review
Profile: compact-quality-first-v2; risk XL.
Requested model/effort: gpt-6-astra / xhigh.
Actual model/effort: null / null; host-authoritative execution attestation unavailable. Fallback: null, no observed switch.
Usage/input/output/cached/reasoning tokens/cost: null; no host counters, no inferred measurement or saving.
Start/elapsed/active: null; worker-entry clock not captured for this follow-up; coordinator dispatch interval is the appropriate measured source.
Input worktree: `/tmp/n3a-review-architecture-v2`.
Provenance: coordinator supplied current document copies from `1e346be`; worktree Git base remains previously verified `30ff86ac1203a98838ee16f1566e0cc1e606593d`. This is a dirty document snapshot, NOT a claim that Git HEAD identifies these bytes. Exact SHA-256 below is the review identity. No Git command was run during this closure pass.
Independence: same separate architecture reviewer, not candidate author; author receipt was read, but closure rests on source rereading and arithmetic. No claim of model/provider independence.

## Verdict

**CAVEATS — both v2 findings closed at planning-contract level; no new blocker/high in this bounded correction review.** The architecture can proceed to the owner's concrete XL-plan decision. D7 remains explicitly unapproved, and implementation/runtime/release acceptance remains outstanding. This is not authorization to implement money, deploy, or make transfers.

## Finding closure and proof

| Finding | Disposition | Source-level proof |
|---|---|---|
| ARV2-01 / pseudocode V2-01 — inclusive recovery calculation | Closed | `Pseudocode.md:56` defines immutable HistoricalTaxBasis immediately BEFORE the observed transfer, with identity, actual date/year, approved rule/profile, mode-specific balances and complete ordering-prefix evidence including same-day order. `:58` separately defines CurrentCounterPlan and all five mandatory inclusion decisions: guard total, NPD internal, NPD coverage, base and withheld. `:215` computes historical withholding/NPD eligibility ONLY from the former, explicitly excluding current-balance reads and current-minus-gross reconstruction, and matches actual withheld/net. `:216` independently verifies locked current values/versions and applies evidenced once-only deltas, including coordinated NPD internal+coverage when current declaration already includes the transfer. `:217-218` persist both typed inputs with atomic supersession, unique confirmation, reservation consumption and actual-year updates. Unknown/partial inclusion or historical order stays review with reserve/observation intact. |
| ARV2-02 — stale canonical policy modes | Closed | `Specification.md:15-18` now requires only every eligible payment/lifetime; FR-PROGRAM-002 states the same rule. PolicyVersion enum, configuration validation, PostPayment and ADR-004/D2 agree. First-only/finite modes remain explicitly deferred, not runnable choices. |

The corrected physical mapping (`Architecture.md:92`) embeds both typed inputs in immutable TaxSnapshot; calendar/recovery semantics (`:101`), ADR-006's historical subsection and the C4 recovery sequence preserve the same separation. This is a bounded extension of the existing evidence reconciliation transaction, not a second service or independent payout path.

Fixtures R1–R4 in `Refinement.md:84-94` now cover the missing acceptance dimensions: absent counters/year transfer and optional missing preparation (R1), NPD already included in declaration with missing internal/coverage (R2), historical progressive calculation before a later payment while current base/withheld remain inclusive and guard total can differ (R3), and unknown history/partial inclusion retaining review (R4). The common fixture requirements retain retries, independent concurrent evidence, failure before commit, one confirmation and unchanged original due_date.

Independent exact-integer document checks confirmed R2's current known total remains240000000 after internal10000/coverage10000, and R3's historical tax is2800 while reusing current balances gives3000. Those checks substantiate that the new inputs discriminate the prior defect. They do not establish runtime concurrency or financial/legal applicability.

## Earlier closures and associated boundaries

- CH-01 remains closed at plan level: canonical all-refund sorting, per-basis-month cumulative rounding targets, signed append-only reallocation and prefreeze reconciliation remain in PostRefund; frozen history and economic/audit hashes remain separate.
- CH-02 remains closed: historical eligibility facts and registration decision are persisted; PostPayment still uses that decision for later payments instead of current partner/asset status.
- CH-03 is now closed across the package: every-payment/lifetime is the only pilot entitlement; first_paid_at remains a minimum-time display projection, not a retroactive eligibility frontier.
- CH-04 remains closed: ordinary preparation uses persistent payer/person/year guard for every tax model and all bases/programs. Recovery's NPD declaration/internal/coverage relationship is now explicitly corrected by CurrentCounterPlan.
- CH-05 is now closed at plan level: observation is possible under the closed gate and without a surviving preparation; sorted old/actual guard locks, atomic supersession and one confirmation provide the reachable replacement path, with historical calculation fixed independently of current counter inclusion. The actual-year delta plan leaves old-year unpaid counters unchanged.

Due date remains the actual transfer deadline on the 5th, with no weekend move. Ordinary preparation/confirmation uses that date; owner-approved late catch-up requires a recorded reason and current/future planned date, then observation/evidenced reconciliation for the actual late fact. This exception preserves the original due_date and visible deviation. A transfer made on the 5th but reported later is evaluated at actual-transfer validity. Architecture, ADR, Refinement and implementation-plan D3 express these same rules.

RecoveryGate still blocks ordinary payment/refund/reallocation/freeze/preparation/confirmation writes while allowing narrowly authorized observation/reconciliation. Missing source facts are staged while closed; reopening requires evidence review, and freeze remains blocked until source replay resolves exceptions. Existing old/actual-year reservation ownership is not released between reconciliation phases. N1 billing/outbox/credentials, N3a ledger and N2 donor roles remain separate; original source/donor audit and runtime cutover checks remain implementation obligations.

## Caveats and limits

D7 is expressly a pending owner proposal in PRD, Specification including SC-US-009-4, ADR-008, implementation-plan and Final_Summary: lead-only own-platform tracking is not approval or completion of incentivized monetary dogfooding. It must be presented as a concrete owner decision at the XL checkpoint. No expansion to old N3 or implicit deployment authority was found in this correction scope.

Completion continues to label build, database/concurrency/mutation/restore/security/N1/provider/browser checks as future implementation gates. R1–R4 are synthetic planned fixtures, not executed application tests. This closure reread did not rerun the full unrelated validation process, provider/tax research or donor source audit. No app/test code, Git operation, external request, container, commit/push, subagent or financial action occurred. Only this receipt is authored, via temporary regular file and atomic rename.

## Exact input SHA-256

| Dirty snapshot input relative to worktree | SHA-256 |
|---|---|
| `projects/03a-affiliate-rewardful/docs/PRD.md` | `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8` |
| `projects/03a-affiliate-rewardful/docs/Specification.md` | `ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7` |
| `projects/03a-affiliate-rewardful/docs/Pseudocode.md` | `04e507c854972339e1beed6d727852df8bbdae3e43e304263afddbc67cbae192` |
| `projects/03a-affiliate-rewardful/docs/Architecture.md` | `ae52f38cf8ae686b931055f7067a5698b0c6c9c506ebc0c2ff5f7f4e2466bf4e` |
| `projects/03a-affiliate-rewardful/docs/ADR.md` | `545cd33be2d0a4249362bf323dbe6a05bb7e4f8ee491e92c7abff96ba4ce9463` |
| `projects/03a-affiliate-rewardful/docs/C4_Diagrams.md` | `342aefb6a6f6f9738b78eb79837c9eb9768186d0f16868e432c9fcab70d4d5b3` |
| `projects/03a-affiliate-rewardful/docs/Refinement.md` | `afd96e0545c56a5f3ca96b7a0aace28ba8e1a48e2621c31e30e286a6f27d6d5a` |
| `projects/03a-affiliate-rewardful/docs/Completion.md` | `b4dc3683129fe10d99096a4d8372223f36e0a7e6b87236fd6ca674c1260068e0` |
| `projects/03a-affiliate-rewardful/docs/test-scenarios.md` | `a9f0c65c5a7435695888b39586d4e3c5775136795588869e4e040efebb8cc995` |
| `projects/03a-affiliate-rewardful/docs/Final_Summary.md` | `8979e07d0501eb99e4087f35c9f29618954bcd65696eecb23585502e910f7466` |
| `projects/03a-affiliate-rewardful/docs/implementation-plan.md` | `ce4c312180a493fa606c3f378b00305c7236931300b022f67165608ecd951d0b` |
| `projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v3.md` | `3fce35ec452d8526d62cf2570b91d0136f19835178b04bf56e561b09b05ae9ed` |
| `projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v2-review.md` | `4c3f76148e4b1980f1fb8d742c93813dfee174d5d94bef498bf49174be1621c5` |

Finalized_at: 2026-09-09T19:17:33.115602+00:00
Open actionable findings in bounded review: blocker0; high0; medium0. Owner D7 caveat and future runtime gates remain. Verdict: CAVEATS.

Status: completed
