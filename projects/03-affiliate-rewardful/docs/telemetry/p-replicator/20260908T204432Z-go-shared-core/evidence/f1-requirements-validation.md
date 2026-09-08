# Independent requirements validation — N3 F1

Run: `20260908T204432Z-go-shared-core`; work unit: `f1-requirements-validation`; profile: `compact-quality-first-v2`; risk: XL.

Verdict: **READY WITH CAVEATS for Phase 2**, for shared-core → A → B → C → D. No blocking money or authorization contradiction remains in the reviewed F1 contract. This is readiness to implement; there is no runtime, build, money correctness or browser acceptance claim.

Independent read-only semantic review. Repository was not edited. Parent owns the final per-feature reports and must copy the Criterion scenarios rows under that exact heading and bind each report to its specification SHA. A score without that artifact cannot satisfy the rubric floor.

## Rubric and interpretation

Source: `.claude/skills/requirements-validator/references/scoring-system.md`, headings “INVEST Score Breakdown”, “SMART Score Breakdown”, “Quality Score Breakdown”, “Blocking floor”. Formula: INVEST 50 + SMART 30 + quality 20. Quote: “A non-zero Testable or Completeness REQUIRES quoting the acceptance criteria being scored”. Quote: “A non-zero Traceability REQUIRES the Criterion scenarios table”. The 60 exact AC quotations and named mappings below satisfy those requirements for this report; before creating this artifact, the missing table would score zero and block.

INVEST vectors are I/N/V/E/S/T, maxima 8/8/10/8/8/8. SMART vectors are S/M/A/R/T, maxima 6/8/6/5/5. Quality vectors are Traceability/Completeness, maxima 10/10. Scores are reasoned rubric judgments, not measured engineering effort or delivery forecasts.

Independent=0 where the story requires another story’s ledger, settlement, enrollment or cross-variant artifact. Negotiable=8 means implementation/composition can be discussed within the frozen safety contract; security requirements are not optional. Valuable=10 is supported by the “Как … хочу …” story quotes in the source specifications. Estimable=8 is supported by concrete actor/action/state contracts, integer policies, and fixture-only scope; it does not promise a calendar. Small=8 for bounded individual F1 stories; shared US-004=0 conservatively because it is a whole settlement lifecycle with concurrency/reconciliation, not comfortably a single-sprint slice. No feature-average score masks that reduction.

Specific=6 because broad prose is concretized by the normative runtime contract. Measurable=8 for explicit amounts/counts, policy fields or bounded grant/hold/period values; 4 for partly measurable UI/explanation/identity outcomes. Time-bound=5 only when a concrete business time is inherited (hold/window, period/due date, grant/session expiry); otherwise 0. No response SLA is invented to improve a score. Completeness=10 where AC include happy path, error and replay/concurrency/temporal edges; 7 when happy path plus denial/error comes from the local AC and its inherited shared requirements/refinement but local edge specificity is lighter. Missing performance SLAs do not trigger the floor.

## Per-feature verdict

| Feature | Stories | AC | Base score mean | Lowest story | Verdict |
|---|---:|---:|---:|---:|---|
| shared-core | 6 | 25 | 93.17/100 | 84/100 | READY WITH CAVEATS |
| a-merchant | 4 | 8 | 92.25/100 | 80/100 | READY WITH CAVEATS |
| b-customer | 4 | 9 | 90.00/100 | 88/100 | READY WITH CAVEATS |
| c-partner | 4 | 8 | 89.00/100 | 80/100 | READY WITH CAVEATS |
| d-agent | 5 | 10 | 90.80/100 | 83/100 | READY WITH CAVEATS |

All stories exceed the 70-point proceed threshold; none falls below 50 or the closed blocking floor. Totals below exclude bonuses. Security +5 applies because the shared normative contract specifies actor/membership/tenant/grant checks, hashed tokens, safe errors, input schema, size/CORS and isolated secrets. Growth +5 applies at project level for carrying all six seed IDs into Specification; it is not counted five times or treated as implemented business growth.

## Story scoring

| Feature / story | INVEST vector | SMART vector | Quality vector | Base /100 |
|---|---|---|---|---:|
| shared-core / US-001 | 8/8/10/8/8/8 = 50 | 6/4/6/5/0 = 21 | 10/10 = 20 | 91 |
| shared-core / US-002 | 8/8/10/8/8/8 = 50 | 6/8/6/5/5 = 30 | 10/10 = 20 | 100 |
| shared-core / US-003 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 |
| shared-core / US-004 | 0/8/10/8/0/8 = 34 | 6/8/6/5/5 = 30 | 10/10 = 20 | 84 |
| shared-core / US-005 | 8/8/10/8/8/8 = 50 | 6/8/6/5/5 = 30 | 10/10 = 20 | 100 |
| shared-core / US-006 | 8/8/10/8/8/8 = 50 | 6/8/6/5/0 = 25 | 10/7 = 17 | 92 |
| a-merchant / US-101 | 8/8/10/8/8/8 = 50 | 6/8/6/5/5 = 30 | 10/10 = 20 | 100 |
| a-merchant / US-102 | 8/8/10/8/8/8 = 50 | 6/8/6/5/5 = 30 | 10/10 = 20 | 100 |
| a-merchant / US-103 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/7 = 17 | 89 |
| a-merchant / US-104 | 0/8/10/8/8/8 = 42 | 6/4/6/5/0 = 21 | 10/7 = 17 | 80 |
| b-customer / US-201 | 8/8/10/8/8/8 = 50 | 6/4/6/5/0 = 21 | 10/7 = 17 | 88 |
| b-customer / US-202 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 |
| b-customer / US-203 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 |
| b-customer / US-204 | 8/8/10/8/8/8 = 50 | 6/4/6/5/0 = 21 | 10/7 = 17 | 88 |
| c-partner / US-301 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/10 = 20 | 92 |
| c-partner / US-302 | 8/8/10/8/8/8 = 50 | 6/8/6/5/0 = 25 | 10/10 = 20 | 95 |
| c-partner / US-303 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/7 = 17 | 89 |
| c-partner / US-304 | 0/8/10/8/8/8 = 42 | 6/4/6/5/0 = 21 | 10/7 = 17 | 80 |
| d-agent / US-401 | 8/8/10/8/8/8 = 50 | 6/8/6/5/5 = 30 | 10/10 = 20 | 100 |
| d-agent / US-402 | 0/8/10/8/8/8 = 42 | 6/8/6/5/0 = 25 | 10/10 = 20 | 87 |
| d-agent / US-403 | 0/8/10/8/8/8 = 42 | 6/4/6/5/0 = 21 | 10/10 = 20 | 83 |
| d-agent / US-404 | 8/8/10/8/8/8 = 50 | 6/8/6/5/0 = 25 | 10/10 = 20 | 95 |
| d-agent / US-405 | 0/8/10/8/8/8 = 42 | 6/8/6/5/5 = 30 | 10/7 = 17 | 89 |

