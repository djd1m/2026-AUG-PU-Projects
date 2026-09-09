# Focused acceptance revalidation v2 — N3a

- `RUN_ID`: `20260909T174821Z-prd-a-1934`
- `WORK_UNIT_ID`: `acceptance-v2`
- Scope: focused revalidation of A-1..A-4 in the current PRD/Specification/Refinement/test-scenarios snapshot; unchanged acceptance evidence was checked only to preserve scores and floors. Architecture/Pseudocode v3 is a separate review lens.
- Profile/risk: `compact-quality-first-v2`, `XL`
- Requested model/effort: `gpt-5.6-sol` / `high`
- Actual model/effort: `null` / `null`; no host-attested execution metadata was exposed
- Usage, cost, available quota, active time and exact worker duration: `null` / unavailable; no worker-scoped provider, billing, quota or attested start counters were exposed

## Current immutable snapshot

Base: `cafe2c4f608ed8262dade750e800e27173517a21`. The four read-only input hashes are:

| Input | SHA-256 |
|---|---|
| `docs/PRD.md` | `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8` |
| `docs/Specification.md` | `ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7` |
| `docs/Refinement.md` | `afd96e0545c56a5f3ca96b7a0aace28ba8e1a48e2621c31e30e286a6f27d6d5a` |
| `docs/test-scenarios.md` | `a9f0c65c5a7435695888b39586d4e3c5775136795588869e4e040efebb8cc995` |

The binary diff of those four paths has SHA-256 `362f210cd7012c4215f38a81b741e892398a8f61cd1c394fb556c08274d7c0b2`. `test-scenarios.md` embeds the current Specification SHA exactly.

## Verdict

**CAVEATS.** A-1..A-4 are closed as acceptance/testability findings. The mandatory MVP requirements now have one consistent oracle and no blocking or high acceptance defect. D7 remains an explicitly proposed, non-MVP contour pending the owner's answer; this is a recorded product decision, not a hidden prerequisite or a reason to block the accepted N1-first MVP.

The current mandatory-scope average is **90.3/100**, up from 87.4 in v1. No story is below 70 and no story hits the requirements-validator floor. Security remains present and specific (`+5` separately); growth IDs FR-GROWTH-001..004 remain traced (`+5` separately).

## Score delta and floor evidence

| Story | v1 → current | Current SMART | Current `Testable / Completeness / Traceability` | Current proof |
|---|---:|---:|---:|---|
| US-005 | `78 → 92` | `30/30` | `8 / 10 / 10` | SC-US-005-4: “сентябрь0коп, октябрь−1коп проводок отмены”; happy refund, mismatch/retry and monthly permutation remain present |
| US-006 | `81 → 84` | `30/30` | `8 / 10 / 10` | SC-US-006-6: due `5 октября`, actual `5 октября` gives one mark/YTD; actual `4/6 октября` is rejected from ordinary confirm and retained as early/late observation |
| US-007 | `84 → 84` | `30/30` | `8 / 10 / 10` | SC-US-007-5 now requires retry/concurrency/pre-commit outcomes “ровно [по] fixtures R1–R4 … без частичного sent/YTD”; score was already at the rubric maximum for SMART/T/C/R |
| US-009 | `71 → 92` | `30/30` | `8 / 10 / 10` | Mandatory SC-US-009-1..3 stay precise; SC-US-009-4 says “не принятая MVP-обязанность” and, if exercised, requires one stable-key record, same-ID retry, conflict rejection and zero ledger/N1-payment effect |

The other nine story scores and quoted criteria from `acceptance-v1.md` are unchanged: US-001 100, US-002 100, US-003 84, US-004 92, US-008 84, US-010 100, US-011 92, US-012 78, US-013 92. Their current SC text remains present. Current `docs/test-scenarios.md` → `## Criterion scenarios` maps all **51 unique** SC IDs to named scenarios; Specification has the same 51 unique IDs and the BDD section has the same 51 unique scenarios, with zero duplicates. This table is the artifact for every non-zero Traceability score. The quotes above, together with the unchanged per-story quotes in v1, are the artifact for non-zero Testable/Completeness. Floor result: **0/13 blocked**.

## Finding closure

1. **A-1 closed — signed monthly refund oracle.** Specification SC-US-005-4 and its BDD copy now both say `сентябрь 0`, `октябрь −1` for the `payment100/commission1/refund30+30` fixture. Refinement's main oracle says the same and retains semantic-total/hash comparison. Its additional `refund50+50` fixture explicitly distinguishes economic totals from a different append-only audit history.

2. **A-2 closed — fifth applies to the transfer.** PRD §5 says the deadline concerns the transfer itself. Specification FR-PAYOUT-001 fixes `due_date=5-е`; SC-US-006-6 separates `actual_date` from report time: the transfer on 5 October reported on 6 October is on time, while actual transfers on 4/6 October cannot take ordinary confirm, remain observable, and preserve the 5 October due date. Refinement `Calendar acceptance` repeats the exact oracle and keeps no weekend shift/no automatic bank transfer.

3. **A-3 closed for current scope — D7 is explicit and testable without being silently accepted.** SC-US-009-4 labels D7 “не принятая MVP-обязанность до решения владельца”. Its conditional test uses owner evidence, `stable subject_id`, timestamp and an owned asset; the result is one `unique(program,subject,qualified_lead)` record, idempotent same-ID retry, conflict rejection, and exact zero platform-ledger/N1-payment effect. Refinement also says click/signup/payment do not qualify a lead. The owner's D7 accept/defer answer remains pending and must not be inferred from this review.

4. **A-4 closed — recovery is observable across all requested contours.** Refinement R1 fixes missing-preparation recovery, exact January 2027 pre/post values, duplicate/concurrent O1 behavior and failure immediately before commit. R2 distinguishes NPD income already included in the declaration from internal/covered counters. R3 preserves historical A-before-B tax (`2800`, not `3000`) and updates only a missing per-counter flag. R4 fails closed for unknown order/pre-transfer balance or incomplete inclusion evidence. Across R1–R4, a failed attempt has no partial Confirmation/sent/YTD change and a successful repeated/concurrent reconciliation creates one confirmation with stable IDs.

## Boundary

This is document-stage acceptance evidence. No runtime test, build, database race, provider call, restore exercise or algorithm review was required or claimed. External dependency review, D7 owner approval, implementation permission, production deployment and real money movement remain separate gates.

Status: completed
