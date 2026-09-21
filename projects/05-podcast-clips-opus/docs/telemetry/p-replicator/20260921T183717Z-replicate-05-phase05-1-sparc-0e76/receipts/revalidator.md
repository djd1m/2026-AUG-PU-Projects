# Квитанция — revalidator, повторная проверка Phase 2

**WORK_UNIT_ID:** `revalidator-attempt-1`
**RUN_ID:** `20260921T183717Z-replicate-05-phase05-1-sparc-0e76`
**Модель:** Opus 5 (`claude-opus-5[1m]`, 1M context) — подтверждено system-reminder сессии.
Запрошенный effort `high`; фактический параметр рассуждения изнутри сессии не наблюдаем.
**Дата:** 2026-09-21
**Файл, которым владею и который написан:** `docs/validation-revalidation.md` (395 строк).
Других файлов проекта не изменял (`git status`: единственный новый файл — он).

## Что прочитано

**Находки (35):** `docs/validation-stories.md` целиком (V1-R01…R08, Gap Register, разделы Security
AC, Growth Traceability, Vague terms, «Противоречия внутри Specification») ·
`docs/validation-coherence.md` — разделы находок всех четырёх линз и сводная таблица 27 строк
(V2-R01…R08, R11…R26, L1…L3; идентификаторов R09/R10 в документе не существует, проверено `grep`).

**Что делалось в ответ:** `docs/decisions-autonomous.md` (DEC-A-001…016) · `docs/decisions-owner.md`
(OWN-001…005) · квитанции раунда `spec-writer-3.md`, `spec-writer-4.md`, `spec-writer-5.md`,
`algo-writer-3.md`, `ops-writer-3.md` целиком · `events.jsonl` (46 событий, из них 7 типа
`correction`/`attempt_*` раунда исправлений — по ним установлена причина V3-R02).

**Текущее состояние документов:** `canon.md` (180) целиком · `Specification.md` (898) — §1, §5
US-003/005/011/012/013, FR-INGEST-001/002/003, FR-LIMIT-001/002/003, FR-AUTH-001, FR-RENDER-002/003,
FR-TRANSCRIBE-002, новые SC и `@security`-сценарии · `Pseudocode.md` (837) — шапка, Data Structures,
`CheckAndConsumeQuota`, `CreateVideo`, `CompleteUpload`, `IngestFromUrl`, `LeaseAttempt`,
`ProbeSource`, `Transcribe`, `RecordModelSpend`, `RenderClip` 6–12, `RecordLinkView`,
`OpenGuestPack`, `ApplyPartnerCode`, `WatchdogTick`, `RetryVideo`, API Contracts, State Transitions,
Error Handling, Scenario Coverage, «Открытые расхождения» и обе таблицы раунда · `Architecture.md`
(218) — Component Breakdown, External Dependencies, Data Architecture, Reconciliation ·
`ADR.md` ADR-001 п.7 и ADR-002 · `C4_Diagrams.md` · `Refinement.md` (304) — Edge Cases Matrix,
Testing Strategy, тесты «сначала красное» · `Completion.md` (166) — Pre-Deployment, Monitoring,
Handoff · `Final_Summary.md` · `PRD.md` §10 · четыре контракта (`model-cost`, `long-job`,
`webhook`, `embed`) · `test-scenarios.md` — шапка, US-011, US-012, область AUTH.

**Правила:** `fail-closed-defaults.md`, `security-operation-order.md`,
`shared-resource-verification.md`, `silent-fallbacks.md`, `model-call-cost.md`,
`long-running-job.md`, плюс `guard-must-be-able-to-fail.md` и `swarm-file-evidence.md` для разметки
слоёв и для V3-R11.

**Критерии вердикта:** `.claude/commands/replicate.md`, раздел «Phase 2: VALIDATION» и таблица
«Exit Criteria» (строки ≈ 407–545).

## Счётчики по 35 находкам

| Статус | Сколько |
|---|---|
| закрыта | 29 |
| закрыта частично | 2 (V2-R01, V2-R23) |
| ложноположительная | 1 (V2-R07) |
| отклонена координатором | 3 (V1-R04, V1-R05, V1-R06) |
| не закрыта | 0 |
| **всего** | **35** |

Все семь blocker-находок первого круга (V2-R01…R07) больше не являются блокерами: пять закрыты
полностью, одна опровергнута живой страницей, одна (V2-R01) закрыта в алгоритмах и осталась строкой
в контракте стоимости — это и есть новая находка V3-R01, а не незакрытый блокер.

## Новые находки по серьёзности

**11 штук: 3 high · 3 medium · 5 low. Blocker — ноль.**

