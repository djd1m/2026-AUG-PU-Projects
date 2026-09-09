# Independent focused pseudocode rereview v3 — N3a

Verdict: PASS for the bounded V2-01 correction and retained prior closures, at planning level. No new HIGH finding identified in this focused pass.
RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: pseudocode-v3-review
Profile: compact-quality-first-v2. Risk: XL. Stage: independent VALIDATE, correction3.
Requested model / effort: gpt-6-astra / high.
Actual model / effort / model evidence: null / null / null; host execution attestation unavailable. Requested routing is not actual-model proof. Fallback: null; no switch evidenced.
Usage input/cached/output/reasoning and cost: null; counters unavailable, cost basis unavailable; no savings claim.

Snapshot provenance: coordinator supplied document bytes from canonical commit1e346be. Local worktree HEAD remains30ff86ac1203a98838ee16f1566e0cc1e606593d with these explicit dirty document copies; HEAD alone does NOT identify reviewed inputs. The SHA-256 manifest below identifies the actual reviewed snapshot. Canonical-copy provenance is coordinator supplied, not a local clean-HEAD claim.

Owned output: only this new receipt. Prior pseudocode-v2-review.md is immutable input. Root/project instructions and applicable policies read in preceding pass remain applicable. No source edits, implementation, subagents, git mutations, network changes or real financial actions. The author receipt was read for intended scope and compared with actual typed fields, algorithms and fixtures; its self-review was not used as independent closure evidence.

## V2-01 closure evidence

- **Historical inputs persisted, not merely mentioned:** Pseudocode:41 adds typed historical_basis/current_counter_plan to immutable TaxSnapshot. Pseudocode:56 defines HistoricalTaxBasis with observation and transfer identity, payer/person/year/date, model/profile/rule, actual gross/base, pre-transfer base/withheld or declared/internal/covered NPD components, ordering-prefix hash, balance and ordering evidence, accountant and approval time. Ordering explicitly excludes the observed transfer and later transfers and resolves same-day order. Missing/ambiguous history remains review. Required mode inputs and irrelevant nulls are explicit.
- **Current storage changes independently represented:** Pseudocode:58 defines CurrentCounterPlan with expected current guard/YTD versions, current declaration and independent declaration inclusion evidence, plus ALL FIVE mandatory CounterDecision entries: guard_total, npd_internal, npd_coverage, base_total, withheld_total. Already included means delta0, missing means contribution delta, irrelevant means0. Current inclusive base/withheld includes opening; missing increments target paid counters and preserve opening. Historical calculation provides base/withheld contribution. NPD coverage inclusion is independent of internal inclusion, so a declared-but-internally-missing transfer can increment both without inflating known income. Unknown/partial inclusion remains review.
- **Execution matches those types:** Pseudocode:208 requires both inputs for reconciliation. Step5 at215 validates historical identity and approved order/balances, calculates ONLY from pre-transfer values, matches actual amounts and explicitly forbids current-balance reads or current-minus-gross reconstruction. Step6 at216 separately validates locked current versions/identified inclusion evidence and applies approved deltas; current balances govern storage only. It checks covered≤internal and economic consistency, preserves declaration, and prohibits another current-total-plus-gross eligibility test.
- **Atomic recovery retained:** Pseudocode:211 accepts observation while recovery is closed and without preparation. Step4 at214 locks OLD/ACTUAL guards in sorted order, then bases/row/preparations, without stealing unrelated reservations. Steps7–8 at217–218 persist both approved typed inputs with historical amounts, supersede and confirm in the SAME transaction, consume matching reservations, advance versions, update only approved actual-year deltas, preserve old-year unpaid counters and due_date. Missing preparation is reconciled through the same historical receipt path. Uncertainty retains observation/reservations; no new transfer or intermediate release/commit occurs.
- **Physical and requirement alignment:** Architecture:92 embeds these typed fields in tax snapshots;101 states historical/current separation and explicit approved late catch-up behavior. ADR-006 and C4 recovery sequence152–163 use the same separation. Specification:438–441 and test-scenarios:374–377 now reference R1–R4. FR-PROGRAM-001/002 at Specification:14–27 no longer carries stale first-only/finite options.

V2-01 is CLOSED: the original inclusive-NPD and later-payment withholding counterexamples have explicit algorithm/data answers. No ad-hoc subtraction or counter-equality inference is needed.

## Fixture adequacy and independent arithmetic

Refinement:84 retains R1 with missing/existing preparation, December guard→January actual year, absent-from-opening counters, replay/concurrency, failure before commit and no partial sent/YTD. Refinement:88 applies existing/missing preparation, duplicate/concurrent evidence, precommit failure and preserved due_date/approved late catch-up to R2–R4.

