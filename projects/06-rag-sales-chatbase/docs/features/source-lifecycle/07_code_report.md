# 07 — Отчёт о коде: `source-lifecycle` (фича 16)

Дата: 2026-09-26 · Исполнитель: Claude Opus 5.5 (один исполнитель, свой worktree) · Основа: `b9b76779` ·
FR-INDEX-004 · SC-US-014-1, SC-US-014-2 · ADR-009, ADR-016, A-N6-028, A-N6-036 · решения **A-N6-050**, **A-N6-051**.

## Что сделано

| Единица | Файлы | Суть |
|---|---|---|
| Миграция 008 | `packages/db/migrations/008_source_lifecycle.sql` | `index_start` (журнал запусков, служебная таблица — не сущность канона); `index_job.series_embed_used`; `page.chunks_dropped`; `DROP INDEX chunk_embedding_hnsw` |
| Жизненный цикл в БД | `packages/db/src/sources.ts` (новый), `bots.ts`, `pdf-sources.ts`, `index-jobs.ts`, `chunks.ts` | `reindexSource` (готовый/отказавший сайт → новая серия той же задачи; идущая — тот же id без траты запуска; PDF — `pdf_reupload`; сохранённый предпросмотр теряет бюджеты предпросмотра); `deleteSource` (задачи → фенс → бот → каскадное удаление одной транзакцией); `recordIndexStartTx`/`indexStartsToday` (20 запусков в сутки МСК, часы БД); `pruneUnseenPages`, `capPageChunks`, `chargeSeriesBudgetTx`; `readOwnedBotForPdf` через общий `OWNED`; `retryIndexJob` — тот же порядок блокировок и предел |
| Воркер | `apps/worker/src/crawl/crawl-site.ts`, `site-processor.ts`, `pdf/pdf-processor.ts`, `embed/embed-and-store.ts` | причина `gone` (404/410); `discoveryIncomplete` (sitemap 5xx/429/сеть, переполнение очереди); уборка только после полного обхода; актуализация адреса переехавшей неизменной страницы; предел 300 фрагментов ДО эмбеддинга; бюджет серии для задач аккаунта |
| Маршруты | `app/api/sources/[sourceId]/route.ts` (DELETE), `…/reindex/route.ts`, `server/cabinet-handler.ts`, `cabinet-deps.ts`, `source-upload-handler.ts` | DELETE 204/404; reindex 202 (queued и running), 409 `reupload`, 429 `index_starts`; сайт и PDF — 429 `index_starts` (PDF — до приёма тела) |
| Кабинет | `dashboard/CabinetViews.tsx`, `bots/[botId]/BotScreen.tsx`, `page.tsx`, `bots.ts` (`readBotCabinet`), `lib/api-client.ts`, `globals.css` | «Обновить», «Повторить», «Удалить» с подтверждением в два шага; «N страниц прочитаны не целиком»; отметка «проверено» следует за сервером; 404 удаления — сообщение |
| Документы | `docs/Architecture.md`, `docs/canon.md`, `docker-compose.yml`, `docs/decisions-autonomous.md` | параллельность 1, HNSW снят, числа §7; нечитаемая `N6_INDEX_CONCURRENCY` снята |
| Тесты | `tests/source-lifecycle.{integration,unit}.test.ts` (новые); правки `crawl.test.ts`, `database.integration.test.ts`, `enums.test.ts`, `chunk-embed.integration.test.ts`, `bot-cabinet.{integration,unit}.test.ts`, `pdf-boundary.test.ts`, `browser/bot-cabinet.test.ts`; `scripts/test-source-lifecycle-mutations.mjs` | см. 05_completion |

## Отклонения от плана и почему

- **Бюджет серии — по плану тарифа** (500 000 free, 1 000 000 платные), а не одно число: у платных 300 страниц, 500 000
  токенов давали бы ≈ 1 700 токенов на страницу.
- **`index_start` исключена из счёта сущностей канона** (два теста называют служебные таблицы закрытым списком): это журнал
  запусков, как `_schema_migration`; параллельная фича 15 меняет тот же счёт, правка числа с двух сторон дала бы конфликт.
- **Сверх плана по ревью:** порядок блокировок, `discoveryIncomplete`, `gone`, актуализация адреса, бюджеты предпросмотра при
  «Обновить», предел в `retryIndexJob` (08_review.md). Переполнение очереди обхода как неполное обнаружение найдено при
  исправлении находки 2.
- **Существующие тесты с изменённой семантикой** (не ослаблены): «Повторить» идущей задачи теперь 202 с тем же id вместо 409
  (плюс утверждение, что второй постановки нет); готовый сайт — 202 новая серия вместо 409 `not_failed`; 404 в обходе —
  `gone` вместо `http_error` (плюс отдельный 503 → `http_error`); вместо проверки наличия HNSW — проверка его отсутствия и
  наличия `chunk_bot`.

## Дефекты, пойманные по ходу

- Две мутации первого прогона выжили (`second-series-while-running`, `series-budget-not-reset`): тесты не проверяли, что
  повторные нажатия на идущей задаче не тратят запуск, и что сброс бюджета держит сама аренда (путь `retryIndexJob`).
  Тесты усилены — обе мутации красные.

Status: completed
