# 07 — Отчёт о коде: `budget-truncation`

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (агент в изолированном worktree, один исполнитель) · Основа: `76c4b4f6` ·
Решение: **A-N6-052** · FR: FR-INDEX-002, FR-LIMIT-002, FR-LIMIT-003 · Правила: long-running-job, model-call-cost.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| Миграция 009 | `packages/db/migrations/009_budget_truncation.sql` | `index_job.truncated_by` — закрытый набор `embed_budget` · `series_embed_budget`; CHECK «только у `done`» |
| Перечисление | `packages/rag/src/enums.ts` | `INDEX_JOB_TRUNCATION`, `readIndexJobTruncation`: NULL → null, известное → как есть, непустое неизвестное → `'unknown'` (не «прочитано целиком») |
| БД | `packages/db/src/chunks.ts` (`readEmbedBudgetRemaining`), `index-jobs.ts` (`completeIndexJob(…, truncated)`, `IndexJobView.truncated`, сброс в `leaseIndexJob`, `readIndexJob`), `sources.ts` (сброс при «Обновить»), `bots.ts` (кабинет читает колонку) | |
| Эмбеддер | `apps/worker/src/embed/embed-and-store.ts` | `EmbedBudgetExhausted(truncation)`; остаток бюджета задачи/серии проверяется ДО первой пачки страницы; отказ пачки по собственному бюджету (страховка) — то же исключение; внешний потолок — `StepFailure('quota_refused')` |
| Обход | `apps/worker/src/crawl/crawl-site.ts` (`StopCrawl`, `stoppedBy = 'embed_budget'`, 0 страниц → `quota_refused`), `site-processor.ts` (перевод исключения, возврат `{ truncated }`, уборка исчезнувших страниц при усечении не запускается) | |
| PDF | `apps/worker/src/pdf/pdf-processor.ts` | останавливается индексация листов; 0 записанных листов → отказ |
| Задача | `apps/worker/src/run-index-job.ts` | `ProcessOutcome`; `processByKind` ВОЗВРАЩАЕТ исход обработчика (первая версия его проглатывала — поймано тестом AC-1) |
| Экраны | `app/preview/PreviewViews.tsx` (`truncationNotice`, текст `quota_refused`), `app/preview/[jobId]/PreviewScreen.tsx`, `app/dashboard/CabinetViews.tsx`, `lib/source-ribbon.ts` (`pagesWord`, `truncated` в `RibbonJob`) | |
| Тесты | `tests/budget-truncation.integration.test.ts` (новый), `tests/chunk-embed.integration.test.ts` (усечение PDF, 0 листов, длинный лист > 64 фрагментов), `tests/source-lifecycle.integration.test.ts`, `tests/enums.test.ts`, `tests/browser/preview-flow.test.ts` (страница `truncated`, списки страниц из реестра), `tests/browser/bot-cabinet.test.ts` (страница `bot-truncated`) | |
| Мутации | `scripts/test-budget-truncation-mutations.mjs` | 5 мутаций; две правки одного файла — одной цепочкой, повтор файла в мутации — отказ сценария |

## Дефекты, пойманные по ходу

- **Диспетчер терял исход обработчика.** `processByKind` делал `await processors[kind](lease)` без `return` — пометка не
  доходила до `completeIndexJob`, задача оказывалась `done` без `truncated_by`. Поймано первым прогоном AC-1/AC-3;
  закреплено мутацией `dispatcher-drops-outcome` (4 красных).
- **Списки страниц браузерного набора предпросмотра были зашиты** в регэксп сервера и в цикл правил — новая страница
  отдавала 404 и не проходила axe/R-правила. Списки выведены из реестра `PAGES`.
- **Пустое утверждение в тесте AC-2** («у каждой попытки result = started» — истинно всегда) заменено точным числом попыток.

## Отклонения от постановки

- Числа 40 000 / 20 / 500 000 не менялись: канон §7 и Specification FR-LIMIT-002 — решение владельца (вопрос в 05).
- «Остановка разбора PDF» из постановки — на деле останавливается индексация листов (разбор документа — целиком заранее,
  свойство pdf-source); формулировка исправлена по ревью.

Status: completed
