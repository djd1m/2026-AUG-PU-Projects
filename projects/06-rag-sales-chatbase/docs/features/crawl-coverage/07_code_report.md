# 07 — Отчёт исполнителя: `crawl-coverage`

Исполнитель: Claude Opus 5.5 (агент в изолированном worktree, ветка `fix/n6-crawl-coverage`), основа `bf7ab6d0`.

## Изменённые файлы

| Файл | Что |
|---|---|
| `apps/worker/src/crawl/frontier.ts` (новый) | `Frontier` — очередь по кругу между разделами, вставка по `lastmod`; `sectionOf`; `sample(n)`; `displayPath` (путь без query, декодирован, ≤ 200) |
| `apps/worker/src/crawl/crawl-site.ts` | очередь FIFO → `Frontier`; `sitemapEntries` (loc + lastmod по блокам `<url>`); `CrawlResult.pagesKnown`, `unreadSample`; страница, остановленная бюджетом эмбеддингов, считается непрочитанной |
| `apps/worker/src/crawl/site-processor.ts` | `page_budget` / `crawl_limit` при остановке обхода (бюджет эмбеддингов главнее); `coverage` в исход; «известно адресов» в журнал (только число) |
| `apps/worker/src/run-index-job.ts` | `ProcessOutcome.coverage` → `completeIndexJob` |
| `packages/db/src/index-jobs.ts` | `IndexCoverage`; `completeIndexJob` пишет `pages_total = GREATEST(известные, pages_done)` и `unread_sample` (только при пометке); сброс `unread_sample` при аренде; `IndexJobView.unread` у усечённой `done` |
| `packages/db/src/bots.ts`, `sources.ts` | `unread_sample` в выборке кабинета; сброс при «Обновить» |
| `packages/rag/src/enums.ts` | `INDEX_JOB_TRUNCATION` += `page_budget`, `crawl_limit` |
| `packages/db/migrations/012_crawl_coverage.sql` (новый) | CHECK `truncated_by` расширен; `unread_sample text[]` с CHECK 1…5 и «только у усечённой» |
| `apps/web/src/app/dashboard/SourceTruncationNotice.tsx` (новый) | пометка ленты: `page_budget`/`crawl_limit` — известные и примеры; прочие — прежний текст budget-truncation |
| `apps/web/src/app/dashboard/CabinetViews.tsx` | одна строка (вызов компонента) + импорт; `pagesWord` больше не импортируется |
| `apps/web/src/lib/source-ribbon.ts` | `RibbonJob.unread?` |
| `vitest.config.ts`, `vitest.browser.config.ts` | псевдоним `@n6/rag/constants` (клиентский компонент не тянет `@n6/rag` с `node:crypto` — сборка Next падала) |
| `tests/crawl-coverage.test.ts`, `tests/crawl-coverage.integration.test.ts`, `tests/browser/crawl-coverage.test.ts`, `tests/fixtures/sectioned-site.ts` (новые) | unit, integration, браузер; фикстура «42 курса + 10 блога + 5 прочих» |
| `tests/enums.test.ts` | сверка ПОСЛЕДНЕГО CHECK (012) с кодом; 009 ⊂ 012 |
| `scripts/test-crawl-coverage-mutations.mjs` (новый) | 6 мутаций по схеме budget-truncation |
| `docs/canon.md`, `docs/Pseudocode.md` | перечисление `truncated_by`; CrawlSite п.2 — порядок и итог |
| `docs/BACKLOG.md` | п. 9 (llms-full.txt, оценка), 10 (sitemapindex), 11 (сайт с одним разделом) |
| `docs/decisions-autonomous.md` | A-N6-070 |

## Переиспользование (ADR-012…016)

Готового справедливого порядка обхода в N1–N5 нет (краулер N6 написан заново, ADR-016) — `frontier.ts` написан заново.
Схема мутационного скрипта — перенесена из `scripts/test-budget-truncation-mutations.mjs` (N6). Разметка пометки —
адаптирована из строки budget-truncation в `CabinetViews.tsx` (вынесена в компонент, прежний текст сохранён дословно).

## Отклонения от постановки

- Тир роутера — **L** (миграция), а не ожидаемый M; цикл пройден полностью, валидация плана — самопроверкой.
- Помимо `page_budget` добавлено `crawl_limit` (потолок запросов/времени): иначе та же ложь «N из N» оставалась бы у
  медленных сайтов.
- Экран предпросмотра не менялся: при `page_budget` в предпросмотре (20 страниц) он показывает прежнюю пометку
  «дальше закончился бюджет предпросмотра» — по смыслу верно, но без числа известных адресов.
