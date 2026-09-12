# Фича `foundation` — архитектура

Размещение кода по сервисам канона §6, структура монорепо, зависимости и переменные окружения.
Системная архитектура принадлежит [`docs/Architecture.md`](../../Architecture.md) и здесь не
переписывается: ниже только то, что создаёт ЭТА фича.

## Размещение по пакетам и сервисам

| Требование фичи | Пакет / сервис | Файлы (целевые) |
|---|---|---|
| FR-foundation-1 сборка | корень монорепо | `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.npmrc` |
| FR-foundation-2 конфигурация | `packages/shared` | `src/config/env.ts` (валидатор), `src/config/types.ts` (`RuntimeConfig`) |
| FR-foundation-2 применение | `apps/api`, `apps/recognizer` | `src/bootstrap.ts` в каждом — валидация ДО открытия сокета и ДО первого запроса к базе |
| FR-foundation-3 схема | `packages/db` | `migrations/001_init.sql`, `src/migrate.ts` (раннер), `src/pool.ts` (единственный пул) |
| FR-foundation-4 сессия | `apps/api` | `src/session/create-device-session.ts`, `src/routes/auth-device.ts`, `src/session/ip-prefix.ts` |
| FR-foundation-5 квота | `apps/api` | `src/quota/check-and-consume.ts`, `src/quota/keys.ts` |
| FR-foundation-6 аренда и адаптер | `apps/recognizer` | `src/lease.ts`, `src/worker.ts`, `src/provider/types.ts`, `src/provider/fake.ts`, `src/provider/select.ts` |
| FR-foundation-7 фронт | `apps/web` | `app/page.tsx`, `app/layout.tsx`, `public/manifest.json`, `public/icons/*` |
| FR-foundation-8 частота | `apps/api` | `src/http/rate-limit.ts` (хук `onRequest`) |
| FR-foundation-9 стек | корень проекта | `Caddyfile`, правки `docker-compose.yml` только при переводе пробы здоровья на HTTP |
| FR-foundation-10 страж | `scripts/` | `scripts/check-env-wiring.sh` |
| NFR-foundation-2 журнал | `packages/shared` | `src/log/logger.ts`, `src/log/redact.ts` |

Доменная логика не знает ни `FastifyRequest`, ни клиента `pg`, ни формы ответа поставщика модели:
адаптеры переводят чужое в свои типы на границе (`.claude/rules/coding-style.md`). Поставщик модели
скрыт за интерфейсом с двумя реализациями уже здесь, хотя вызывается только фейк.

## Структура каталогов

```
04-calorie-vision-cal-ai/
├── package.json                 # workspaces: apps/*, packages/*; скрипты test|lint|build|migrate
├── package-lock.json            # единственный локфайл; контекст сборки образов — этот каталог
├── tsconfig.base.json
├── vitest.config.ts             # проекты vitest по workspace; окружение node
├── eslint.config.js
├── Caddyfile                    # единственная дверь: TLS-терминация профиля edge, rate limit, CSP
├── docker-compose.yml           # существует; фича его не переписывает
├── Dockerfile                   # существует; цели api | recognizer | web
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   └── src/
│   │       ├── bootstrap.ts          # ValidateRuntimeConfig → пул → сервер
│   │       ├── server.ts             # регистрация хуков и маршрутов
│   │       ├── http/rate-limit.ts    # onRequest, ДО разбора тела
│   │       ├── routes/health.ts      # GET /health
│   │       ├── routes/auth-device.ts # POST /api/v1/auth/device
│   │       ├── session/create-device-session.ts
│   │       ├── session/ip-prefix.ts
│   │       └── quota/check-and-consume.ts
│   ├── recognizer/
│   │   ├── package.json
│   │   └── src/{bootstrap.ts,worker.ts,lease.ts,provider/{types.ts,fake.ts,select.ts}}
│   └── web/
│       ├── package.json
│       ├── app/{layout.tsx,page.tsx}
│       └── public/{manifest.json,icons/}
├── packages/
│   ├── db/
│   │   ├── package.json
│   │   ├── migrations/001_init.sql
│   │   └── src/{migrate.ts,pool.ts,index.ts}
│   └── shared/
│       ├── package.json
│       └── src/{config/{env.ts,types.ts},log/{logger.ts,redact.ts},domain/{enums.ts,units.ts},http/envelope.ts}
├── scripts/check-env-wiring.sh
└── tests/
    ├── unit/            # конфигурация, усечение адреса, перечисления, редактор журнала
    ├── integration/     # миграции, роли, сессия, квота, аренда, частота, здоровье
    └── concurrency/     # квота 20×, аренда двумя воркерами — только на настоящем PostgreSQL
```

Тесты лежат в общем `tests/` с разделением по слою, а не рядом с каждым модулем: конкурентные
прогоны требуют настоящей базы из профиля `test`, и держать их отдельно от чистых unit-тестов
дешевле, чем размечать каждый файл.

## Зависимости npm

Мажорные версии фиксируются здесь, точные — в `package.json` и локфайле. Ни одна не добавляется
«на будущее»: пакет, не используемый кодом этой фичи, в манифест не попадает.

