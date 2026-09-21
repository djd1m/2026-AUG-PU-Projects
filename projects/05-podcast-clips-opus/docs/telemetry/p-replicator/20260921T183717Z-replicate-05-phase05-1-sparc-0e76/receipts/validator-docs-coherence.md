# Квитанция — validator-docs-coherence

**WORK_UNIT_ID:** `validator-docs-coherence-attempt-1`
**RUN_ID:** `20260921T183717Z-replicate-05-phase05-1-sparc-0e76`
**Роль:** Phase 2 (VALIDATION), линзы architecture / pseudocode / coherence / dependencies + Шаг 2.9
**Модель:** Claude Opus 5 (`claude-opus-5[1m]`), контекст 1M, режим auto
**Дата:** 2026-09-21
**Написанный файл (единственный):** `docs/validation-coherence.md` — 27 находок, четыре вердикта,
блок `## Decision Coverage` в предписанной форме. Других файлов проекта не изменял.

## Что прочитано

**Документы проекта (целиком):** `canon.md` · `Specification.md` (789 строк) · `PRD.md` ·
`Pseudocode.md` (739 строк) · `Architecture.md` · `ADR.md` · `C4_Diagrams.md` · `Refinement.md` ·
`Completion.md` · `Final_Summary.md` (разделы метрик, рисков, timeline) · `Solution_Strategy.md`
(выборочно) · `Research_Findings.md` (выборочно) · `CJM_Variants.md` (выборочно) ·
`source-product-profile.md` (выборочно) · `dispatch-plan.md` · `decisions-owner.md` ·
`decisions-autonomous.md` · четыре контракта: `model-cost-contract.md`, `long-job-contract.md`,
`webhook-contract.md`, `embed-contract.md`.

**Инструкции конвейера:** `.claude/commands/replicate.md` строки 407–600 (Phase 2: шаг 2.0, шесть
линз, критерии выхода, Шаг 2.9 с предписанной формой блока и двумя исключёнными файлами).

**Правила:** `security-operation-order.md` · `shared-resource-verification.md` ·
`fail-closed-defaults.md` · `honest-configuration.md` · `silent-fallbacks.md` ·
`long-running-job.md` · `model-call-cost.md` · `docker-ports.md` · `deployment-seams.md` ·
`guard-must-be-able-to-fail.md` (все — из `CLAUDE.md`-контекста проекта, полный текст).

**Образец формы:** `projects/04-calorie-vision-cal-ai/docs/validation-report.md`.

## Результаты по линзам

| Линза | Вердикт | Решающая находка |
|---|---|---|
| validator-architecture | 🔴 NEEDS WORK | V2-R02, V2-R03 — два физических ограничения делают названные алгоритмы неисполнимыми как написано |
| validator-pseudocode | 🔴 NEEDS WORK | V2-R01 — ветка `INSERT` атомарного оператора квоты не проверяет потолок |
| validator-coherence | 🔴 NEEDS WORK | V2-R04, V2-R05, V2-R06 — две Must-способности без маршрута, контракт входа от отменённого механизма, публичный домен без конфигурации |
| validator-dependencies | 🔴 NEEDS WORK | V2-R07 — цитата CONFIRMED-строки на странице не найдена, модель отсутствует в списке поддерживаемых |

### Что оказалось чистым (проверено, находок нет)

- **40 из 40 ключей REQUIREMENT заявлены** — множество строк `REQUIREMENT:` в `Pseudocode.md`
  совпало с 29 FR + 5 FR-GROWTH + 6 NFR канона §3 точно, без пропусков и без лишних.
- **Scenario Coverage честен** — 32 `SC-US-nnn-k` в `Specification.md`, 32 в строках `REALISES:`,
  множества совпали побайтово; обе таблицы «none» верны. Выборочно проверены 5 сценариев
  (SC-US-002-3, SC-US-004-2, SC-US-009-2, SC-US-013-1, SC-US-011-3): названные алгоритмы делают то,
  что утверждает сценарий, кроме SC-US-011-3 — он опирается на оператор из V2-R01.
- **Числа канона §7 совпадают во всех документах** — сверены все строки таблицы (размер, 2–90 мин,
  60/600/20/2, 3 и 14 суток, 900 с, 3,5 %, 4,5:1, 30/120, 50 за 10 мин, 2 попытки, 15 и 30 мин,
  `Europe/Moscow`). Расхождений ноль.
- **Success Metrics совпадают построчно в трёх документах** — `Specification.md` §8, `PRD.md`,
  `Final_Summary.md`: десять строк, одинаковые пороги и источники значения.
- **У всех восьми ADR есть исполнимая Confirmation** с названным внедряемым дефектом.
- **Рамка соблюдена** — distributed monolith, Compose, PostgreSQL 16 в контейнере, VPS, без
  managed-сервисов, хранилища без `ports:`, единственная публикация — петлевая.
- **`UNCONFIRMED`-строка названа построчно и исключена из Phase 3** в четырёх местах.

## Находки по серьёзности

