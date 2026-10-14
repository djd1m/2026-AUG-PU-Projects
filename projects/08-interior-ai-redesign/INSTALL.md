# N8 — установка и публичный стенд

## Требования

- Node.js `>=24 <25` и npm;
- Docker Engine с Compose v2;
- свободный loopback-порт 3088 либо другой порт, заданный через `N8_HTTP_PORT`;
- SSH client, если приложение запускается на удалённом сервере.

PostgreSQL наружу не публикуется. Compose создаёт отдельные роли bootstrap/migrator/app, named volumes `database` и `assets`, web и worker. `.mcp.json` не подключает внешние MCP servers.

## Первый запуск

Из корня общего репозитория:

```sh
bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign
cd projects/08-interior-ai-redesign
npm ci
npm run setup:local
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d web worker
docker compose ps
curl -fsS http://127.0.0.1:3088/health/live
curl -fsS http://127.0.0.1:3088/health/ready
```

`setup:local` один раз создаёт ignored `.env` с mode `0600`, случайными secrets, `N8_AI_MODE=manual` и `N8_PAYMENTS_MODE=off`. Существующий `.env` сохраняется. Не копируйте значения secrets в issue, лог или документацию.

Если 3088 занят, задайте согласованные значения до Compose startup:

```sh
N8_HTTP_PORT=13088 N8_PUBLIC_ORIGIN=http://127.0.0.1:13088 docker compose up -d web worker
```

Сохраните те же значения в приватном `.env`, если этот порт должен переживать следующие команды.

## Публичный HTTPS на этом VPS

Текущий адрес: https://n8.77.83.87.178.sslip.io. DNS sslip.io указывает на VPS 77.83.87.178. В приватном `.env` установлены `N8_PUBLIC_HOST=n8.77.83.87.178.sslip.io`, `N8_PUBLIC_ORIGIN=https://n8.77.83.87.178.sslip.io` и `N8_TRUSTED_PROXY_IP=172.29.8.2`. Секреты и база сохранены.

Все дальнейшие операции текущего публичного стенда выполняйте с обоими compose-файлами:

```sh
docker compose -f docker-compose.yml -f compose.public.yml up -d --no-deps web worker proxy
docker compose -f docker-compose.yml -f compose.public.yml ps
curl -fsS https://n8.77.83.87.178.sslip.io/health/ready
```

Caddy управляет сертификатом и HTTP → HTTPS. Named volumes `tls-data`/`tls-config` сохраняют TLS state. Overlay явно сохраняет имя `n8-interior-local`, убирает loopback-публикацию web и добавляет отдельную edge-сеть; PostgreSQL остаётся в default-сети без опубликованных портов. Не запускайте текущий стенд только с базовым compose: это уберёт публичный прокси из управляемой конфигурации. Не удаляйте database/assets/TLS volumes.

Базовая локальная установка и SSH ниже предназначены для отдельного локального экземпляра с согласованным HTTP origin. Текущий публичный стенд открывается непосредственно по HTTPS.

## Доступ через SSH

На сервере web остаётся привязан к `127.0.0.1`. На рабочем компьютере откройте tunnel:

```sh
ssh -N -L 3088:127.0.0.1:3088 user@server
```

После этого используйте `http://127.0.0.1:3088` локально. Если локальный 3088 занят, меняется только левая сторона, например `-L 13088:127.0.0.1:3088`, и браузер открывает `http://127.0.0.1:13088`.

