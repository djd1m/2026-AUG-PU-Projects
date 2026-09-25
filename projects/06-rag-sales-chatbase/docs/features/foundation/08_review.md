# foundation — независимое ревью (Sonnet 5)

**Дата:** 2026-09-25 · **Ревьюер:** Sonnet 5 (Anthropic; код не менялся) · **Автор кода:** Opus 5.5 ·
**Ревизия:** грязное дерево N6, снимок из `07_code_report.md`
(`sha256:9c0621844d4bf47ba21fef7b74116c2d43d63d95cb79e5e6e1f195ddbae26704`) · Не cross-family
(OpenAI/Codex не звался с 25.09 — `anthropic-only-openai-quota-2026-09`), но это первое ревью
другой моделью Anthropic по этой ревизии — CLAUDE.md проекта требует именно это.

Прочитано: `07_code_report.md`, `05_completion.md`, `reuse-map.md`, корневой и проектный `CLAUDE.md`,
`docs/canon.md` §4/§6/§7, `docs/ADR.md` (ADR-001, ADR-004, ADR-005, ADR-012, ADR-014),
`docs/Pseudocode.md` (`AuthRegisterAndLogin`, `LoadCeilings`), `docs/decisions-autonomous.md`
(A-N6-020…023), исходный код (не только отчёты): `packages/rag/src/{config,enums,constants}.ts`,
`packages/db/migrations/001_init.sql`, `apps/web/src/server/{auth,auth-store,auth-handler,ip,rate-limit,route}.ts`,
`apps/web/src/app/health/route.ts`, `apps/worker/src/{index,environment}.ts`, `docker-compose.yml`,
`compose.test.yml`, `Dockerfile`, `proxy/Caddyfile`, `proxy/Dockerfile`, `scripts/check-env-wiring.mjs`,
`scripts/test-ceilings-mutations.mjs`, `tests/{config,enums,auth,proxy-rate,database.integration,redis.integration,compose}.test.ts`,
`package.json` во всех четырёх workspace.

## 1. Секреты

`git status --porcelain` не содержит `.env`; `.env.example` — все секреты пустые
(`N6_DB_PASSWORD=`, `REDIS_PASSWORD=`, `SESSION_SECRET=`, `OPENROUTER_API_KEY=`), только
безопасные значения потолков и `ANSWER_MODEL`/`EMBED_MODEL`. `.gitignore:5-6` — `.env` и `.env.*`
исключены, `!.env.example` — включён явно. Grep по новым файлам на `sk-`, `AIza`, `ghp_` и на
`password/secret/key/token = "длинная строка"` — пусто (единственное совпадение,
`DUMMY_HASH` в `apps/web/src/server/auth.ts:6`, — это НЕ секрет: фиктивный bcrypt-хэш публичного
пароля-эталона для константного времени ответа, комментарий это называет). **Находок нет.**

## 2. Docker Compose

`docker-compose.yml` и `compose.test.yml`: `name:` есть у обоих (`docker-compose.yml:8`,
`compose.test.yml:8`). `db` (`pgvector/pgvector:0.8.6-pg16`) и `redis` (`redis:7.4-alpine`) — без
`ports:`, теги закреплены версией, не `latest`. `proxy` собирается локально
(`pull_policy: build`) с явным тегом `caddy:2.8-n6-ratelimit-${IMAGE_TAG:-dev}`; `web`/`worker-index`/
`migrate` — тоже с `${IMAGE_TAG:-dev}`, не безусловный `latest`. Единственная публикация на хост —
`proxy` на `127.0.0.1:${N6_HTTP_PORT:-8086}` (`docker-compose.yml:56`). `db`/`redis` —
`healthcheck` + зависящие сервисы ждут `condition: service_healthy`; `migrate` —
`condition: service_completed_successfully` у `web`/`worker-index`. `restart: unless-stopped` у всех
долгоживущих сервисов, `restart: "no"` у `migrate` и у `test`-раннера `compose.test.yml` — верно
(единоразовые). Секреты и потолки — везде `${VAR:?текст}`, дефолтов нет. **Находок нет** — это
образцовая реализация правил `docker-ports.md`/`compose-hygiene.md`.

