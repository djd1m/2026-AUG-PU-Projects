# Independent acceptance validation — N3a

- `RUN_ID`: `20260909T174821Z-prd-a-1934`
- `WORK_UNIT_ID`: `acceptance`
- Project: `projects/03a-affiliate-rewardful`
- Profile/risk: `compact-quality-first-v2`, `XL` (money, tax, N1/ЮKassa boundary, role isolation)
- Requested model/effort: `gpt-5.6-sol` / `high`
- Actual model/effort: `null` / `null`; the host exposed no execution attestation, so requested routing is not reported as actual
- Usage, cost, available quota, active time and exact worker duration: `null` / unavailable; no worker-scoped counters or attested start timestamp were exposed
- Scope: acceptance quality of the four supplied documents only. Architecture/Pseudocode findings, runtime implementation and external-capability verification are separate review lenses.

## Immutable input snapshot

Base `cafe2c4f608ed8262dade750e800e27173517a21`; before this report, exactly the four declared owned inputs were dirty. Their reviewed bytes were:

| Input | SHA-256 |
|---|---|
| `docs/PRD.md` | `378844193321cec2ab11e7f0e5f071fa7c1711009240962a6128feb50726307b` |
| `docs/Specification.md` | `b4adeb8f0a98ab966bcadf1a30fc2d75764be65a5a87e16aaa0947bb0826ba76` |
| `docs/Refinement.md` | `10644b2b9bfc952d9549f9f0a85bc93eef4411de8977129782f61e5af6fbf995` |
| `docs/test-scenarios.md` | `51e934652d8fed627321d7556b5cea07d5a49d50ce3a5cb4377141667e5b137e` |

The binary diff of those four paths has SHA-256 `67505a70a1c5bf8d102dacdccc954b0921ea7fcaf85dcb7badf7177399ae9a7b`. `test-scenarios.md` embeds the reviewed Specification hash exactly.

## Verdict

**NEEDS WORK.** The structural acceptance gate is strong: 13 stories contain 51 unique SC criteria; the Criterion scenarios table contains the same 51 unique IDs; and the BDD section contains the same 51 unique named scenarios. There are no duplicate or uncovered IDs. Every story has a happy outcome, error/edge behavior and security behavior, so `Testable`, `Completeness` and `Traceability` are non-zero for every story and the requirements-validator blocking floor does not fire.

The average story score is **87.4/100** before the separate Security and Growth bonuses; no story scores below 70. The overall verdict is nevertheless NEEDS WORK because SC-US-005-4 gives mutually exclusive expected October totals for one fixture. An implementation cannot satisfy both normative artifacts, so the current acceptance suite has no single passing oracle.

## Per-story score and AC coverage

Scoring follows the requirements-validator rubric: INVEST 50, SMART 30, Quality 20. `T/C/R` means Testable/Completeness/Traceability. All `R=10` values cite `docs/test-scenarios.md` → `## Criterion scenarios`, rows SC-US-001-1 through SC-US-009-4, which map all 51 criteria to named scenarios.

| Story | SC | INVEST | SMART | Quality `T/C/R evidence` | Total | Status |
|---|---:|---:|---:|---|---:|---|
| US-001 | 3 | 50 | 30 | `8/10/10`; SC-US-001-1: “сохраняет версию политики и разрешает приглашения” | 100 | READY |
| US-002 | 3 | 50 | 30 | `8/10/10`; SC-US-002-1: “фиксируются actor/time/version и выдаются уникальные link и promo” | 100 | READY |
| US-003 | 4 | 34 | 30 | `8/10/10`; SC-US-003-1: “создаёт одну комиссию”; SC-US-003-4 checks eligibility at `registered_at` | 84 | CAVEATS |
| US-004 | 4 | 42 | 30 | `8/10/10`; SC-US-004-1: “создаётся отдельная комиссия”; SC-US-004-4: forged intake gives “нулевой эффект ledger” | 92 | READY |
| US-005 | 4 | 34 | 24 | `4/10/10`; SC-US-005-1 creates “одна связанная отрицательная корректировка”, but SC-US-005-4 conflicts with the exact Refinement oracle | 78 | CAVEATS |
| US-006 | 6 | 34 | 30 | `8/7/10`; SC-US-006-1 fixes September period inclusion; SC-US-006-6 records “одна append-only отметка и одно изменение YTD”, but the owner-fixed fifth-day transfer timing is not closed | 81 | CAVEATS |
| US-007 | 5 | 34 | 30 | `8/10/10`; SC-US-007-1 plus Refinement's fixture yields withholding `28000` kopeks and net `172000`; unknown inputs fail closed | 84 | CAVEATS |
| US-008 | 3 | 34 | 30 | `8/10/10`; SC-US-008-1 requires provenance, and Refinement fixes aggregate = sum(scoped ledger) with concrete `13200`/unknown outcomes | 84 | CAVEATS |
| US-009 | 4 | 30 | 21 | `4/10/10`; SC-US-009-1 makes share intentional/no-auto-send, while SC-US-009-4 remains conditional and leaves “qualified lead” undefined | 71 | CAVEATS |
| US-010 | 3 | 50 | 30 | `8/10/10`; SC-US-010-1 requires badge plus separate impression/click | 100 | READY |
| US-011 | 3 | 42 | 30 | `8/10/10`; SC-US-011-1 puts one confirmed conversion in the code cohort and personal ledger | 92 | READY |
| US-012 | 3 | 30 | 28 | `4/10/10`; SC-US-012-2 fixes `320/390/768/1440`, zero horizontal overflow, keyboard/focus/labels/text statuses; the happy phrase “поддерживают последовательность A” remains qualitative | 78 | CAVEATS |
| US-013 | 6 | 42 | 30 | `8/10/10`; SC-US-013-3 atomically rejects role escalation and SC-US-013-5 yields one membership/assets set after consent | 92 | READY |