## Consequential semantic findings

1. Monetary identity is explicit and durable. Runtime “Payment и refund” requires stable provider/account/object ID, changed-payload rejection, original reward immutability, queued refunds and cumulative rounding. With P=150000 and 2000bps, reward=30000 minor; cumulative refund reversal is original reward minus reward on remaining gross. This supports split-refund equivalence and replay tests independently of implementation.

2. Settlement ownership is coherent. Runtime “Registry и allocation lifecycle”: “Approval checks exact revision/hash and current sourceVersion then claims every positive obligation via unique allocation ownership in one transaction.” The paired requirement “Recalculation/new source invalidates approvals and releases only unsent allocations; sent allocations and transfer facts remain forever” resolves prior allocation/refund deadlock concerns. Tests must include mixed sent/unsent rows and competitors, not only prepare/export.

3. Stale exported CSV cannot be recalled; the contract correctly distinguishes fresh `registry.sent` from `registry.reconcile` for an already performed stale-version transfer. Reconciliation records original revision/amount/evidence and discrepancy without authorizing another payment. No bank integration or automatic debt-offset is implied. This closes AC-shared-core-47/48 without production claims.

4. Credits are separate obligations: reservations subtract from available balance and invoice remaining; unknown outcome retains reservation, failed releases once, success applies once. Terminal conflict fails. A late refund creates an adjustment/exception without rewriting an invoice. This is implementable with tenant-serialized pg transactions and bounded fixtures; it still requires concurrent SQL evidence.

5. Authorization order is explicit: membership/grant checks precede action/idempotency result; revoke is checked before cached results. Grants exclude approve/export/sent/enrollment/credit.reserve and grant management. Cross-tenant and own-subject queries are denied before projection. The fixture bootstrap deliberately creates laboratory actor contexts; it is not production authentication. Limited tokens must exercise negative tests rather than only the all-role bootstrap.

6. UI/MCP/A2A business scenarios are not a wire interoperability claim. Shared PRD “Приёмка по режимам” explicitly places F1 semantics in the fixture actor/transport harness and defers real negotiation, serialization, auth and client interoperability to W4. AC-shared-core-63 is checked as the common-ledger invariant on fixtures, not as a real pilot. No provider verification documentation review or external banking test is required for this F1 readiness decision.

7. Database isolation is stricter than the repository’s generic loopback exception: the user/project forbid all host DB ports, including tests. Runtime/Architecture specify only API and PostgreSQL on an internal db network; UI uses a distinct network. A generated secret0600, nondefault random password, no token/secret logging, and production-mode refusal are explicit. The root loopback exception must not be reused.

## Bounded caveats and implementation decisions

- **C1 shared-core:** US-004 is larger than a compact story. Implement and verify it in bounded ledger → prepare/approve → export/sent/reconcile slices, but keep the complete lifecycle as its acceptance boundary. This is sequencing, not an extra feature or a request for repeated approval.

- **C2 shared/A/C:** the runtime contract supplies the F1 hold7/window30/UTC/2000bps values; historical HTML hold14 and unapproved production examples cannot override them. Public terms mean fixture-session terms in F1: program.read requires a member, and A PRD explicitly defers public publication. UI can preview form inputs before program.save; that command publishes a new fixture policy. Do not add a production anonymous endpoint or hidden policy default.

- **C3 shared/D/A:** direct-owner session and grant contexts must stay distinct in the harness. The F1 design is not a secure external credential delegation protocol. Handoff across browser origins must use an explicit allowlisted transfer mechanism with exact origin/source/schema checks; token in URLs is forbidden. Artifact id/revision/hash alone grants no access. The current owner must re-read/approve the current revision after later source changes.

- **C4 shared:** some operational limits have a required existence but no chosen numeric value (bootstrap rate/run cap, connection/statement/lock timeout). Choose explicit conservative fixture constants and cover their boundaries; those are reversible implementation choices, not missing product authorization. Rate limiting must count malformed bootstrap attempts before schema validation; quota is charged only for a successfully committed seed.

- **C5 B:** value moment, independent decline, explicit consent and iframe isolation need actual browser behavior. A single seeded screenshot or pre-enrolled default customer cannot alone prove no-consent behavior. Provide an unenrolled path, a held-credit path, and the distinct available-credit300/invoice1500 path. No real Proofwall SSO is assumed.

- **C6 growth/look:** do not lose requirements outside the 60 AC. See table below. In particular promo/link cohorts and badge behavior are not automatically proved by ledger tests. Preserve source capture uncertainty and the speculative status of growth effects. FR-LOOK-005 says “three” historically; current Architecture/PRDs require all four variants.

