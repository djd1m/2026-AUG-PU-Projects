# quota-and-spend — отчёт о коде

**Фича:** 2 `quota-and-spend` · **Дата:** 2026-09-25 · **Исполнитель:** Opus 5.5 (агент, автономный режим;
фактическая модель — метаданные сессии `claude-opus-5-5[1m]`) · **FR:** `FR-LIMIT-001`, `FR-LIMIT-002`,
`FR-LIMIT-003`, `NFR-OPS-001`, `FR-INDEX-002` · **ADR:** ADR-001, ADR-002, ADR-008, ADR-011, ADR-012,
ADR-014 · Переиспользование — [`reuse-map.md`](reuse-map.md), квитанция — [`05_completion.md`](05_completion.md).

## Что сделано

| Файл | Что | Алгоритм / требование |
|---|---|---|
| `packages/db/src/quota.ts` (новый) | `chargeQuota(tx, charges)` — два оператора на пару под `SAVEPOINT`, пустой `RETURNING` = отказ, откат ВСЕХ scope списания; `consumeQuota(pool, charges)` — своя короткая транзакция; `transaction()` | CheckAndConsumeQuota, ADR-008 |
| `packages/db/src/ceilings.ts` (новый) | построители списаний: ответ посетителю (5 scope), создание предпросмотра (`:create`, `ip_previews`, `previews`), ответ предпросмотра (`:answers`, `preview_answers`), эмбеддинги индексации (аккаунт + global), эмбеддинги предпросмотра (global); предел по паре (scope, вид) из LoadCeilings; план → free/paid строгим равенством; проверка ключей | FR-LIMIT-001…003, канон §7, ADR-004 (fail-closed плана) |
| `packages/rag/src/period.ts` (новый) | `moscowDay`, `moscowMonth` (Europe/Moscow) | канон §7 «сутки — Europe/Moscow» |
| `packages/rag/src/spend.ts` (новый) | `spendRecorder` (attempt/outcome, fsync), `meteredCall` (квота → attempt → вызов → outcome на КАЖДУЮ попытку; повтор при `RetryableCallError` — новое списание), `reserveProbe` (24 пробы на вид в сутки), `validateSpendPath` | RecordModelSpend, NFR-OPS-001, model-call-cost п.4 |
| `packages/rag/src/openrouter.ts` (новый) | `createOpenRouter`: `complete` (json_schema strict, `temperature 0`, `max_tokens ≤ 400`, таймаут 20 с) и `embed` (`dimensions 1536`, 1–64 текстов, сверка длины каждого вектора, таймаут 30 с); классы отказа | ADR-002, ADR-011, FR-INDEX-002 |
| `apps/worker/src/embed-probe.ts` (новый), `apps/worker/src/index.ts` | EmbedProbe после LoadCeilings; длина ≠ 1536 или ответ ≠ 200 → код 1 | FR-INDEX-002, ADR-001 |
| `apps/web/src/answer-probe.ts` (новый), `apps/web/src/preflight.ts`, `tsconfig.preflight.json` | проба `ANSWER_MODEL` в preflight (до `next start`) | ADR-011, роадмап |
| `packages/rag/src/config.ts`, `apps/*/src/**/environment.ts` | `N6_SPEND_LOG` обязателен (абсолютный `.jsonl`) в конфиге web и worker-index | RecordModelSpend п.2 |
| `packages/db/package.json`, `package.json`, `package-lock.json` | `@n6/db` → `@n6/rag`; сборка `rag → db` (лок обновлён `npm install --offline`, +1 строка) | — |
| `docs/model-cost-contract.md` | + 2 строки `свой-код` (пробы старта, 24/24, ОТКАЗ) и абзац-обоснование | model-call-cost |
| `docs/decisions-autonomous.md` | A-N6-024 | — |
| `tests/config.test.ts`, `tests/fixtures/environment.ts` | положительный контроль старта — через подменный шлюз; фикстура получила `N6_SPEND_LOG` | — |
| `tests/*` (5 новых) + `tests/fixtures/fake-gateway.mjs`, `scripts/test-quota-mutations.mjs` | см. ниже | — |

Строк нового кода продукта — 400 (квота 149, расход/клиент/период 210, пробы 41); тестов — 462; скрипт
мутаций — 91. Каждый файл < 500 строк (lint).

## Тесты фичи

| Файл | Тестов | Что утверждает |
|---|---|---|
| `tests/quota.concurrency.test.ts` | 11 | настоящий Postgres: прогон 1 (20 одновременно при остатке 1 → 1 списание, 1 вызов модели, 1 строка attempt, 19 × `visitor_answers`; ip/бот/месяц = 20, а не 39); 40 одновременно при пределе 7 → 7; свежая строка с n > предела → отказ; отказ `global_answers` не трогает узкие scope; отказ внутри транзакции вызывающего оставляет её пригодной; счёт по попыткам на настоящем счётчике (2 неудачные попытки → used 2, 2 строки attempt, 3-я отказана квотой); прогон 6 (60 разных посетителей за одним /24 → 60, 61-й → `ip_answers`, другой префикс не наказан); исчерпанная сессия не мешает 20 другим; `NOBADGE` → предел free 50; прогон 4 (5 созданий → 1; затем 10 ответов проходят, 11-й — отказ); прогон 5 (20 × 7000 токенов при пределе 100 000 → ровно 14, account = global = 98 000) |
| `tests/spend.test.ts` | 8 | attempt на диске в момент вызова; отказ модели не возвращает списание; повтор после 503 — 3 списания и 3 attempt; квота отказала — ни вызова, ни строки; повтор упёрся в квоту; журнал недоступен → вызова нет; `N6_SPEND_LOG` непригоден; 24 пробы в сутки, 25-я — отказ |
| `tests/openrouter.test.ts` | 15 | форма запросов эмбеддингов и ответа; 1535 и 3072 → `dimension_mismatch`; число векторов/не-числа → `schema_violation`; 429/500/503 повторяемые, 400/401/402 нет; ключ не утекает в текст ошибки |
| `tests/quota-keys.test.ts` | 8 | 5 scope по порядку с ключами, периодом МСК (00:30 МСК 1.10 = `2026-10-01`/`2026-10`) и пределами; план строгим равенством (9 форм мусора → free); полный IP вместо префикса — отказ; создание предпросмотра не содержит `:answers` |
| `tests/probes.test.ts` | 6 | собранные `apps/worker/dist/index.js` и `apps/web/.next/preflight/preflight.js` против подменного шлюза: 1536 → живёт / код 0; 1535 → код 1 и `dimension_mismatch` в журнале; 500 → код 1, попытка учтена; ответ без схемы → код 1 |

