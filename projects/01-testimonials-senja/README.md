# 01. Сбор видео-отзывов и «Стена любви»

> **Неделя 01** · `отзывы` · референс: **[Senja.io](https://senja.io/) — 7000+ создателей и SaaS, $1M ARR, импорт с 30+ платформ**

## Документация

- 🇷🇺 [Документация на русском](./README/ru/README.md)
- 🇬🇧 [English documentation](./README/eng/README.md)

Быстрый старт, руководства пользователя и администратора, справочник API,
архитектура, устранение неполадок.

## Простыми словами

**Проблема.** Клиенты вас хвалят — в переписке, голосом, в письме. Но эти похвалы разбросаны:
скриншот в мессенджере, письмо в почте, комментарий где-то в соцсети. А на сайте пусто, и новый
посетитель не понимает, можно ли вам доверять.

**Что делает продукт.** Даёт вам ссылку, которую вы отправляете довольному клиенту. Он переходит
и оставляет отзыв — текстом или записывает короткое видео прямо в браузере, ничего не устанавливая
и нигде не регистрируясь. Вы решаете, какие отзывы показывать. Все одобренные складываются в
красивую страницу-витрину и в блок, который вставляется на ваш сайт одной строчкой.

**Зачем это людям.** Отзыв живого человека убеждает сильнее любого рекламного текста, а видео —
сильнее текста: видно, что человек настоящий. Продукт превращает разрозненные похвалы в
доказательство, которое работает на вас круглосуточно.

**Как этим пользуются.** Отправили ссылку пяти клиентам → через день получили три отзыва →
одобрили → вставили блок на сайт. Дальше он наполняется сам, по мере новых отзывов.

## Что делаем

Копируем Senja.io: сбор текстовых и видео-отзывов, брендированные формы, Wall of Love, встраиваемый виджет без кода, импорт с 30+ платформ.

**Целевой стек:** Next.js в монолите, OpenAI STT через изолирующий сервис `services/transcribe`
(D-007/ADR-005 — изначально планировался Claude API через MCP, технически невозможен), отдельный
бандл JS-виджета

## Механики роста (обязательный блок)

Главный продукт — не прототип, а **рост**: аудитория и выручка. В требования закладываем на этапе дизайна, а не после.

| Драйвер | Гипотеза для этого проекта |
|---|---|
| **Виральность** | Виджет на чужом сайте = постоянная витрина продукта. Каждый собранный отзыв публикуется на публичной странице и несёт «Powered by» → трафик обратно. Форма сбора отзыва — сама по себе точка касания с аудиторией клиента. |
| **Партнёрка** | _заполняется по итогам `/research/GROWTH-MECHANICS-REQUIREMENTS.md`_ |
| **Блогеры / люди с аудиторией** | _заполняется по итогам `/research/GROWTH-MECHANICS-REQUIREMENTS.md`_ |

> Обязательный блок требований по росту: [`/research/GROWTH-MECHANICS-REQUIREMENTS.md`](../../research/GROWTH-MECHANICS-REQUIREMENTS.md)

## Структура

```
01-testimonials-senja/
├── README.md              # этот файл
├── CLAUDE.md              # контекст проекта для Claude Code
├── DEVELOPMENT_GUIDE.md   # окружение, запуск, проверка, деплой
├── LESSON-01.md           # тезисы и план занятия
├── docs/                  # SPARC-документация (см. ../../start/SPARC-DOCS-GUIDE.md)
│   ├── discovery/         # Phase 0 — reverse-engineering Senja
│   ├── validation/        # отчёты Phase 2, финальный вердикт 07-final-gate.md
│   ├── PRD.md  Specification.md  Architecture.md  Pseudocode.md  ADR.md
│   └── Refinement.md  Completion.md  C4_Diagrams.md  test-scenarios.md
├── decisions/             # журнал развилок D-001…D-008 (локальный для проекта)
├── .claude/               # тулкит проекта: агенты, правила, roadmap
├── scripts/               # проверки контрактов (сборка compose)
├── apps/
│   ├── web/               # ⚠️ пока только Dockerfile — пишется в /run mvp
│   └── widget/            # виджет, 2.35 KB gzip при бюджете 30 KB
├── packages/db/           # 8 SQL-миграций, роли, RLS, rate-limit
├── services/
│   ├── transcribe/        # единственная точка входа к OpenAI STT (ADR-005)
│   └── worker/            # очередь транскрипции + очистка rate_limit_events
└── docker-compose.yml  Caddyfile  .env.example
```

## Быстрый старт

Нужны Docker + Docker Compose и Node ≥ 22. Подробнее — `DEVELOPMENT_GUIDE.md`.

```bash
cp .env.example .env                     # заполнить пароли и ключи
docker compose up -d postgres minio transcribe

# миграции (packages/db — workspace монорепо, раннер идёт с хоста)
PGIP=$(docker compose exec -T postgres hostname -i | tr -d '\r')
DATABASE_URL="postgres://proofwall:<пароль>@${PGIP}:5432/proofwall" npm run db:migrate

# тесты на живой БД (отдельная база, миграции в неё же)
docker compose exec -T postgres psql -U proofwall -d postgres -c "create database proofwall_test"
TEST_DB="postgres://proofwall:<пароль>@${PGIP}:5432/proofwall_test"
DATABASE_URL="$TEST_DB" npm run db:migrate
TEST_DATABASE_URL="$TEST_DB" npm test

# контракт сборки compose
bash scripts/check-compose-buildable.sh
```

> ⚠️ `docker compose up -d` **целиком** пока падает: `apps/web` — это только `Dockerfile`,
> исходников нет, вместе с ним не поднимается `caddy`. Работают четыре сервиса из шести.
> Почему так решено — `decisions/D-008-web-app-missing.md`. `apps/web` пишется в `/run mvp`.

## Статус

| Этап | Статус | Результат |
|---|---|---|
| Phase 0 — Product Discovery | ✅ | `docs/discovery/` |
| Phase 1 — SPARC (`/replicate`) | ✅ | 11 документов в `docs/` |
| Phase 2 — Validation | ✅ | 🟢 READY 89.4/100, 4 блокера закрыты |
| Phase 3 — Toolkit | ✅ | `.claude/` агенты, правила, roadmap на 13 фич |
| Phase 4 — Finalize | ✅ | scaffold, `v0.1.0-scaffold` |
| `/start` — скелет и интеграция | ✅ | 62/62 теста на живой Postgres 16 |
| Реализация (`/run mvp`) | ⬜ | 13 фич, начиная с `apps/web` |

### Что проверено вживую, а не «должно работать»

- 8 миграций применяются на контейнерном Postgres 16, повторный прогон — no-op;
- изоляция арендаторов подтверждена данными: без контекста аккаунта не видно ничего
  (fail-closed), запись в чужой проект отбита RLS-политикой, UPDATE чужого отзыва — 0 строк;
- `app_authenticated` получает `permission denied` на партнёрских таблицах;
- 62/62 теста, два прогона подряд с одинаковым результатом;
- контейнер `worker` подключается к БД и выполняет cleanup-job;
- контейнер `transcribe` — `healthy`, ffmpeg 8.1.2, `GET /health` → 200;
- **граница ADR-005 (FTC) проверена на работающем сервисе:** `POST /transcribe`
  с телом `{text: ...}` → `400 Unrecognized key: "text"`.
