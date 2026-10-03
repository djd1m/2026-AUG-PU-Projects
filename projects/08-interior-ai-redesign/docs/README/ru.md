# RoomKind — передача локального программного пакета

[English](en.md) · [41 критерий приёмки](../features/f06a/acceptance-map.md) · [Эксплуатация](../features/f06a/operations.md)

Источник: `8030270f023d83c9cdd597c4578517a1b58b4b35`; прогон `n8-20261002-1740`.
Программные F01–F04 приняты с привязкой к исходникам. UI6 фактически прошёл42 основных проверки на1440/390 и2 проверки отдельно перезапущенного сервера с отключёнными платежами. Восстановление собственной синтетической БД и файлов прошло. F05 GPU, реальная приёмка провайдера и общий F06/MVP остаются открыты; deployment не выполнен.

## Реализованное поведение

Регистрация/вход: канонический email, пароль 12–128 символов, bcrypt, отзываемая непрозрачная сессия на семь дней. Новый аккаунт получает ровно один пробный кредит. JPEG/PNG/WebP ограничены 10 MiB и 20 млн декодированных пикселей; ориентация нормализуется, EXIF удаляется, UUID-файлы хранятся вне статического каталога. Приватные строки/медиа доступны владельцу, чужие идентификаторы дают 404.

Стили: `warm`, `minimal`, `afrohemian`, `playful`. Приём задания возвращает 202 со стабильным job ID, атомарно резервирует один кредит и консервативный ticket попытки. Повтор того же ключа/тела возвращает исходную работу, другое тело даёт конфликт. Очередь истекает через 60 с, всё задание — через 360 с, попытка — максимум 180 с; lease 30 с, heartbeat 10 с, максимум две начатые попытки. Суточный предел platform 200/account 20 можно только понижать. Retry требует новый ticket; неиспользованная квота не возвращается. Окончательный отказ возвращает кредит ровно раз. Ошибка GET означает unknown; reload продолжает по job ID.

Приватная галерея/сравнение, управление с клавиатуры, share/download, серверные композиты, отдельное согласие на публикацию и revoke реализованы. AI label остаётся всегда; RoomKind badge снимается сервером только при подтверждённой платной entitlement без billing hold. Native resolved и доставленное скачивание учитываются отдельно и не доказывают пост в соцсети. Публичная страница выдаёт композит и экранированный контекст, не приватные файлы. Обычный fixture не проходит quality acceptance/publication. Браузерный privileged seed `accepted-software` проверяет только разрешения и остаётся синтетическим, без доказательства геометрии.

Цена ROOM20 задаётся сервером: **20 кредитов за 900 ₽** (`90000` minor RUB). Hosted checkout оставляет ввод карты у YooKassa; приложение не хранит карточные данные. Return URL не начисляет кредиты. Проверка провайдера, replay, постоянный refund hold и первая партнёрская конверсия имеют программные доказательства; реальная приёмка YooKassa и списания не заявлены. Коды создаёт оператор, tracking требует отдельный изначально неотмеченный opt-in; ручной код работает без tracking-cookie. Агрегаты не создают выплат.

## Среда и конфигурация

Node **22**, PostgreSQL **16** (Compose: `postgres:16.10-bookworm`), существующие locked npm-зависимости, приватное хранилище. Python-зависимости inference закреплены в [worker/requirements.txt](../../worker/requirements.txt); проверка resolved security/runtime остаётся в F05.

Имена и placeholders берутся из [.env.example](../../.env.example). Значения подготовить приватно: placeholders не являются допустимыми credentials. Не печатать connection strings, secret-expanded Compose, реальные env или dump.

