# Independent user-stories revalidation — N3a

- Run: `20260909T174821Z-prd-a-1934`
- Work unit: `stories-v2`
- Profile: `compact-quality-first-v2`
- Risk context: `XL` (money, tax, external N1/ЮKassa boundary)
- Requested model: `gpt-5.6-sol`, effort `high`
- Actual model/effort: `null` — worker execution metadata was not exposed; requested routing is not attestation
- Fallback: `null` — no host evidence of a model change
- Usage/cost: `null` — provider counters and a matching rate basis were not exposed
- Duration: `null` — no attested worker start/end interval; it is not reconstructed from the run id
- Base revision: `30ff86ac1203a98838ee16f1566e0cc1e606593d`

## Current dirty-snapshot inputs

| Input | SHA-256 |
|---|---|
| `docs/PRD.md` | `c01affc243901a30ca77afad8db7cf5e665bd6f688504f87963f51f9e271f4c8` |
| `docs/Specification.md` | `ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7` |
| `docs/Refinement.md` | `afd96e0545c56a5f3ca96b7a0aace28ba8e1a48e2621c31e30e286a6f27d6d5a` |
| `docs/test-scenarios.md` | `a9f0c65c5a7435695888b39586d4e3c5775136795588869e4e040efebb8cc995` |
| `requirements-validator/SKILL.md` | `b4b394adf08feee552f39c83331398f119e0d4abf21e683fe4706da438b4a426` |
| `requirements-validator/references/scoring-system.md` | `72104b74f07e0610f67f00b246b5225a530203bff225bacf7bf384bc6fd21cdf` |
| Optional context: prior `stories-v1.md` | `74d597c138f549482bc161548353053ee9db3d4338b4c928efa028908c7e5ab1` |

Deterministic inventory of the current snapshot: 27 `FR-*` + 9 `NFR-*` = 36 requirement headings, 13 `US-*` headings, 51 rows under `test-scenarios.md` → `## Criterion scenarios`, and 51 named Gherkin `Scenario:` blocks. The two 51-ID sets are identical. The scenario document embeds the current Specification digest `ebdbb...8f7`.

## Verdict

**CAVEATS, no blocking-floor failure.** The 13-story set now averages **90.8/100** before bonuses, replacing the stale 86.6 score from the earlier snapshot. Eight stories are READY (≥90), five are REVIEW (70–89), none is below 70, and none is blocked. Planning may continue; the five REVIEW stories still need deliberate implementation slicing because their product outcomes cross several upstream capabilities.

The formerly material `first-only` versus recurring contradiction is fixed in this snapshot. `FR-PROGRAM-001` requires one `every eligible payment` / `lifetime` mode; `FR-PROGRAM-002` excludes first-only and finite terms; `FR-COMMISSION-001` and `US-004` consistently cover first and later eligible manual payments.

## Scoring method

- INVEST tuple: `Independent/Negotiable/Valuable/Estimable/Small/Testable`, maxima `8/8/10/8/8/8`.
- SMART tuple: `Specific/Measurable/Achievable/Relevant/Time-bound`, maxima `6/8/6/5/5`.
- Quality tuple: `Traceability/Completeness`, maxima `10/10`.
- Security and Growth are separate bonuses and are not added to the 100-point story totals.
- A lifecycle/event boundary in Given/When is a timing context for categorical functional criteria; no response-time target was invented.

## Per-story scores

