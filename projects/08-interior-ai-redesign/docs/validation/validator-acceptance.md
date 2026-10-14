# N8 Phase 2 — validator-acceptance

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-acceptance-1`
- TRACE_PATH: `/tmp/n8-validator-acceptance-20261013/projects/08-interior-ai-redesign/docs/validation/validator-acceptance.md`
- Launch UTC: `2026-10-13T21:21:01Z`
- Completion UTC: `2026-10-13T21:23:17Z`; measured receipt interval: `136 s`.
- Requested route: `Sol high`
- Actual provider/model: `null` — execution metadata are unavailable to this worker; the requested route is not proof of a switch.
- Provider usage/cost: `null` — no provider counters are exposed.
- Available spend: `null` — provider budget/limit telemetry is unavailable.
- Repository revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; the project documents are an uncommitted source set, so the hashes below are authoritative.
- Scope: SMART testability, completeness, criterion-to-scenario traceability, negative/concurrent cases. No source document was edited.

## Exact sources read

| Source | SHA-256 |
|---|---|
| `docs/Specification.md` | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| `docs/PRD.md` | `feb8c948e48db90300b59de6ebeb232569e235c24b976831db8684592b5d911b` |
| `docs/Pseudocode.md` | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| `docs/Refinement.md` | `117df54fc7fa7bfda66ce576c756dfe0d23556097034ed0b801046c5ccf39c67` |
| `docs/Completion.md` | `59e64f3fcfab60333107eabe845bcbd82e2a7b4fb341d68907684008f53769fa` |

## Verdict and score rationale

**Acceptance verdict: NEEDS WORK for Phase 2 aggregation.** The acceptance analysis itself completed. The corpus contains exactly 21 requirement headings and 45 unique `SC-*` criteria, and all 45 are claimed by a pseudocode algorithm. The BDD fragment below gives every source AC a unique named scenario and adds explicit performance/security cases.

Role-bounded acceptance score: **36/50 (72/100 normalized, REVIEW)**. This is the SMART + Quality half of the skill rubric; INVEST belongs to the separate `validator-stories` lens and is not fabricated here.

| Dimension | Score | Evidence/reason |
|---|---:|---|
| Specific | 4/6 | IDs, actors, inputs, states and response codes are mostly concrete; composite criteria listed below still admit multiple oracles. |
| Measurable | 4/8 | Numeric bounds and exact arithmetic are strong, but `safe`, `понятен`, `необходимые actions`, and the unbound performance fixture/iteration count need executable definitions. |
| Achievable | 6/6 | Pseudocode supplies bounded algorithms and offline adapters for the accepted local scope. |
| Relevant | 5/5 | Every SC supports its adjacent story/requirement and the selected CJM A. |
| Time-bound | 0/5 | Only some criteria carry TTL/deadline/latency context; most UI/domain AC have no time oracle, so the corpus cannot receive the binary rubric point. |
| Traceability | 10/10 | `Specification.md` has 45 unique SC IDs; `Pseudocode.md` claims all 45; the table and named scenarios below map every ID. |
| Completeness | 7/10 | The corpus has happy and error handling, but the per-story pattern is incomplete for the stories named below; this is the rubric's partial-coverage value, not “No AC”. |

Blocking-floor audit: `Testable` is non-zero because all actual AC are quoted as Given/When/Then below; `Completeness` is non-zero because the quoted corpus covers success, failure and edge/concurrency classes; `Traceability` is non-zero because the next table maps every AC ID to a named scenario. No story lacks AC. Security bonus would be `+5` after the explicit security scenarios below. Growth bonus is `+0`: the deterministic check found no filled `FR-GROWTH-nnn` seed row, so no trace claim is made.

## Findings

1. **BLOCKED — applicable Phase 2 surface receipts are absent.** `FR-design-3` is a long paid external-model job and `FR-billing-2` is an incoming webhook, but `check-job-contract`, `check-model-cost`, and `check-webhook-contract` each returned exit `2` because `docs/long-job-contract.md`, `docs/model-cost-contract.md`, and `docs/webhook-contract.md` do not exist. Phase 2 states that exit `2` is not success. Create the declarations from accepted behavior and rerun the guards; do not claim the application behavior has been tested merely because a declaration passes.
2. **MAJOR — `NFR-performance-1` has no source SC and its protocol is not reproducible yet.** `Pseudocode.md` says `REALISES: none`; `Refinement.md` names `bounded-load`, but “согласованный fixture” and “фиксируются iterations” provide no fixture identity, warm-up, measured sample count, percentile method, or failure rule. `NFR-PERF-API-1` and `NFR-PERF-BUDGET-1` below provide a concrete oracle for owner acceptance.
3. **MAJOR — four criteria combine different causes and results.** Split `SC-US-008-3` (two-worker once-only dispatch vs post-dispatch timeout), `SC-US-010-2` (unresolved inputs vs invalid negative input), `SC-US-013-2` (invalid payment facts vs provider timeout/replay), and `SC-US-016-2` (rate limit vs secret redaction). A failed test must identify one violated behavior instead of satisfying an `or` branch.
4. **WARNING — several story-local scenario sets are incomplete under the skill's per-story pattern.** `US-011` has no rejection/error case for an unconfirmed or dimension-invalid substitution; `US-016` is negative-only and lacks an authorized-request control; `US-018` has only the degraded WebGL/small-screen case and no ordinary keyboard journey. Add the named supplemental cases below or consciously record why a cross-story happy path is the control.
5. **WARNING — qualitative oracles need definitions.** In `SC-US-004-1`, “thumbnail безопасен” should mean successful decode/re-encode, EXIF absent, fixed MIME/nosniff, and no externally resolved resources. In `SC-US-008-1`, “понятен выключенный режим” should assert visible `manual/off` label and absence of network traffic. In `SC-US-018-1`, “необходимые actions доступны” should name the canonical actions and assert no horizontal overflow at 390 CSS px.

Positive evidence: `check-docs-complete` returned `0`; after evidence dates were corrected, `check-external-deps` returned `0` with five CONFIRMED and four explicitly UNCONFIRMED capabilities. Meaningful concurrency already exists in `SC-US-007-2`, `SC-US-008-3`, `SC-US-013-1`, and the `SC-US-016-2` rate-limiter contour; `Refinement.md` requires separate DB connections, barriers/held locks, and bounded deadlines, which prevents a sequential lucky run from masquerading as concurrency evidence.

## Criterion scenarios

| Criterion | Named scenario |
|---|---|
| SC-US-001-1 | New login creates the only usable session |
| SC-US-001-2 | Invalid or revoked authentication reveals no private data |
| SC-US-002-1 | Projects persist independently |
| SC-US-002-2 | Foreign and archived project mutations fail without change |
| SC-US-003-1 | Confirmed room produces exact area and stable shell |
| SC-US-003-2 | Invalid geometry or missing calibration cannot be confirmed |
| SC-US-004-1 | Valid private asset is normalized and owner-only |
| SC-US-004-2 | Malicious or oversized asset is rejected without egress |
| SC-US-004-3 | Foreign asset key does not bypass ownership |
| SC-US-005-1 | Reference provenance survives reopening |
| SC-US-005-2 | Pinterest denial falls back honestly to upload |
| SC-US-005-3 | Exact owner Pinterest pin remains exact |
| SC-US-006-1 | Styling preserves the measured shell |
| SC-US-006-2 | Invalid scene proposal cannot replace the prior variant |
| SC-US-007-1 | Design change creates history and recalculates consequences |
| SC-US-007-2 | Two editors produce one commit and one conflict |
| SC-US-007-3 | Restoring or changing style revokes prior approval |
| SC-US-008-1 | Manual mode works with zero AI egress |
| SC-US-008-2 | Missing caps or hostile response fails closed |
| SC-US-008-3 | Concurrent workers dispatch once and retain uncertain reservation |
| SC-US-009-1 | Product snapshot exposes all provenance |
| SC-US-009-2 | Retail denial never invents a price |
| SC-US-009-3 | Region or age makes a snapshot stale |
| SC-US-010-1 | Exact pack arithmetic yields ten packs |
| SC-US-010-2 | Unknown inputs remain unknown and invalid inputs fail |
| SC-US-010-3 | Budget changes create an exact versioned delta |
| SC-US-010-4 | Integer ruble input converts exactly and updates the limit |
| SC-US-011-1 | Accepted substitution revalidates fit and approval |
| SC-US-011-2 | Moving a line changes phase subtotals only |
| SC-US-011-3 | Recalculation preserves both budget versions |
| SC-US-012-1 | Disabled or incomplete payment config grants nothing |
| SC-US-012-2 | Checkout retry creates one trusted-price order |
| SC-US-013-1 | Concurrent webhook replay grants once |
| SC-US-013-2 | Invalid payment or verification outage grants nothing |
| SC-US-013-3 | Verified refund places a durable billing hold |
| SC-US-014-1 | Export and share preview disclose only the chosen result |
| SC-US-014-2 | Revoked archived or expired share stops future access |
| SC-US-014-3 | Foreign account cannot publish a share |
| SC-US-015-1 | Duplicate growth event is stored once without sensitive data |
| SC-US-015-2 | Missing events and unavailable storage remain distinct |
| SC-US-016-1 | Cross-origin and cross-owner requests have no side effect |
| SC-US-016-2 | Atomic rate limit and redacted failure logs hold |
| SC-US-017-1 | Fresh local deployment is ready private and restart-safe |
| SC-US-017-2 | Bad config schema or storage fails ready without paid calls |
| SC-US-018-1 | Small-screen keyboard path survives WebGL failure |
| NFR-performance-1 | NFR-PERF-API-1; NFR-PERF-BUDGET-1 |

## BDD fragment — all source AC quoted and named

```gherkin
Scenario: SC-US-001-1 — New login creates the only usable session
  Given новый адрес
  When зарегистрировался, вышел и вошёл
  Then кабинет доступен только новой действующей сессии