## Прогон в образе (дословно)

`docker compose -f compose.test.yml --project-directory . --env-file /tmp/n6-foundation.env run --rm --build test`
(`N6_ACCEPTANCE=1`), код возврата **0**; полный вывод — `tests/artifacts/quota-and-spend/compose-test-run.txt`:

```
 ✓ tests/quota.concurrency.test.ts (11 tests) 1695ms
 ✓ tests/database.integration.test.ts (10 tests) 1370ms
 ✓ tests/config.test.ts (192 tests) 13937ms
 ✓ tests/auth.test.ts (10 tests) 1023ms
 ✓ tests/openrouter.test.ts (15 tests) 30ms
 ✓ tests/spend.test.ts (8 tests) 74ms
 ✓ tests/quota-keys.test.ts (8 tests) 15ms
 ✓ tests/probes.test.ts (6 tests) 10559ms
 ✓ tests/proxy-rate.test.ts (8 tests) 24ms
 ✓ tests/compose.test.ts (16 tests) 12ms
 ✓ tests/enums.test.ts (22 tests) 14ms
 ✓ tests/redis.integration.test.ts (1 test) 29ms
 ✓ tests/health.test.ts (1 test) 9ms
 Test Files  13 passed (13)
      Tests  308 passed (308)
```

Пропусков 0. Стек после прогонов остановлен `down -v` (код 0; контейнеров `n6-test-*` не осталось).

## Мутации (дословно)

В образе того же стека: `run --rm --build test sh -c 'node scripts/test-db.mjs && node scripts/test-quota-mutations.mjs'`,
код возврата **0**; вывод — `tests/artifacts/quota-and-spend/mutations-run.txt`. Прогон — 5 файлов фичи (48 тестов):

```
single-statement: дефект возвращён → 2 failed | 46 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
read-then-write: дефект возвращён → 3 failed | 45 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
count-by-success: дефект возвращён → 10 failed | 38 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
no-visitor-limit: дефект возвращён → 6 failed | 42 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
create-spends-answers: дефект возвращён → 2 failed | 46 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
dimension-unchecked: дефект возвращён → 3 failed | 45 passed (48) (код 1); код восстановлен → 48 passed (48) (код 0)
```

Три мутации постановки — `single-statement`, `count-by-success`, `no-visitor-limit`; три — из Refinement
«Стражи и мутации» (`read-then-write`, `create-spends-answers`, размерность). Страж самого скрипта: без
`DATABASE_URL` → код **2** («мутационный прогон НЕ ВЫПОЛНЕН»), не 0. Прежний страж старта
`scripts/test-ceilings-mutations.mjs` перепрогнан после правки положительного контроля — 5/5 мутаций
пойманы (33/14/1/8/18 красных; восстановление 192/192).

## Что нашли по дороге

- **Однооператорную форму ловит ОДИН тест, и не конкурентный.** Под конкуренцией `ON CONFLICT DO UPDATE
  … WHERE` в PostgreSQL перепроверяет условие на новой версии строки и ведёт себя верно; её дефект —
  первое списание на свежей строке без сравнения с пределом (`VALUES (…, n)`). Конкурентный тест с
  `n = 1` её НЕ различает; различает тест «свежая строка, n > предела» (эмбеддинги пачкой). Это записано
  в комментарии `quota.ts` — иначе форму «упростят» обратно, сославшись на зелёные конкурентные тесты.
- **Проба старта — платный вызов «свой-код» без предела.** Постановка требовала пробу; `restart:
  unless-stopped` превращал бы сломанный шлюз в оплату пробы на каждом перезапуске. Добавлен предел
  24/сутки на вид и строки контракта (`check-model-cost.cjs` → 0, 7 вызовов).
- **Положительный контроль foundation перестал бы быть офлайновым**: web/worker теперь ходят в шлюз при
  старте. Решено подменой `fetch` через `node --import tests/fixtures/fake-gateway.mjs` — без
  тестового крючка в коде продукта и без переменной адреса шлюза в окружении (адрес — константа кода).

## Проверки сборки

`npm run typecheck` → 0 · `npm run lint` → «Статические правила: ошибок нет» · `npm run build` → 0 ·
`N6_ENV_FILE=/tmp/n6-foundation.env bash scripts/check-env-wiring.sh` → 0 («Потерь нет»; без env-файла
честно 2) · `node ../../.claude/hooks/check-model-cost.cjs .` → 0 · локально `npm test` без БД → 286
passed | 22 skipped (пропуски названы репортёром — это НЕ приёмка; приёмка — прогон в образе выше).

Status: completed