| Story | INVEST (50) | SMART (30) | Quality (20) | Total | Status | Basis for deductions |
|---|---:|---:|---:|---:|---|---|
| US-001 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-002 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-003 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | End-to-end link/cookie/promo → N1 signup → verified payment → historical eligibility depends on partner and N1 capabilities and remains wider than one independent slice. |
| US-004 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on attribution and verified N1 intake; the commission outcome itself is bounded. |
| US-005 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on payment/refund intake; current Refinement fixtures now make amounts, rounding, over-refund, and monthly permutations estimable and measurable. |
| US-006 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | Freeze, period allocation, idempotent preparation, authorized confirmation, calendar/year deviations, and recovery interaction form several dependent slices. |
| US-007 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | Tax profile, marginal calculation, shared reservation, НПД gate, evidence recovery, and accountant approval remain a broad money-critical story despite exact fixtures. |
| US-008 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | The story aggregates clicks through payouts across two roles and therefore depends on most upstream ledger and reconciliation behavior. |
| US-009 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Trigger depends on the first real commission; voluntary share behavior is bounded and explicit. D7 is excluded from this accepted score boundary as described below. |
| US-010 | 50 `(8/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **100** | READY | — |
| US-011 | 42 `(0/8/10/8/8/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Depends on partner activation and confirmed-payment intake; its code/cohort result is bounded. |
| US-012 | 34 `(0/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **84** | REVIEW | Cross-screen role, finance-state, responsive, keyboard, focus, label, and text-status checks remain a multi-surface slice; the new exact viewport/overflow assertions fix its prior testability gap. |
| US-013 | 42 `(8/8/10/4/4/8)` | 30 `(6/8/6/5/5)` | 20 `(10/10)` | **92** | READY | Registration, login/logout, one-time grants, consent membership, delegation, session expiry, rate limiting, and injection remain at least two implementation slices. |

Arithmetic: `(100+100+84+92+92+84+84+84+92+100+92+84+92) / 13 = 90.769...`, reported as **90.8**.

## Blocking-floor and actual-criterion evidence

For every story, `Testable = 8`, `Completeness = 10`, and `Traceability = 10`. The quoted clauses below are actual acceptance-criterion text from `Specification.md` §4/§9. Each listed ID also appears as an exact `Criterion → Scenario` row in `test-scenarios.md` → `## Criterion scenarios`; thus non-zero Traceability is artifact-backed. Happy + edge + security/error coverage supports Completeness 10.

| Story | T/C/R | Actual AC evidence (exact `Then` clauses) | Criterion-scenario rows |
|---|---:|---|---|
| US-001 | `8/10/10` | 001-1 “система сохраняет версию политики и разрешает приглашения”; 001-2 “активация отклонена с перечнем незаполненных решений”; 001-3 “запрос запрещён и записан в аудит без изменения версии.” | SC-US-001-1..3 |
| US-002 | `8/10/10` | 002-1 “фиксируются actor/time/version и выдаются уникальные link и promo”; 002-2 “активация не происходит и показывается новая версия”; 002-3 “доступ запрещён без раскрытия существования чужой записи.” | SC-US-002-1..3 |
| US-003 | `8/10/10` | 003-1 “attribution связывает payment с партнёром и создаёт одну комиссию”; 003-2 “применяется версия conflict/window rule, а выбранный исход и причина видимы”; 003-3 “комиссия не создаётся, а rejection безопасно аудируется.” | SC-US-003-1..4 |
| US-004 | `8/10/10` | 004-1 “создаётся отдельная комиссия по применимой policy version”; 004-2 “комиссия видна, а MRR показан как `unknown`”; 004-3 “денежный эффект возникает ровно один раз.” | SC-US-004-1..4 |
| US-005 | `8/10/10` | 005-1 “создаётся одна связанная отрицательная корректировка на применимую сумму”; 005-2 “закрытая история неизменна, а correction попадает в следующий период/exception”; 005-3 “повтор даёт прежний результат без второго эффекта, а mismatch блокируется для сверки.” | SC-US-005-1..4 |
| US-006 | `8/10/10` | 006-1 “snapshot включает применимые сентябрьские delta и не включает октябрьские”; 006-2 “новый долг не создаётся, а дата не переносится автоматически”; 006-3 “export не меняет статус, а неавторизованная отметка запрещена и аудируется.” | SC-US-006-1..6 |
| US-007 | `8/10/10` | 007-1 “marginal brackets применяются к частям базы и сохраняются gross/tax/net/evidence”; 007-2 “она уходит в review без автоматического удержания 6% и без придуманного split”; 007-3 “действие fail closed и причина остаётся в exception/audit.” | SC-US-007-1..5 |
| US-008 | `8/10/10` | 008-1 “метрики согласованы с ledger и каждая сумма имеет provenance”; 008-2 “видны exception и `MRR unknown`, а не ноль/оценка”; 008-3 “сервер запрещает доступ и не включает чужие данные в агрегат/export.” | SC-US-008-1..3 |
| US-009 | `8/10/10` | 009-1 “N3a готовит текст; owner явно копирует его/открывает native share, а N3a не отправляет сообщение”; 009-2 “новый first-value offer не возникает, а предыдущий факт не переписывается”; 009-3 “сообщение не отправлено; offer/open не записаны как intentional share.” | SC-US-009-1..4; 009-4 remains proposed-only |
| US-010 | `8/10/10` | 010-1 “виден badge N3a и отдельно считаются impression/click”; 010-2 “система не обещает покупку/цену и сохраняет badge до валидного entitlement”; 010-3 “серверное правило free восстанавливает badge; N1 widgets не изменяются.” | SC-US-010-1..3 |
| US-011 | `8/10/10` | 011-1 “conversion учитывается в cohort кода и personal ledger”; 011-2 “versioned lifecycle/conflict rule даёт один видимый исход без двойной комиссии”; 011-3 “выдача и доступ запрещены.” | SC-US-011-1..3 |
| US-012 | `8/10/10` | 012-1 “Rubik/slate/white/blue CTA и двухколоночный hero поддерживают последовательность A”; 012-2 “на320/390px контент становится одной колонкой; на всех ширинах document.scrollWidth≤viewport, действия достижимы клавиатурой, focus виден, поля имеют labels и статусы текстовые”; 012-3 “owner controls отсутствуют, начисление не названо выплатой, demo ясно маркировано.” | SC-US-012-1..3 |
| US-013 | `8/10/10` | 013-1 “создана одна учётная запись с назначенной grant ролью и сессия; пароль и token хранятся только как hash”; 013-2 “сервер отклоняет запрос без финансовой записи и предлагает вход”; 013-3 “повышение роли и повторное создание доступа запрещены атомарно.” | SC-US-013-1..6 |

Floor result: all 13 have non-zero Testable, Completeness, and Traceability. **Blocked by floor: 0.** This proves criterion existence, coverage shape, and linkage, not implementation or execution.

## Separate bonuses

### Security: +5

Applicable and specific. Evidence includes server-side object authorization and cross-program isolation (`NFR-SECURITY-001`, SC-US-002-3, SC-US-008-3), authenticated and validated N1 ingress (`NFR-SECURITY-002`, SC-US-004-4), grant/session/rate-limit/injection controls (SC-US-013-1..4), and fail-closed payout/tax actions (SC-US-006-3, SC-US-007-3). The bonus records requirements coverage only.

### Growth traceability: +5

Applicable. The prior source-bound review established that the discovery seed contains `FR-GROWTH-001..004`; in the current Specification all four exact IDs remain present and `§5 Growth scenario coverage` maps them to US-009, US-003, US-010, and US-011 respectively. This proves carry-forward only. The discovery brief was not reread in this bounded work unit, so applicability relies on the cited prior receipt; current carry-forward was independently rechecked.

## Actual findings (maximum three)

1. **Medium — five stories remain broad/dependent implementation units.** US-003, US-006, US-007, US-008, and US-012 each score 84 because their outcomes span multiple prerequisite capabilities or surfaces. Their criteria are now executable, but the story boundaries still need deliberate vertical slicing during planning; the scoring table records the exact affected dimensions. This is a sizing/independence caveat, not a missing-AC block.

No second defect is asserted. The refreshed criteria close the prior partial-refund oracle, authorized payout happy path, forged N1 intake, tax fixture, dashboard reconciliation, and responsive/a11y gaps. The rubric forbids inventing findings to meet a count.

## Required D7 decision boundary

`SC-US-009-4` explicitly says the platform-leads contour is a test contour for proposal D7 and “не принятая MVP-обязанность до решения владельца.” PRD §4 and `FR-GROWTH-001` likewise describe lead-only platform growth as proposed. Therefore it is not treated as approved scope, delivered behavior, or monetary dogfooding. The pending owner question remains open; no permission, N3a billing source, price, commission policy, real payout, or completion is inferred. Payments to N1 have zero monetary effect in the proposed platform context.

## Limits

This was a planning-artifact rereview of the four named current files. No source requirements were changed; no runtime code, build, database, provider call, browser check, monetary transfer, deployment, or executed acceptance test was performed or claimed. The 51 Gherkin blocks are test plans, not passing test results. Architecture and pseudocode were outside this bounded work unit. No actual model, token, cost, or duration counters were available, so savings are not established.

Status: completed