Scenario: SC-US-001-2 — Invalid or revoked authentication reveals no private data
  Given неверный пароль/истёкшая или отозванная сессия
  When вход/чтение
  Then общий 401, приватные данные отсутствуют

Scenario: SC-US-002-1 — Projects persist independently
  Given два проекта
  When изменён и перезагружен один
  Then второй не изменён, состояние первого восстановлено

Scenario: SC-US-002-2 — Foreign and archived project mutations fail without change
  Given другой аккаунт/архив
  When чужой ID либо мутация архива
  Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены

Scenario: SC-US-003-1 — Confirmed room produces exact area and stable shell
  Given 4.5×4×2.7 м и допустимые проёмы
  When подтвердил
  Then площадь пола 18 м², стабильный shell hash, видны план и 3D

Scenario: SC-US-003-2 — Invalid geometry or missing calibration cannot be confirmed
  Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб
  When согласование
  Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет

Scenario: SC-US-004-1 — Valid private asset is normalized and owner-only
  Given безопасный GLB или reference image
  When upload
  Then исходный hash сохранён, asset доступен только owner, thumbnail безопасен

Scenario: SC-US-004-2 — Malicious or oversized asset is rejected without egress
  Given oversized/повреждённый/remote-URI GLB либо изображение-bomb
  When upload
  Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL

