# Как повторить ReviewQR (N2) с нуля

Дата: 2026-09-29 · Основа: основная ветка после слияния `c70afb53` (адрес гостя в лимите, 28.09) ·
Образец — `projects/06-rag-sales-chatbase/docs/REPRODUCE.md`.

Документ для человека или агента, который поднимает N2 на новой машине или повторяет разработку.
Каждое утверждение сверено с кодом 29.09.2026. **Честная пометка о происхождении команд:** команды
тестов и проверок взяты из скриптов репозитория и прогонялись при разработке (последний полный
прогон — 28.09, `111 из 111`); шаги подъёма стенда с нуля (миграции на пустую базу, пароли ролей)
**выведены из кода** — на текущем стенде они делались до появления этого документа и не записаны.
Такие шаги помечены «(выведено из кода)». Что пошло не так по дороге — [`Refinement.md`](Refinement.md)
§9 «Грабли» (G-01…G-20); решения — [`DECISIONS-PHASE-0.md`](DECISIONS-PHASE-0.md) и
[`ADR.md`](ADR.md).

Все команды — из каталога проекта `projects/02-review-qr-reputation`, если не сказано иначе.

## 0. Что получится в конце

- Стенд `https://<домен>` (сейчас `https://reviewqr.aicoding.space`) за общим TLS-прокси машины:
  пять контейнеров compose-проекта `reviewqr` — `postgres`, `guest`, `intake`, `notifier`, `web`.
  **Ни одной публикации порта на хост**: `guest` и `web` доступны только через сеть общего прокси
  `talk-ai-public`, `intake` и `postgres` — только внутри своей сети.
- Гость: `/r/<слаг>` (две равноправные двери + приватная), `/r/<слаг>/private` (форма),
  `/go/<слаг>/<площадка>` (302 на карточку). Владелец: страница продукта `/`, `/register`, `/login`,
  кабинет `/dashboard`, QR и печатные макеты, привязка Telegram, список обращений, оплата «Точки»
  990 ₽ / 30 дней через ЮKassa (магазин тестовый).
- Обращение гостя приходит владельцу в Telegram за 5–13 с.
- Контракт вебхука: `node ../../.claude/hooks/check-webhook-contract.cjs .` → **2** (проверка не
  выполнена: значение «ПОДПИСИ НЕТ» не входит в закрытый список проверки — ЮKassa уведомления не
  подписывает, подлинность держится на сети источника и перезапросе статуса; см.
  [`webhook-contract.md`](webhook-contract.md)). Код 2 — не «всё в порядке», а честный отказ формы.

## 1. Что нужно заранее

