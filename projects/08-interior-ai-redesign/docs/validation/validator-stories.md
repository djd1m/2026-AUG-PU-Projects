# N8 Phase 2 — validator-stories receipt

- RUN_ID: `20261013T202009Z-expanded-cjm-9f69`
- WORK_UNIT_ID: `validator-stories-1`
- TRACE_PATH: `/tmp/n8-validator-stories-20261013/projects/08-interior-ai-redesign/docs/validation/validator-stories.md`
- Launch UTC: `2026-10-13T21:20:14Z`
- Finished UTC: `2026-10-13T21:24:07Z`
- Elapsed wall time: `233 s`
- Source revision: `3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4`; the six project documents are untracked/dirty inputs, so their SHA-256 values below are the binding source identity.
- Profile: `compact-quality-first-v2`; stage `VALIDATE`; requested model `gpt-5.6-sol`, effort `high` (policy). Actual model, actual effort, fallback and token/cost usage: `null` because the host exposed no execution metadata or attempt-exclusive usage counters.
- ROUTE: overall N8 delivery is XL because it includes payments/webhooks; this work unit is a bounded, docs-only Phase 2 story lens and changes only this receipt. E2E preflight: `not_applicable` (no E2E was run).
- Memory precheck: two Russian `dz recall ... --project /home/2026-AUG-PU-Projects` queries returned no matching patterns.

## Scope and method

Validated the 18 normative `US-*` stories in `Specification.md` against INVEST only. SMART, architecture, dependency and security-specialist verdicts belong to other Phase 2 lenses. `SC-US-*` lines are treated as the actual acceptance criteria because PRD declares Specification FR/NFR headings and US/SC IDs normative. Testability and completeness use the exact SC text quoted below. Traceability uses the criterion-scenario map below plus the exact `REALISES` claims in `Pseudocode.md`; this proves named coverage, not implementation.

INVEST is scored with the repository rubric: I 8, N 8, V 10, E 8, S 8, T 8, maximum 50. The normalized percentage is `INVEST × 2`; the validator-stories threshold is 70. Completeness is `/10`; Traceability is `/10`. The blocking floor applies only when Testable, Completeness, or Traceability is zero.

## Result

- Stories analyzed: **18**; normative criteria: **45**.
- Mean INVEST: **46.0/50 = 92%**.
- Below the validator-stories 70 threshold: **US-016 (68%)**, **US-018 (52%)**.
- Blocking-floor zeros: **none**. Every story has actual SC, and every one of the 45 SC IDs is mapped to a named scenario and an algorithm.
- Lens verdict: **NEEDS WORK** because two stories miss the story-lens threshold. This is not the aggregate Phase 2 verdict.

| Story | I | N | V | E | S | T | INVEST | Completeness | Traceability | Result / evidence |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| US-001 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; SC-001-1..2 cover session success and rejected invalid/revoked access. |
| US-002 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; isolated persistence plus foreign/archive refusal. |
| US-003 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 10 | 10 | PASS; bounded but combines manual-room and GLB calibration paths. |
| US-004 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 10 | 10 | PASS; bounded but combines image and GLB validation/storage. |
| US-005 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; save, unavailable Pinterest recovery, exact deep-link persistence. |
| US-006 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 10 | 10 | PASS; broad viewer/catalog/fit contour, still bounded by explicit contracts. |
| US-007 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; revision, conflict and approval invalidation are deterministic. |
| US-008 | 8 | 8 | 10 | 8 | 0 | 8 | 42/50 (84%) | 7 | 10 | PASS WITH CAVEAT; job/provider/spend/concurrency is larger than two sprints as one story; enabled-success SC is absent. |
| US-009 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; provenance, blocked source and staleness covered. |
| US-010 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; numeric happy/error/boundary cases are concrete. |
| US-011 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 4 | 10 | PASS WITH CAVEAT; three separate outcomes and no rejected/failed substitution criterion. |
| US-012 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; disabled config and idempotent checkout covered. |
| US-013 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 10 | 10 | PASS; succeeded/replay, invalid/timeout and refund paths covered. |
| US-014 | 8 | 8 | 10 | 8 | 4 | 8 | 46/50 (92%) | 10 | 10 | PASS; export plus share lifecycle is a split candidate, but scenarios cover success, revocation/TTL and refusal. |
| US-015 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 4 | 10 | PASS WITH CAVEAT; duplicate and empty/error states exist, but no unique-event/count happy path. |
| US-016 | 0 | 8 | 10 | 8 | 0 | 8 | 34/50 (68%) | 7 | 10 | **NEEDS WORK**; the story spans every repository/read/write, CSRF, ownership, limits and logging, so it is neither independent nor sprint-small. Input-injection/bounds lacks an explicit SC. |
| US-017 | 8 | 8 | 10 | 8 | 8 | 8 | 50/50 (100%) | 10 | 10 | PASS; clean start/restart and fail-closed readiness covered. |
| US-018 | 0 | 8 | 10 | 4 | 0 | 4 | 26/50 (52%) | 7 | 10 | **NEEDS WORK**; it spans the complete UI journey, and “необходимые actions/ошибки доступны” does not enumerate pass/fail elements or assert visible focus/no horizontal overflow. |