| Серьёзность | Число | Идентификаторы |
|---|---|---|
| blocker | 7 | V2-R01, V2-R02, V2-R03, V2-R04, V2-R05, V2-R06, V2-R07 |
| high | 10 | V2-R08, R11, R12, R13, R14, R15, R16, R17, R21, R22 |
| medium | 7 | V2-R18, R19, R20, R23, R24, R25, R26 |
| low | 3 | V2-L1, V2-L2, V2-L3 |

Итого 27 находок; столько же строк в сводной таблице фрагмента, и в этом же виде их следует
переносить в Gap Register отчёта фазы.

## Четыре проверки цитат внешних зависимостей (WebFetch, 2026-09-21)

| # | Страница | Результат |
|---|---|---|
| 1 | `developers.openai.com/api/docs/guides/speech-to-text` | ✅ ВСЕ ЧЕТЫРЕ цитаты найдены дословно: «Use `whisper-1` when you need word or segment timestamps.»; «The `timestamp_granularities[]` parameter is only supported for `whisper-1`.»; «Files can be up to 25 MB. Supported input formats are `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, and `webm`.»; «For larger recordings, use a compressed audio format or split the file into chunks of 25 MB or less. Avoid splitting in the middle of a sentence, which can remove context and reduce accuracy.» |
| 2 | `platform.claude.com/docs/en/build-with-claude/structured-outputs` | ⚠️ ЧАСТИЧНО. Найдено дословно: «Structured outputs guarantee schema-compliant responses through constrained decoding» и «Not supported: … Numerical constraints (such as `minimum`, `maximum`, `multipleOf`); String constraints (`minLength`, `maxLength`)». **НЕ НАЙДЕНО:** «Supported models: … `claude-sonnet-5` …» — список поддерживаемых моделей на странице содержит `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`; `claude-sonnet-5` в нём отсутствует. → V2-R07 (blocker) |
| 3 | `cloud.ru/docs/s3e/ug/topics/api__putbucketlifecycleconfiguration` | ✅ Найдены все три элемента: `Expiration (Date, Days, ExpiredObjectDeleteMarker)`, `AbortIncompleteMultipartUpload (DaysAfterInitiation)`, `NoncurrentVersionExpiration`. `Transition` на странице отсутствует, что согласуется с утверждением ADR-002 п.4 (само утверждение цитирует соседнюю страницу `concepts__lifecycle`, отдельно мной не проверялась) |
| 4 | `docs.bullmq.io/guide/jobs/stalled` | ✅ ОБЕ цитаты найдены дословно: «When a worker is not able to notify the queue that it is still working on a given job, that job is moved back to the waiting list, or to the failed set.» и «If a job stalls more than a predefined limit (see the `maxStalledCount` option), the job will be failed permanently» + «The default is 1.» |

Три строки из четырёх подтверждены полностью; четвёртая подтверждена наполовину и требует смены
вердикта с `CONFIRMED` на `CONTRADICTED` до перепроверки.

## Decision Coverage (Шаг 2.9)

```
Decisions in docs/ADR.md: 8  ·  named downstream: 8  ·  superseded: 0
Recorded but named nowhere:            none
Named downstream but absent from ADR:  none
```

Метод: идентификаторы взяты из заголовков `## ADR-<nnn>` файла `docs/ADR.md` (ADR-001…ADR-008);
точный токен `ADR-<nnn>` искался регистрочувствительно РОВНО в восьми названных файлах
(`PRD.md`, `Solution_Strategy.md`, `Specification.md`, `Pseudocode.md`, `Architecture.md`,
`Refinement.md`, `Completion.md`, `C4_Diagrams.md`); `docs/ADR.md` и `docs/validation-report.md`
исключены по правилу. Пометок «superseded» в `ADR.md` нет.

Распределение упоминаний: ADR-001 — 13 · ADR-002 — 12 · ADR-003 — 6 · ADR-004 — 5 · ADR-005 — 5 ·
ADR-008 — 5 · ADR-006 — 4 · ADR-007 — 4.

Два наблюдения, не выражаемые счётчиком и записанные во фрагменте: `Specification.md` не называет
ни одного `ADR-nnn`, хотя ADR-004/007/008 управляют именно её требованиями; ADR-007 назван только в
`Refinement.md`. Оба допустимы правилом и оба стоит знать.

## Границы этой проверки

- Три линзы из четырёх сравнивают наш текст с нашим текстом. Наружу сделано ровно четыре обращения,
  перечисленных выше; остальные двенадцать `CONFIRMED`-строк приняты по цитате в документе.
- Ни один алгоритм не исполнялся, ни одна схема не применялась к базе. Утверждения «этот `UNIQUE`
  столкнётся» (V2-R02) и «эта вставка пройдёт мимо потолка» (V2-R01) выведены чтением SQL и
  обязаны быть подтверждены тестом, который сначала показывает красное.
- Линзы `validator-stories` и `validator-acceptance` (INVEST/SMART, BDD) — не моя единица; их несёт
  `validator-stories-ac`.
- Детерминированные ворота шага 2.0 и 2.1–2.4 (`check-docs-complete`, `check-external-deps`,
  `check-look-origin`, `check-embed-contract`, `check-job-contract`, `check-webhook-contract`,
  `check-model-cost`) я не запускал: они принадлежат координатору и выполняются до роя.

Status: completed
