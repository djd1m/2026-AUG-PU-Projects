# quota-and-spend — карта переиспользования (источник → назначение → что изменено)

**Дата:** 2026-09-25 · **Доноры:** N5 `projects/05-podcast-clips-opus` (ADR-012), N4
`projects/04-calorie-vision-cal-ai` (ADR-014). Доноры только читались. В каждом новом файле первая строка —
комментарий происхождения (`из N5: …` / `из N4: …` / «написано заново»).

## Ответ по строкам `reuse` роадмапа

| # | ADR | Блок | Ответ | Что именно |
|---|---|---|---|---|
| 1 | ADR-012 | атомарная квота (N5 `packages/db/src/quota.ts`) | **адаптировано** | `transaction()` — без изменений; пара операторов `INSERT … ON CONFLICT DO NOTHING` + `UPDATE … WHERE used::bigint + n <= limit RETURNING` под `SAVEPOINT` — без изменений; колонка `period` вместо `day` (у `bot_month_answers` — месяц); фиксированные причины N5 заменены списком пар `(scope, scope_key, period, n, limit)`, который строит `ceilings.ts`; добавлены `consumeQuota` (своя короткая транзакция) и проверка списка (пустой, n/предел вне int4, повтор строки). `refundUploadSlot` не взят — у N6 возвратов нет (счёт по попыткам) |
| 2 | ADR-012 | журнал расхода по попыткам (N5 `apps/worker/src/llm/spend.ts`) | **перенесено + расширено** | запись `open('a', 0o600) → writeFile → sync` — без изменений; события — вызовы N6 (`answer`, `embed_question`, `embed_index`, `answer_preview`, `embed_preview`, `probe_*`); место — `packages/rag/src/spend.ts` (общий у web и worker-index). Добавлено `meteredCall` — порядок «квота → attempt(fsync) → вызов → outcome» на КАЖДУЮ попытку (у N5 он был разнесён по воркерам `select.ts`/`stt.ts`) и `reserveProbe` |
| 3 | ADR-012 | клиент OpenRouter (N5 `apps/worker/src/llm/provider.ts`) | **адаптировано** | один путь `https://openrouter.ai/api/v1`, `redirect: 'error'`, `AbortSignal.any` с таймаутом, `response_format: json_schema strict`, разбор `choices[0].message.content` с отказом на `refusal` — из N5; добавлены эмбеддинги (`POST /embeddings`, `dimensions: 1536`, сверка длины каждого вектора), `temperature 0`, `max_tokens ≤ 400`, `provider.require_parameters`; `provider.only` N5 (закрепление за Anthropic/Google) не взят — у N6 одна модель из закрытого набора; классы отказа: 429/5xx/сеть/таймаут → `RetryableCallError`, прочее → `GatewayResponseError` со `spendResult` |
| 4 | ADR-014 | ключи квоты для анонимов (N4 `apps/api/src/quota/keys.ts`, `check-and-consume.ts`) | **переписано** (донор на Fastify) | взяты: идея двух ключей анонима (сессия + префикс адреса) плюс общий `'all'`, фиксированный порядок ключей против взаимных блокировок, `moscowDay` (→ `packages/rag/src/period.ts`, + `moscowMonth`). **Не взята** однооператорная форма списания N4 (`INSERT … VALUES (1) ON CONFLICT DO UPDATE … WHERE used < limit`): первое списание на свежей строке она не сравнивает с пределом — это мутация `single-statement`, пойманная тестом |

## Файлы

| Источник | Назначение (N6) | Что изменено |
|---|---|---|
| N5 `packages/db/src/quota.ts` | `packages/db/src/quota.ts` | строка 1 таблицы выше |
| N4 `apps/api/src/quota/keys.ts` | `packages/db/src/ceilings.ts` | строки 4; ключи и числа — канон N6 §7 (10 scope, 14 переменных, вид предела в `scope_key`); проверка ключей (UUID, префикс /24 или /48, сессия браузера без `:`) |
| N4 `apps/api/src/quota/keys.ts` (`moscowDay`) | `packages/rag/src/period.ts` | + месяц; отказ на непригодной дате |
| N5 `apps/worker/src/llm/spend.ts` | `packages/rag/src/spend.ts` | строка 2 |
| N5 `apps/worker/src/llm/provider.ts` | `packages/rag/src/openrouter.ts` | строка 3 |
| — (форма — N5 `provider.ts` + `spend.ts`) | `apps/worker/src/embed-probe.ts` | **написано заново**: у N5 нет эмбеддингов |
| — (форма — N5 `provider.ts`) | `apps/web/src/answer-probe.ts` | **написано заново**: у N5 нет пробы модели при старте |
| N5 `apps/web/src/preflight.ts` (через foundation) | `apps/web/src/preflight.ts` | + `await answerProbe` после `loadWebConfig` |
| N6 `scripts/test-ceilings-mutations.mjs` (он из N5 `test-limits-mutations.mjs`) | `scripts/test-quota-mutations.mjs` | 6 мутаций квоты/расхода; якорь — отрезок «начало…конец» (многострочные мутации); код 2 без `DATABASE_URL` |
| — | `tests/quota.concurrency.test.ts`, `spend.test.ts`, `openrouter.test.ts`, `quota-keys.test.ts`, `probes.test.ts`, `fixtures/fake-gateway.mjs` | **написано заново** по форме N5 `database.integration.test.ts` (своя схема на прогон, настоящий Postgres) |

## Что сознательно НЕ взято

N5 `refundUploadSlot` (возвратов у N6 нет); N5 `provider.only`/`allow_fallbacks` (одна модель из
закрытого набора кода, A-N6-022); однооператорное списание N4 (ADR-008); N5 `recordModelSpend` воркера
STT (минуты аудио — у N6 такой единицы нет).
