# Independent user-stories validation — N3a

- Run: `20260909T174821Z-prd-a-1934`
- Work unit: `stories`
- Profile: `compact-quality-first-v2`
- Risk context: `XL` (money, tax, external N1/ЮKassa boundary)
- Requested model: `gpt-5.6-sol`, effort `high`
- Actual model: `null` — execution metadata for this worker was not exposed; the requested model is not treated as attestation
- Usage/cost: `null` — provider counters and rates were not exposed
- Started/duration: `null` — worker start timestamp was not attested, so duration is not reconstructed from the run id
- Completed at: `2026-09-09T18:23:46Z`

## Inputs and integrity

| Input | SHA-256 |
|---|---|
| `docs/PRD.md` | `13800427fed04e78d12414c93ff30e8d1a5d61579d1ec7d66d21499537d82384` |
| `docs/Specification.md` | `36cfb78e1ac7e15e3cd5ce386ee54aa24d380af7022a0ecfeefd5c20bfd10732` |
| `docs/test-scenarios.md` | `a03af82ba8f12e80177d9911f2c3bcf173304ea018f55d8da2dc385cd8aa2769` |
| `docs/product-discovery-brief.md` (growth trace only) | `2254286a9384e4974488bebc90c623e6faa70b52d228c2bdd5b4199aaf0fa9d3` |
| `requirements-validator/SKILL.md` | `b4b394adf08feee552f39c83331398f119e0d4abf21e683fe4706da438b4a426` |
| `requirements-validator/references/scoring-system.md` | `72104b74f07e0610f67f00b246b5225a530203bff225bacf7bf384bc6fd21cdf` |

Deterministic document checks: 13 `US-*` headings; 40 criterion headings in Specification; 40 rows in `test-scenarios.md` → `## Criterion scenarios`; 40 named BDD scenarios. The criterion-ID sets are identical, and the Specification hash embedded in `test-scenarios.md` matches the bytes reviewed. Per the scenario document's contract, every `SC-US-*` ID is both the acceptance criterion and its named scenario; the absence of a separate `AC-*` family is not a defect.

## Verdict

**CAVEATS.** The 13-story set averages **86.6/100** before bonuses. No story scores below 70, and none hits the blocking floor: every story has acceptance criteria, every criterion is mapped to a named scenario, and each story has at least some completion coverage. Seven stories are READY (≥90); six need focused review (70–89). Planning can continue. The affected payout, N1-ingress, tax/refund-oracle, and platform-leads contours should receive the bounded AC changes below before their implementation is treated as ready.

This verdict does not authorize production deployment or a real payout. The selected CJM A, N1-first/ЮKassa boundary, and manual payout on the 5th for the previous calendar month are owner-fixed constraints and therefore were not deducted under Negotiable.

## Scoring method

- INVEST tuple is `I/N/V/E/S/T`, maxima `8/8/10/8/8/8`.
- SMART tuple is `Specific/Measurable/Achievable/Relevant/Time-bound`, maxima `6/8/6/5/5`.
- Quality tuple is `Traceability/Completeness`, maxima `10/10`.
- Security and Growth are assessed separately and are not added to the 100-point story totals.
- An event or lifecycle boundary in Given/When counts as a time context for functional AC; response-time metrics are not invented where the outcome is categorical.

## Per-story scores