| Имена | Назначение |
|---|---|
| `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `STORAGE_DIR` | Валидируемая среда, БД, случайный секрет, точный origin, абсолютное приватное хранилище |
| `PORT`, `HOST`, `PROVIDER_MODE`, `WORKER_MODE` | Прямой listener; у web worker disabled; provider disabled/fixture/live |
| `PLATFORM_DAILY_LIMIT`, `ACCOUNT_DAILY_LIMIT` | Обязательные положительные пределы ≤200/20, account ≤platform |
| `DB_PASSWORD`, `WEB_PORT`, `COMPOSE_PROJECT_NAME` | Compose interpolation; loopback web, внутренняя БД |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | Только серверный live provider; отсутствие ключей запрещает checkout |
| `WORKER_SOURCE_REVISION`, `WORKER_SEED`, `WORKER_PYTHON`, `MODEL_ROOT` | Отдельный worker: immutable source, seed, Python, offline manifest |
| `QUALITY_OPERATOR_ID`, `QUALITY_CORPUS_REPORT`, `QUALITY_CORPUS_SHA256` | Доверенная CLI identity и привязка независимого измеренного отчёта |

Секретов браузера нет. Startup проверяет credentials/config; production запрещает fixture provider/worker. Для nonlocal origin обязателен HTTPS. Пример прямого DATABASE_URL не означает опубликованный порт БД Compose.

## Действующие команды

Ниже инструкции оператору, не выполненные в этой docs-попытке. Запуск из каталога проекта после приватной подготовки env и зависимостей. Node `--env-file` загружает подготовленный файл; `npm` самостоятельно его не загружает.

```sh
node --env-file=/private/roomkind-web.env scripts/migrate.js
node --env-file=/private/roomkind-web.env web/server.js
node --env-file=/private/roomkind-web.env scripts/maintenance.js
node --env-file=/private/roomkind-web.env scripts/queue-status.js
```

В [package.json](../../package.json) существуют `npm run migrate`, `npm start`, `npm run sweep`, `npm run lint`, `npm run build`, `npm test`, `npm run test:integration`, `npm run test:boundaries`, `npm run test:mutation`. `build`/`lint` — syntax/static check; `npm test` проверяет только foundation boundaries/media, не всю последующую PG/browser/GPU матрицу. Остальные gates — в receipts и [test-scenarios](../test-scenarios.md).

[compose.yaml](../../compose.yaml) содержит локальные db/web/maintenance, с фиксированными disabled payment/inference, суммарным CPU 2, внутренней БД и loopback web. Inference-сервиса в нём нет. После port-conflict check и захвата существующего heavy mutex координатора:

Для этих Compose-команд и port checker приватно подготовить игнорируемый проектный `.env` с теми же выбранными `WEB_PORT` и interpolation variables. Checker принимает фактический путь Compose; аргумент-каталог ищет отсутствующий `docker-compose.yml`. `.env` не печатать.

```sh
bash ../../scripts/check-port-conflicts.sh compose.yaml
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml up -d --build
```

Worker запускается отдельным процессом с общей приватной БД/хранилищем. В его приватном env задать `WORKER_MODE=fixture` либо явно `controlnet`, source revision и seed; у web оставить worker disabled. Fixture использует Python/Pillow и делает маркированную демонстрацию, без вывода о геометрии. ControlNet требует CUDA, вручную подготовленные pinned локальные веса/manifest, safetensors, лицензии и хеши; скачивания или CPU/fixture fallback нет. Фактическая GPU provisioning/security/corpus/latency заблокирована.

```sh
node --env-file=/private/roomkind-worker.env scripts/worker.js --once
node --env-file=/private/roomkind-web.env scripts/partner.js create ACCOUNT_UUID
node --env-file=/private/roomkind-web.env scripts/partner.js activate PARTNER_UUID true
node --env-file=/private/roomkind-web.env scripts/partner.js aggregate PARTNER_UUID
node --env-file=/private/roomkind-fixture.env scripts/payment-fixture.js INTENT_UUID success
node --env-file=/private/roomkind-quality.env scripts/quality.js JOB_UUID accepted 'Operator review reason'
```

Payment fixture поддерживает `success`, `cancel`, `refund` только в явном nonproduction fixture mode после асинхронного создания intent. Quality acceptance требует реальный валидный измеренный corpus; команда не создаёт доказательства. Payment worker запускается внутри normal web server; `scripts/payment-worker.js` не самостоятельный daemon CLI. Полную локальную fixture-цепочку либо настроенный ControlNet/provider stack собрать отдельными процессами и приватными env; базовый Compose их не включает. Live provider/deployment/spend требуют отдельного разрешения.

Для фактического HTTPS browser fixture существуют [scripts/ui/compose.e2e.yml](../../scripts/ui/compose.e2e.yml) и [F04b correction browser runbook](../features/f04b-fix/browser-runbook.md): собственные PG/schema/storage, init, общий remote browser и отдельный disabled-provider restart. Это тестовый стенд, не production topology. Неудачи 1–5 сохраняются; screenshots/partial results не означают полную приёмку.

## API и остаток передачи

Маршруты в [web/app.js](../../web/app.js): register/login/logout; `GET /api/me`; upload bytes через `POST /api/uploads`, list/read/delete uploads; `POST /api/jobs`, paginated `GET /api/jobs`, job read/delete/result; `POST /api/payments`, config/status и independently verified webhook. Share-attempt/share-outcome/publication находятся под job; `GET /api/jobs/:id/composite/:mode/:event_key` выдаёт экспорт. Публичные пути: `/s/:token`, `/s/:token/composite`, `/api/publications`, `/examples`. UI читает attribution через exact-Origin `POST /api/attribution/state` с `{}`; consent/manual actions — `POST /api/attribution`. Authenticated writes требуют точный configured Origin.

[Эксплуатация](../features/f06a/operations.md) описывает inert restore собственной синтетической PG, private volume/rollback и gates. Для реальной GPU-приёмки нужны ≥12 лицензированных комнат ×3 стиля, ноль новых/пропавших openings, anchors ≤2% диагонали, плюс ≥30 actual warm jobs с p95 inference ≤25 с и отдельным queue time. Draft PR направляется в `claude/install-npm-packages-n7l3m5`; создание main, merge/deployment не разрешены. [Completion](../Completion.md) сохраняет условия приёмки и полномочия.

Последние доказательства координатора: [F04 acceptance](../features/f04b/acceptance.md), [браузерный receipt](../telemetry/n8-20261002-1740/n8-ui-e2e-6-receipt.md), [восстановление](../telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md). Исторические неудачи1–5 и авторская проверка сохранены.
