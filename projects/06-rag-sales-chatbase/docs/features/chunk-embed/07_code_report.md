# chunk-embed — отчёт о коде

**Фича:** 6 `chunk-embed` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (агент, автономный режим;
фактическая модель — метаданные сессии `claude-opus-5-5[1m]`) · **FR:** `FR-INDEX-001`, `FR-INDEX-002`, `FR-INDEX-003`,
`NFR-SCALE-001`, `NFR-PERF-002` · **SC:** `SC-US-004-1`, `SC-US-016-1`, `SC-US-016-2` · **ADR:** ADR-001, ADR-002,
ADR-009, ADR-016 · Квитанция — [`05_completion.md`](05_completion.md), решения — A-N6-028. OpenAI/Codex не вызывался;
живой OpenRouter не вызывался (все эмбеддинги в тестах — подменный `fetch` за настоящим клиентом).

## Что сделано

| Файл | Что | Алгоритм / требование |
|---|---|---|
| `packages/rag/src/chunk.ts` (новый) | `chunkDocument`: разделы по h1–h3 → абзацы; абзац > 600 → предложения (линейный сканер `[.!?…]` + пробел); предложение > 600 → куски по словам ≤ 500; слово > 500 → куски по символам (суррогатная пара не разрывается); упаковка до цели 500, сверх — до 600 только если так ближе к цели; перекрытие — хвост ≤ 80 токенов предыдущего фрагмента по границе слов, не через границу раздела; `context_path` = «заголовок страницы › h1 › h2 › h3» (дубль title/h1 схлопывается, заголовок ≤ 120 символов); `embeddingInput` = путь + `\n` + текст; `plainTextBlocks` для PDF (строка = абзац); `estimateTokens` — потоковая оценка (ASCII 4 / кириллица 2 / прочее 1 символ на токен, пробел разделяет серии) | ChunkDocument, FR-INDEX-001 |
| `packages/rag/src/constants.ts` | `CHUNK_TARGET_TOKENS` 500, `CHUNK_MAX_TOKENS` 600, `CHUNK_OVERLAP_TOKENS` 80, `EMBED_BATCH_MAX` 64, `EMBED_RETRIES` 2, `SEARCH_TOP_K` 4, `isEmbeddingOfDimension` — ЕДИНСТВЕННАЯ проверка длины 1536 (клиент, EmbedAndStore, запись) | канон §7, ADR-001 |
| `packages/rag/src/openrouter.ts` | проверка длины через `isEmbeddingOfDimension`; пачка ≤ `EMBED_BATCH_MAX` | ADR-001 |
| `apps/worker/src/embed/embed-and-store.ts` (новый) | `createEmbedder`: плательщик (предпросмотр — `embed_budget` задачи; иначе аккаунт бота; бот без аккаунта и без бюджета → `internal`); пачки ≤ 64; каждая попытка — `meteredCall` с `charge` = одна короткая транзакция: пульс+фенс задачи → бюджет задачи (у предпросмотра) → `account_embed_tokens` + `global_embed_tokens` (сутки по `now()` БД), отказ любого — откат всех; 2 повтора при 429/5xx/таймауте; вторая проверка 1536 внутри попытки (outcome = `dimension_mismatch`); отображение отказов: исчерпаны повторы → `embedding_unavailable` (повторяемый шаг задачи), 4xx/мусор → `embedding_unavailable` без повтора, длина ≠ 1536 → `internal` + «СИГНАЛ ОПЕРАТОРУ», предел → `quota_refused` | EmbedAndStore п.1–3, FR-LIMIT-003 |
| `packages/db/src/chunks.ts` (новый) | `writeIndexedPage` — ОДНА транзакция: `recordProgressTx` (фенс первым оператором) → upsert `page` → `DELETE` прежних фрагментов страницы → вставка пачками по 64 (`$n::vector`) → `chunks_done += вставлено − удалено` под фенсом; `resetAttemptCountersTx` (база `chunks_done` = фрагменты источника); `touchAndChargeJobBudgetTx`; `searchChunks` + `SEARCH_CHUNKS_SQL` — точный перебор внутри бота (A-N6-028) | EmbedAndStore п.4, NFR-SEC-001 |
| `apps/worker/src/crawl/site-processor.ts` | новая/изменённая страница → `chunkDocument` (title + блоки краулера) → `embedder.embed` (вне транзакции) → `writeIndexedPage`; «без изменений» и пропуски — как было; в журнале + «фрагментов N» | RunIndexJob п.3 |
| `apps/worker/src/pdf/pdf-processor.ts` | то же для страниц PDF: title «файл.pdf, с. N», блоки — строки текста | RunIndexJob п.3, SC-US-004-1 |
| `apps/worker/src/index.ts` | `createEmbedder` с `createOpenRouter(config.models)`, `spendRecorder(config.spendLog)`, `config.ceilings` → оба обработчика | — |
| `.claude/rules/coding-style.md`, `docs/Architecture.md`, `docs/decisions-autonomous.md` | поиск — точный перебор; запись — только `writeIndexedPage`; поправка к «Data Architecture»; A-N6-028 | — |
| тесты | `tests/chunk.test.ts` (28: оценка, контекст, цель/потолок/перекрытие, разделы, длинные формы, суррогаты, **время на 2 млн символов × 8 форм**); `tests/chunk-embed.integration.test.ts` (15: SC-US-004-1 целиком с поиском, изоляция, две двойные доставки, атомарность страницы, квота/бюджет/конкурентный потолок, 3072, 400); `tests/resume.test.ts` (3: SC-US-016-1, автоповтор серии, SC-US-016-2); фикстура `tests/fixtures/fake-embeddings.ts`; `crawl-job`/`pdf-job` подключают тестовый эмбеддер | Refinement |
| `scripts/test-chunk-embed-mutations.mjs` (новый) | 4 заказанные мутации; красный = «N failed», а не код 1 (несобравшийся файл тоже даёт 1 — найдено на первом прогоне) | guard-must-be-able-to-fail |
| `scripts/test-quota-mutations.mjs`, `tests/probes.test.ts` | якорь мутации `dimension-unchecked` перенесён на `isEmbeddingOfDimension`; `probes.test` собирает `packages/db` и `packages/queue` до воркера (в копии проекта без `dist` воркер не собирался — прежний пробел, см. 05_completion) | регресс стражей |