## 3. Сессии и вход

`apps/web/src/server/auth.ts:33` (`login`) — `findAccount` отпускает соединение пула до
`bcrypt.compare` (комментарий `auth.ts:34` подтверждает); `bcrypt.compare` сравнивается с
`DUMMY_HASH`, если аккаунта нет — одинаковое время. `auth-store.ts` не оборачивает bcrypt в
транзакцию нигде. `auth-handler.ts:47` — `cookie()` ставит
`Path=/; HttpOnly; Secure; SameSite=Lax`, имя `__Host-n6_session` (`auth-handler.ts:11`) — все три
требования `__Host-` (Secure, Path=/, без Domain) соблюдены. Порядок в `createAuthHandler`
(`auth-handler.ts:33-36`): `clientIp` → `allowMutation` (лимит) → `Origin` → разбор тела — лимит
частоты строго до разбора тела, как того требует `security-operation-order.md`. Ответ на
несуществующий аккаунт и на неверный пароль — один и тот же объект `LOGIN_FAILURE`
(`auth.ts:12`) с кодом `401`, независимо от причины (`auth.ts:35`: `if (!account || !matches || …) return null`
→ `auth-handler.ts:61`: `if (!token) return json(LOGIN_FAILURE, 401)`). Зафиксировано тестом
`database.integration.test.ts:96-102` (12 конкурентных регистраций → 1 аккаунт, 1 живая сессия;
12 сравнений bcrypt не держат пул — `database.integration.test.ts:103-118`). **Находок нет.**

Отдельно проверено поведение «регистрация на занятую почту отвечает тем же текстом, что успех»
(`Pseudocode.md:56`): `PgAuthStore.register` (`auth-store.ts:14-19`) действительно не создаёт
сессию при `ON CONFLICT DO NOTHING`, но `AuthService.register` (`auth.ts:24-29`) возвращает токен
безусловно — это НЕ дефект, а реализация анти-энумерации из самой постановки: занятый адрес получает
рабочий на вид ответ с cookie, которая не аутентифицирует (сессии в БД нет). Убедился, что это не
теряется как «тихий фолбэк»: поведение прямое следствие требования, а не побочный эффект бага.

## 4. XFF (A-N6-021) — согласованность с Caddy

Проверено то, что отчёт `05_completion.md` п.2 честно называет непроверенным (стек целиком не
поднимался): согласованность между тем, что Caddy РЕАЛЬНО передаёт, и тем, что ожидает `web`.

`proxy/Caddyfile:31` — `reverse_proxy web:3000 { header_up X-Forwarded-For {client_ip} }` —
**заменяет** заголовок вычисленным `{client_ip}`, не дописывает (явный комментарий
`Caddyfile:29-30` про урок N4). `servers.trusted_proxies static private_ranges` (`Caddyfile:19`)
означает, что Caddy доверяет XFF от адресов приватных диапазонов (шлюз docker-сети) и вычисляет
`{client_ip}` из них, а не от анонимного клиента напрямую — корректно, поскольку `proxy` действительно
единственная публикация (раздел 2).

`apps/web/src/server/ip.ts:9-11` — `clientIp` принимает РОВНО одно значение XFF, иначе `throw`;
`auth-handler.ts:66-68` ловит это исключение и отвечает `503`. Раз Caddy пишет ОДНО значение — цепочка
длиннее одного элемента возникнуть не должна, значит `web` не должен получать 503 по этой причине в
штатной работе. Читаемая конфигурация и код **согласованы**; тест `proxy-rate.test.ts:12-16` фиксирует
и заголовок Caddy, и поведение `clientIp` раздельно, но не сквозным HTTP-запросом через реальный
`proxy` контейнер. Вывод: дефекта нет, но это утверждение **о согласованности прочитанных текстов**, не
о прогоне — первый прогон `docker compose up` обязан включить хотя бы один запрос `POST /api/auth/login`
через `proxy`, чтобы превратить это в измеренный факт (это уже пункт 2 `05_completion.md`; ревью его
подтверждает и настаивает не терять из виду).

