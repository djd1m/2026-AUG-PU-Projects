# rag-answer — отчёт о коде

**Фича:** 7 `rag-answer` · **Дата:** 2026-09-26 · **Исполнитель:** Opus 5.5 (автономный режим по постановке
координатора) · **Тир:** XL по роадмапу (главный инвариант продукта + платный вызов) — остановки на плане у владельца
не было, по постановке; решения — A-N6-029.

## Что сделано

| Файл | Что |
|---|---|
| `packages/rag/src/answer.ts` (новый) | `answerQuestion` — ядро AnswerQuestion без маршрута; `parseVisitorRequest` — закрытый набор ключей тела (`question`, `history`) |
| `packages/rag/src/search.ts` (новый) | `ownHit` — единственная проверка принадлежности фрагмента боту в ядре; `selectRelevant` — свой → порог `≥ 0.40` → top 4 |
| `packages/rag/src/prompt.ts` (новый) | `SYSTEM_RULES` (константа, без чужого текста); фрагменты `<материал id="Fk">`, вопрос `<вопрос>`, история `<история>` — одним сообщением user; `neutralize` (`<`/`>` → `‹`/`›`, управляющие → пробел); JSON-схема с `enum` меток |
| `packages/rag/src/validate-model-answer.ts` (новый) | ValidateModelAnswer: всё, кроме «answered + текст + непустые цитаты только из меток», — `unknown` с причиной; текст ≤ 1200 символов |
| `packages/rag/src/constants.ts` | `MIN_SIMILARITY 0.40`, `QUESTION_MAX_CHARS 500`, `HISTORY_TURNS 2`, `ANSWER_TEXT_MAX_CHARS 1200`, `SOURCE_EXCERPT_MAX_CHARS 160`, `QUESTION_TEXT_TTL_DAYS 14` (канон §7, Specification FR-ANSWER-001…003) |
| `packages/db/src/answers.ts` (новый) | `loadAnswerBot` (бот по доверенному id, план — fail-closed), `chargeAnswerQuota` (5 scope виджета / 2 предпросмотра одной короткой транзакцией, сутки по `now()` БД), `recordQuestion` (текст только у `unknown`, `text_expires_at = now() + 14 дней`) |
| `packages/db/src/chunks.ts` | `searchChunks` возвращает `bot_id` (`ChunkHit extends SearchHit`); SQL поиска и его инвариант не тронуты |
| `tests/rag-answer.test.ts` (новый, 33) | ядро на портах в памяти + настоящий клиент OpenRouter за подменным fetch |
| `tests/validate-model-answer.test.ts` (новый, 23) | 19 форм мусора/выдумки + верные ответы, обрезка по кодовым точкам |
| `tests/bot-isolation.test.ts` (новый, 6) | связка `loadAnswerBot → chargeAnswerQuota → searchChunks → answerQuestion → recordQuestion` на настоящем Postgres + pgvector |
| `tests/fixtures/fake-answer-gateway.ts` (новый) | подменный шлюз `/embeddings` + `/chat/completions` (JSON, мусор, refusal, HTTP-статус, зависание до отмены) |
| `scripts/test-rag-answer-mutations.mjs` (новый) | 3 мутации заказа координатора; схема — из `test-chunk-embed-mutations.mjs` |
| `docs/measurements/threshold-calibration.md` (новый) | протокол и пустая таблица: **НЕ ИЗМЕРЕНО** (живые вызовы запрещены) |

## Порядок в ядре (как исполняется)

1. Модели — из закрытого набора кода (`ANSWER_MODELS`/`EMBED_MODELS`), иначе исключение до любого вызова.
2. Бот — аргумент ядра; статус читается fail-closed: виджет — только `active`, предпросмотр — только `draft`, иначе `not_found`.
3. Вопрос и история перепроверяются (`parseVisitorRequest`): пусто / > 500 символов / > 2 ходов / лишний ключ → `invalid` ДО квоты.
4. `meteredCall(embed_question)`: `chargeQuota` → строка `attempt` с `fsync` → эмбеддинг → `outcome`. Отказ квоты →
   `refused_limit` в журнале, ни одного вызова. Сбой шлюза → «сервис недоступен» (квота уже списана).
5. `search(bot.id, вектор)` → `selectRelevant`: чужие отброшены (+ «СИГНАЛ ОПЕРАТОРУ»), порог `≥ 0.40`, top 4. Пусто →
   «не знаю» + контакт, текст вопроса в журнал на 14 дней, **модель не вызывается**.
6. `meteredCall(answer | answer_preview)` без повтора, `AbortSignal.timeout(20 с)` поверх таймаута клиента,
   `temperature 0`, `max_tokens 400`, `response_format: json_schema` с `enum` меток. Таймаут/429/5xx/4xx → «сервис
   недоступен»; не JSON / refusal → «не знаю».
7. `validateModelAnswer` → затем каждая цитата отображается на выданный фрагмент, и каждый — `ownHit`. Иначе «не знаю».
8. `answered`: журнал с `cited_chunk_ids`, без текста; ответ с `sources` и `sourceChip` (заголовок/имя PDF + страница,
   `http(s)`-ссылка только для сайта, ≤ 160 символов фрагмента).

## Прогоны

| Что | Итог |
|---|---|
| `npm run typecheck` | 0 |
| `npm run lint` | «Статические правила: ошибок нет» |
| `npm run build` | 0 |
| Локально (без БД) новые наборы | 56 passed, 6 skipped (bot-isolation — пропуск без `DATABASE_URL`, законно вне образа) |
| В образе `compose.test.yml` (`tests/artifacts/rag-answer/image-run.txt`) | **31 файл, 677/677**, пропусков 0, `exit=0` |
| Мутации rag-answer в образе (`tests/artifacts/rag-answer/mutations-run.txt`) | 3/3 пойманы, восстановление зелёное, `exit=0` |
| Регресс мутаций chunk-embed (правился `chunks.ts`) (`tests/artifacts/rag-answer/regression-chunk-embed-mutations.txt`) | 4/4, `exit=0` |
| `check-model-cost.cjs .` | 0 |

Мутации (дословно — в [`05_completion.md`](05_completion.md)): `threshold-removed` 3 failed, `citation-check-removed` 8 failed, `foreign-citation-accepted` 2 failed; восстановление 77/77 каждый раз.

Status: completed