## Blocking findings and targeted corrections

### VS-B01 — US-016 is a cross-product security epic (threshold blocker)

Evidence: `NFR-security-1` requires owner checks in every repository/file route, CSRF on cookie mutations, request/upload bounds, secret redaction, three rate-limit classes and proxy trust. Its two SC cover CSRF/cross-owner and rate/redaction, but no SC names malformed/injection payload handling. The same story therefore cannot be developed and demonstrated independently and is not one-sprint sized.

Correction: retain `NFR-security-1` as the umbrella invariant, but replace `US-016` with independently testable slices, for example (a) session/CSRF mutation guard, (b) project/file owner isolation, (c) bounded input and injection rejection, and (d) atomic rate limit plus redacted logging. Give each slice its own SC IDs; include at least one allowed owned request and one malformed/injection request with explicit response and no-side-effect assertions. Re-run this lens on the new story IDs.

### VS-B02 — US-018 is a whole-journey quality epic with a vague pass condition (threshold blocker)

Evidence: `NFR-quality-1` covers every screen at 390 px and desktop, focus, labels, errors, keyboard navigation, horizontal overflow, state labels and viewer fallback. The only criterion, `SC-US-018-1`, says necessary actions/errors remain available, but does not name those actions/errors and omits explicit visible-focus and no-horizontal-scroll assertions.

Correction: split the umbrella by independently testable surfaces, at minimum (a) shell/navigation and forms at 390 px + keyboard, and (b) viewer failure with 2D fallback. Name the critical actions for S0–S9 or reference a fixed journey table; add observable assertions for focus visibility, labelled controls, textual errors, and zero horizontal clipping of those actions. Preserve `SC-US-018-1` only as an end-to-end rollup after the smaller criteria exist.

## Non-blocking corrections

- `US-008`: add an offline provider-contract happy criterion: a valid schema-shaped provider response completes one job, creates one draft DesignRevision bound to the current shell, and consumes/reconciles exactly one held credit without a live network call. Split provider contract, job lifecycle and spend admission before implementation planning.
- `US-011`: add a rejected substitution criterion for incompatible/unknown dimensions: no new approved revision, prior design/budget history remains intact, and the user gets a typed recovery path.
- `US-015`: add a first unique-event happy criterion mapping an allowlisted event to exactly one count and explicitly distinguishing `share_created` from external sharing/conversion.

## Criterion scenarios

All criterion text below is quoted from `Specification.md`; names are validator labels. The last column is the exact claimant in `Pseudocode.md`.