Scenario: SC-US-004-3 — Foreign asset key does not bypass ownership
  Given чужой assetId
  When скачать/использовать в проекте
  Then 404 даже при известном storage key

Scenario: SC-US-005-1 — Reference provenance survives reopening
  Given reference
  When выбраны tags/note и повторное открытие
  Then данные сохранены вместе с source/дата

Scenario: SC-US-005-2 — Pinterest denial falls back honestly to upload
  Given недоступный Pinterest
  When добавлена ссылка
  Then предлагается upload, нет обещания импортированной доски или автоматического доступа

Scenario: SC-US-005-3 — Exact owner Pinterest pin remains exact
  Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`
  When сохранена/переоткрыта
  Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL

Scenario: SC-US-006-1 — Styling preserves the measured shell
  Given калиброванная основа
  When меняю стиль/мебель/ракурс и до/после
  Then shell hash/размеры/проёмы неизменны, выбор сохранён

Scenario: SC-US-006-2 — Invalid scene proposal cannot replace the prior variant
  Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox
  When сохранить
  Then 422 SCENE_INVALID, предыдущий вариант цел

Scenario: SC-US-007-1 — Design change creates history and recalculates consequences
  Given согласованный вариант
  When поменял размер/стиль
  Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown

Scenario: SC-US-007-2 — Two editors produce one commit and one conflict
  Given два одновременных редактирования
  When одинаковый expectedVersion
  Then один commit, второй 409 VERSION_CONFLICT без потери данных

Scenario: SC-US-007-3 — Restoring or changing style revokes prior approval
  Given approved design
  When изменён стиль или выбран другой исторический вариант
  Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования

Scenario: SC-US-008-1 — Manual mode works with zero AI egress
  Given manual/off
  When пользователь ищет AI
  Then понятен выключенный режим, пресеты работают, наружных вызовов нет

Scenario: SC-US-008-2 — Missing caps or hostile response fails closed
  Given enabled без caps/key или тестовый вредоносный ответ
  When startup/validation
  Then отказ startup либо job failed, shell не меняется

Scenario: SC-US-008-3 — Concurrent workers dispatch once and retain uncertain reservation
  Given два worker и один job/лимит
  When параллельный запуск/timeout
  Then один dispatch, caps атомарны; неизвестный исход сохраняет reservation, автоматического повторного платного dispatch нет

Scenario: SC-US-009-1 — Product snapshot exposes all provenance
  Given официальная ссылка и ручной снимок
  When сохранён
  Then все provenance-поля видны и подставляются в shopping line

Scenario: SC-US-009-2 — Retail denial never invents a price
  Given retailer 401/нет цены
  When запрос обновления
  Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение

Scenario: SC-US-009-3 — Region or age makes a snapshot stale
  Given fresh снимок
  When сменён регион/магазин либо прошло 24h
  Then effective freshness stale, подтверждённый статус снят до нового снимка

Scenario: SC-US-010-1 — Exact pack arithmetic yields ten packs
  Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек
  When calculate
  Then 10 упаковок, 1600000 копеек, видимая формула

Scenario: SC-US-010-2 — Unknown inputs remain unknown and invalid inputs fail
  Given хотя бы один unmatched/unselected товар даже при известных работах/доставке, null coverage либо отрицательный input
  When calculate
  Then incomplete с unknown rows либо 422; неизвестное не теряется

Scenario: SC-US-010-3 — Budget changes create an exact versioned delta
  Given изменённые quantity/price/reserve и бюджетный лимит
  When calculate
  Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились»

Scenario: SC-US-010-4 — Integer ruble input converts exactly and updates the limit
  Given цена 1600 ₽ целым вводом и ранний лимит
  When введены/изменены значения
  Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение

Scenario: SC-US-011-1 — Accepted substitution revalidates fit and approval
  Given нет товара
  When выбрал замену
  Then видно отличие/новые габариты, новая версия и повторное согласование

Scenario: SC-US-011-2 — Moving a line changes phase subtotals only
  Given позиции двух этапов
  When перенос строки
  Then суммы этапов меняются, общая сумма неизменна

Scenario: SC-US-011-3 — Recalculation preserves both budget versions
  Given старая смета
  When возвращаюсь к дизайну и пересчитываю
  Then сохранены обе версии и причина изменения, old approval не переиспользован

Scenario: SC-US-012-1 — Disabled or incomplete payment config grants nothing
  Given off/неполный live config
  When checkout/start
  Then отключён checkout/отказ startup, денег и entitlement нет

Scenario: SC-US-012-2 — Checkout retry creates one trusted-price order
  Given тестовый provider и одинаковый ключ
  When два checkout
  Then один order/remote id; клиент не меняет цену/credits

Scenario: SC-US-013-1 — Concurrent webhook replay grants once
  Given verified succeeded
  When webhook replay/concurrent delivery
  Then одно начисление и один ledger outcome

Scenario: SC-US-013-2 — Invalid payment or verification outage grants nothing
  Given чужой merchant/amount/test mode либо provider timeout
  When webhook
  Then 400/503, credits неизменны; после timeout повтор не потерян

Scenario: SC-US-013-3 — Verified refund places a durable billing hold
  Given refund.succeeded
  When verified event
  Then новые live jobs запрещены и export entitlement отозван, audit/history доступны

Scenario: SC-US-014-1 — Export and share preview disclose only the chosen result
  Given первый вариант
  When export/share preview
  Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены

Scenario: SC-US-014-2 — Revoked archived or expired share stops future access
  Given активная ссылка
  When owner отзывает/архивирует проект или TTL истёк
  Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить

Scenario: SC-US-014-3 — Foreign account cannot publish a share
  Given чужой аккаунт/неподтверждённые права
  When создание link
  Then отказ без публикации

Scenario: SC-US-015-1 — Duplicate growth event is stored once without sensitive data
  Given повторный event key
  When повторная запись
  Then один event, нет исходных фото/текста/токенов в log

Scenario: SC-US-015-2 — Missing events and unavailable storage remain distinct
  Given нет событий
  When метрика
  Then наблюдаемое 0 событий либо unknown при отказе хранилища, не прогноз конверсии

Scenario: SC-US-016-1 — Cross-origin and cross-owner requests have no side effect
  Given cross-origin/request без CSRF либо чужой ID
  When mutation/read
  Then 403/404, side effect отсутствует

Scenario: SC-US-016-2 — Atomic rate limit and redacted failure logs hold
  Given лимит/secret-bearing failure
  When повтор запросов
  Then 429 с Retry-After, logs без credentials/планов/полных payload

Scenario: SC-US-017-1 — Fresh local deployment is ready private and restart-safe
  Given fresh isolated env
  When migrate/build/start
  Then health ready, DB не имеет published ports, project data переживают restart

Scenario: SC-US-017-2 — Bad config schema or storage fails ready without paid calls
  Given incompatible config/schema/storage
  When ready/start
  Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются

Scenario: SC-US-018-1 — Small-screen keyboard path survives WebGL failure
  Given 390px/keyboard/WebGL unavailable
  When прохожу путь
  Then необходимые actions/ошибки доступны и есть 2D fallback
```

