# Как повторить Proofwall (N1) с нуля

Дата: 2026-09-29 · Основа: ветка после правки FR-015 «время ответа» (28.09) · Образец — `projects/06-rag-sales-chatbase/docs/REPRODUCE.md`.

Документ для человека или агента, который поднимает N1 на новой машине или повторяет разработку.
Команды взяты из файлов репозитория (`package.json`, `scripts/`, `compose*.yml`) и квитанций фич;
что пошло не так по дороге и почему команды именно такие — [`Refinement.md`](Refinement.md#post-mvp)
(G-01…G-22). Требования после MVP — [`Specification.md`](Specification.md#post-mvp), алгоритмы —
[`Pseudocode.md`](Pseudocode.md#post-mvp), компоненты и переменные — [`Architecture.md`](Architecture.md#post-mvp),
выпуск и статус на стенде — [`Completion.md`](Completion.md#post-mvp). Решения — [`../decisions/`](../decisions/README.md) (D-001…D-010).

Все команды — из каталога проекта `projects/01-testimonials-senja`, если не сказано иначе.

## 0. Что получится в конце

- Стенд `https://<домен>` за общим TLS-прокси машины: проект compose `01-testimonials-senja`,
  сервисы `postgres`, `minio`, `transcribe`, `web`, `worker`; своя дверь `caddy` не запускается
  (80/443 держит общий прокси). **Ни один порт на хост не публикуется** — `web` доступен прокси по
  внешней сети `talk-ai-public`, хранилища — только во внутренних сетях.
- Регистрация и проект с тремя ссылками (форма, стена, сниппет виджета), вход, смена и восстановление
  пароля, вход Яндексом, модерация, стена `/w/<slug>`, виджет с badge на free, импорт CSV, отзыв с
  площадки, оплата платного тарифа 990 ₽ / 30 дней (ЮKassa), кабинет партнёра.
- Выключено по умолчанию: приём видео (`VIDEO_INTAKE_ENABLED`), мост в N3 (`N3_BRIDGE_ENABLED`),
  агентные покупки (`AGENT_PAYMENTS_ENABLED`); агентные покупки живут отдельным TEST-пилотом (§10).

## 1. Что нужно заранее

| Что | Зачем | Кто делает |
|---|---|---|
| Linux, Docker ≥ 27 с compose v2, Node 22 на хосте (`engines: node >=22`), `openssl`, `curl` | сборка, тесты с хоста, миграции | — |
| Общий TLS-прокси машины (у нас `ai-hub-tls-proxy`, Caddy, внешняя сеть `talk-ai-public`) | TLS и домен; без него — свой `caddy` из `docker-compose.yml` | владелец |
| Домен и запись A на IP машины | `BASE_URL`, `APP_DOMAIN` | владелец (DNS) |
| Ключ OpenAI | расшифровка видео (`services/transcribe`); без него `transcribe` не стартует | владелец вписывает в env сам |
| Магазин ЮKassa **отдельный** от проекта 02 ([`yookassa-setup.md`](yookassa-setup.md)) | оплата тарифа; без ключей — `PAYMENTS_STUB=true` или `501` | владелец |
| Ключ Resend и адрес отправителя (необязательно) | письма восстановления пароля; без них `/forgot` → `503` | владелец |
| Приложение Yandex ID (необязательно) | вход Яндексом; без него кнопка → `503` | владелец |

## 2. Код и зависимости

```bash
git clone git@github.com:djd1m/2026-AUG-PU-Projects.git && cd 2026-AUG-PU-Projects/projects/01-testimonials-senja
npm ci                       # монорепо npm workspaces: apps/*, services/*, packages/*
npm run build:widget         # бандл виджета с content-hash → apps/web/public + widget-manifest.json
```

`build:widget` падает, если бандл больше 30 KB gzip (`apps/widget/scripts/check-bundle-size.mjs`).

## 3. Тесты — до всякого запуска

Тестовое окружение — Postgres 16 и MinIO из `compose.test.yml` (проект `proofwall-test`, tmpfs,
публикация **только на `127.0.0.1`**, пароли без дефолтов):

```bash
bash scripts/init-test-env.sh                                     # .env.test с случайными паролями, права 600, в .gitignore
docker compose --env-file .env.test -f compose.test.yml up -d --wait
set -a; . ./.env.test; set +a
export TEST_DATABASE_URL="postgres://proofwall_test:${TEST_PG_PASSWORD}@127.0.0.1:${TEST_PG_PORT}/proofwall_test"
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate             # 001…020, повторный запуск — no-op
npm test                                                          # все workspaces
npm run typecheck                                                 # 0 ошибок
```

- Без `S3_ENDPOINT` набор «storage — живой MinIO» пропускается (3 skipped) — это предусловие слоя,
  а не зелёный результат. Чтобы прогнать его, задать `S3_ENDPOINT=http://127.0.0.1:${TEST_MINIO_PORT}`,
  `S3_ACCESS_KEY=proofwall_test`, `S3_SECRET_KEY=$TEST_MINIO_PASSWORD`.
- Ожидаемо на 28.09 ([квитанция FR-015](features/fr-015-password-reset/05_completion.md)): web 850 + 3 skipped,
  widget 35, gateway 6, transcribe 9, worker 42, agent-payments 58, db 18 — **1018 passed, 3 skipped, 0 failed**;
  typecheck 0.
- Точечно — один файл: `cd apps/web && npx vitest run tests/password-reset.test.ts` (с тем же `TEST_DATABASE_URL`).
- Изолированный вариант без публикации портов (так гонялись проверки моста 09.09):
  `docker compose -f compose.bridge-test.yml up --abort-on-container-exit --exit-code-from backend` —
  `npm test` в `node:22` над смонтированным исходником; нужен `.secrets/bridge-test.env` (600) с именами
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `TEST_DATABASE_URL`, `MINIO_ROOT_USER`,
  `MINIO_ROOT_PASSWORD`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`,
  `SESSION_SECRET`, `BASE_URL`, `PAYMENTS_STUB` (healthcheck ждёт пользователя и базу `bridge_test`).
- Уборка: `docker compose --env-file .env.test -f compose.test.yml down -v`.

## 4. Конвейер разработки фичи (как делались FR-009…FR-016)

1. **Тир:** `bash ../../scripts/complexity-router.sh <файлы>` — `0` T/S/M, `1` L/XL, `2` не выполнено.
   Деньги, вход, необратимое — L/XL.
2. **План** `docs/features/<slug>/01…05_*.md` (spec, pseudocode, architecture, refinement, completion),
   затем `validation-report.md`; красный вердикт — новая ревизия плана, не код.
3. **Реализация** с тестами; каждый страж — мутацией (внедрить дефект → красный → вернуть → зелёный),
   результат — строкой в `05_completion.md`. Трогает пул/локи — конкурентный тест, не только последовательный.
4. **Ревью** (`review-report.md` или ответ Codex дословно, как `08_review_codex_timing.md`); blocker/high чинятся в фиче.
5. **Выкладка** (§6) и сквозная проверка ПО ВЫДАННОМУ адресу (§8); только после неё — `done` в roadmap.

## 5. Проверки портов — ДО любого `up`

```bash
node ../../.claude/hooks/check-ports.cjs .        # 0 — хранилища наружу не смотрят; 2 — проверка НЕ выполнена
bash scripts/check-port-conflicts.sh .            # 0 — порты свободны; 1 — конфликт
bash scripts/check-compose-buildable.sh           # образы собираются и стартуют
bash scripts/check-env-wiring.sh                  # каждая process.env.X сервиса есть в его environment:
```

Хостовые порты только через переменные (`${WEB_PORT:-3000}`, `${HTTP_PORT:-80}`, `${HTTPS_PORT:-443}`);
при конфликте правится `.env` машины, не compose.

## 6. Подъём стенда

```bash
# 1) env стенда — вне git (.env в .gitignore), права 600
umask 077; cp .env.example .env; chmod 600 .env
# вписать: POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, S3_SECRET_KEY (openssl rand -hex 24),
# SESSION_SECRET (openssl rand -hex 32), DATABASE_URL (хост postgres, пароль выше),
# BASE_URL=https://<домен>, APP_DOMAIN=<домен>, PGPOOL_MAX=30, PGPOOL_CONNECTION_TIMEOUT_MS=5000.
# Ключи OPENAI_API_KEY, YOOKASSA_*, RESEND_API_KEY/MAIL_FROM, YANDEX_CLIENT_* — вписывает ВЛАДЕЛЕЦ.
# Полный список имён по сервисам — Architecture.md §12.4.

# 2) сеть общего прокси должна существовать (иначе compose откажет: external network not found)
docker network inspect talk-ai-public >/dev/null

# 3) подъём без своего caddy: compose.demo.yml выключает его профилем
docker compose -f docker-compose.yml -f compose.demo.yml up -d --build
docker compose -f docker-compose.yml -f compose.demo.yml ps -a    # postgres, minio, transcribe — healthy; web, worker — Up
```

**Миграции.** База наружу не опубликована, а в рабочем образе `web` нет `tsx` (G-08) — миграция
подаётся в `psql` контейнера, по одной, в транзакции вместе со строкой журнала раннера:

```bash
set -a; . ./.env; set +a
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > ~/proofwall-backup-$(date +%F-%H%M).sql.gz
for f in packages/db/migrations/0*.sql; do n=$(basename "$f")
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "select 1 from schema_migrations where filename='$n'" 2>/dev/null | grep -q 1 && continue
  { echo "BEGIN;"; echo "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());"
    cat "$f"; echo "insert into schema_migrations (filename) values ('$n');"; echo "COMMIT;"; } |
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q || break
done
```

`ON_ERROR_STOP=1` обязателен: без него `psql` продолжит после ошибки и запишет миграцию как
применённую. Ручная миграция без строки в `schema_migrations` ломает следующую (G-09).

**Как поднят текущий стенд (28.09).** `docker-compose.yml` + `compose.bridge-release.yml`: тот
закрепляет теги `web` (`proofwall-web:login-navigation-20260909`) и `worker`
(`proofwall-worker:bridge-229e7ee`), но `caddy` НЕ выключает — поэтому с ним сервисы называются
явно: `docker compose -f docker-compose.yml -f compose.bridge-release.yml up -d --build web`.
`--build` перезаписывает образ под тем же тегом; для истории образов — сначала новый тег в оверрайде.

## 7. Домен и общий прокси (делает владелец)

1. DNS: `A <домен> → <IP машины>` — до первой проверки имени.
2. Блок в Caddyfile общего прокси (`/home/dz-projects-2026/edge/Caddyfile`), как у стенда
   `proofwall.aicoding.space`: `encode gzip zstd`; `Cache-Control "public, max-age=31536000, immutable"`
   для `/widget.*.js`; `reverse_proxy 01-testimonials-senja-web-1:3000`. **CORS для `/api/widget/*` в
   прокси НЕ ставить** — его ставит приложение, два заголовка ломают виджет на всех чужих сайтах (G-06).
3. Правка на месте, без смены inode, затем проверка и перезагрузка:
   ```bash
   docker exec ai-hub-tls-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
     && docker exec ai-hub-tls-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   Если `reload` читает старый файл (bind mount держит прежний inode) — подать конфиг через stdin (G-21).
4. Сменили домен — поменять `BASE_URL`/`APP_DOMAIN` в `.env` и пересоздать `web`: без `BASE_URL` в
   проде `web` не стартует, с чужим — все выданные ссылки ведут не туда (G-01).

## 8. Проверки на стенде

```bash
B=https://<домен>
for p in / /login /forgot /partner; do curl -s -o /dev/null -w "$p %{http_code}\n" "$B$p"; done   # 200 (forgot без почты — страница без формы)
curl -sI "$B/api/widget/config?slug=<slug>" | grep -i access-control-allow-origin | wc -l        # ровно 1
bash scripts/check-cjm.sh "$B"      # сквозной путь: регистрация → проект → ПЕРЕХОД ПО ВЫДАННОЙ ссылке → отзыв
```

Виджет проверять на странице ЧУЖОГО origin (правило `embeddable-widget`), не на своём домене:
рендер на `APP_DOMAIN` и его поддоменах установкой не считается (FR-013). Прогонный лист
демонстрации с шагами — [`demo-script.md`](demo-script.md).

## 9. Оплата ЮKassa

Подключение магазина — [`yookassa-setup.md`](yookassa-setup.md): отдельный магазин, адрес уведомлений
`https://<домен>/api/webhooks/payment`, события `payment.succeeded` и `payment.canceled`.
В `.env`: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `PAYMENTS_STUB=false`, `PAID_TIER_PRICE_RUB`
(по умолчанию 990; пустая строка даёт 0 — не оставлять пустой). Пересоздать `web`. Проверка: кнопка
оплаты в кабинете ведёт на страницу ЮKassa; после оплаты у проекта `paid_until` = max(сейчас, прежний срок) + 30 дней,
badge исчезает, по истечении срока возвращается сам. Уведомления не подписаны — подлинность держится
на адресе источника и перезапросе статуса (FR-PAY-001).

## 10. Операции оператора

- **Мост N3** (выключен): `N3_BRIDGE_ENABLED=true`, `N3_BASE_URL`, `N3_TENANT_ID`, `N3_CONNECTOR_KEY` в `.env`,
  пересоздать `web` и `worker`. Пропущенное уведомление об оплате моста —
  `npx tsx scripts/reconcile-n3-payment.ts <paymentId>` — только оператор, «внутри backend» (шапка скрипта):
  нужны исходники, доступ к БД по сети `database` (`DATABASE_URL`) и ключи ЮKassa; из рабочего образа
  `web` не запускается — в нём нет `tsx` (G-08). Точной команды запуска в документах фичи нет.
  Архитектура — [`n3-integration-architecture.md`](n3-integration-architecture.md).
- **Агентные покупки, TEST-пилот** (`compose.agent-pilot.yml`, проект `proofwall-agent-pilot`, свои БД и
  хранилище, портов нет). Env — пять файлов `.secrets/agent-pilot/` (600): `database.env`
  (`POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`), `storage.env` (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`),
  `web.env` (`DATABASE_URL`, `S3_*`, `TRANSCRIBE_SERVICE_URL`, `N3_BRIDGE_ENABLED`, `AGENT_GATEWAY_SECRET`,
  `YOOKASSA_*`, `RESEND_API_KEY`, `MAIL_FROM`, `SESSION_SECRET`, `BASE_URL`, `APP_DOMAIN`, `PAYMENTS_STUB`,
  `PAID_TIER_PRICE_RUB`, `VIDEO_INTAKE_ENABLED`, `AGENT_PAYMENTS_ENABLED`, `AGENT_PAYMENTS_AUDIENCE`,
  `AGENT_YOOKASSA_TEST_SHOP_ID`, `AGENT_YOOKASSA_TEST_SECRET_KEY`), `worker.env` (`DATABASE_URL`, `S3_*`,
  `TRANSCRIBE_SERVICE_URL`, `N3_BRIDGE_ENABLED`, `AGENT_GATEWAY_SECRET`, `AGENT_RECONCILE_URL`),
  `gateway.env` (`AGENT_GATEWAY_SECRET`, `AGENT_BACKEND_URL`, `AGENT_PUBLIC_ORIGIN`, `PORT`).
  Схема ядра — `DATABASE_URL=… node scripts/migrate-agent-payments.mjs` после обычных миграций;
  образы задаются `AGENT_PILOT_{WEB,WORKER,GATEWAY}_IMAGE`. Демонстрация, границы и остановка —
  [`public-pilot.md`](features/agent-purchase/public-pilot.md), процедуры — [`operations.md`](features/agent-purchase/operations.md).
  Команды подъёма пилота в документах фичи нет; стенд работает с 10.09 на
  `proofwall-agent.194.85.249.105.sslip.io` и `proofwall-mcp.194.85.249.105.sslip.io`.
- **Токен кабинета партнёра** (FR-011) выдать нечем — ни маршрута, ни скрипта; `issuePartnerCode` и
  `rotateDashboardToken` в `apps/web/src/lib/partner.ts` вызываются только из тестов.
- **Бэкапы:** `pg_dump` (§6) и `mc mirror` бакетов `minio` согласованно по времени.

## 11. Уборка

```bash
docker compose --env-file .env.test -f compose.test.yml down -v                 # тестовый стек
docker compose -f compose.bridge-test.yml down -v                               # изолированный прогон
docker compose -f docker-compose.yml -f compose.demo.yml down                   # стенд; данные остаются в томах, с -v — вместе с данными
git worktree list; git worktree remove <влитое дерево>
```

## 12. Чего стенд не доказывает

Живое письмо восстановления через Resend; живой вход Yandex ID; вебхук ЮKassa → `paid_until` на
основном стенде; реальная TEST-покупка и возврат через мост N3 (документы противоречат —
[Refinement §6.1](Refinement.md#post-mvp-open)); потолок расхода на STT (не реализован — поэтому видео
выключено); выдача токена партнёру; агентные покупки в проде и прогон пилота после смены IP машины
(в `tests/agent-payments-pilot/run.mjs` зашит прежний IP `212.192.0.33`); превью-домены как «внешние».

<a id="features-table"></a>
## Состав фич и где описаны

Ссылки Specification/Pseudocode/Architecture/Refinement — на разделы этого каталога; «Тесты» — пути
от корня проекта; «На стенде» — по [Completion §6](Completion.md#post-mvp).

| Фича | Источник | Specification | Pseudocode | Architecture | Refinement | Тесты | На стенде |
|---|---|---|---|---|---|---|---|
| MVP FR-001…FR-008, FR-GROWTH-001…005 | Phase 1, коммиты `d94c98d4`…`f9b7df63` | [§1–2](Specification.md#1-функциональные-требования-mvp) | [§1–11](Pseudocode.md#1-приём-отзыва-текст-fr-002-и-видео-fr-003) | [§3–7](Architecture.md#3-модель-данных) | [§2–3](Refinement.md#2-граничные-случаи-по-fr) | `apps/web/tests/*`, `apps/widget/tests/*`, `packages/db/tests/*` | да |
| FR-009 вход | [`features/fr-009-login/`](features/fr-009-login/01_specification.md) | [FR-009](Specification.md#fr-009) | [§12.1](Pseudocode.md#alg-fr-009) | [§12.3](Architecture.md#post-mvp) | [G-10, G-11](Refinement.md#post-mvp) | `apps/web/tests/login.test.ts`, `login-route.test.ts` | да |
| FR-010 смена пароля | [`features/fr-010-password-change/`](features/fr-010-password-change/01_specification.md) | [FR-010](Specification.md#fr-010) | [§12.2](Pseudocode.md#alg-fr-010) | [§12.3](Architecture.md#post-mvp) | [G-12](Refinement.md#post-mvp) | `apps/web/tests/password-change*.test.ts` | да |
| FR-011 кабинет партнёра | [`features/fr-011-partner-dashboard/`](features/fr-011-partner-dashboard/01_specification.md) | [FR-011](Specification.md#fr-011) | [§12.3](Pseudocode.md#alg-fr-011) | [§12.2](Architecture.md#post-mvp) | [§6.1](Refinement.md#post-mvp-open) | `apps/web/tests/partner-dashboard.test.ts` | да (токен выдать нечем) |
| FR-012 повтор STT | [`features/fr-012-transcribe-retry/`](features/fr-012-transcribe-retry/01_specification.md) | [FR-012](Specification.md#fr-012) | [§12.4](Pseudocode.md#alg-fr-012) | [§12.2](Architecture.md#post-mvp) | [G-16](Refinement.md#post-mvp) | `services/worker/tests/transcribe-retry.test.ts` | да |
| FR-013 внешний домен | [`plans/fr-013-external-domain.md`](plans/fr-013-external-domain.md), `31163db3` | [FR-013](Specification.md#fr-013) | [§12.5](Pseudocode.md#alg-fr-013) | [§12.4](Architecture.md#post-mvp) | [§6.1](Refinement.md#post-mvp-open) | `apps/web/tests/widget-install.test.ts` | да |
| FR-014 импорт CSV | [`features/fr-014-csv-import/`](features/fr-014-csv-import/01_specification.md) | [FR-014](Specification.md#fr-014) | [§12.6](Pseudocode.md#alg-fr-014) | [§12.2](Architecture.md#post-mvp) | [G-17](Refinement.md#post-mvp) | `apps/web/tests/csv-import.test.ts`, `csv-import-route.test.ts` | да |
| FR-015 восстановление пароля (+ время ответа 28.09) | [`features/fr-015-password-reset/`](features/fr-015-password-reset/01_specification.md), `0244802a`, `437244e9` | [FR-015](Specification.md#fr-015) | [§12.7](Pseudocode.md#alg-fr-015) | [§12.2](Architecture.md#post-mvp) | [G-13, G-14](Refinement.md#post-mvp) | `apps/web/tests/password-reset.test.ts` | выложено; `/forgot` 503 без ключа Resend |
| FR-016 Yandex ID | [`features/fr-016-yandex-id/`](features/fr-016-yandex-id/01_specification.md) | [FR-016](Specification.md#fr-016) | [§12.8](Pseudocode.md#alg-fr-016) | [§12.2](Architecture.md#post-mvp) | [G-15](Refinement.md#post-mvp) | `apps/web/tests/sso.test.ts`, `sso-transport.test.ts` | код выложен; живой вход не проверен |
| Оплата со сроком 990 ₽ / 30 дней | [`features/paid-tier-checkout/`](features/paid-tier-checkout/01-plan.md), [`yookassa-setup.md`](yookassa-setup.md) | [FR-PAY-001](Specification.md#fr-pay-001) | [§7.2–7.3, §12.9](Pseudocode.md#alg-fr-pay-001) | [§12.2](Architecture.md#post-mvp) | [G-05, G-09](Refinement.md#post-mvp) | `apps/web/tests/payment.test.ts`, `tariff.test.ts`, `ip-range.test.ts` | TEST: платёж создан; вебхук не подтверждён |
| Потолок расхода на модель | [`features/model-spend-ceiling/`](features/model-spend-ceiling/01_specification.md) | [FR-SPEND-001](Specification.md#fr-spend-001), [FR-INTAKE-002](Specification.md#fr-intake-002) | [§12.10](Pseudocode.md#alg-fr-intake) | — (не реализован) | [§6.1](Refinement.md#post-mvp-open) | `apps/web/tests/video-intake-switch.test.ts` (только выключатель) | потолка нет; видео выключено |
| Отзыв с площадки | [`features/platform-proof/`](features/platform-proof/01_specification.md) | [FR-PROOF-001](Specification.md#fr-proof-001) | [§12.11](Pseudocode.md#alg-fr-proof-001) | [§12.2](Architecture.md#post-mvp) | [G-20, §6.1](Refinement.md#post-mvp) | `apps/web/tests/platform-proof.test.ts` | код есть; DoD не закрыт |
| Мост в N3 | [`features/n3-affiliate-bridge/`](features/n3-affiliate-bridge/01_specification.md), [`n3-integration-architecture.md`](n3-integration-architecture.md) | [FR-N3-001](Specification.md#fr-n3-001) | [§12.12](Pseudocode.md#alg-fr-n3-001) | [§12.5](Architecture.md#post-mvp) | [§6.1](Refinement.md#post-mvp-open) | `apps/web/tests/n3-*.test.ts`, `services/worker/tests/n3-outbox.test.ts` | развёрнут, выключен; A–D 49/49 |
| Агентные покупки (MCP/A2A) | [`features/agent-purchase/`](features/agent-purchase/01_specification.md) | [FR-AGENT-001](Specification.md#fr-agent-001) | [§12.13](Pseudocode.md#alg-fr-agent-001) | [§12.5](Architecture.md#post-mvp) | [G-21, G-22](Refinement.md#post-mvp) | `packages/agent-payments/test/*`, `services/agent-api/tests/*`, `tests/agent-payments-e2e/`, `tests/agent-payments-pilot/` | только TEST-пилот |
| Фото к текстовому отзыву | коммит `7539dc56` | [FR-INTAKE-001](Specification.md#fr-intake-001) | [§12.10](Pseudocode.md#alg-fr-intake) | [§12.4](Architecture.md#post-mvp) | — | `apps/web/tests/photo.test.ts` | да |
| Демо-отзывы | коммит `6ff4075b`, [`demo-script.md`](demo-script.md) | [FR-DEMO-001](Specification.md#fr-demo-001) | — | [§12.2](Architecture.md#post-mvp) | — | `apps/web/tests/wall.test.ts` | да |
| Слаг из русского названия и ссылки | коммиты `19e17040`, `d75cde86` | [FR-SLUG-001](Specification.md#fr-slug-001) | — | — | [G-19](Refinement.md#post-mvp) | `apps/web/tests/slug-source.test.ts` | да |
| `/dashboard` без слага | коммит `e7aebed1` | [FR-DASH-001](Specification.md#fr-dash-001) | — | [§12.3](Architecture.md#post-mvp) | [G-15](Refinement.md#post-mvp) | нет | да |
| Инфраструктурные исправления (BASE_URL, web без публикации, restart, CORS, пул) | коммиты `016a49ad`, `f64a9843`, `cf7e3ede`, `1cb7a31c`, `09bd3ffd` | — | — | [§7, §12.4](Architecture.md#7-docker-compose) | [G-01…G-03, G-06, G-10](Refinement.md#post-mvp) | `apps/web/tests/urls.test.ts`, `widget-install.test.ts` | да |