| Что | Зачем | Кто делает |
|---|---|---|
| Linux, Docker с compose v2, `bash`, `openssl`, `curl`. **Node 22 на хосте** — только для проверки `check-ports.cjs` из §5 (`node ../../.claude/hooks/check-ports.cjs`; `check-port-conflicts.sh` — bash); установка, тесты и сборка идут в `node:22-alpine` и хостового Node/npm не требуют | сборка, тесты, запуск | — |
| Общий TLS-прокси машины: Caddy в контейнере `ai-hub-tls-proxy`, внешняя сеть `talk-ai-public` | TLS, домен, маршрутизация guest/web, закрытие `/internal/*` | владелец машины |
| Домен и запись A на IP машины | `BASE_URL` — из него собирается каждый QR | владелец (DNS) |
| Telegram-бот (создаётся у @BotFather) | `TELEGRAM_BOT_TOKEN` (нотифаер), `TELEGRAM_BOT_USERNAME` (кабинет) | владелец вписывает в env сам |
| Магазин ЮKassa (тестовый или боевой) — необязательно | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`; без них кнопка оплаты отвечает «приём оплаты ещё не настроен» | владелец |

## 2. Код и зависимости

```bash
git clone git@github.com:djd1m/2026-AUG-PU-Projects.git && cd 2026-AUG-PU-Projects/projects/02-review-qr-reputation
# lock-файла в репозитории НЕТ (package-lock.json в .gitignore, G-18): версии берутся заново по диапазонам ^
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -v "$PWD:/app" -w /app node:22-alpine npm install --no-audit --no-fund
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/app" -w /app node:22-alpine npm run typecheck
```

Установка нужна до тестов: `scripts/test-all.sh` запускает `npx tsx` и `npx vitest` внутри
`node:22-alpine` с примонтированным каталогом проекта, а раннер миграций импортирует `pg`
(выведено из кода: без `node_modules` шаг миграций вернёт «миграции не легли — проверка НЕ
выполнена», код 2). Образы стенда ставят зависимости сами (`npm ci … || npm install` в Dockerfile).

## 3. Тесты — до всякого запуска стенда

```bash
bash scripts/test-all.sh     # только docker; `npm test` — тот же скрипт, но требует host npm
```

Что делает (NFR-OPS-003 в [`Specification-NFR.md`](Specification-NFR.md)):
одноразовая сеть `rq-test-<pid>` и Postgres `postgres:16-alpine` **без публикации порта** (скрипт
это проверяет), миграции из файлов с нуля, затем каждый набор `apps/*/tests/*.test.ts`,
`services/*/tests/*.test.ts` — **под своей ролью СУБД**, выведенной из первой строки файла.

- Коды: `0` пройдены все · `1` падения названы · `2` проверка НЕ выполнена (нет docker, база не
  поднялась, миграции не легли, у набора нет строки роли). **Код 2 — не вердикт**: гонка старта
  одноразового Postgres изредка даёт «база не отвечает» — повторить.
- Ожидаемо на 28.09: `✅ пройдено 111 из 111` (наборы: `purity` 9 · `http` 12 · `owner` 23 ·
  `payment` 16 · `intake` 16 · `seam-guest-ip` 8 · `binder` 10 · `expire` 2 · `notifier` 15).
- Голый `npm run test:one` (vitest на всё сразу) падает «правами» **по построению** — не дефект (G-06).
- `KEEP_DB=1 bash scripts/test-all.sh` оставляет базу для разбора (уборка — §11).

**Страж матрицы прав T1–T3c** (`scripts/check-db-grants.sh`) здесь НЕ запускается: ему нужны `.env`,
сеть стенда и мигрированная база с паролями ролей — он выполняется в §6, шаг 3б.

## 4. Env стенда — вне git, права 600

Compose читает `.env` в каталоге проекта (он в `.gitignore`; так устроен текущий стенд: `.env`
рядом с `docker-compose.yml`, права `600`). Значения секретов в документ не пишутся — только откуда
их берут.

```bash
umask 077; cp .env.example .env; chmod 600 .env
```

| Переменная | Откуда значение | Кто читает |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | `reviewqr` (как в `.env.example`) | postgres, миграции |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` (без неё compose не стартует — `:?`) | postgres |
| `DATABASE_URL_RENDER`, `_INTAKE`, `_NOTIFY`, `_OWNER` | `postgres://app_<роль>:<пароль>@postgres:5432/reviewqr`; пароль каждой роли — `openssl rand -hex 24`, тот же, что в §6 шаг 3 | guest, intake, notifier, web |
| `PGPOOL_MAX`, `PGPOOL_CONNECTION_TIMEOUT_MS` | `10`, `2000` (мусор или `0` — отказ старта) | все четыре сервиса |
| `BASE_URL` | `https://<домен>` без слеша. **Обязателен**: у `guest` без него отказ старта, у `web` — тихий `localhost` в каждом QR, у `intake` — снятая проверка Origin (G-12) | guest, intake, web |
| `SESSION_SECRET` | `openssl rand -hex 32` (≥ 16 символов). ⚠️ по текущему compose до `guest` **не доезжает** — защита `device_hash` НЕ воспроизводится (G-13); правка — §6, шаг 0 | `apps/guest/src/journal.ts` |
| `TRUSTED_PROXY_HOST` | пусто → `ai-hub-tls-proxy`; на другой машине — имя контейнера её прокси в `talk-ai-public` | guest |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | у @BotFather; **вписывает владелец** | notifier; web |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | кабинет ЮKassa; **вписывает владелец** | web |
| `PRICE_POINT_RUB` | пусто → 990 (DEC-PAY-1) | web |

`MAX_BOT_TOKEN`, `HTTP_PORT`, `HTTPS_PORT` из `.env.example` ничем не читаются. `NODE_ENV=production`
задают Dockerfile всех четырёх сервисов; в `.env` он не обязателен.

## 5. Проверки портов — ДО любого `up`

```bash
node ../../.claude/hooks/check-ports.cjs .          # 0 — хранилище и приложение наружу не смотрят
bash ../../scripts/check-port-conflicts.sh .        # занятость портов этой машины
```

Публикаций у проекта нет, поэтому конфликтов быть не должно; проверки обязательны по правилу
репозитория. Код `2` у `check-ports.cjs` (например, нечитаемый compose без `.env`) — не «чисто».

## 6. Подъём (выведено из кода — порядок, при котором ни один сервис не стартует на пустой схеме)

```bash
set -a; . ./.env; set +a
docker network inspect talk-ai-public >/dev/null     # сеть общего прокси обязана существовать

# 0) G-13: по текущему docker-compose.yml `SESSION_SECRET` в `guest` НЕ передаётся, и `device_hash`
#    считается с ПУСТЫМ ключом HMAC (journal.ts) — задуманная защита не воспроизводится. Исполнитель
#    вносит ОДНУ строку в docker-compose.yml, в `services.guest.environment`, после `- BASE_URL`:
#        - SESSION_SECRET
#    (в этом репозитории compose не правился — это правка кода, вне области документации).
grep -A12 '^  guest:' docker-compose.yml | grep -q -- '- SESSION_SECRET' \
  || echo 'G-13 открыт: SESSION_SECRET не передан в guest'

# 1) только база
docker compose up -d postgres && docker compose ps postgres        # healthy

# 2) миграции 001–012 раннером (DATABASE_URL_MIGRATE — суперроль; в compose её нет намеренно)
docker run --rm --network reviewqr_default -v "$PWD:/app" -w /app \
  -e DATABASE_URL_MIGRATE="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB" \
  node:22-alpine npx tsx packages/db/src/migrate.ts                 # apply 001… → «применено: 12»

# 3) пароли четырёх ролей: миграции создают их LOGIN без пароля. Пароли — те, что вписаны в
#    DATABASE_URL_* (hex, кавычки не нужны). Через stdin, чтобы пароль не попал в список процессов.
for r in render intake notify owner; do
  v=$(eval echo "\$DATABASE_URL_$(echo $r | tr a-z A-Z)"); pw=${v#*://app_$r:}; pw=${pw%%@*}
  printf "ALTER ROLE app_%s PASSWORD '%s';\n" "$r" "$pw"
done | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

# 3б) страж прав T1–T3c — ПОСЛЕ миграций и паролей, ДО запуска сервисов (нужны схема, роли и сеть).
#     Без psql на хосте — в контейнере Postgres в сети стенда.
docker run --rm --network reviewqr_default -v "$PWD:/app" -w /app \
  -e DATABASE_URL_SUPER="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB" \
  postgres:16.4-alpine bash scripts/check-db-grants.sh     # 0 матрица цела · 1 нарушена · 2 не выполнена
#     Не 0 — сервисы не запускать.

# 4) сервисы
docker compose up -d --build
docker compose ps -a      # postgres healthy; guest, intake, notifier, web — Up
docker logs reviewqr-guest-1 2>&1 | grep -c trusted_proxy_lookup_failed    # 0
```

- `guest` не стартует (и перезапускается), пока `TRUSTED_PROXY_HOST` не резолвится в сети — прокси
  должен быть в `talk-ai-public` раньше.
- Раннер отказывает на миграции, изменённой после применения, — это защита, а не сбой (NFR-OPS-002).
  База, накатанная руками до раннера, принимается один раз флагом `--baseline`.
- Обновление кода на живом стенде: миграции (шаг 2) → `docker compose up -d --build <изменённые
  сервисы>`; например, 28.09 пересобирались только `guest` и `intake`.

## 7. Домен и общий прокси (делает владелец машины)

1. DNS: `A <имя> → <IP машины>`.
2. Блок в Caddyfile общего прокси (сейчас `/home/dz-projects-2026/edge/Caddyfile`) — **ровно такой**,
   порядок директив важен (NFR-OPS-004):

   ```
   <имя> {
   	encode gzip zstd
   	header Cache-Control "no-store"
   	@internal path /internal/*
   	respond @internal 404
   	@guest path /r /r/* /go/*
   	reverse_proxy @guest reviewqr-guest-1:3000
   	reverse_proxy reviewqr-web-1:3000
   }
   ```

   Имена контейнеров — полные (`reviewqr-guest-1`), не алиас `guest`: в общей сети короткое имя
   однажды совпадёт с чужим сервисом. Правка файла — на месте, без смены inode (как у N6).
3. Применение: `docker exec ai-hub-tls-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`,
   затем `caddy reload` тем же способом. 01.09 админ-API прокси был выключен и reload не работал —
   применяли `docker restart ai-hub-tls-proxy`, сняв коды ответа всех сайтов прокси до и после (G-16).
4. Сменили домен — поменять `BASE_URL` в `.env` и пересоздать `guest`, `intake`, `web`
   (`docker compose up -d --force-recreate guest intake web`). **Напечатанные QR ведут на старый
   домен навсегда** — менять домен до печати.

## 8. Проверки на стенде (по выданному адресу, не по localhost)

```bash
B=https://<имя>
for p in / /login /register; do curl -s -o /dev/null -w "$p %{http_code}\n" "$B$p"; done     # 200
curl -s -o /dev/null -w "internal %{http_code}\n" -X POST "$B/internal/invalidate/x"         # 404 — отрезано прокси
curl -s -o /dev/null -w "webhook %{http_code}\n" -X POST -H 'content-type: application/json' \
  -d '{"event":"payment.succeeded","object":{"id":"probe"}}' "$B/webhooks/yookassa"          # 400 — чужая сеть
```

Сквозной путь — руками в браузере, **пользуясь адресами, которые выдала система**: регистрация →
точка (адрес соберётся из названия) → ссылки Яндекс.Карт/2ГИС (`https://…`) → «QR и макеты» (QR
ведёт на `$B/r/<слаг>`) → «уведомления» → «Получить ссылку на бота» → Start в Telegram (ответ
«Готово…») → открыть `$B/r/<слаг>` с телефона → «Написать нам напрямую» → отправить → сообщение в
Telegram за 5–13 с и в кабинете «обращения →». T4 на стенде: несколько запросов `/r/<слаг>` с разными
`?rating=`, cookie и User-Agent дают побайтово одинаковое тело (`ef776561`).

Отправка формы на боевом стенде создаёт настоящее обращение владельцу — делать на своей тестовой
точке. Лимит: 11-я отправка с одного адреса за час → «Слишком много сообщений».

## 9. Оплата ЮKassa

- В `.env`: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` (вписывает владелец), затем
  `docker compose up -d --force-recreate web`.
- В кабинете ЮKassa: адрес уведомлений `https://<имя>/webhooks/yookassa`, события
  `payment.succeeded` и `payment.canceled`. Allowlist сетей ЮKassa (включая IPv6) зашит в
  `apps/web/src/payment.ts` — сверять с документацией провайдера при каждом обновлении.
- Цена в продукте — `PRICE_POINT_RUB`, по умолчанию **990 ₽ за 30 дней** (DEC-PAY-1, совпадает с
  README и страницей продукта). Сейчас магазин **тестовый**; боевой — решение владельца DEC-PAY-2.
- Проверка: кнопка «Подключить «Точку» — 990 ₽ / 30 дней» (у оплаченного — «Продлить ещё 30 дней») в кабинете → тестовая карта ЮKassa → возврат на
  `/dashboard?paid=1` → бренд-строка на `/r/<слаг>` пропала (≤ 60 с). Живьём сделано 02.09.

## 10. Операции оператора

| Задача | Как |
|---|---|
| Журналы | `docker logs reviewqr-<сервис>-1`; ключевые строки: `trusted_proxy_lookup_failed` (guest), `rate_limit_coarse_window` (intake, раз в минуту при отказах), `notifier_tick_failed`, `bind_token_unknown`, `bind_start_without_token` (notifier), `checkout_failed`, `guest_invalidate_failed` (web) |
| Недоставленные обращения | `docker exec reviewqr-postgres-1 psql -U reviewqr -d reviewqr -c "select status, last_error, count(*) from notifications group by 1,2"` — в кабинете статус доставки не виден |
| Истечение подписок | само, раз в час в нотифаере; бренд-строка возвращается |
| Бэкап | в проекте не настроен; разово: `docker exec reviewqr-postgres-1 pg_dump -U reviewqr reviewqr > <файл вне git>` |
| Схема | после обновления кода — шаг 2 §6; страж прав — §3 |

## 11. Уборка

```bash
docker ps -a --filter name=rq-test-pg -q | xargs -r docker rm -f      # тестовые базы, оставленные KEEP_DB=1
docker network ls --filter name=rq-test- -q | xargs -r docker network rm
docker compose down            # снять стенд, данные в томе reviewqr_pgdata остаются; с -v — вместе с данными
```

## 12. Чего стенд не доказывает

Раздельный счёт лимита по двум реальным адресам гостей через настоящий Caddy (форма на стенде после
28.09 не отправлялась; доказано тестом стыка и мутациями M-30…M-34); что Caddy без
`trusted_proxies` заменяет клиентский `X-Forwarded-For` (по документации, не по замеру); ручной
повтор вебхука из кабинета ЮKassa; боевой магазин; истечение подписки на стенде (первая оплаченная
действует до 02.10); открытие карточек площадок диплинками на живом телефоне (блокирует пилот);
MAX; ответ гостю (FR-008); метрику недели (отчёта в коде нет); поведение при двух репликах `intake`.

## 13. Состав фич и где описаны

Сокращения: Spec — [`Specification.md`](Specification.md), -OWNER/-NFR/-GROWTH — соседние файлы
спецификации; Ps — Pseudocode*; Arch — Architecture*; Ref — [`Refinement.md`](Refinement.md).

| Фича | Источник | Specification | Pseudocode | Architecture | Refinement | Тесты | На стенде |
|---|---|---|---|---|---|---|---|
| Монорепо, схема, четыре роли, страж матрицы прав | `49b3a12e`, миграции 001–005 | NFR-SEC-003 (-NFR) | Ps §1 | Arch §3.1, -DATA §6, §8 | §1 T1–T3c, G-08 | `scripts/check-db-grants.sh` | ✅ |
| Гостевая поверхность: выбор, переход, форма | `b071961d`, `c1382c55` | FR-005, FR-006, NFR-SEC-001/002 | Ps §1 | Arch §5, -UI §9 | §1 T4–T6, T12 | `apps/guest/tests/purity.test.ts` | ✅ T4 проверен на стенде |
| Приём приватных обращений, трёхступенчатый лимит | `8da37419`, `3b375189` | FR-006, NFR-SEC-004 (-NFR) | Ps §2, -OPS §10 | -OPS §7.2 | §3, G-02…G-04 | `services/intake/tests/intake.test.ts` | ✅ |
| Раннер миграций | `534cd85d` | NFR-OPS-002 (-NFR) | — | -DATA §8 | G-05 | четыре прогона в коммите, автотеста нет | ✅ 007–008 накатаны раннером |
| Доставка владельцу в Telegram | `f6b5f955` | FR-007 | Ps §3, -OPS §11 | -OPS §7.1 | §1 T16, §9 | `services/notifier/tests/notifier.test.ts` | ✅ 5–13 с |
| Кабинет: регистрация, RLS, точки, ссылки площадок | `ca33245a`, `03e71538` | FR-001, FR-002 | -OWNER §4.1–4.2 | -OPS §6, -DATA §8 | G-01, G-07 | `apps/web/tests/owner.test.ts`, `apps/web/tests/http.test.ts` | ✅ |
| Адрес точки из названия (транслит) | `1d66ec4e`, миграция 010 | FR-PLACE-001 (-OWNER) | -OWNER §4.1 | -DATA §8 | G-07 | `owner.test.ts` «транслитерация» | ✅ |
| QR и печатные макеты | `ea0e93a9` | FR-004, FR-PRINT-001 (-OWNER) | -OWNER §4.3 | -OPS §6 | §4.3 | `http.test.ts` «QR и печатные макеты» | ✅ |
| Привязка Telegram одноразовым кодом и её починки | `d4c20509`, `27ee2e6b`, `637c3a75`, `16bdcb75`, `d2420ffb`, миграции 009, 012 | FR-BIND-001…003 (-OWNER) | -OWNER §4.3 | -DATA §8 | G-11, G-14 | `services/notifier/tests/binder.test.ts`, `owner.test.ts` | ✅ |
| **`docs/features/payment`** — оплата ЮKassa | [`features/payment/`](features/payment/01_specification.md), `90da85df`, `db10f349`, `d58f5cb2`, `dfb6497e` | FR-010, FR-011, FR-PAY-001 (-OWNER) | -OWNER §5.1 | -OPS §10, -DATA §8 | G-09, G-10 | `apps/web/tests/payment.test.ts` (P-1…P-10) | ✅ тестовый платёж 02.09 |
| Истечение подписки, возврат бренд-строки | `services/notifier/src/expire.ts` | FR-EXPIRE-001 (-OWNER) | -GROWTH §3.1 | — | — | `services/notifier/tests/expire.test.ts` (P-9) | не наблюдалось (до 02.10) |
| Бренд-строка бесплатной точки | `apps/guest/src/render.ts` | FR-GROWTH-003 (-GROWTH) | -GROWTH §3, §3.1 | -UI §9 | — | `payment.test.ts` P-5 | ✅ снята после оплаты |
| Кэш страницы выбора и закрытый `/internal/*` | `apps/guest/src/server.ts`, Caddyfile машины | FR-CACHE-001 (-OWNER), NFR-OPS-004 | -GROWTH §3.1 | -OPS §9 | — | `payment.test.ts` P-6 | ✅ 404 снаружи |
| Облик кабинета по Birdeye и страница продукта `/` | `fc392e65` | FR-LOOK-013…020, FR-LAND-001 (-OWNER) | — | -UI §9 | G-20 | `owner.test.ts` «облик» | ✅ |
| Выкладка за общим прокси, guest и web раздельно | `ef776561` | NFR-ARCH-001, NFR-OPS-004 | — | -OPS §9 | G-16 | `check-ports.cjs` (§5) | ✅ |
| Все наборы одной командой под своими ролями | `50ebc949` | NFR-OPS-003 (-NFR) | — | — | G-06, G-19 | `scripts/test-all.sh` | — |
| **`docs/features/guest-ip-forwarding`** — адрес гостя в лимите | [`features/guest-ip-forwarding/`](features/guest-ip-forwarding/05_completion.md), `c70afb53` | NFR-SEC-005 (-NFR) | -OPS §9 | -OPS §7.2 | §2 M-30…M-34, G-15 | `services/intake/tests/seam-guest-ip.test.ts` | ✅ выложено 28.09; форма не отправлялась |
| Контракт вебхука | [`webhook-contract.md`](webhook-contract.md) | FR-011 | -OWNER §5.1 | -OPS §10 | — | `payment.test.ts` P-1 | проверка → 2 (формат) |
| **`docs/features/client-account-handover`** — передача аккаунта | [`features/client-account-handover/`](features/client-account-handover/01_specification.md) | — (план) | — | — | — | — | ⏸ не реализовано |