## 5. LoadCeilings

`packages/rag/src/config.ts:8-13` — все 14 имён `QUOTA_*` присутствуют и совпадают с
`docs/canon.md` §7. `loadCeilings` (`config.ts:69-84`): `required()` (`config.ts:57-61`) отказывает
на `undefined` И на пустую строку отдельными сообщениями; `!/^[1-9][0-9]*$/.test(raw)` отклоняет `0`,
дробь, экспоненту, пробел, минус, буквы; `n > 2147483647` отклоняет вне `int4`. `CEILING_PAIRS`
(`config.ts:50-58`) — 8 пар, все «персональный ≤ общего», включая добавленную `A-N6-023`
`[ACCOUNT_EMBED, GLOBAL_EMBED]` — задокументировано и последовательно. Мутационный прогон
(`05_completion.md`: 5/5 мутаций — дефект красный, восстановление зелёное) подтверждён по коду:
каждая мутация (`scripts/test-ceilings-mutations.mjs:14-24`) точно бьёт по проверяемой строке
(`default-ceiling` → `config.ts:58`, `zero-accepted` → `config.ts:72`, `pairs-skipped` →
`config.ts:78`). **Находок нет.**

## 6. Миграция 001

`vector(1536)` (`001_init.sql:96`) + `hnsw (embedding vector_cosine_ops) WITH (m = 16,
ef_construction = 64)` (`001_init.sql:102`) — совпадает с ADR-001 и каноном. CHECK закрытых
множеств — сверены тестом `tests/enums.test.ts` с единственным источником
`packages/rag/src/enums.ts` для `plan/kind/outcome/scope/type/source/failure_reason` и пяти
`status`-колонок. Изоляция арендатора: `chunk`, `source`, `page`, `index_job`, `preview`,
`visitor_session`, `question_log`, `widget_install` несут `bot_id uuid NOT NULL REFERENCES bot(id)
ON DELETE CASCADE`; `chunk_bot` индекс (`001_init.sql:100`) поддерживает `WHERE bot_id = $1` в одном
SQL с поиском (запрос поиска ещё не написан — фича не отвечает вопросами, — но схема готова для
инварианта NFR-SEC-001 без пост-фильтра). `quota_counter` не имеет колонки предела — соответствует
ADR-008 (предел — окружение). Проверено `database.integration.test.ts:36-85` на настоящем Postgres:
идемпотентность миграции, HNSW на `vector(3072)` падает («2000 dimensions»), 1535 измерений
отвергнуты, CHECK-инварианты по имени ограничения. **Одна находка ниже (M1).**

## 7. Происхождение и отсутствие кода N5

Каждый скопированный файл несёт первую строку `// из N5: <путь> — <что изменено>` (или ключ `"//"`
в JSON). Grep по `ffmpeg|minio|trpc|playwright|S3_ENDPOINT|watermark|podcast` по `apps/`, `packages/`,
`scripts/`, `docker-compose.yml`, `compose.test.yml`, `Dockerfile`, `package.json` находит ТОЛЬКО
провенанс-комментарии, описывающие, что именно убрано (`Dockerfile:4`: «без ffmpeg/OpenCV… без
браузера в worker»; `apps/worker/package.json:2`: «без очереди, S3 и ffmpeg»). Ни одного
функционального фрагмента N5 (медиа, аудио, водяной знак, tRPC, MinIO) не осталось. `package.json`
всех четырёх workspace содержит только зависимости, нужные `foundation` (`bcrypt`, `ioredis`,
`next`, `zod`, `pg` — через `@n6/db`). **Находок нет.**