| Story | INVEST (50) | SMART (30) | Quality (20) | Total | Rubric status | Main reason for deductions |
|---|---:|---:|---:|---:|---|---|
| US-001 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-002 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-003 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | End-to-end link → N1 signup → payment slice depends on partner assets and the still-to-be-fixed N1 contract; it is broader than an independent small story. |
| US-004 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on attribution and verified N1 payment intake, but its commission outcome is bounded. |
| US-005 | 34 `(0/8/10/4/8/4)` | 24 `(4/4/6/5/5)` | 20 `(10/10)` | **78** | REVIEW | “Применимая сумма” gives no numeric oracle for a partial refund, cumulative refunds, or over-refund rejection. |
| US-006 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 12 `(10/2)` | **76** | REVIEW | The story promises register **and sending**, but its positive path ends at snapshot preparation; authorized manual `sent` with date/evidence has no success criterion. |
| US-007 | 30 `(0/8/10/4/4/4)` | 24 `(4/4/6/5/5)` | 20 `(10/10)` | **74** | REVIEW | Tax rules are safely gated, but the happy AC lacks a concrete rule/YTD/bracket fixture and exact expected gross/tax/net values. |
| US-008 | 30 `(0/8/10/4/4/4)` | 24 `(4/4/6/5/5)` | 20 `(10/10)` | **74** | REVIEW | “Метрики согласованы с ledger” and “каждая сумма имеет provenance” need a precise field/reconciliation oracle; the story also spans two role views and export isolation. |
| US-009 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on a first real commission; the voluntary no-auto-send outcome itself is precise. |
| US-010 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-011 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on partner activation and confirmed-payment intake; cohort outcome is bounded. |
| US-012 | 30 `(0/8/10/4/4/4)` | 22 `(2/4/6/5/5)` | 20 `(10/10)` | **72** | REVIEW | Cross-screen scope and phrases such as “поддерживают последовательность A”, “без горизонтальной потери” and “ясно маркировано” lack concrete viewport/DOM/a11y assertions. |
| US-013 | 42 `(8/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Registration, login/logout, grants, session revocation, rate limiting and injection are a two-slice scope, though the outcomes are testable. |

## Blocking-floor evidence

For every row below, Traceability = 10 is backed by `docs/test-scenarios.md` → `## Criterion scenarios`, which maps every listed criterion ID to the identically named scenario. The quoted text is from `docs/Specification.md` → `§4 User stories и acceptance criteria`; it supports non-zero Testable and Completeness. Completeness is 10 where happy + edge + security/error are present, except US-006, whose happy path is incomplete for the full story promise.

| Story | Testable | Completeness | Traceability | Quoted AC evidence |
|---|---:|---:|---:|---|
| US-001 | 8 | 10 | 10 | SC-US-001-1: “система сохраняет версию политики и разрешает приглашения”; mapped rows SC-US-001-1..3. |
| US-002 | 8 | 10 | 10 | SC-US-002-1: “фиксируются actor/time/version и выдаются уникальные link и promo”; mapped rows SC-US-002-1..3. |
| US-003 | 8 | 10 | 10 | SC-US-003-1: “attribution связывает payment с партнёром и создаёт одну комиссию”; mapped rows SC-US-003-1..3. |
| US-004 | 8 | 10 | 10 | SC-US-004-1: “создаётся отдельная комиссия по применимой policy version”; mapped rows SC-US-004-1..3. |
| US-005 | 4 | 10 | 10 | SC-US-005-1: “создаётся одна связанная отрицательная корректировка на применимую сумму”; mapped rows SC-US-005-1..3. |
| US-006 | 8 | 2 | 10 | SC-US-006-1: “snapshot включает применимые сентябрьские delta и не включает октябрьские”; mapped rows SC-US-006-1..3. This quotes a real AC, but the heading “Месячный реестр и отправка” has no authorized-send success AC. |
| US-007 | 4 | 10 | 10 | SC-US-007-1: “marginal brackets применяются к частям базы и сохраняются gross/tax/net/evidence”; mapped rows SC-US-007-1..3. |
| US-008 | 4 | 10 | 10 | SC-US-008-1: “метрики согласованы с ledger и каждая сумма имеет provenance”; mapped rows SC-US-008-1..3. |
| US-009 | 8 | 10 | 10 | SC-US-009-1: “owner явно копирует его/открывает native share, а N3a не отправляет сообщение”; mapped rows SC-US-009-1..3. |
| US-010 | 8 | 10 | 10 | SC-US-010-1: “виден badge N3a и отдельно считаются impression/click”; mapped rows SC-US-010-1..3. |
| US-011 | 8 | 10 | 10 | SC-US-011-1: “conversion учитывается в cohort кода и personal ledger”; mapped rows SC-US-011-1..3. |
| US-012 | 4 | 10 | 10 | SC-US-012-2: “контент становится одной колонкой без горизонтальной потери действий/статусов”; mapped rows SC-US-012-1..3. |
| US-013 | 8 | 10 | 10 | SC-US-013-3: “повышение роли и повторное создание доступа запрещены атомарно”; mapped rows SC-US-013-1..4. |

