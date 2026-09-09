# Architecture correction v3 — terminal receipt

RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: architecture-v3
Stage: PLAN correction3; XL; compact-quality-first-v2.
Requested model/effort: gpt-6-astra/high. Actual model/effort: null/null; execution attestation unavailable. Usage/cost: null, host counters unavailable. No switch/fallback performed or savings claimed.
Observed interval: 2026-09-09T19:06:38Z → 2026-09-09T19:10:38.147945+00:00, elapsed_seconds=240; initial tool reading preceded first clock, full assignment interval belongs to coordinator.
Frozen author inputs started at30ff86ac1203a98838ee16f1566e0cc1e606593d; reviewer pseudocode-v2-review.md read in full relevant finding/counterexamples. Latest coordinator PRD/Specification/Refinement read/copied as inputs at finish, not worker-owned output:
- PRD.md: c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8
- Specification.md: ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7
- Refinement.md: afd96e0545c56a5f3ca96b7a0aace28ba8e1a48e2621c31e30e286a6f27d6d5a

## Owned output hashes

| File | Lines | SHA-256 |
|---|---|---|
| Pseudocode.md | 358 | 04e507c854972339e1beed6d727852df8bbdae3e43e304263afddbc67cbae192 |
| Architecture.md | 141 | ae52f38cf8ae686b931055f7067a5698b0c6c9c506ebc0c2ff5f7f4e2466bf4e |
| ADR.md | 59 | 545cd33be2d0a4249362bf323dbe6a05bb7e4f8ee491e92c7abff96ba4ce9463 |
| C4_Diagrams.md | 163 | 342aefb6a6f6f9738b78eb79837c9eb9768186d0f16868e432c9fcab70d4d5b3 |
| webhook-contract.md | 68 | a9fecf539a1a4bb7148ce5d011e54779e2681f9468a9f7de7fa0173ffb946d74 |

## V2-01 bounded correction

HistoricalTaxBasis is a precise immutable typed TaxSnapshot input: payer/person/year/date/transfer identity/profile/rule/model, actual gross/base, pre-transfer inclusive base/withholding or NPD declared/internal/coverage, complete ordering-prefix hash and evidence, accountant approval. Historical formulas consume ONLY these immediately-before-transfer values; neither current totals nor current minus an assumed payment reconstruct history.

Independent CurrentCounterPlan persists locked expected versions/current values and five separately evidenced inclusion/delta decisions: guard total, NPD internal, NPD declaration coverage, base and withheld. It explicitly distinguishes already-included/add-missing/not-applicable; no inferred inclusion from equal totals. Base/withheld missing increments target paid counters while opening stays immutable. NPD declaration stays unchanged, but missing internal AND coverage can both increment when declared aggregate already contains the transfer. Historical eligibility calculation never adds that payment again to CURRENT declared total.

Confirmed historical calculation and approved CURRENT deltas are validated separately; both typed inputs persist in corrected TaxSnapshot within the unchanged atomic old/actual-year guard lock + supersession + one Confirmation transaction. Missing/unknown order/balance/inclusion fails review with observation and reserve retained; no new service, payout API or transfer mode. Architecture/ADR/C4/webhook boundary notes aligned. Ordinary day5 and explicitly owner-approved late catch-up exception preserved; D7 remains proposal awaiting owner decision.

## Checks and evidence limits

- 36 exact unique REQUIREMENT keys equal canonical set;51SC /48algorithm claims /3ui-only exclusions; no dangling IDs. All5files below500lines; direct whitespace and git diff --check pass.
- R2 independent document arithmetic: historical239990000+10000=240000000 qualifies; current declaration240000000/internal0/coverage0 → internal10000/coverage10000, current economic total unchanged240000000.
- R3 independent document arithmetic: historical pre-base239990000/pre-withheld31198700 + A20000 gives tax2800/net17200. Later-inclusive current base240110000/withheld31216500 stay unchanged, while independently absent guard total may add20000. Using current formula or marginal current-minus-gross base gives3000, proving temporal basis matters.
- One initial probe assertion was corrected: subtracting BOTH A's already-known historical tax and base can numerically reproduce2800 circularly; the invalid current-minus-gross marginal shortcut is3000. This probe correction changed no product requirement or algorithm. No assertion that arbitrary subtraction reconstructs history is retained.
- Current R1–R4 coordinator fixtures read: partial/mixed/unknown inclusion, missing/existing preparation/year-crossing/concurrent/fault paths remain planned runtime acceptance, not executed application tests.
- Webhook declaration gate exit2 not-implemented remains expected and unpassed. No runtime/build/DB/concurrency/mutation/restore/browser/provider/tax-law validation performed.
- Focused author reread compared typed input fields and recovery steps with mapped storage and diagrams. Independent final rereview must determine closure; receipt does not approve XL plan or implementation.
- No code, commit, push, subagent, deployment, financial action or unrelated redesign. Integrate only five owned docs plus this receipt; PRD/Specification/Refinement copies are inputs.

Status: completed