## Supplemental executable scenarios

```gherkin
@performance
Scenario: NFR-PERF-API-1 — Ordinary API p95 is at most 500 ms
  Given the committed bounded-load fixture hash, exact build hash, host CPU/RAM/OS, and an empty provider network spy are recorded
  And 10 concurrent clients each complete 20 warm-up requests followed by 100 measured ordinary API requests, excluding bcrypt, upload, 3D parse, and provider routes
  When elapsed time is recorded with a monotonic clock for all 1000 measured responses and nearest-rank p95 is computed without dropping errors or timeouts
  Then p95 is at most 500 ms, every response has the expected status/body, and any error or timeout fails the scenario

@performance
Scenario: NFR-PERF-BUDGET-1 — Exact 200-line recalculation p95 is at most 100 ms
  Given one immutable 200-line fixture with decimal quantities, packs, unknown rows, services, delivery and reserve, plus exact build and host identity
  And the benchmark completes 50 warm-up iterations followed by 1000 measured recalculations using a monotonic clock
  When nearest-rank p95 is computed over all measured iterations and every result hash is compared with the golden exact-arithmetic hash
  Then p95 is at most 100 ms, all 1000 hashes match, and any exception or omitted iteration fails the scenario

@security
Scenario: SEC-AUTH-BYPASS-1 — Forged cookie cannot enter a private project
  Given an unsigned, expired, or revoked cookie for owner A and a private project of owner B
  When each protected read and mutation is attempted
  Then each response is 401 or 404 as applicable, no private field is returned, and no row or asset changes

@security
Scenario: SEC-INJECTION-1 — Boundary text is stored as data only
  Given SQL, HTML/script, command-shell, and URL-userinfo payloads in every accepted text or URL input
  When schemas, repositories, rendering, logs, and link handling process each payload
  Then SQL remains parameter data, executable markup never runs, no command starts, forbidden URLs are rejected, and logs contain no raw secret-bearing payload

@security @concurrency
Scenario: SEC-RATE-RACE-1 — Parallel requests cannot overshoot the atomic rate cap
  Given one authenticated subject has 59 accepted mutations in the current minute
  When 20 separate database connections release the same barrier and submit one mutation each
  Then exactly one mutation succeeds, 19 receive 429 with Retry-After, and the persisted count is 60

@error-handling
Scenario: US-011-ERROR-1 — Invalid substitution is not accepted
  Given a proposed replacement has incompatible dimensions or the owner has not confirmed it
  When replacement is requested
  Then the current design and budget pointers remain unchanged and the response identifies the missing confirmation or failed fit

@happy-path
Scenario: US-016-CONTROL-1 — Authorized same-origin request succeeds
  Given an active owner session, exact configured Origin, valid CSRF token, owned IDs, and capacity below the rate limit
  When a valid bounded mutation is submitted
  Then the mutation succeeds once and its audit record contains only allowlisted redacted fields

@happy-path @accessibility
Scenario: US-018-CONTROL-1 — Ordinary keyboard journey completes at 390 CSS pixels
  Given a 390 CSS-pixel viewport with WebGL available and a saved project at the first canonical step
  When the user completes every canonical action using only keyboard controls
  Then focus order follows the visible workflow, labels and errors are announced, persisted choices survive reload, and no key action requires horizontal scrolling
```

## Guard evidence and handoff

| Check | Exit | Interpretation |
|---|---:|---|
| `check-docs-complete` | 0 | Required documents exist and are non-template; correctness is still this validation's job. |
| `check-external-deps` | 0 | Nine capability rows have closed-list verdicts; four are explicitly UNCONFIRMED and removed/rewritten from mandatory MVP. |
| `check-job-contract` | 2 | Applicable declaration absent; blocks a Phase 2 pass. |
| `check-webhook-contract` | 2 | Applicable declaration absent; blocks a Phase 2 pass. |
| `check-model-cost` | 2 | Applicable declaration absent; blocks a Phase 2 pass. |
| `check-look-origin` | 2 | Seed table header was not parseable; no positive look-origin claim made by this lens. |
| `check-growth-trace` | 2 | No filled growth seed rows; scored `+0`, not a fabricated trace. |
| `check-look-trace` | 2 | Source look honestly marked not measured (`no-browser-mcp`); no positive trace claim made. |

Required next action for the coordinator: aggregate the five concrete acceptance findings, add the three applicable contract artifacts and split/clarify the named composite criteria before declaring Phase 2 READY. The BDD fragment may be copied into the canonical test-scenario artifact after those source decisions are accepted.

Status: completed