| Criterion | Exact acceptance criterion | Named scenario | Pseudocode claimant |
|---|---|---|---|
| SC-US-001-1 | Given новый адрес; When зарегистрировался, вышел и вошёл; Then кабинет доступен только новой действующей сессии. | New account receives only a fresh valid session | Authenticate |
| SC-US-001-2 | Given неверный пароль/истёкшая или отозванная сессия; When вход/чтение; Then общий 401, приватные данные отсутствуют. | Invalid or revoked session reveals no private data | Authenticate |
| SC-US-002-1 | Given два проекта; When изменён и перезагружен один; Then второй не изменён, состояние первого восстановлено. | Project persistence remains isolated | ProjectCommand |
| SC-US-002-2 | Given другой аккаунт/архив; When чужой ID либо мутация архива; Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены. | Foreign and archived project mutations are rejected | ProjectCommand |
| SC-US-003-1 | Given 4.5×4×2.7 м и допустимые проёмы; When подтвердил; Then площадь пола 18 м², стабильный shell hash, видны план и 3D. | Confirmed room produces stable measured shell | CalibrateSpace |
| SC-US-003-2 | Given ноль/NaN/отрицательное/проём вне стены/неподтверждённый масштаб; When согласование; Then 422 либо 409 CALIBRATION_REQUIRED, проверенного статуса нет. | Invalid or unconfirmed geometry cannot be approved | CalibrateSpace |
| SC-US-004-1 | Given безопасный GLB или reference image; When upload; Then исходный hash сохранён, asset доступен только owner, thumbnail безопасен. | Safe private asset upload | StorePrivateAsset |
| SC-US-004-2 | Given oversized/повреждённый/remote-URI GLB либо изображение-bomb; When upload; Then 413/415/422, нет опубликованного asset и сетевых запросов к вложенным URL. | Malicious or oversized asset is rejected without fetch | StorePrivateAsset |
| SC-US-004-3 | Given чужой assetId; When скачать/использовать в проекте; Then 404 даже при известном storage key. | Foreign asset remains inaccessible | StorePrivateAsset |
| SC-US-005-1 | Given reference; When выбраны tags/note и повторное открытие; Then данные сохранены вместе с source/дата. | Reference annotations and provenance persist | SaveReference |
| SC-US-005-2 | Given недоступный Pinterest; When добавлена ссылка; Then предлагается upload, нет обещания импортированной доски или автоматического доступа. | Pinterest unavailable falls back honestly | SaveReference |
| SC-US-005-3 | Given заданная владельцем ссылка `https://ru.pinterest.com/pin/1117807570051119485/`; When сохранена/переоткрыта; Then исходная ссылка сохранена и доступна, не заменена общим Pinterest URL. | Exact Pinterest deep link survives round trip | SaveReference |
| SC-US-006-1 | Given калиброванная основа; When меняю стиль/мебель/ракурс и до/после; Then shell hash/размеры/проёмы неизменны, выбор сохранён. | Design changes preserve measured shell | ValidateAndRenderScene |
| SC-US-006-2 | Given предложение с shell transform, неизвестным catalogId или выходящим за ручную оболочку bbox; When сохранить; Then 422 SCENE_INVALID, предыдущий вариант цел. | Invalid scene cannot replace prior design | ValidateAndRenderScene |
| SC-US-007-1 | Given согласованный вариант; When поменял размер/стиль; Then новая revision, старый результат доступен, quantities пересчитываются по новой подтверждённой площади либо остаются unknown. | Change creates revision and recalculates honestly | ReviseAndApprove |
| SC-US-007-2 | Given два одновременных редактирования; When одинаковый expectedVersion; Then один commit, второй 409 VERSION_CONFLICT без потери данных. | Concurrent edit permits one commit | ReviseAndApprove |
| SC-US-007-3 | Given approved design; When изменён стиль или выбран другой исторический вариант; Then создана новая draft revision, approval снят, история сохранена, покупки показывают предупреждение до повторного согласования. | Restored or changed design invalidates approval | ReviseAndApprove |
| SC-US-008-1 | Given manual/off; When пользователь ищет AI; Then понятен выключенный режим, пресеты работают, наружных вызовов нет. | Disabled AI leaves manual presets usable | SubmitAndRunProposal |
| SC-US-008-2 | Given enabled без caps/key или тестовый вредоносный ответ; When startup/validation; Then отказ startup либо job failed, shell не меняется. | Unsafe AI config or output fails closed | SubmitAndRunProposal |
| SC-US-008-3 | Given два worker и один job/лимит; When параллельный запуск/timeout; Then один dispatch, caps атомарны; неизвестный исход сохраняет reservation, автоматического повторного платного dispatch нет. | Concurrent AI dispatch and timeout preserve spend safety | SubmitAndRunProposal |
| SC-US-009-1 | Given официальная ссылка и ручной снимок; When сохранён; Then все provenance-поля видны и подставляются в shopping line. | Manual product snapshot retains provenance | RecordProductSnapshot |
| SC-US-009-2 | Given retailer 401/нет цены; When запрос обновления; Then blocked/unknown, нуля или текущей цены не появляется, предлагается ручное подтверждение. | Blocked retailer does not invent price | RecordProductSnapshot |
| SC-US-009-3 | Given fresh снимок; When сменён регион/магазин либо прошло 24h; Then effective freshness stale, подтверждённый статус снят до нового снимка. | Product evidence becomes stale by context or age | RecordProductSnapshot |
| SC-US-010-1 | Given площадь 18, запас 8%, упаковка 1.99, цена 160000 копеек; When calculate; Then 10 упаковок, 1600000 копеек, видимая формула. | Exact package and price calculation | CalculateBudget |
| SC-US-010-2 | Given хотя бы один unmatched/unselected товар даже при известных работах/доставке, null coverage либо отрицательный input; When calculate; Then incomplete с unknown rows либо 422; неизвестное не теряется. | Unknown and invalid inputs remain explicit | CalculateBudget |
| SC-US-010-3 | Given изменённые quantity/price/reserve и бюджетный лимит; When calculate; Then новая версия, точный delta, known/scenario отдельно; incomplete не получает «уложились». | Budget revision shows delta without false fit | CalculateBudget |
| SC-US-010-4 | Given цена 1600 ₽ целым вводом и ранний лимит; When введены/изменены значения; Then native input допускает submit, minor=160000, текущий лимит отображается и немедленно влияет на сравнение. | Integer ruble input converts exactly | CalculateBudget |
| SC-US-011-1 | Given нет товара; When выбрал замену; Then видно отличие/новые габариты, новая версия и повторное согласование. | Accepted substitute creates reviewed revision | ReplaceAndPhase |
| SC-US-011-2 | Given позиции двух этапов; When перенос строки; Then суммы этапов меняются, общая сумма неизменна. | Moving phase preserves total | ReplaceAndPhase |
| SC-US-011-3 | Given старая смета; When возвращаюсь к дизайну и пересчитываю; Then сохранены обе версии и причина изменения, old approval не переиспользован. | Recalculation preserves history and drops old approval | ReplaceAndPhase |
| SC-US-012-1 | Given off/неполный live config; When checkout/start; Then отключён checkout/отказ startup, денег и entitlement нет. | Disabled payment cannot charge or grant entitlement | Checkout |
| SC-US-012-2 | Given тестовый provider и одинаковый ключ; When два checkout; Then один order/remote id; клиент не меняет цену/credits. | Idempotent checkout trusts server package | Checkout |
| SC-US-013-1 | Given verified succeeded; When webhook replay/concurrent delivery; Then одно начисление и один ledger outcome. | Concurrent payment replay grants once | ApplyVerifiedPayment |
| SC-US-013-2 | Given чужой merchant/amount/test mode либо provider timeout; When webhook; Then 400/503, credits неизменны; после timeout повтор не потерян. | Invalid or unavailable verification preserves credits and retry | ApplyVerifiedPayment |
| SC-US-013-3 | Given refund.succeeded; When verified event; Then новые live jobs запрещены и export entitlement отозван, audit/history доступны. | Verified refund places account on hold | ApplyVerifiedPayment |
| SC-US-014-1 | Given первый вариант; When export/share preview; Then обе кнопки рядом, watermark соответствует entitlement, исходные приватные данные не включены. | Export and share preview redact private data | ExportAndShare |
| SC-US-014-2 | Given активная ссылка; When owner отзывает/архивирует проект или TTL истёк; Then последующий view/image 404, cache no-store; ранее скачанные копии не обещано удалить. | Revoked, archived or expired share stops serving | ExportAndShare |
| SC-US-014-3 | Given чужой аккаунт/неподтверждённые права; When создание link; Then отказ без публикации. | Unauthorized sharing publishes nothing | ExportAndShare |
| SC-US-015-1 | Given повторный event key; When повторная запись; Then один event, нет исходных фото/текста/токенов в log. | Growth event is idempotent and redacted | RecordGrowth |
| SC-US-015-2 | Given нет событий; When метрика; Then наблюдаемое 0 событий либо unknown при отказе хранилища, не прогноз конверсии. | Empty or unavailable metric is reported honestly | RecordGrowth |
| SC-US-016-1 | Given cross-origin/request без CSRF либо чужой ID; When mutation/read; Then 403/404, side effect отсутствует. | CSRF and cross-owner requests have no side effect | GuardRequest |
| SC-US-016-2 | Given лимит/secret-bearing failure; When повтор запросов; Then 429 с Retry-After, logs без credentials/планов/полных payload. | Rate limit and redacted failure logging | GuardRequest |
| SC-US-017-1 | Given fresh isolated env; When migrate/build/start; Then health ready, DB не имеет published ports, project data переживают restart. | Isolated stack starts and persists without DB publication | BootOperational |
| SC-US-017-2 | Given incompatible config/schema/storage; When ready/start; Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются. | Invalid environment fails closed without provider calls | BootOperational |
| SC-US-018-1 | Given 390px/keyboard/WebGL unavailable; When прохожу путь; Then необходимые actions/ошибки доступны и есть 2D fallback. | Small-screen keyboard journey falls back to 2D | RenderAccessibleJourney |