Floor result: `Testable > 0`, `Completeness > 0`, and `Traceability > 0` for all 13 stories. **Blocked by floor: 0.** This says the artifacts exist and are linked; it does not erase the semantic gaps listed below.

## Separate bonuses

### Security: +5 (separate from 100)

Applicable and present. Specific controls include server-side object authorization and cross-program isolation (`NFR-SECURITY-001`, SC-US-002-3, SC-US-008-3), authenticated/validated N1 intake (`NFR-SECURITY-002`), session/grant checks (SC-US-013-1..3), and rate-limit plus injection rejection (SC-US-013-4). The +5 recognizes presence; it does not mean every security path has scenario coverage. A forged or unauthenticated N1 business event is the material missing scenario below.

### Growth traceability: +5 (separate from 100)

Applicable because `docs/product-discovery-brief.md` → `PD-011. M5 — Growth Requirements Seed` contains FR-GROWTH-001..004. All four exact IDs survive in Specification and are mapped in `§5 Growth scenario coverage` to happy/edge/security scenarios: FR-GROWTH-001→US-009, 002→US-003, 003→US-010, 004→US-011. This proves carry-forward only, not implementation, business effect, legality, or complete monetary dogfooding.

## High-priority gaps and bounded fixes

1. **Authorized payout marking has no happy path.** FR-PAYOUT-003 requires an owner/operator to mark an external transfer with date and evidence, while SC-US-006-3 tests only export and an unauthorized `sent` attempt. Add `SC-US-006-4 — happy`: Given a frozen register row, valid tax preparation/approval, payout scope, external transfer date and evidence reference; When the authorized actor marks it sent; Then exactly one append-only payout mark is recorded, the snapshot remains unchanged, repeat submission is idempotent, `sent` is labelled as the actor's transfer assertion, and no bank transfer is initiated by N3a.

2. **The N1 money ingress has no explicit authentication-bypass scenario.** NFR-SECURITY-002 is normative, but SC-US-003-3 covers invalid promo/self-referral/unconfirmed payment rather than a forged transport. Add `SC-US-003-4 — security`: Given a missing/invalid/replayed attestation or a merchant/environment mismatch; When an alleged payment/refund event arrives; Then it is rejected with zero ledger effect, an auditable reconciliation exception is retained without secrets, and N1 billing remains unaffected.

3. **The platform's own lead-only referral contour is a proposed owner decision, not a complete story or financial dogfooding.** PRD §4 and FR-GROWTH-001/ADR-008 correctly say that enrollment, link/code and lead tracking are staged separately and that a platform billing source/price is absent. US-009 tests voluntary sharing only. Before claiming this staged contour as accepted scope, obtain owner review. If accepted, add one bounded lead-only story with criteria for explicit terms acceptance, unique platform link/code, qualified-lead recording in a separate context, and zero commission/payout effect from any N1 payment. Label monetary dogfooding unavailable until a separately approved N3a billing source and commission policy exist.

## Other focused refinements

- Add a partial-refund example table with payment amount, policy rate, refund sequence, expected adjustment in minor units, rounding rule, and cumulative cap; include an over-refund/mismatched-currency rejection. This makes US-005 executable without inventing “применимую сумму”.
- Add at least one exact tax fixture around a bracket boundary and one payer/person/year locking case, with expected gross/base/tax/net and rule version. Keep unknown YTD/status/contract as fail-closed gates; do not encode legal defaults that the owner/accountant has not approved.
- Define dashboard provenance fields and an equality oracle between ledger rows, aggregate totals and export; include an unresolved-reconciliation case with the exact affected/withheld values.
- For US-012, name supported contract widths and require zero horizontal document overflow, keyboard reachability, visible focus, programmatic labels, text status independent of color, and exact actor/action visibility. Visual brand choices remain fixed product constraints, not negotiation defects.

## Scope of validation

This was a planning-artifact review. No runtime code, build, database, provider call, browser check or executed acceptance test was required or claimed. Architectural documents were not needed to establish the findings; canonical requirements and scenarios were assessed directly.

Status: completed