- **C7 completion:** 05_completion files are explicitly planned, with no executable test receipt. Their absence is correct before IMPLEMENT and blocks completion later. Four mandatory real browser journeys at390/1440, keyboard/error/durable refresh, B foreign-origin CSS/CSP/CORS, D owner/partner/customer/revoke/cancel/A handoff, build, PostgreSQL concurrency/restart, all shared regression and mutation evidence must exist before handoff. Requirements readiness is not permission to skip these gates.

## Discovery requirements outside the 60 AC

| ID | F1 mapping / named scenario | Caveat |
|---|---|---|
| FR-GROWTH-001 | B US-201/204; Value moment precedes opt-in and user-initiated share | Speculative growth effect; no auto-send |
| FR-GROWTH-002 | shared US-002/003, B US-202; Pending attribution cannot mint confirmed reward | Pending/no-reward explanation must be visible |
| FR-GROWTH-003 | Shared UI and role portal; Fixture pilot retains attribution badge | Keep F1 pilot branded; no paid entitlement or growth effect invented. If paid-tier switch is exposed, deny removal for every unknown tier |
| FR-GROWTH-004 | shared attribution/enrollment, B/C share kit, A reporting; Promo and link cohorts remain distinguishable through confirmed conversion | Personal promo and cohort projection require explicit implementation/tests beyond the 60 SC |
| FR-GROWTH-005 | B US-201/204 and runtime HTTP/embed; Foreign-origin fixture identity and standalone portal | Real SSO explicitly deferred F2 |
| FR-GROWTH-006 | shared US-003/004, C US-303; Immutable commission source and separate payout status | Manual sent is not bank credited |
| FR-LOOK-001 | Shared UI browser style assertion: Rubik, slate text, #0087ee, white | Source public capture only |
| FR-LOOK-002 | A/B/C/D marketing composition: desktop hero columns and CTA5px, mobile adaptation | Do not force two columns at390px |
| FR-LOOK-003 | Marketing and working screens have distinct entries and scope | D/closed source flows are author reconstruction |
| FR-LOOK-004 | Ledger/payment/payout rendering shows separate statuses | Covered across A/C/D browser journeys |
| FR-LOOK-005 | All four variants at390/1440 with keyboard labels/focus | Later four-variant scope supersedes historical “three” |

Growth source is `docs/product-discovery-brief.md` → `Growth Requirements Seed`; all FR-GROWTH-001…006 appear verbatim as IDs in `docs/Specification.md` → `Сохранённые требования discovery`. Source profile FR-LOOK-001…005 also appear there. The original seed labels several obligations SPECULATIVE; F1 implementation is an authorized experiment, not a decision to ship them as proven production growth mechanisms.

## Additional BDD outlines for inherited adversarial requirements

These supplement the exact 60 business scenarios below and define executable oracles; they are not claims that test code already exists. Instantiate each protected action used by each story through this shared matrix rather than inventing duplicate business AC.

| Named scenario | Given / When / Then | Applies |
|---|---|---|
| SEC-auth-bypass | Given absent/invalid/expired session, when any protected action is called, then401/403 and no data/mutation; UI variant or actorId alone cannot authorize | All 23 stories |
| SEC-input-injection | Given SQL strings, HTML/script payloads, __proto__/constructor keys and oversize bodies, when submitted at command/HTTP boundaries, then schema/size rejection or inert escaped display, no SQL/code execution or secret leak | All user-supplied action inputs; A/C/D ledger rendering; B embed |
| SEC-cross-tenant | Given a second fixture tenant and known resource IDs, when a valid first-tenant member requests them, then403/404 without foreign fields and identical balances before/after | All tenant data stories, especially US-001/006/304/405 |
| SEC-bootstrap-rate | Given configured bootstrap cap N/window, when more than N valid and malformed attempts occur, then later attempts are rate-limited; malformed attempts cannot bypass limiter; rejected seed does not partially persist | createDemo / US-006 |
| ERR-db-rollback-retry | Given an injected failure after a mutation starts, when transaction aborts and same key retries, then no orphan ledger/inbox/allocation/reservation and exactly one final result | US-002/003/004/101/203/302/402/404 |
| EDGE-refund-rounding | Given amount7minor/bps2000, when refunds1 then1 are applied, then cumulative reversal1minor equals one refund2; repeated refund ID changes nothing | US-002/003/102 |
| EDGE-refund-before-payment | Given a verified pending partial refund, when confirmed payment later arrives, then original accrual and queued reversal commit together; replay cannot restore it | US-002/003/102 |
| EDGE-settlement-races | Given two prepared overlapping registries, when approve concurrently, then only one allocation owner; after one partner sent and refund, sent stays claimed and unsent is released; stale export rejects and old-CSV reconciliation records once | US-004/103/402/403 |
| EDGE-credit-unknown | Given balance300/invoice1500 and reservation300, when result unknown then concurrent retry/new reserve, then no second spend; failed releases once; success applies once; conflicting terminal result rejects | US-203/405 |
| EDGE-grant-cache-cancel | Given successful task and cached result, when grant is revoked/expired, then delegated replay denies; direct owner can read artifact. Given canceled T1 and fresh T2, late T1 cannot publish to either | US-005/104/401/403/404 |
| EDGE-restart | Given persisted session/ledger/registry/reservation, when API/container restarts without dropping DB volume and commands replay, then same identities/results and no duplicated effects | Shared persistence invariant across all UIs |
| UI-embed-boundary | Given foreign-origin host with hostile CSS and restrictive CSP, when B loads, declines, joins and reads credit, then styles stay isolated, allowed CORS works and hostile origin/source/schema messages do not convey identity or mutate state | B US-201/204 |