The quotes above are the required artifact proof for every non-zero Testable/Completeness score. Completeness is 10 where the story has happy + error/security + edge coverage; US-006 is 7 because the positive manual-send flow exists but does not close the accepted fifth-day timing. The 51-row mapping cited above is the proof for every non-zero Traceability score.

## Security and growth gates

Security is applicable and specific, so the separate rubric result is **+5**. Auth/grant bypass is covered by SC-US-013-3; brute force and injection by SC-US-013-4; cross-partner/program access by SC-US-002-3 and SC-US-008-3; forged N1 payment/refund intake by SC-US-004-4. These are observable rejection/no-ledger/no-session outcomes, not a claim that runtime controls already exist.

Growth traceability is applicable and earns the separate **+5**: exact `FR-GROWTH-001..004` IDs survive and Specification §5 maps them to happy/edge/security scenarios. This proves carry-forward only. The conditional lead-only proposal is still subject to finding A-3 below.

## Owner-fixed outcomes

- CJM A is explicit in PRD and Specification, and US-012 tests its selected presentation at four contract widths.
- N1 Proofwall is the sole first billing authority; ЮKassa confirmation remains N1's responsibility, while N3a consumes authenticated opaque N1 facts and never treats redirect/signup as payment.
- Previous-calendar-month selection is explicit in FR-PAYOUT-001 and SC-US-006-1. The separate meaning of “manual payout on the 5th” is not fully preserved; see A-2.
- The `28000`-kopeck (`280 RUB`) withholding and `172000`-kopeck net are a synthetic fixture tied to a confirmed rule version. They are test data, not a legal or merchant default. The percentage `20%` is likewise explicitly demo-only unless an owner configures a rate.

## Highest-priority findings and bounded fixes

1. **A-1 — HIGH, blocking: one refund fixture has opposite October oracles.** `Specification.md` SC-US-005-4 and its copied BDD scenario require “октябрь1коп”, while `Refinement.md` → `Межмесячное округление` requires the semantic monthly total `октябрь−1`. Both name payment `100`, commission `1`, two refunds `30`, delivery on 2 October before September freeze. **Fix:** make both SC copies say `сентябрь 0, октябрь −1` for the registry delta (or explicitly distinguish a positive cancellation magnitude from the signed ledger delta), and assert identical semantic totals/hash across both delivery permutations.

2. **A-2 — HIGH: the accepted fifth-day payout became only fifth-day register preparation.** PRD says “Выплата вручную 5-го числа за предыдущий календарный месяц”; FR-PAYOUT-001/SC-US-006-1 constrain snapshot preparation, while SC-US-006-6 accepts any external transfer date. A test cannot decide whether a transfer dated the 4th/6th satisfies the owner's rule. **Fix:** state that `transfer_date` is the 5th in program timezone for the preceding calendar month and define early/late evidence behavior; if the fifth constrains preparation rather than transfer, record that changed interpretation explicitly in PRD. Keep the stated no-weekend-shift rule.

3. **A-3 — MEDIUM: platform-lead acceptance is conditional and “qualified lead” has no oracle.** SC-US-009-4 begins “Given владелец одобрит” and neither the four inputs nor the scenario define the event that qualifies a lead or its stable duplicate identity. **Fix:** mark the contour accepted or deferred. If accepted, define the trusted qualifying event, business key, timestamp/context, duplicate result and exact zero-money assertions; if deferred, keep it outside mandatory MVP AC while retaining the proposal.

4. **A-4 — MEDIUM: recovery evidence names atomicity without an observable failure/retry result.** SC-US-007-5 says reconciliation “атомарно обновляет резерв/YTD”, but provides no starting reservation/YTD values, duplicate evidence identity, or crash/concurrent outcome. **Fix:** add a synthetic pre/post fixture and require exactly one TransferObservation, one YTD delta in the actual transfer year and one reservation transition for repeated/concurrent evidence; a failed attempt must leave RecoveryGate closed, ordinary confirmation blocked and no valid `sent` mark.

## Review boundary

This is a planning-document review. No runtime test, build, database race, browser run, provider call or restore exercise exists or was expected at this stage; none is reported as failed. External dependency capability, permission to implement, production deployment and real money movement remain separate gates. The existing Architecture/Pseudocode reviews were deliberately not repeated.

Status: completed