| Sev | ID | Одной строкой |
|---|---|---|
| high | V3-R01 | `model-cost-contract.md` несёт дословно дефектный однооператорный `INSERT … ON CONFLICT DO UPDATE` квоты — рядом с его же исправленной формой, не помеченный отменённым (механизм V2-R05) |
| high | V3-R02 | DEC-A-015 не доехал до `Refinement.md`/`Completion.md`: чек-лист требует ПЯТЬ потолков, сторож запуска — ШЕСТЬ; `user_upload_refunds` отсутствует в обоих файлах |
| high | V3-R03 | `test-scenarios.md` привязан к мёртвой редакции `sha256:2831e1c6…`, не содержит трёх новых `SC-US` и утверждает в `SC-US-011-1` отказ, которого при потолке 90 не будет (60 + 30 = 90 ≤ 90) |
| medium | V3-R04 | строка «Empty input» матрицы `Refinement.md` объявляет слот невозвращаемым при `not_media` вопреки DEC-A-014 |
| medium | V3-R05 | «Error Handling Strategy» `Pseudocode.md` — «четыре разных текста» против «ПЯТЬ» в шаге 5 того же алгоритма |
| medium | V3-R06 | `Solution_Strategy.md` несёт «60 мин» и «четыре разных текста отказа» (дважды) |
| low | V3-R07 | «`scope` — один из ПЯТИ ключей канона» при шести в каноне §4 (два места `Pseudocode.md`) |
| low | V3-R08 | `Specification.md` FR-AUTH-001 ссылается на «4 сценария» области AUTH; в разделе их 8 |
| low | V3-R09 | шапка §Reconciliation — «33 алгоритма», `ProbeSource` не перечислен; в `Pseudocode.md` их 34 |
| low | V3-R10 | список «Без возврата» FR-LIMIT-003 пропускает `refused_user_llm` |
| low | V3-R11 | квитанции `arch-writer` за раунд нет, манифеста квитанций нет: `check-swarm-receipts` = `2` |

Общая черта трёх high: все три — отставание ЦИТАТЫ от числа, которое поменяли в другом документе,
то есть тот же механизм, что и у закрытых V2-R05 и V2-R22. Телеметрия называет причину у V3-R02
точно: `spec-writer-5` (DEC-A-015) финишировал в 20:27:42, `ops-writer-3` — в 20:32:31, но читал
журнал решений до DEC-A-014 включительно.

## Результат проверки V2-R07

**Ложноположительная — подтверждено независимо, живой страницей, а не решением координатора.**

`WebFetch` по `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`,
2026-09-21. Список поддерживаемых моделей содержит `claude-fable-5-1`, `claude-mythos-5-1`,
`claude-fable-5`, `claude-mythos-5`, `claude-mythos-preview`, `claude-opus-5`, `claude-opus-4-8`,
`claude-opus-4-7`, `claude-opus-4-6`, **`claude-sonnet-5`**, `claude-sonnet-4-6`,
`claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`, `claude-haiku-4-5-20251001`.

Две другие цитаты той же строки инвентаря также подтвердились дословно: гарантия
constrained decoding и перечень Not supported с числовыми и строковыми ограничениями. Вердикт
строки CONFIRMED верен, модель не меняется, DEC-A-012 подтверждён. Это единственная из 35 находок,
опровержение которой требовало обращения наружу.

## Детерминированные стражи на текущей редакции

`0`: `check-docs-complete`, `check-external-deps`, `check-canon`, `check-file-ownership`,
`check-metric-source`, `check-look-trace`, `check-look-origin`, `check-model-cost`.
`1`: **ни одного**.
`2`: `check-job-contract` (not-deployed), `check-embed-contract` («виджета нет» — законный ответ),
`check-webhook-contract` («вебхуков нет» — законный ответ), `check-review-contract` (Phase 4 не
выполнялась), `check-source-version` (нет `docs/source-versions.md`), `check-swarm-receipts` (нет
манифеста — V3-R11). Ни один код `2` не прочитан как «в порядке».

Сверки множеств, выполненные мной, а не принятые по квитанциям: `SC-US` — 35 в `Specification.md`,
35 в `Refinement.md`, 35 в `Pseudocode.md`, `comm` пуст в обе стороны; 32 в `test-scenarios.md`
(отсутствуют три новых); ключей `REQUIREMENT` — 40, и все 40 объявлены заголовками `###` в
`Specification.md`; десять публичных путей и пятнадцать процедур `canon.md` §5 против
`Pseudocode.md` §API Contracts — `diff` отсортированных списков пуст; Edge Cases Matrix — 43 строки
данных против заявленных 43.

## Рекомендуемый вердикт фазы

**🟡 CAVEATS.**

🟢 не выдаётся по двум критериям: «нет противоречий» (шесть новых расхождений раунда) и «ни одной
внешней зависимости `UNCONFIRMED`» (две остаются: FR-INGEST-003 и FR-RESULT-003, обе `Should`, обе
названы построчно в отчёте).

🔴 не выдаётся: BLOCKED нет, ни у одного пункта `Testable = 0` или `Completeness = 0`, ни одна
внешняя зависимость не `CONTRADICTED` — единственный кандидат в `CONTRADICTED` опровергнут живой
страницей.

Рекомендация к Phase 3: починить V3-R01, V3-R02, V3-R03 и дописать вторую половину V2-R23 до
начала реализации — четыре правки, ни одна не требует нового раунда роя, и каждая из первых трёх
иначе доезжает до кода.

## Границы этой перепроверки

Сравнивался текст с текстом. Ни один алгоритм не исполнялся, ни одна схема не применялась к базе,
ни один потолок не достигался прогоном. Из пятнадцати `CONFIRMED`-строк инвентаря наружу
перепроверена ОДНА — поручённая. Утверждения о поведении SQL (V2-R01, V2-R12, V2-R20) остаются
выведенными из чтения и обязаны быть подтверждены тестом, который сначала показывает красное.

Status: completed