## Criterion scenarios

Every row below maps an AC heading in `docs/features/<feature>/01_specification.md` to an explicitly named scenario. The source quotation is the exact AC body (SC ID separately identified). This table is the evidence used for nonzero Testable, Completeness and Traceability scores.

| Criterion | Scenario | Source quotation |
|---|---|---|
| AC-shared-core-11 | SC-US-001-1 — Foreign tenant denied before projection | `docs/features/shared-core/01_specification.md` → `AC-shared-core-11`: Given пользователь tenantX, When запрашивает resource tenantY через UI/MCP/A2A, Then отказ до чтения/изменения, отсутствие чужих полей в ответе. |
| AC-shared-core-12 | SC-US-001-2 — Foreign partner and global registry denied | `docs/features/shared-core/01_specification.md` → `AC-shared-core-12`: Given партнёрX, When запрашивает общий реестр или запись партнёраY, Then отказ; знание ID и выбор варианта не дают доступа. |
| AC-shared-core-13 | SC-US-001-3 — Role switch rechecks server membership | `docs/features/shared-core/01_specification.md` → `AC-shared-core-13`: Given пользователь имеет две роли, When переключает рабочий контекст, Then сервер проверяет членство и роль заново; UI отображает действующего субъекта. |
| AC-shared-core-21 | SC-US-002-1 — Duplicate and parallel payment yields one reward | `docs/features/shared-core/01_specification.md` → `AC-shared-core-21`: Given подтверждённый платёж, When событие доставлено дважды/параллельно, Then одно эффективное начисление на business payment id и reward policy, а не на delivery attempt. |
| AC-shared-core-22 | SC-US-002-2 — New recurring payment accrues independently | `docs/features/shared-core/01_specification.md` → `AC-shared-core-22`: Given тот же клиент оплатил следующий период, When пришёл новый подтверждённый payment id, Then отдельное начисление, если версия политики предусматривает recurring; converted referral не блокирует renewal. |
| AC-shared-core-23 | SC-US-002-3 — Unverified event cannot poison confirmed inbox | `docs/features/shared-core/01_specification.md` → `AC-shared-core-23`: Given событие не проверено у провайдера или проверка недоступна, When поступило уведомление, Then оно не становится подтверждённым доходом, доступен повтор/сверка. |
| AC-shared-core-24 | SC-US-002-4 — Explicit promo precedence without invalid-code fallback | `docs/features/shared-core/01_specification.md` → `AC-shared-core-24`: Given одновременно ссылка и промокод, When атрибуция разрешается, Then применяется одна версия правила. Предложение пилота: явный промокод приоритетен, неверный явный код не даёт скрытого cookie fallback; это требует утверждения до F2. |
| AC-shared-core-31 | SC-US-003-1 — Immutable original and correction retain source policy | `docs/features/shared-core/01_specification.md` → `AC-shared-core-31`: Given оплата/возврат/пересчёт, When изменяется экономический итог, Then сохраняются исходная запись и коррекция с причиной/ссылкой на событие; история не переписывается под текущую ставку. |
| AC-shared-core-32 | SC-US-003-2 — Credit never enters cash payout | `docs/features/shared-core/01_specification.md` → `AC-shared-core-32`: Given cash и subscription credit, When строится баланс, Then разные типы обязательств и доступности; credit нельзя выгрузить как денежную выплату или автоматически конвертировать в cash. |
| AC-shared-core-33 | SC-US-003-3 — Post-sent refund preserves transfer and raises exception | `docs/features/shared-core/01_specification.md` → `AC-shared-core-33`: Given возврат уже оплаченной комиссии, When он обработан, Then видна корректировка/задолженность и необходимость сверки; физический перевод не объявляется автоматически отменённым. |
| AC-shared-core-41 | SC-US-004-1 — Prepare eligible monthly cash with exclusions | `docs/features/shared-core/01_specification.md` → `AC-shared-core-41`: Given выбранный период и допустимые к выплате начисления, When подготовлен реестр, Then видны период, получатели, сумма, валюта, версия, исключения; не включены уже отправленные позиции и credits. |
| AC-shared-core-42 | SC-US-004-2 — Changed snapshot invalidates prior approval and export | `docs/features/shared-core/01_specification.md` → `AC-shared-core-42`: Given утверждена версияV1, When состав/сумма меняется, Then появляется новая версия и старое утверждение неприменимо; экспорт требует действующего утверждения этой версии. |
| AC-shared-core-43 | SC-US-004-3 — CSV download never marks sent | `docs/features/shared-core/01_specification.md` → `AC-shared-core-43`: Given CSV выгружен, When его скачивание завершилось, Then статуса «отправлено» нет. Отдельная отметка владельца содержит дату/оператора/основание, не гарантирует зачисление. |
| AC-shared-core-44 | SC-US-004-4 — Repeated preparation creates no second payable obligation | `docs/features/shared-core/01_specification.md` → `AC-shared-core-44`: Given повторная подготовка периода, When одинаковый запрос повторён, Then не возникает второй набор подлежащих оплате обязательств; экспорт сам по себе не резервирует новую выплату. |
| AC-shared-core-45 | SC-US-004-5 — Competing approvals claim each obligation once | `docs/features/shared-core/01_specification.md` → `AC-shared-core-45`: Given одно cash-обязательство доступно двум одновременно подготовленным реестрам, When утверждаются оба, Then оно атомарно закрепляется только за одним действующим settlement; второй получает конфликт и пересчёт. Разные idempotency keys не создают право платить его дважды. |
| AC-shared-core-46 | SC-US-004-6 — New command key cannot duplicate sent amount | `docs/features/shared-core/01_specification.md` → `AC-shared-core-46`: Given обязательство уже помечено отправленным, When другой оператор/агент повторяет отметку с другим ключом, Then второй факт отправки не увеличивает выплаченную сумму; исправление ошибочной отметки — отдельная аудируемая процедура. |
| AC-shared-core-47 | SC-US-004-7 — Refund releases unsent allocations and preserves sent rows | `docs/features/shared-core/01_specification.md` → `AC-shared-core-47`: Given утверждённый, но не отправленный реестр с allocations, When новый подтверждённый refund меняет source snapshot, Then в одной транзакции старое утверждение/экспорт становятся недействительными, только неотправленные allocations освобождаются либо переносятся в новую явно неутверждённую версию. Отправленные строки не освобождаются. |
| AC-shared-core-48 | SC-US-004-8 — Stale CSV transfer becomes unique reconciliation exception | `docs/features/shared-core/01_specification.md` → `AC-shared-core-48`: Given оператор фактически перевёл деньги по ранее скачанному устаревшему CSV, When фиксирует это после refund, Then факт не скрывается и не отбрасывается как будто перевода не было: создаётся reconciliation exception с исходной версией/суммой и отдельной коррекцией; запись не означает разрешение нового перевода. |
| AC-shared-core-51 | SC-US-005-1 — Grant allows reads and drafts but forbids payout approval | `docs/features/shared-core/01_specification.md` → `AC-shared-core-51`: Given действующий grant чтения/черновика, When агент выполняет разрешённую задачу, Then нет лишнего подтверждения каждого чтения; approve/pay/send из этого grant не следуют. |
| AC-shared-core-52 | SC-US-005-2 — Revoke and expiry deny next step and cached result | `docs/features/shared-core/01_specification.md` → `AC-shared-core-52`: Given grant отозван/истёк, When начинается следующий защищённый шаг либо отдаётся новый защищённый результат, Then он отвергается; сохранённый результат доступен владельцу по его собственным правам. |
| AC-shared-core-53 | SC-US-005-3 — Owner opens identical artifact across channels | `docs/features/shared-core/01_specification.md` → `AC-shared-core-53`: Given агентный артефакт id/version/hash, When владелец продолжает в UI, Then использует тот же артефакт, суммы и правила; переключение канала не создаёт новый расчёт. |
| AC-shared-core-54 | SC-US-005-4 — Canceled task rejects late response without external rollback | `docs/features/shared-core/01_specification.md` → `AC-shared-core-54`: Given задача отменена, When приходит поздний ответ, Then он не продвигает отменённую задачу и не записывается как результат новой задачи; cancel не объявляется отменой внешнего перевода. |
| AC-shared-core-61 | SC-US-006-1 — Fresh demo runs isolate seed and balances | `docs/features/shared-core/01_specification.md` → `AC-shared-core-61`: Given один тестовый dataset, When запускаются варианты, Then каждому сеансу выделен изолированный sandbox/tenant; не объединяются fake balances разных испытаний. |
| AC-shared-core-62 | SC-US-006-2 — Handoff preserves tenant subject and artifact revision | `docs/features/shared-core/01_specification.md` → `AC-shared-core-62`: Given переход UI↔agent внутри одной задачи, When передан artifact reference, Then сохраняются tenant/subject и версия; изоляция экспериментальных сеансов не разрывает этот переход. |
| AC-shared-core-63 | SC-US-006-3 — One backend payment is shared across variant projections | `docs/features/shared-core/01_specification.md` → `AC-shared-core-63`: Given реальный пилот, When один платёж виден в нескольких интерфейсах, Then он обрабатывается общим backend ровно один раз, а варианты читают один ledger. |
| AC-a-merchant-1011 | SC-US-101-1 — Valid policy version shown and used prospectively | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1011`: Given есть права владельца и fixture project; When сохраняет валидные ставку/окно/тип вознаграждения; Then создана версия политики, видимая в preview; будущие начисления ссылаются на неё. |
| AC-a-merchant-1012 | SC-US-101-2 — Missing or out-of-range policy is rejected | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1012`: Given ставка отсутствует или значение вне разрешённого диапазона; When пытается опубликовать; Then публикация запрещена с исправляемой ошибкой; скрытого default нет. |
| AC-a-merchant-1021 | SC-US-102-1 — Confirmed fixture payment displays source rule amount hold | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1021`: Given есть confirmed fixture payment и атрибуция; When запускает пример начисления; Then видит событие/правило/сумму/hold; общий SC-US-002 применяется. |
| AC-a-merchant-1022 | SC-US-102-2 — Payment replay after refund cannot restore commission | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1022`: Given после оплаты зарегистрирован возврат; When повторно получает старое событие оплаты; Then коррекция остаётся; комиссия не восстанавливается из-за delivery replay. |
| AC-a-merchant-1031 | SC-US-103-1 — Owner exports exact approved registry with exclusions | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1031`: Given есть eligible cash entries за месяц; When готовит/проверяет/утверждает реестр; Then выгружает именно эту версию и видит исключённые строки. |
| AC-a-merchant-1032 | SC-US-103-2 — Export status remains separate from explicit sent fact | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1032`: Given уже выгрузил CSV; When ещё не делал перевод; Then интерфейс не показывает отправку; отдельная отметка хранит оператора и дату. |
| AC-a-merchant-1041 | SC-US-104-1 — Copy program enrollment URL and current rate | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1041`: Given создана программа; When копирует приглашение; Then получает enrollment link, а не customer referral link; отображается действующая ставка. |
| AC-a-merchant-1042 | SC-US-104-2 — D handoff opens corrected persisted artifact in A | `docs/features/a-merchant/01_specification.md` → `AC-a-merchant-1042`: Given агент подготовил исправленную версию реестра; When открывает её в A; Then тот же id/version/hash/суммы доступны по правам владельца; не подставляется старый demo dataset. |
| AC-b-customer-2011 | SC-US-201-1 — Value moment invitation permits decline | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2011`: Given клиент опубликовал виджет, событие value moment известно; When открывает предложение; Then видит условия и возможность отказаться, не теряя функции основного продукта. |
| AC-b-customer-2012 | SC-US-201-2 — Read or page load cannot enroll without consent | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2012`: Given согласие не получено; When открывает страницу или его агент читает условия; Then не создаётся enrollment; чтение не считается согласием. |
| AC-b-customer-2021 | SC-US-202-1 — Confirmed friend payment creates held credit | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2021`: Given друг подтвердил оплату и policy разрешает credit; When обрабатывается событие; Then credit отражён на проверке с источником и условием доступности. |
| AC-b-customer-2022 | SC-US-202-2 — Click registration and self-referral cannot earn available credit | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2022`: Given есть только регистрация/клик либо self-referral; When система рассматривает награду; Then доступный бонус не появляется; причина отказа/ожидания объяснима. |
| AC-b-customer-2031 | SC-US-203-1 — Apply 300 RUB once to 1500 RUB invoice | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2031`: Given есть доступный credit300 и fixture invoice1500; When применяет300 к счету; Then счёт1200, credit зарезервирован/применён однократно; отдельный статус при незавершённом счёте. |
| AC-b-customer-2032 | SC-US-203-2 — Concurrent credit reserve cannot overspend | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2032`: Given два запроса одновременно пытаются применить один credit; When выполняется общий use case; Then не тратится больше доступного остатка; проигравший получает актуальный баланс. |
| AC-b-customer-2033 | SC-US-203-3 — Unknown billing retains reservation until one terminal resolution | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2033`: Given credit зарезервирован, а результат биллинга неизвестен после timeout; When повторяется применение; Then сохраняется исходная операция для сверки, нет второго расходования/фиктивного release. После подтверждённого отказа резерв освобождается ровно один раз; после успеха становится применённым. |
| AC-b-customer-2041 | SC-US-204-1 — Enrolled customer obtains same share kit without auto-send | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2041`: Given участие добровольно оформлено; When запрашивает share kit в UI/MCP; Then получает ту же персональную ссылку и disclosure; отправка не производится автоматически. |
| AC-b-customer-2042 | SC-US-204-2 — Read grant cannot enroll or spend or buy owner tariff | `docs/features/b-customer/01_specification.md` → `AC-b-customer-2042`: Given личный агент имеет только read-balance grant; When пытается вступить/применить credit; Then отказ до изменения; тариф владельца не доступен клиенту как его собственная покупка. |
| AC-c-partner-3011 | SC-US-301-1 — Terms show rate hold window payout version and enrollment | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3011`: Given есть опубликованная версия программы; When открывает public terms; Then видит тип/ставку/окно/удержание/порядок выплат, дату версии и статус участия. |
| AC-c-partner-3012 | SC-US-301-2 — Historical entry displays its original policy | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3012`: Given условия изменились; When просматривает старое начисление; Then видит применённую историческую версию, не только текущую ставку. |
| AC-c-partner-3021 | SC-US-302-1 — Explicit enrollment yields personal link not enrollment URL | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3021`: Given подтвердил участие в программе; When enrollment принят по fixture policy; Then получает personal referral link/share kit, отличный от enrollment URL. |
| AC-c-partner-3022 | SC-US-302-2 — Enrollment retry preserves single membership | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3022`: Given тот же запрос повторён; When вступает второй раз; Then не создаются второй партнёр/дублирующая атрибуция; возвращается существующее участие. |
| AC-c-partner-3031 | SC-US-303-1 — Own cash history explains hold corrections and due date | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3031`: Given есть собственный начисленный доход; When открывает history/payout; Then видит только свои записи и причины hold/коррекции, ориентир до5-го следующего месяца. |
| AC-c-partner-3032 | SC-US-303-2 — Owner sent fact shows date without bank receipt claim | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3032`: Given владелец пометил перевод отправленным; When обновляет статус; Then видит отправку с датой; зачисление не утверждается без отдельного подтверждения. |
| AC-c-partner-3041 | SC-US-304-1 — Own payout projection matches UI and delegated harness | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3041`: Given личный grant разрешает own payout read; When UI или MCP/A2A запрашивает статус; Then возвращается один и тот же actor-scoped результат с источником/временем. |
| AC-c-partner-3042 | SC-US-304-2 — Known foreign partner ID still denied | `docs/features/c-partner/01_specification.md` → `AC-c-partner-3042`: Given в запросе указан другой partner id; When агент вызывает tool/task; Then доступ отвергается даже при известном ID; общий реестр не раскрывается. |
| AC-d-agent-4011 | SC-US-401-1 — Grant displays bounded subject scope expiry without approve/send | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4011`: Given идентифицирован пользователь/tenant и цель; When подтверждает read+draft grant; Then показаны срок, субъект и scope; платёж/approve/send не входят в grant. |
| AC-d-agent-4012 | SC-US-401-2 — Revocation denies agent while direct owner remains authorized | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4012`: Given grant истёк/отозван; When агент начинает новый защищённый шаг; Then операция запрещена; UI владельца остаётся доступен по независимым правам. |
| AC-d-agent-4021 | SC-US-402-1 — Task replay preserves logical artifact without double payable | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4021`: Given есть один logical task и fixture payments; When повторяет запрос подготовки; Then получает тот же logical artifact или явно новую версию, без второго payable registry. |
| AC-d-agent-4022 | SC-US-402-2 — Refund recalculation updates amounts explanation and approval | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4022`: Given появился refund; When запускает пересчёт; Then меняются и строки/сумма, и объяснение; прошлое утверждение недействительно. |
| AC-d-agent-4031 | SC-US-403-1 — Owner exports only exact approved artifact | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4031`: Given видит artifact id/version/hash; When утверждает и выгружает; Then получает только утверждённое содержимое; экспорт не запускает перевод. |
| AC-d-agent-4032 | SC-US-403-2 — Owner handoff after revoke keeps corrected artifact | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4032`: Given доступ агента отозван после пересчёта; When владелец открывает ручное продолжение; Then получает тот же исправленный реестр; новое owner approval разрешено без оживления grant агента. |
| AC-d-agent-4041 | SC-US-404-1 — Repeated personal task creation returns same task | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4041`: Given есть own-status grant и taskT1; When создаёт запрос, затем повторяет его; Then видит тот же task и статус, без повторного начисления/отправки. |
| AC-d-agent-4042 | SC-US-404-2 — Late T1 response cannot complete T2 after cancellation | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4042`: Given T1 отменён, затем создан T2; When приходит поздний ответ с taskT1; Then ответ не завершает T2; отмена не объявляется rollback внешних действий. |
| AC-d-agent-4051 | SC-US-405-1 — Delegated own credit matches B without cash leakage | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4051`: Given клиент имеет own-credit-read grant и fixture credit balance; When запрашивает доступную сумму и условие применения; Then ответ совпадает с B по балансу/резерву/доступности и не показывает cash-комиссии других ролей. |
| AC-d-agent-4052 | SC-US-405-2 — Read-only grant cannot reserve or apply credit | `docs/features/d-agent/01_specification.md` → `AC-d-agent-4052`: Given read-only grant; When агент пытается зарезервировать или применить бонус; Then изменения запрещены до отдельного разрешённого действия; чтение не тратит баланс. |

## Input hashes

SHA256 captured from current source bytes at report generation. Parent reported Architecture/CLAUDE and PRD status-header amendments during review; their final bytes were read or their exact authorization-only purpose explicitly supplied. Specifications and Pseudocode have no reported semantic changes. Each per-feature report must use its own specification hash below; any later spec change requires affected revalidation.

| Input path (repository relative) | SHA256 |
|---|---|
| CLAUDE.md | 3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241 |
| .claude/skills/requirements-validator/SKILL.md | b4b394adf08feee552f39c83331398f119e0d4abf21e683fe4706da438b4a426 |
| .claude/skills/requirements-validator/references/scoring-system.md | 72104b74f07e0610f67f00b246b5225a530203bff225bacf7bf384bc6fd21cdf |
| docs/development/model-routing.md | cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9 |
| docs/development/model-routing-telemetry.md | 22ba852701d2c78b372cb07ed9b53f4227799ff6f8dc9c57849c09d0c35829cd |
| projects/03-affiliate-rewardful/CLAUDE.md | 6464ba7335c865c0ac6cc017ad1eaed6c2455d2d9b91be1aa50f4b20059f035d |
| projects/03-affiliate-rewardful/docs/runtime-contract.md | 0ff2e66a413947b8948b974bb53ad0d9c242008112ec4dfff7e7b0cead6fb6c2 |
| projects/03-affiliate-rewardful/docs/Architecture.md | 8ff4cc7de220eb448a16eda09edfbe74a18e7f9456ebad3fa2f31aed8d7d6cdf |
| projects/03-affiliate-rewardful/docs/Specification.md | e8d084d85aaf800626f201b5c417990b981945c81c78819688eb827d9b2f22da |
| projects/03-affiliate-rewardful/docs/Pseudocode.md | a2e710c615684d6364d417383d035238d715911cab8399982cb19153353dde43 |
| projects/03-affiliate-rewardful/docs/product-discovery-brief.md | 4819596fe0aad821a15028332277804670bcb8e3356e7144274d96f6772910af |
| projects/03-affiliate-rewardful/docs/source-product-profile.md | 86d6a5e30783b4d2bee9de38cb4b9cc04d514bbb09625e7691474756bdc8b1df |
| projects/03-affiliate-rewardful/shared/docs/PRD.md | 71377bf049d6e0f5a4fe57527f7a197b9467db808f5ada6e6539542fcbd6e96b |
| projects/03-affiliate-rewardful/variants/a-merchant/docs/PRD.md | cdf11683edc5b610803374037a0a5e844fbbe29da8a8a02bdc7ba5d7718e351f |
| projects/03-affiliate-rewardful/variants/b-customer/docs/PRD.md | 5e6ff058c7644d60841dc59a956e7d48df8ec6592f1805f0fda8fcf1ca982970 |
| projects/03-affiliate-rewardful/variants/c-partner/docs/PRD.md | 0dd1396c7b8b4a881077f981b241d871639db797502c3bd8c96ea57894298240 |
| projects/03-affiliate-rewardful/variants/d-agent/docs/PRD.md | 363566efe0f2286614ed06b15717b17ffa26f49fcefd4b20a2c9aed49269d59c |
| projects/03-affiliate-rewardful/docs/features/a-merchant/01_specification.md | d9bce34cfcdb8f3321573a1570e4c13cf1fde520fee5c26d8112e2112268ed34 |
| projects/03-affiliate-rewardful/docs/features/a-merchant/02_pseudocode.md | 9c25085a77ffb80845b727e3399bdde9c5369d6236dba0ec82e5a4e097b0ba7b |
| projects/03-affiliate-rewardful/docs/features/a-merchant/03_architecture.md | 3f3f77fb53b0e4e4ec5b37ce72ae7da760cbf17b142428e8224bc87fa163098b |
| projects/03-affiliate-rewardful/docs/features/a-merchant/04_refinement.md | 6d36e4720d0679f2b84a4ddf8261ba4802140565196647ff200fbab0f4c3751f |
| projects/03-affiliate-rewardful/docs/features/a-merchant/05_completion.md | c97a69d2ad09318bd7acfa563d5e74e2b6476f870cff4605564a314762402b1f |
| projects/03-affiliate-rewardful/docs/features/b-customer/01_specification.md | 1685b59ca5fd0eda908165ff21256698ac1abb4ce87228466cb502fad68c6a13 |
| projects/03-affiliate-rewardful/docs/features/b-customer/02_pseudocode.md | afeb63a31e9d18ff5b1e76b539ad32a77558257fa0bd125eeb555fa4a1e415e2 |
| projects/03-affiliate-rewardful/docs/features/b-customer/03_architecture.md | ec5ac012b841e2cf988cd81dcc52ebce4c48281696ae6e6e9e14d44d5fae5c34 |
| projects/03-affiliate-rewardful/docs/features/b-customer/04_refinement.md | eb3cf68f7211adeb906703c7c82d65e6a84482b1719c60bfee1206c8a4ebdb60 |
| projects/03-affiliate-rewardful/docs/features/b-customer/05_completion.md | 02a869ee0b98eff65d252ed80c29033950c7336488f84578a6feee8d8205f51b |
| projects/03-affiliate-rewardful/docs/features/c-partner/01_specification.md | 03af9e0e338d19fc2c86dfa5e2d4da7525d358f8bd00f8f8fe545052c59268a8 |
| projects/03-affiliate-rewardful/docs/features/c-partner/02_pseudocode.md | 1a832eea27d6864652548cf19b3b889f2abf6317512d11fee078c73ff4596a9b |
| projects/03-affiliate-rewardful/docs/features/c-partner/03_architecture.md | 791a235b173b3eecb0af996977f843e4e0c241b62c0da4c55b7f9ee6868afeb1 |
| projects/03-affiliate-rewardful/docs/features/c-partner/04_refinement.md | 1b3d501acafe3656b3d44ce9797b4dde075fbde9d8bc351a4b3a4b72627779c8 |
| projects/03-affiliate-rewardful/docs/features/c-partner/05_completion.md | 5ace004d5ae7e4e30dc3e64b427006566fd47b8ee11196a2c131c665299f2118 |
| projects/03-affiliate-rewardful/docs/features/d-agent/01_specification.md | b5e87047f8690a67e1ee18e262329086313633dfdbcc4f28b5acc11ac949f80f |
| projects/03-affiliate-rewardful/docs/features/d-agent/02_pseudocode.md | b53c5635e24fbcfa4ccdf583fb82a4c847c13ed862b6d13d6872d4e231f8eefc |
| projects/03-affiliate-rewardful/docs/features/d-agent/03_architecture.md | 4f3f6d7c86cdadae45477b6027f4722009feb7ab9bb512add7ab64357eaa63a5 |
| projects/03-affiliate-rewardful/docs/features/d-agent/04_refinement.md | 1f666fa062f4af5da4cf8f8345603bc9d557f322a7cf6ef1f28442f987dacf48 |
| projects/03-affiliate-rewardful/docs/features/d-agent/05_completion.md | 5d229693e47bc8af2049cdaba1ac1d01ec7c0f6b728fdc856a8ca71a2dacdaf0 |
| projects/03-affiliate-rewardful/docs/features/shared-core/01_specification.md | c8c82349029c64fee16b09fcc0752fa75614b9bd6a15a5d3e6248572b570f387 |
| projects/03-affiliate-rewardful/docs/features/shared-core/02_pseudocode.md | e0a91d3ffaf657a517970d40dde23d6d7a4eb5c1d602628645f54bbbd1fe641b |
| projects/03-affiliate-rewardful/docs/features/shared-core/03_architecture.md | ed5b5c93e7ddd80d43e8b2152b44d72ca5653fd632dfc2fd2b2d0b085460ccdd |
| projects/03-affiliate-rewardful/docs/features/shared-core/04_refinement.md | 3201dfe0691ae0eade72f2c619f630e2ae7f8a67032b6d9ab9b150a63a08ec99 |
| projects/03-affiliate-rewardful/docs/features/shared-core/05_completion.md | d426b95858b6f8e488114ea4e4c5956a5b97df4bc07261e797b2a0338abefe92 |

## Receipt

```json
{
  "run_id": "20260908T204432Z-go-shared-core",
  "work_unit_id": "f1-requirements-validation",
  "stage": "VALIDATE",
  "profile": "compact-quality-first-v2",
  "requested_model": "gpt-6-astra",
  "requested_effort": "high",
  "actual_model": null,
  "actual_effort": null,
  "model_evidence": null,
  "fallback_reason": null,
  "started_at": null,
  "ended_at": "2026-09-08T20:55:29.761459+00:00",
  "elapsed_wall_ms": null,
  "active_wall_ms": null,
  "usage": {
    "input_tokens_total": null,
    "cached_input_tokens": null,
    "output_tokens_total": null,
    "reasoning_tokens": null,
    "source": null,
    "scope": "attempt-exclusive",
    "quality": "unavailable"
  },
  "cost_basis": "unavailable",
  "missing_data": [
    "Host did not expose model/effort execution metadata or provider usage counters to this reviewer.",
    "Reviewer-local start timestamp was not recorded; parent delegation event may provide measured elapsed. No duration reconstructed from memory."
  ],
  "semantic_verdict": "READY_WITH_CAVEATS",
  "runtime_validation": "not_run_preimplementation",
  "ac_count": 60,
  "story_count": 23,
  "blocking_findings": 0,
  "status": "completed"
}
```

Status: completed