## Обычные команды

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
docker compose logs --tail=200 web worker
docker compose stop web worker db
```

`npm run test:e2e` запускает production journey driver. Предыдущая локальная source-bound проверка image 9 прошла 21/21 шагов; API benchmark и restart-persistence также имеют pass receipts. Повторный запуск после изменения source/build создаёт новый receipt; старый не переиспользуется. Не используйте `docker compose down -v`, если данные или evidence volumes нужно сохранить.

## AI: manual по умолчанию, optional OpenRouter live

Manual mode полностью работоспособен без API key. Для live нужны все поля из `.env.example`:

- `N8_AI_MODE=live`, OpenRouter key, `N8_AI_MODEL_ID` и точный allowlist;
- актуальные input/output rates и дата `N8_AI_RATE_VALID_UNTIL`;
- `max_tokens`, request overhead, per-job/account-day/global-day caps;
- подтверждённый hard limit выделенного provider key и `N8_AI_OPERATOR_ENABLED=true`.

Период ключа задаётся парой `N8_AI_PROVIDER_LIMIT_RESET=daily|weekly` и
`N8_AI_PROVIDER_CAP_MICRO_USD=<потолок>`. Например, `weekly` и `10000000` разрешают
проверенный ключ до $10 в неделю, независимо от дневных лимитов N8. Период ответа
OpenRouter должен совпасть, лимит быть конечным и не выше настроенного потолка,
остаток — достаточным для одного запроса; `Include BYOK usage` должен быть включён.
Для `daily` потолок ключа также не должен превышать глобальный дневной лимит N8.
Если оба поля отсутствуют, сохраняется прежняя проверка `daily` с глобальным дневным
потолком. Частичная пара, пустые значения и неизвестный период при live отклоняются.
Compose передаёт эту пару только если она задана в окружении / `.env`.

Дневные account/global лимиты приложения продолжают работать и при недельном ключе:
они не становятся недельными, а неопределённые резервы сохраняются между сутками.
Обычный ключ генерации не позволяет менять его лимит через API управления OpenRouter;
настройки меняются в кабинете владельца либо отдельным management key.

Конфигурация fail-closed: пустое поле, model вне allowlist, истёкший rate, неподтверждённый hard limit или operator disabled блокируют startup/dispatch. Каталог OpenRouter ранее подтвердил Gemini candidate `google/gemini-4-argon`, но availability, тариф и качество должны быть проверены заново перед live activation. Приложение отправляет только согласованный bounded text/scene JSON; изображения, планы, ссылки и executable code в текущий live request не входят. Платный эксперимент этой инструкцией не разрешается.

Для live admission дополнительно нужен хотя бы один подтверждённый кредит аккаунта и отсутствие billing hold. Одного API key недостаточно; клиентский balance не считается доказательством оплаты. Локальный manual путь кредитов не требует.

## Payments

Оставляйте `N8_PAYMENTS_MODE=off` для локального HTTP/SSH запуска. Live требует HTTPS `N8_PUBLIC_ORIGIN`, merchant shop ID/secret, test-mode flag и server-owned SKU JSON. Return URL не начисляет права; webhook считается сигналом, а подтверждение перечитывается у provider. Реальный merchant и live payment не входят в текущую локальную передачу.

## Imports and catalog

- GLB: поддерживается bounded self-contained GLB v2; синтетические fixtures проверены, реальный Scaniverse device export ещё не был acceptance sample.
- References: поддерживаются private JPG/PNG/WebP и сохранение публичной HTTPS-ссылки, включая Pinterest. Сервер не импортирует board и не fetch-ит ссылку.
- Retail: официальный deep link и ручной snapshot цены/наличия. Проверенные retailer pages вернули 401; обход блокировки запрещён.

Для отката приложения остановите только N8 web/worker и верните совместимый image/config. Миграции откатывайте лишь на disposable fixture либо из собственного backup; uncertain AI jobs и payment events нельзя автоматически переигрывать после restore.
## Отдельный Docker-контейнер для UI проверок

`Dockerfile.e2e` наследует app image, использует Node24 и locked Playwright1.60 с Chromium/Firefox/WebKit, шрифтами и системными CA. `compose.e2e.yml` не получает DB/provider secrets. Содержит только read-only UI driver, evidence/private syntheticfixture mounts, memory2GiB/shm1GiB. Сначала проверяйте конфликты портов и fresh source/build/environment preflight; команда ниже сама не заменяет preflight.

```sh
export N8_E2E_EVIDENCE_DIR=docs/telemetry/p-replicator/20261014T064554Z-public-ui-53d8/evidence
export N8_E2E_HOST_EVIDENCE="$PWD/$N8_E2E_EVIDENCE_DIR"
export N8_BUILD_REVISION="$(docker inspect n8-interior-local-web-1 --format '{{.Image}}')"
export N8_E2E_ATTEMPT="journey-$(date -u +%Y%m%d%H%M%S)"
docker compose -f compose.e2e.yml build playwright
docker compose -f compose.e2e.yml run --rm playwright node scripts/e2e.mjs
```

Повторный запуск требует новый `N8_E2E_ATTEMPT`; драйвер не перезаписывает существующее evidence. Он создаёт вымышленные приватные аккаунты и проекты; пароли остаются только в ignored `.runtime/public-e2e/<attempt>`, screenshots/results — в telemetry evidence. Тестовые данные сохраняются для воспроизводимости, автоматической очистки аккаунтов пока нет. Публичные ссылки journey отзывает.

`public-ui-audit.mjs` использует сохранённую синтетическую fixture `public-journey-1/runtime-fixture.json`, сравнивает три движка, 1440/390px, шесть шагов, клавиатуру, Axe и явно injected422 frontend-проверку. Для повторного аудита задайте новый attempt и вызовите:

```sh
export N8_E2E_ATTEMPT="ui-audit-$(date -u +%Y%m%d%H%M%S)"
docker compose -f compose.e2e.yml run --rm playwright node scripts/public-ui-audit.mjs
```

Этот аудит требует первоначальную приватную fixture; не копируйте её пароль в документацию или публичный каталог. При утрате fixture создайте новый productionjourney с attempt `public-journey-1` в новом run/evidence root либо адаптируйте явный fixture input в тестовом драйвере; существующие receipts не удаляйте. Final evidence и границы проверки описаны в публичном release report нового run.

## Распознавание чертежа

Dockerfile устанавливает системные Tesseract, русские/английские данные и шрифты. Вне Docker требуются Linux и `/usr/bin/tesseract` с языками `rus+eng`; без них интерфейс возвращает явную ошибку и сохраняет ручной ввод. Поддерживаются JPG/PNG/WebP до 10 МБ, одна прямоугольная комната; PDF/DWG/DXF не принимаются. Файлы и OCR остаются приватными, внешнего API нет.

Для проверки импорта в отдельном Playwright-контейнере после fresh preflight используйте переменные из раздела UI выше, новый `N8_E2E_ATTEMPT` и `node scripts/floorplan-e2e.mjs` вместо `scripts/e2e.mjs`. Драйвер проверяет реальный OCR синтетического плана, клавиатуру, мобильный экран, сохранение источника, пустое распознавание и изоляцию владельцев в трёх движках. Точность на реальном пользовательском чертеже этим synthetic fixture не измеряется.