## Порядок операций на странице (security-operation-order)

`chunkDocument` (чистая функция, без БД) → для каждой пачки: короткая транзакция «пульс+фенс → бюджет/квота»
(COMMIT) → строка `attempt` с `fsync` → HTTP к шлюзу (соединение пула НЕ держится) → `outcome` → по всем пачкам
векторы собраны → одна транзакция `writeIndexedPage` (фенс первым). Опоздавшая попытка останавливается на
ближайшем списании (не платит) или на записи (откат).

## Замеры (в образе `n6-test`, Postgres 16 + pgvector 0.8.6)

| Что | Значение |
|---|---|
| `chunkDocument`, 2 млн символов: русский текст с заголовками / одно слово / слова без точек / крошечные предложения / точки / 100 000 заголовков / строки PDF / эмодзи | 157 / 240 / 368 / 661 / 248 / 198 / 172 / 190 мс (порог теста 3 с) |
| `searchChunks`, 5001 фрагмент одного бота, точный перебор | 34 мс |
| вставка фрагмента со случайным вектором при живом индексе HNSW (пачки по 50) | 2,8 мс на фрагмент; пачка из 500 не уложилась в `statement_timeout` 5 с (первая попытка засева) |
| путь HNSW + `WHERE bot_id` + `iterative_scan = relaxed_order`, 3 своих фрагмента против 300 чужих ближайших | **0 из 3** своих возвращено (чужих — 0) → A-N6-028 |

## Итоги проверок (дословно — в [`05_completion.md`](05_completion.md))

typecheck / lint / build — 0; в образе `28 passed (28)`, `615 passed (615)`, код 0; мутации chunk-embed 4/4;
регресс стражей: index-job 6/6, crawler 9/9, pdf и quota — см. квитанцию.