| Пакет | Мажор | Где | Зачем |
|---|---|---|---|
| `fastify` | 5 | `apps/api` | HTTP-сервер; даёт доступ к сырому телу и хук `onRequest` раньше разбора тела |
| `@fastify/cookie` | 11 | `apps/api` | чтение и установка cookie сессии с флагами `HttpOnly; Secure; SameSite=Lax` |
| `pg` | 8 | `packages/db` | клиент PostgreSQL; пул с `connectionTimeoutMillis`, без ORM |
| `next` | 15 | `apps/web` | App Router, SSR, статика PWA |
| `react`, `react-dom` | 19 | `apps/web` | требование Next.js 15 |
| `typescript` | 5 | корень | общий компилятор, `tsconfig.base.json` |
| `vitest` | 3 | корень | раннер всех слоёв, включая конкурентные прогоны |
| `eslint`, `typescript-eslint` | 9 / 8 | корень | линт |
| `zod` | 4 | `packages/shared` | разбор внешнего значения из `unknown` схемой (приведение `as` падает с TS2352) |

Не ставится в этой фиче: `sharp` (нормализация фото — `scan-pipeline`), `@anthropic-ai/sdk` (живой
вызов модели — `scan-pipeline`), любой клиент S3 (загрузка фото — там же), Telegram SDK (вход —
`consent-and-telegram-auth`). `sharp` отдельно опасен тем, что его сборка с поддержкой HEIF не
данность; проверять её нужно тогда, когда она понадобится, а не сейчас.

## External Dependencies

No external dependencies — this feature calls no third-party service.

Каркас не обращается ни к Anthropic, ни к Telegram, ни к USDA FoodData Central: адаптер поставщика
модели работает детерминированным фейком и наружу не ходит (DEC-A-009), а импорт базы — отдельная
разовая задача следующей фичи. `db` и `storage` — собственные сервисы compose, не внешние
поставщики. Инвентарь внешних зависимостей проекта целиком —
[`docs/Architecture.md`](../../Architecture.md), раздел External Dependencies; эта фича не добавляет
к нему ни строки.

## Переменные окружения

Все обязательные проверяются `ValidateRuntimeConfig` ДО открытия сокета; отсутствующее, пустое или
непригодное значение валит старт с названной переменной и её внешним последствием. Значения по
умолчанию есть ТОЛЬКО у хостовых портов — это названное исключение
([`port-conflicts-local.md`](../../../../.claude/rules/port-conflicts-local.md)).

| Переменная | `api` | `recognizer` | `web` | Поведение при отсутствии |
|---|---|---|---|---|
| `DATABASE_URL` | да | да | нет | отказ старта |
| `APP_ORIGIN` | да | нет | да | отказ старта; дефолта нет по построению — определяет каждую выдаваемую наружу ссылку |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | да | да | нет | отказ старта |
| `N4_SCAN_LIMIT_USER`, `N4_SCAN_LIMIT_DAY`, `N4_ESCALATION_LIMIT_DAY` | да | да | нет | отказ старта, ТРИ независимые проверки (ADR-007) |
| `TELEGRAM_BOT_TOKEN` | да | нет | нет | объявлена в compose как `${VAR:?…}`; кодом этой фичи не читается — вход реализует другая фича |
| `N4_MODEL_PROVIDER` | нет | да | нет | `fake` по умолчанию в compose; значение вне `{fake, live}` — отказ |
| `ANTHROPIC_API_KEY` | нет | да | нет | пусто законно при `fake`; при `live` — отказ старта |
| `NODE_ENV`, `TZ` | да | да | да | в явном списке исключений `check-env-wiring.sh` |
| `API_INTERNAL_URL` | нет | нет | да | отказ старта `web` |

Переменной для порога эскалации `0,6`, имён моделей и таймзоны НЕТ намеренно: это числа канона §7
(ADR-004), а не настройки окружения.

## Границы, которые фича обязана сохранить

- `web` не получает ни одного секрета вызова наружу и не ходит в базу: он общается только с `api` по
  `API_INTERNAL_URL`. Это проверяется списком `environment:` сервиса в `docker-compose.yml`.
- `recognizer` не принимает HTTP-запросов извне вовсе: у него нет ни порта, ни маршрутов.
- `db` и `storage` не публикуют портов; соседи ходят по именам `db:5432` и `storage:9000`.
- Единственный публикуемый порт стека — `127.0.0.1:${N4_EDGE_PORT:-4180}` у Caddy в профиле `edge`.
  Хостового порта у `web` нет и не появляется: публикация рядом с прокси позволяет обойти прокси
  вместе с ограничением частоты, которое тот держит.
- CORS не настраивается ни в приложении, ни в Caddy: `web` и `api` живут на одном origin, а два
  одинаковых заголовка ломают CORS молча, и `curl` этого не показывает.
- `Caddyfile` ставит CSP без `unsafe-inline`, `frame-ancestors` доменами Telegram и `connect-src`
  своим origin; `/c/*` отдаётся с `Cache-Control: no-store` уже сейчас, хотя карточки появятся
  позже: политика кэширования принадлежит двери, а не фиче, которая её однажды нарушит.