## Находки

| # | Серьёзность | Файл:строка | Суть | Чем исправить |
|---|---|---|---|---|
| M1 | medium | `packages/db/migrations/001_init.sql:129` (`job_attempt.status CHECK (status IN ('running','done','failed'))`); отсутствует в `packages/rag/src/enums.ts`; не проверено явно в `tests/enums.test.ts` (только косвенно захватывается общим regex `status text NOT NULL[^,]*CHECK`, но не сравнивается ни с одним экспортом) | Закрытый набор `job_attempt.status` живёт ТОЛЬКО в SQL. `coding-style.md` («Закрытые перечисления») требует единственный источник в коде + сверку тестом для КАЖДОГО перечисления; здесь источника в коде нет вовсе — если код `index-job-core` начнёт писать в `job_attempt.status` строкой не из этого набора, CHECK поймает на записи, но нормализация («неизвестное → самое строгое») будет реализована заново без привязки к этому единственному источнику, и разойдётся тем же классом, что H1/M2 Phase 2 (число/значение правится в одном месте, а не во всех). A-N6-023 фиксирует, что набор нужен CHECK'у УЖЕ в 001, но не называет, что код-сторона отложена — значит, отсутствие не решение, а пробел | Добавить `export const JOB_ATTEMPT_STATUS = ['running','done','failed'] as const` и `readJobAttemptStatus` в `enums.ts` СЕЙЧАС (тело функции не используется до `index-job-core`, но источник должен появиться вместе с CHECK, а не после), и добавить `job_attempt` в таблицу `cases`/`statuses` теста `tests/enums.test.ts`. Не блокирует эту фичу (никакой код ещё не пишет в таблицу), но должно быть закрыто ДО того, как `index-job-core` начнёт писать в `job_attempt`, иначе точка попадёт в квитанцию той фичи как незамеченный долг этой |
| L1 | low | `proxy/Caddyfile:31`, `apps/web/src/server/ip.ts:9-11`, `05_completion.md` п.2 | Согласованность «Caddy пишет ровно один XFF» ↔ «`web` принимает ровно один» подтверждена ЧТЕНИЕМ кода и конфигурации (раздел 4 выше), а не сквозным HTTP-запросом через поднятый `proxy`-контейнер. Отчёт это называет как открытый пункт, ревью подтверждает, что дефекта в текущих файлах НЕТ, но настаивает не терять этот пункт | Первым действием при первом `docker compose up` — не просто поднять стек, а выполнить `POST /api/auth/login` ЧЕРЕЗ `http://127.0.0.1:${N6_HTTP_PORT}` и убедиться, что ответ НЕ `503 unavailable` (это уже входит в план `05_completion.md` п.2 — ревью его не открывает заново, а фиксирует, что без этого шага раздел 4 остаётся утверждением о тексте, не о рантайме) |

## Итог

Секреты, compose-гигиена, порядок операций входа, `LoadCeilings`, миграция 001 и происхождение кода
проверены по исходнику (не только по отчёту исполнителя) и совпадают с постановкой, каноном,
Pseudocode и ADR-001/012/014 без расхождений. Найдена одна недоработка среднего уровня (M1: закрытый
набор `job_attempt.status` не имеет источника в коде вопреки правилу проекта — не блокирует
`foundation`, но должно закрыться до `index-job-core`) и один пункт для усиления открытого риска,
уже названного самим отчётом (L1: согласованность XFF доказана чтением, не прогоном). Блокеров и
расхождений с ADR/каноном/Pseudocode не найдено.

**Вердикт: APPROVE WITH FIXES** (M1 — закрыть до начала `index-job-core`; L1 — уже в плане
`05_completion.md`, ревью только подтверждает необходимость).

Status: completed
