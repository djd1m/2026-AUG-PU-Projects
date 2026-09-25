# Стиль кода N6 «Суфлёр»

Источник: Architecture «Technology Stack», «Data Architecture», Pseudocode «Data Structures» и «API
Contracts», канон §4–§7, корневое [`compose-hygiene.md`](../../../../.claude/rules/compose-hygiene.md).
Базовый стек-донор — N5 (ADR-012): что не сказано здесь, делается как в
`projects/05-podcast-clips-opus/.claude/rules/coding-style.md`.

## Монорепо

npm workspaces: `apps/web` (Next.js 15 App Router, route handlers), `apps/worker` (BullMQ:
краулер, PDF, чанкинг, эмбеддинги, сторож), `apps/widget` (IIFE-бандл, esbuild, без фреймворка —
собирается в `apps/web/public/w/`), `packages/db` (пул `pg`, миграции SQL, `quota.ts`),
`packages/rag` (чанкинг, промпт, `ValidateModelAnswer`, клиент OpenRouter), `packages/queue`
(BullMQ + fence, донор N5). Пакет одного назначения; `apps/*` не импортируют друг друга.

- Сборка образов — из корня монорепо; `npm ci` видит манифесты ВСЕХ workspace.
- Корневой `npm run build` собирает виджет ПЕРВЫМ (его бандл — статика `web`), затем `web`, `worker`.
- `CMD` ссылается на скрипт, существующий в ТОМ `package.json`, который его запускает.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`. Без `any` на границах; `unknown` + zod.
- zod на КАЖДОЙ границе: тело запроса, query, заголовки `Origin`/`Idempotency-Key`, ответ модели,
  ответ OpenRouter, окружение (`LoadCeilings`). Разобранное — в тип, неразобранное дальше не идёт.
- Ошибки домена — классы с кодом из закрытого списка Pseudocode «Error Handling Strategy»; маршрут
  переводит код в HTTP-статус в одном месте. Недоступность внешнего источника истины —
  ИСКЛЮЧЕНИЕ, а не возвращаемое значение (иначе транзакция коммитится).
- Время — `timestamptz`, сутки для квот — `Europe/Moscow`; длительности в именах несут единицу
  (`timeoutMs`, `ttlHours`).

## SQL, `pg`, pgvector

- ORM нет: `pg` и параметризованный SQL (`$1`); строковая сборка SQL со значениями — запрещена.
- Перечисления — `text` + `CHECK (col IN (…))`; значения объявлены ОДИН раз в коде и в миграции
  сверяются тестом.
- Эмбеддинг — `vector(1536)`; размерность — константа кода (`EMBED_DIMENSIONS = 1536`), не
  окружение; в запросе к OpenRouter передаётся `dimensions: 1536`.
- Поиск: `SELECT … FROM chunk WHERE bot_id = $1 ORDER BY embedding <=> $2 LIMIT 4` и только потом
  порог `1 − distance ≥ 0.40` в коде. `SET LOCAL hnsw.ef_search = 40` внутри транзакции поиска.
- Квота — только через `packages/db/src/quota.ts` (два оператора, откат всех scope); прямой `UPDATE
  quota_counter` вне модуля — запрещён.
- Миграции только добавляющие в неделю (откат приложения без отката схемы, Completion).

## Закрытые перечисления и fail-closed

Все перечисления канона §4 — `as const`-массивы в одном модуле; разбор неизвестного даёт самое
строгое: план → `free`, статус аккаунта/бота → `deleted`, задача → `failed`, причина → `internal`,
исход → `unknown`, источник атрибуции → `cookie`. Сравнение планов — строгое `===` без
`toLowerCase`/`trim` (ADR-004: нормализация превращает опечатку в снятый бейдж).

## Числа — из канона, не из головы

Потолки, порог, `top_k`, размеры фрагментов, лимиты краулера, сроки жизни — канон §7. В коде —
константы одного модуля (`packages/rag/src/constants.ts` и `LoadCeilings`) со ссылкой на канон.
Меняя число — искать его сквозным поиском по всему N6 (урок H1/M2 Phase 2).

## Виджет

Без фреймворка; ≤ 45 КБ gzip (сборка падает выше). Разметка в shadow root; `all: initial` на корне;
единицы свои, не наследуемые от хозяина; окно чата грузится по клику на пузырь. `textContent` —
единственный способ вывести текст ответа. Тема виджета — от хозяина (`prefers-color-scheme` и
атрибут), не cookie кабинета.

## Именование

Файлы — `kebab-case.ts`; функции — `camelCase` глаголом; имена алгоритмов Pseudocode сохраняются
(`answerQuestion` ↔ `AnswerQuestion`), чтобы трассировка находилась поиском. Cookie — префикс
`__Host-n6_`. Переменные окружения — `QUOTA_*`, `N6_*`, имена моделей — `ANSWER_MODEL`, `EMBED_MODEL`.

## Known Gotchas

### TypeScript / Node
- `\w` в регэкспах не матчит кириллицу — `\p{L}` с флагом `u`.
- `req as CustomType` падает TS2352 — через `unknown` или типизированный обработчик.
- `fetch` в Node 22 (undici) следует редиректам сам — краулеру нужен `redirect: 'manual'` и своя
  проверка каждого `Location`.
- `Content-Length` может лгать или отсутствовать — считать принятые байты потока.
- `pdfjs-dist` в Node требует legacy-сборку и отключённого воркера; число страниц — из документа,
  до извлечения текста.

### Инфраструктура
- `SET LOCAL` действует только в текущей транзакции текущего соединения.
- `pg.Pool` без `connectionTimeoutMillis` ждёт бесконечно — недоступность обязана быть отказом.
- Двойной `Access-Control-Allow-Origin` (Caddy + приложение) молча ломает CORS; `curl` не видит.
- Caddy дописывает свой IP в XFF — ключ лимита `{client_ip}` и `trusted_proxies` (урок N4).
- Bind-mount файла привязан к inode: правка Caddyfile переименованием не доходит до контейнера.
- `docker compose run` без `--build` берёт старый образ — прогон проверяет не тот код (урок N5).
- `ON CONFLICT DO UPDATE … WHERE` не проверяет потолок на вставке — только два оператора.