## Source SHA-256

| Document read | SHA-256 |
|---|---|
| `/home/2026-AUG-PU-Projects/CLAUDE.md` | `c1669853c58eddd6994761d510f5f1a4d1b992b50e16f8ebedf18a10937144a2` |
| `/home/2026-AUG-PU-Projects/docs/development/model-routing.md` | `cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9` |
| `/home/2026-AUG-PU-Projects/docs/development/model-routing-telemetry.md` | `22ba852701d2c78b372cb07ed9b53f4227799ff6f8dc9c57849c09d0c35829cd` |
| `/home/2026-AUG-PU-Projects/.claude/rules/complexity-router.md` | `422a1d1952f7755c1ea772b33e9e41e1bd78a239af8a0a490f03bc48eb4e0c70` |
| `/home/2026-AUG-PU-Projects/.claude/rules/project-work-companion-local.md` | `273c7cb0d069609ba2823786e98f914362bc1fb38d864e3e4f720d6f3ecddbc4` |
| `/home/2026-AUG-PU-Projects/.claude/skills/project-work-companion/SKILL.md` | `7d27b2e123cfab42ddb5d8930ac1a6fce3aaaeb3ceb626f77a9f2cad56858403` |
| `/home/2026-AUG-PU-Projects/.claude/skills/requirements-validator/SKILL.md` | `b4b394adf08feee552f39c83331398f119e0d4abf21e683fe4706da438b4a426` |
| `/home/2026-AUG-PU-Projects/.claude/skills/requirements-validator/references/invest-criteria.md` | `ac6976adf776b9b60c784e1a0f6a0d96dd3332b16f4c12b72d3e59f9325bb626` |
| `/home/2026-AUG-PU-Projects/.claude/skills/requirements-validator/references/scoring-system.md` | `72104b74f07e0610f67f00b246b5225a530203bff225bacf7bf384bc6fd21cdf` |
| `/home/2026-AUG-PU-Projects/.claude/commands/replicate.md` (Phase 2) | `165d7b3c0606be6817893b53cbfc5ca55c7b81cbe35cbdd0dccf8679d702e81a` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/PRD.md` | `feb8c948e48db90300b59de6ebeb232569e235c24b976831db8684592b5d911b` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/Specification.md` | `fcfefeb2285784120c5614162f394d47ae895d6022eeca7371d8ed24f3a20fa1` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/Pseudocode.md` | `1f53f758a978135b9ee29806c1544b5af1793dbaa22bbff4c3f43bbccb844ad7` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/Architecture.md` | `765968d146d03c3524e999e8a1771272e310773b99c4e6bb21ff9916a26e5f99` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/project-input.md` | `cdb8a9eb5a1d3f5a9f2dc6d00e25e242625952df9b7fb575c9d75b31ae58e231` |
| `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/docs/discovery/cjm-design-brief.md` | `54fc2c4488781afe75f09651f73c38e40373155623b2535e28da0e15fbffe74c` |

Status: completed