R2 at90: pre-transfer aggregate239990000 + gross10000 =240000000. Current declaration240000000 with internal0/coverage0 becomes internal10000/coverage10000, keeping known total240000000. Independent guard total inclusion remains separate. R3 at92: historical pre-base239990000/pre-withheld31198700 + gross/base20000 under synthetic13%/15% gives tax2800/net17200; current later-inclusive base240110000/withheld31216500 remains unchanged. An independently missing guard total alone may add20000. R4 at94 rejects unknown historical order/balances and incomplete coverage/inclusion without clearing the reservation or producing Confirmation.

Independent integer DOCUMENT probe reproduced R2 and R3 exactly and confirmed that the invalid current-balance formula would instead give3000. Probe exit0. This verifies the counterexample arithmetic and the written fixture targets, not runtime transactions, actual tax applicability or application tests.

## Retained prior closures and gates

The current diff changes the recovery types/steps/API contract and corresponding explanatory requirements/diagrams/fixtures. It does not alter the previously reviewed canonical refund allocation/economic hash, consent membership, historical eligibility, immutable calendar, all-model persistent preparation guard or ordinary observation route. PSEUDO-01,03,04,05,06 retain their document-level closures; the remaining PSEUDO-02 historical-calculation blocker is closed by the evidence above. The first rereview receipt remains the detailed evidence for unchanged portions.

Due5th remains the transfer deadline. Approved late catch-up preparation retains original due_date and completes through observation/evidenced reconciliation; Architecture101 now states the exception explicitly. D7 platform_leads remains pending owner scope review (Pseudocode233); this PASS neither approves that proposal nor represents complete monetary dogfooding. XL owner checkpoint and implementation/runtime gates remain required.

## Checks and limitations

Deterministic naming check exit0:36 unique requirements=36 unique claims;51SC=48 algorithm-covered plus3 explicit UI-only exclusions; no dangling algorithm claim. test-scenarios Spec revision matches current Specification SHA. Input hashes rechecked unchanged before finalization. Receipt delivered as a regular non-symlink file by same-directory temporary file and atomic rename, with the terminal marker written last.

No runtime/build/DB/concurrency/mutation/restore/browser/provider test, external-law validation or benchmark was performed. R1–R4 are planned tests. This is a focused correction reread, not a fresh broad audit or overall feature acceptance. Approval to implement, deploy or pay is not inferred. Full start/elapsed/active time is null because initial reading preceded the first clock sample; the measured interval below covers only the observed tail of this review.

## Input SHA-256

- `PRD.md`: `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8`
- `Specification.md`: `ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7`
- `Pseudocode.md`: `04e507c854972339e1beed6d727852df8bbdae3e43e304263afddbc67cbae192`
- `Architecture.md`: `ae52f38cf8ae686b931055f7067a5698b0c6c9c506ebc0c2ff5f7f4e2466bf4e`
- `ADR.md`: `545cd33be2d0a4249362bf323dbe6a05bb7e4f8ee491e92c7abff96ba4ce9463`
- `C4_Diagrams.md`: `342aefb6a6f6f9738b78eb79837c9eb9768186d0f16868e432c9fcab70d4d5b3`
- `Refinement.md`: `afd96e0545c56a5f3ca96b7a0aace28ba8e1a48e2621c31e30e286a6f27d6d5a`
- `Completion.md`: `b4dc3683129fe10d99096a4d8372223f36e0a7e6b87236fd6ca674c1260068e0`
- `test-scenarios.md`: `a9f0c65c5a7435695888b39586d4e3c5775136795588869e4e040efebb8cc995`
- `Final_Summary.md`: `8979e07d0501eb99e4087f35c9f29618954bcd65696eecb23585502e910f7466`
- `implementation-plan.md`: `ce4c312180a493fa606c3f378b00305c7236931300b022f67165608ecd951d0b`
- `telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v3.md`: `3fce35ec452d8526d62cf2570b91d0136f19835178b04bf56e561b09b05ae9ed`
- `telemetry/p-replicator/20260909T174821Z-prd-a-1934/pseudocode-v2-review.md`: `78dd5a99a742d3d85f4d433646da4cb81fdfc0f19ce276cc33c9412208a431d4`

First observed clock: 2026-09-09T19:12:39+00:00. Receipt finalized_at: 2026-09-09T19:14:21.871874+00:00. Observed tail interval_ms: 102871; not full assignment duration.

Status: completed
