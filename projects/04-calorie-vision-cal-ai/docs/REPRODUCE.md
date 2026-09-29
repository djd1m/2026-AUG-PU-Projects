# Как повторить «Тарелку» (N4) с нуля

Дата: 2026-09-29 · Основа: основная ветка после 11 фич роадмапа, партнёрских доработок 16–17.09,
RV-серии 28.09 и правки синонимов 29.09 · Образец — `projects/06-rag-sales-chatbase/docs/REPRODUCE.md`.

Документ для человека или агента, который поднимает N4 на новой машине или повторяет разработку.
Требования — [`Specification.md`](Specification.md) (§10 — всё, что сделано после Phase 1); алгоритмы —
[`Pseudocode.md`](Pseudocode.md); устройство — [`Architecture.md`](Architecture.md); грабли, из-за
которых команды именно такие, — [`Refinement.md`](Refinement.md) «Грабли…» (G-01…G-24); эксплуатация —
[`Completion.md`](Completion.md) «Развёртывание и эксплуатация по факту»; решения —
[`decisions-owner.md`](decisions-owner.md) (OWN-nnn) и [`decisions-autonomous.md`](decisions-autonomous.md) (DEC-A-nnn).

**Что проверено при написании (29.09, в изолированном дереве, на этой машине):** шаги 2, 3 и 4
целиком — зависимости, импорт USDA из скачанного дампа → 7 928 строк, seed → 153 строки, контрольные
позиции, юнит-тесты 548 + 1 пропуск, линт, типы, сборка, интеграционные 349/349 в отдельном
compose-проекте. Шаги 6–10 (стенд, домен, оплата) взяты из квитанций фич и `Completion.md` и в этот
день НЕ повторялись: стенд не трогали.

Все команды — из каталога проекта `projects/04-calorie-vision-cal-ai`, если не сказано иначе.

## 0. Что получится в конце

- Стенд `https://<домен>` (у нас `tarelka.aicoding.space`) за общим TLS-прокси машины: 6 сервисов
  compose (`proxy`, `web`, `api`, `recognizer`, `db`, `storage`) плюс одноразовый `storage-init`;
  единственная публикация — `127.0.0.1:${N4_EDGE_PORT:-4180}` у двери (Caddy).
- Съёмка без регистрации → распознавание (OpenRouter) → числа только из базы USDA с источником →
  правка порции и замена ингредиента → дневник и мягкий стрик → карточка «поделиться» `/c/{id}` →
  вход по почте (или Telegram) → подписка Pro через ЮKassa (тестовый магазин) → комиссия партнёру
  50 % → кабинеты партнёра и владельца, реестр выплат.
- Контракты: `model-cost` → 0, `webhook` → 2 (честно: повтор настоящим магазином не воспроизводился),
  `long-job` → 2 (декларация не обновлена после развёртывания), `embed` → 2 (виджета нет).

## 1. Что нужно заранее

| Что | Зачем | Кто делает |
|---|---|---|
| Linux, Docker ≥ 27 с compose v2, `openssl`, `curl`, `unzip`, `sha256sum` | сборка и запуск | — |
| Node на хосте — любой ≥ 20 (только для юнит-тестов и скриптов; у нас 20.20.2) | `npx vitest run`; зависимости ставятся в контейнере Node 22 | — |
| Шрифты и `fontconfig` там, где идут юнит-тесты (`fonts-dejavu-core`) | тест «текст помещается в карточку» меряет растр (G-21) | — |
| Дамп USDA FoodData Central (≈10 МБ zip) | база продуктов — раздел «Данные о питании» | оператор |
| Общий TLS-прокси машины (у нас `ai-hub-tls-proxy`, Caddy, сеть `talk-ai-public`) | TLS и домен | владелец |
| Домен и запись A на IP машины | внешний адрес `APP_ORIGIN` | владелец (DNS) |
| Ключ OpenRouter | живое распознавание; без него `N4_MODEL_PROVIDER=openrouter` валит старт | владелец вписывает в env сам |
| Бот Telegram (@BotFather): токен и имя | `TELEGRAM_BOT_TOKEN` (проверка `initData`), `TELEGRAM_BOT_USERNAME` (кнопка входа) — обязательны даже без входа через Telegram | владелец |
| Магазин ЮKassa (тестовый или боевой, необязательно) | живая оплата; без него `N4_PAYMENTS_MODE=fake` | владелец |
| Codex CLI (необязательно) | независимое ревью фич | владелец |

## 2. Код и зависимости

```bash
git clone git@github.com:djd1m/2026-AUG-PU-Projects.git && cd 2026-AUG-PU-Projects/projects/04-calorie-vision-cal-ai
# зависимости и сборка — ВНУТРИ контейнера Node 22 с сетью (engines: node >= 22.12; у сервиса test сети нет, G-15)
docker run --rm --network bridge -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e NEXT_TELEMETRY_DISABLED=1 \
  -v "$PWD:/workspace" -w /workspace node:22.22.0-bookworm-slim \
  sh -c 'npm ci --no-audit --no-fund && npm run lint && npm run typecheck && npm run build'
```

Проверено 29.09: `lint` 0, `typecheck` 0, `build` 0 (shared → db → api, recognizer, web). Файлы
`node_modules`, `dist`, `.next` в игнорируемых путях и принадлежат пользователю контейнера
(root); при желании добавить `--user "$(id -u):$(id -g)"` — эта форма 29.09 не прогонялась.
Сборка `web` обязательна до интеграционных тестов: наборы `web-*` запускают `next start` (иначе
3 красных файла, `food-synonyms-fix/05_completion.md`).

## 3. Данные о питании

База продуктов **скачивается из интернета** и в репозиторий не входит (чужие данные, CC0). На
стенде она залита 13.09 из дампа, лежащего на машине в `/home/dz-projects-2026/usda/` (перенесён
вместе с машиной при миграции сервера). Код импорта — `scripts/import-fdc.ts` (`npm run import:fdc`),
загрузчик синонимов — `packages/db/src/seed/load-food-synonyms.ts` (`npm run seed:food-synonyms`).
Скачивания в коде НЕТ намеренно: это шаг оператора (`operations/import-fdc.md`).

### 3.1. Скачать два набора и сверить

Используются ДВА набора CSV (FNDDS не загружался — DEC-A-048):

| Набор | URL | Размер | SHA-256 архива (наш экземпляр) |
|---|---|---|---|
| SR Legacy, выпуск 2018-04 | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip` | 6 074 592 Б | `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0` |
| Foundation Foods, выпуск 2026-04-30 | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip` | 3 825 741 Б | `70457ee9d9342f43bda2010318c85f04210c689fdeb9cd2da4c513b0e8dbc655` |

Оба адреса 29.09 отвечали `200` с этими размерами. USDA выпускает новые версии Foundation; если
архив другой — импорт пройдёт, но число строк и id контрольных позиций могут отличаться.

```bash
D=~/usda; mkdir -p "$D" && cd "$D"
for Z in FoodData_Central_sr_legacy_food_csv_2018-04.zip FoodData_Central_foundation_food_csv_2026-04-30.zip; do
  curl -fSLO "https://fdc.nal.usda.gov/fdc-datasets/$Z" && unzip -oq "$Z"; done
sha256sum *.zip
```

### 3.2. Собрать один каталог для импорта

Импорт принимает ОДИН каталог с `food.csv`, `food_nutrient.csv`, `nutrient.csv`, `food_portion.csv`.
Каталог стенда `merged/` собран так (побайтно сверено 29.09 с `/home/dz-projects-2026/usda/merged`):
заголовок и строки SR Legacy, затем строки Foundation без заголовка; `nutrient.csv` — из SR Legacy.

```bash
SR=FoodData_Central_sr_legacy_food_csv_2018-04; FF=FoodData_Central_foundation_food_csv_2026-04-30
mkdir -p merged && cp "$SR/nutrient.csv" merged/
for f in food food_nutrient food_portion; do
  { cat "$SR/$f.csv"; tail -n +2 "$FF/$f.csv"; } > "merged/$f.csv"; done
wc -l merged/*.csv   # 95785 food · 814595 food_nutrient · 25401 food_portion · 475 nutrient
```

### 3.3. Импорт и синонимы

Сначала миграции (шаг 4 или 6), затем импорт и seed. Команды одинаковы для тестовой базы и для
стенда; различается только адрес базы. Зависимости уже стоят в каталоге (шаг 2): у сервиса `test`
сети нет, и `npm ci` внутри него падает `EAI_AGAIN` / «Exit handler never called» (G-15).

```bash
DC="docker compose --project-directory . -p <проект>"      # стенд: -p "${N4_COMPOSE_PROJECT:-n4-tarelka}"; репетиция: -p n4-repro
# DATABASE_URL сервиса test указывает на n4_test; для стенда подставить базу n4 (как при перезаливке 29.09):
TO_N4='DATABASE_URL="${DATABASE_URL%/n4_test}/n4"'
$DC --profile test run --rm --no-deps -T -v ~/usda/merged:/fdc:ro test \
  sh -c "$TO_N4 npm run import:fdc -- /fdc --snapshot-date 2026-04-30"
# ожидается: «импорт завершён: принято 7928, отвергнуто 87855, снимок 2026-04-30, в таблице 7928»
$DC --profile test run --rm --no-deps -T test sh -c "$TO_N4 npm run seed:food-synonyms"
# ожидается: «seed применён: 153 строк food_synonym (заменено прежних строк тех же кураторов: 0)»;
# повторный запуск — «…заменено …: 153», exit 0 (идемпотентен, G-14)
```

- `--snapshot-date` — дата ПУБЛИКАЦИИ набора, не сегодняшняя; без неё импорт отказывает. Какая дата
  была передана 13.09 на стенде, нигде не записано — проверить владельцу:
  `docker exec "${N4_COMPOSE_PROJECT:-n4-tarelka}-db-1" psql -U n4_admin -d n4 -tAc "SELECT DISTINCT import_snapshot_date FROM food_item"`.
  Для повторения берите 2026-04-30 (выпуск Foundation).
- Из 95 783 записей принимаются 7 928: у остальных нет калорийности (DEC-A-048). На стенде 29.09 в
  `food_item` 7 928 строк.
- Импорт идемпотентен (`UNIQUE (source, source_id)`), `id` существующих строк не меняются.

### 3.4. Контрольные позиции

```bash
$DC exec -T db psql -U n4_admin -d <n4|n4_test> -tA -c "SELECT count(*) FROM food_item" \
  -c "SELECT count(*) FROM food_synonym" \
  -c "SELECT s.name_ru||' -> '||f.source_id||' '||f.name_en FROM food_synonym s JOIN food_item f ON f.id=s.food_item_id
      WHERE s.name_ru IN ('яйцо вареное','гречка вареная','мед') ORDER BY 1"
# 7928 · 153 · гречка вареная -> 170686 Buckwheat groats, roasted, cooked · мед -> 169640 Honey ·
# яйцо вареное -> 173424 Egg, whole, cooked, hard-boiled
```

Проверено 29.09 на репетиционной базе `n4-repro` (миграции 001–013 → импорт → seed дважды → запрос
выше) — всё совпало. Перезаливка синонимов на ЖИВОМ стенде — только по инструкции
`features/food-synonyms-fix/05_completion.md` (проверки «до», стоп-условия, «после»): seed удаляет
все строки кураторов `nutritionist-ru-01` и `coordinator-ru-02`.

Страж seed ↔ дамп: `FDC_DUMP_DIR=~/usda/merged npx vitest run tests/unit/food-synonym-seed.test.ts`
(10 passed); без переменной сверка с дампом пропускается и видна как `skipped`.

## 4. Тесты — до всякого запуска

**Юнит и стражи** — на хосте (Node ≥ 20, есть `fontconfig` и DejaVu) или в контейнере с ними:

```bash
npx vitest run                                   # 29.09 на хосте: Test Files 75 passed, Tests 548 passed | 1 skipped
# либо в контейнере (голый node:22-slim без шрифтов даёт 1 красный, G-21):
docker run --rm --network bridge -e HOME=/tmp -v "$PWD:/workspace" -w /workspace node:22.22.0-bookworm-slim \
  sh -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends fontconfig fonts-dejavu-core >/dev/null && npx vitest run'
```

**Интеграционные** — настоящие PostgreSQL 16 и MinIO в ОТДЕЛЬНОМ compose-проекте, никогда не в
проекте стенда `${N4_COMPOSE_PROJECT:-n4-tarelka}` (тесты делают `TRUNCATE`, G-08). Env — одноразовый, вне репозитория. Compose требует ВСЕ
переменные `${VAR:?}` файла, даже для профиля `test` (G-23), поэтому в тестовом env есть и токен бота,
и пороги двери — фиктивные:

```bash
umask 077; mkdir -p ~/.n4-test; E=~/.n4-test/test.env
{ for v in N4_DB_ADMIN_PASSWORD N4_DB_APP_PASSWORD N4_STORAGE_ROOT_PASSWORD N4_S3_SECRET_KEY TELEGRAM_BOT_TOKEN; do
    printf '%s=%s\n' "$v" "$(openssl rand -hex 24)"; done
  printf 'N4_STORAGE_ROOT_USER=root%s\nN4_S3_ACCESS_KEY=app%s\n' "$(openssl rand -hex 6)" "$(openssl rand -hex 8)"
  printf '%s\n' APP_ORIGIN=http://localhost TELEGRAM_BOT_USERNAME=test_bot N4_SCAN_LIMIT_USER=10 N4_SCAN_LIMIT_DAY=3000 \
    N4_ESCALATION_LIMIT_DAY=600 N4_RATE_LIMIT_MUTATE_PER_MIN=30 N4_RATE_LIMIT_READ_PER_MIN=120 \
    N4_PROXY_RATE_MUTATE_PER_MIN=30 N4_PROXY_RATE_READ_PER_MIN=120 N4_SUBSCRIPTION_PRICE_MINOR=100000 \
    N4_SUBSCRIPTION_PERIOD_DAYS=30 N4_COMMISSION_HOLD_DAYS=14 N4_SCAN_LIMIT_PRO=100 N4_PAYMENTS_MODE=fake; } > "$E"
set -a; . "$E"; set +a
export N4_PRIVATE_SUBNET=10.86.0.0/24 N4_EGRESS_SUBNET=10.87.0.0/24   # свободные на машине: ip route | grep '^10\.'
DC="docker compose --project-directory . -p n4-repro"
$DC up -d --wait db storage
bash scripts/create-test-database.sh -p n4-repro       # без -p или с -p n4-tarelka — код 2, docker не вызывается (G-26)
$DC --profile test run --rm -T test npm run test:integration
$DC --profile test down -v
```

Ожидаемо на 29.09: `Test Files 76 passed (76)`, `Tests 349 passed (349)`; после `down -v` не остаётся
ни контейнеров, ни томов, ни сетей `n4-repro`. Подсети по умолчанию `10.85/10.83` заняты стендом —
у параллельного прогона свои (`.env.example`, раздел о подсетях).

**Перед передачей результата** — ещё `bash scripts/check-env-wiring.sh` (0 — все читаемые кодом
переменные доезжают до `api`, `recognizer`, `web`; 17.09 — 0; 29.09 не повторялся).

## 5. Конвейер разработки фичи (как делались фичи)

Порядок — [`feature-runbook.md`](feature-runbook.md): тир `bash ../../scripts/complexity-router.sh
<файлы>` (`1` — L/XL, деньги — XL и остановка на плане у владельца); документы
`docs/features/<slug>/01…05`, валидация, реализация в отдельном worktree, стражи мутациями (дефект →
красный, восстановление → зелёный, обе строки в `05_completion.md`), ревью Codex по файлу-постановке
(`.claude/rules/codex-invocation-local.md`; образец — `features/food-synonyms-fix/08_review_codex.md`),
слияние координатором и ПОЛНЫЙ прогон всех наборов (G-22). Номер миграции раздаёт координатор (G-01).

## 6. Стенд

```bash
# 1) env стенда — вне git, права 600. У нас это .env в каталоге проекта основного checkout
#    (он в .gitignore; compose и check-port-conflicts читают его без --env-file).
umask 077; cp .env.example .env
# ВНИМАНИЕ: .env.example НЕ содержит переменных подписки и платежей — дописать их (G-23, список ниже).
```

| Переменная | Значение на стенде | Откуда |
|---|---|---|
| `N4_DB_ADMIN_PASSWORD`, `N4_DB_APP_PASSWORD`, `N4_STORAGE_ROOT_PASSWORD`, `N4_S3_SECRET_KEY` | секреты | `openssl rand -hex 24` |
| `N4_STORAGE_ROOT_USER`, `N4_S3_ACCESS_KEY` | имена | любые, не `minioadmin` |
| `APP_ORIGIN` | `https://tarelka.aicoding.space` | домен (шаг 7); на него строится `return_url` оплаты |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | токен, `calorytarelka_bot` | владелец, @BotFather |
| `N4_SCAN_LIMIT_USER` / `N4_SCAN_LIMIT_DAY` / `N4_ESCALATION_LIMIT_DAY` | 20 / 3000 / 600 | `model-cost-contract.md`; канон 10 на пользователя |
| `N4_SCAN_LIMIT_PRO` | 100 | OWN-008 |
| `N4_RATE_LIMIT_{MUTATE,READ}_PER_MIN`, `N4_PROXY_RATE_{MUTATE,READ}_PER_MIN` | 30 / 120 | канон §7 |
| `N4_MODEL_PROVIDER` | `openrouter` | `fake` без ключа — распознавание детерминированное, не живое |
| `OPENROUTER_API_KEY` | ключ | **вписывает владелец**; агент ключ не печатает и не копирует |
| `ANTHROPIC_API_KEY` | пусто | нужен только при `live` |
| `N4_SUBSCRIPTION_PRICE_MINOR` / `_PERIOD_DAYS` / `N4_COMMISSION_HOLD_DAYS` | 100000 / 30 / 14 | OWN-002, OWN-011 |
| `N4_PAYMENTS_MODE` / `N4_PAYMENTS_PROVIDER` | `live` / `yookassa` (без магазина — `fake`) | шаг 9 |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_TEST_MODE` | магазин, `true` | **вписывает владелец** (шаг 9) |
| `N4_EDGE_PORT`, `N4_EGRESS_SUBNET`, `N4_PRIVATE_SUBNET`, `N4_COMPOSE_PROJECT` | 4180, 10.83/24, 10.85/24, `n4-tarelka` | правятся под машину |

Потолки расходов модели: 20 попыток на пользователя в сутки, 3000 в сутки на всех, 600 эскалаций;
любой незаданный — отказ старта `api`/`recognizer` (ADR-007). Расход — консоль OpenRouter и
`docker logs "${N4_COMPOSE_PROJECT:-n4-tarelka}-recognizer-1" | node scripts/telemetry/model-calls.cjs - <YYYY-MM-DD>`.

```bash
# 2) проверки портов ДО up (правило репозитория). COMPOSE_PROFILES=edge — иначе дверь не попадёт в проверку
set -a; . ./.env; set +a; export COMPOSE_PROFILES=edge
bash ../../scripts/check-port-conflicts.sh .   # ✅ хранилища, ✅ порт двери свободен
node ../../.claude/hooks/check-ports.cjs .     # 0
```

Обе проверки НЕ распознают `proxy` как reverse-proxy (образ собирается из `proxy/Dockerfile`), и
проверка «приложение не опубликовано рядом с прокси» для N4 не выполняется — её держит сам compose:
у `web` и `api` нет `ports:` (G-24). На машине, где стенд уже поднят, `check-port-conflicts` сообщит
«`${N4_EDGE_PORT:-4180}` занят `${N4_COMPOSE_PROJECT:-n4-tarelka}-proxy-1`» — это своя дверь.

```bash
# 3) образы и хранилища
docker compose --project-directory . --profile edge build
docker compose --project-directory . up -d --wait db storage
# 4) миграции 001–013, затем данные (шаг 3.3 с тем же -p)
docker compose --project-directory . -p "${N4_COMPOSE_PROJECT:-n4-tarelka}" --profile test run --rm --no-deps -T test \
  sh -c 'DATABASE_URL="${DATABASE_URL%/n4_test}/n4" npm run migrate'
# 5) почта владельца — закрытый список В КОДЕ (не env). СНАЧАЛА опустошить список (G-25: иначе
#    прежний адрес из репозитория остаётся владельцем), затем вписать свой и пересобрать api
sed -i 's|^export const OWNER_EMAILS: readonly string\[\] = \[.*\];$|export const OWNER_EMAILS: readonly string[] = [];|' \
  apps/api/src/routes/admin.ts
grep -c 'OWNER_EMAILS: readonly string\[\] = \[\];' apps/api/src/routes/admin.ts   # 1 — иначе стоп
bash scripts/set-owner-email.sh
grep -n 'OWNER_EMAILS: readonly' apps/api/src/routes/admin.ts   # ровно ОДИН адрес — ваш
# 6) подъём
docker compose --project-directory . --profile edge up -d
docker compose --project-directory . --profile edge ps -a
# ожидаемо: db, storage, api, web, proxy — healthy; recognizer — Up; storage-init — Exited (0)
curl -s "http://127.0.0.1:${N4_EDGE_PORT:-4180}/health"   # {"data":{"status":"ok","db":"ok"}}
```

Шаги 3–6 восстановлены по коду и квитанциям; одной последовательностью на чистой машине не
прогонялись. Сервиса миграций в compose нет — `npm run migrate` вручную при каждой новой миграции.
Имя compose-проекта и порт двери все команды берут из тех же `N4_COMPOSE_PROJECT` и `N4_EDGE_PORT`,
что `docker-compose.yml` (`name:` и `ports:` двери), — поэтому env экспортирован в шаге 2 и должен
оставаться экспортированным в той же оболочке.

**Владелец: без опустошения списка стенд воспроизводится с дефектом безопасности (G-25).**
В репозитории `apps/api/src/routes/admin.ts:23` (`OWNER_EMAILS`) уже содержит адрес ПРЕЖНЕГО владельца
стенда, а `scripts/set-owner-email.sh:15` заменяет список, только когда он пуст (`= [];`); иначе ветка
`scripts/set-owner-email.sh:20` ДОПИСЫВАЕТ новый адрес в начало, не удаляя прежний. На независимом
стенде без шага `sed` выше прежний адрес сохраняет права владельца: кабинет (выручка, реквизиты
партнёров, реестр выплат, заведение партнёров) откроется тому, кто зарегистрируется этим адресом.
Адрес здесь намеренно не повторяется — он в файле. Проверка: `grep -n` в конце шага 5 показывает
ровно один адрес, и он ваш.

Правка кода для исполнителя (в документации НЕ внесена): в `apps/api/src/routes/admin.ts:23` поставлять
пустой список — `export const OWNER_EMAILS: readonly string[] = [];` (пусто законно и значит «кабинет
закрыт всем», комментарий `apps/api/src/routes/admin.ts:18`); в `scripts/set-owner-email.sh:20` заменить
дописывание заменой всего списка —
`sed -i "s|OWNER_EMAILS: readonly string\[\] = \[.*\];|OWNER_EMAILS: readonly string[] = ['$EMAIL'];|" "$FILE"`
(второй владелец — отдельным явным действием, не побочным эффектом скрипта).

## 7. Домен и общий прокси (делает владелец)

1. DNS: `A <имя> → <IP машины>`. Не открывать имя до появления записи — отрицательный ответ кэшируется.
2. Блок в Caddyfile общего прокси — правка НА МЕСТЕ, без смены inode (G-03), затем `validate` и `reload`:
   ```bash
   F=/home/dz-projects-2026/edge/Caddyfile; cp -p $F $F.bak-n4
   P="${N4_COMPOSE_PROJECT:-n4-tarelka}"   # контейнер двери называется <проект>-proxy-1
   printf '\n<имя> {\n\tencode gzip zstd\n\theader X-Robots-Tag "noindex, nofollow"\n\treverse_proxy %s-proxy-1:80\n}\n' "$P" >> $F
   docker exec ai-hub-tls-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
     && docker exec ai-hub-tls-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   Действующий блок 29.09 (проект по умолчанию): `tarelka.aicoding.space, n4.194.85.249.105.sslip.io { … reverse_proxy n4-tarelka-proxy-1:80 }`.
   При другом `N4_COMPOSE_PROJECT` цель блока — `${N4_COMPOSE_PROJECT:-n4-tarelka}-proxy-1:80`; сеть общего
   прокси (`talk-ai-public`, `docker-compose.yml`) от имени проекта не зависит.
   `ops/ai-hub-caddy-block.txt` в репозитории — старый вариант с адресом `212.192.0.33`.
3. Дверь доверяет `X-Forwarded-For` только от `172.21.0.0/16` (сеть общего прокси, `Caddyfile`). Другая
   подсеть сети прокси — поправить `trusted_proxies`, иначе лимит частоты станет общим на всех (G-04),
   а вебхук ЮKassa будет отвергать все уведомления (G-05).
4. Сменили домен — `APP_ORIGIN` в env и `up -d --force-recreate api web proxy`.

## 8. Проверки на стенде

```bash
curl -s https://<имя>/health                                            # {"data":{"status":"ok","db":"ok"}}
curl -s -o /dev/null -w '%{http_code}\n' https://<имя>/r/DEMOBLOG        # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<имя>/api/v1/admin/partners   # 404
curl -s https://<имя>/api/v1/notifications                              # {"data":{"unread":0,"items":[]}…}
node ../../.claude/hooks/check-model-cost.cjs .      # 0
node ../../.claude/hooks/check-webhook-contract.cjs .  # 2 — честно (webhook-contract.md)
node ../../.claude/hooks/check-job-contract.cjs .    # 2 — not-deployed в декларации
node ../../.claude/hooks/check-embed-contract.cjs .  # 2 — виджета нет
```

Полный сценарий по адресам (съёмка, результат, дневник, карточка, вход по почте, `/r/`, кабинеты,
уведомления, выгрузки, реквизиты) — [`operations/functional-verification.md`](operations/functional-verification.md);
путь партнёра до начисления — [`operations/partner-journey.md`](operations/partner-journey.md).

## 9. Оплата ЮKassa (когда есть магазин)

Скрипта установки ключей у N4 нет (у N6 есть). Владелец вписывает в env стенда `N4_PAYMENTS_MODE=live`,
`N4_PAYMENTS_PROVIDER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_TEST_MODE=true|false`
(ровно `true` или `false`, иначе отказ старта) и пересоздаёт `api` и `web`. В кабинете магазина — адрес
уведомлений `https://<имя>/api/v1/webhooks/payments/yookassa`, события `payment.succeeded`,
`refund.succeeded`. Журнал старта `api` пишет `payments_mode` — прогон с `fake` не проверка приёма денег.

## 10. Операции оператора

Таблица — [`Completion.md`](Completion.md) «Операции владельца»: заведение партнёра и приглашение,
выплата 5-го числа по реестру, выгрузки, перезаливка синонимов, расход модели, смена домена.

## 11. Уборка

```bash
docker compose --project-directory . -p n4-repro --profile test down -v   # тестовые стеки
git worktree list; git worktree remove <влитое дерево>
# снять стенд (данные останутся в томах; с -v — вместе с базой продуктов и фото):
docker compose --project-directory . --profile edge down
```

## 12. Чего стенд не доказывает

Приём настоящих денег, чарджбэк, фискальный чек, повтор уведомления настоящим магазином; отправку
выплат (её нет — DEC-A-062); доставку уведомлений в Telegram и вход через Telegram живьём; анти-фрод
на настоящем трафике; калибровку порога эскалации и точность распознавания (сверка 30 блюд не
проводилась); обрыв соединения посредником у долгой задачи; прогон, упёршийся в суточный потолок.

## 13. Состав фич и где описаны

`Spec` — идентификатор в `Specification.md`; `Pseudo` — алгоритм в `Pseudocode.md`; `Arch` — раздел
`Architecture.md`; `Refin` — грабли `Refinement.md`. Столбец «На стенде» — по квитанции фичи.

| Фича | Источник | Specification | Pseudocode | Architecture | Refinement | Тесты | На стенде |
|---|---|---|---|---|---|---|---|
| [`foundation`](features/foundation/05_completion.md) | роадмап 1 | FR-AUTH-001, NFR-* | CreateDeviceSession | Component Breakdown | G-02, G-15 | `tests/integration/{migrations,db-roles,health}.test.ts` | да |
| [`scan-pipeline`](features/scan-pipeline/05_completion.md) | роадмап 2 | FR-CAPTURE-*, FR-RECOGNIZE-001/002, FR-LIMIT-001/002 | CheckAndConsumeQuota, EnqueueScan, RecognizeScan | Data Architecture | G-09, G-10 | `tests/concurrency/{quota-parallel,lease}.test.ts`, `tests/integration/recognize/` | да (OpenRouter) |
| [`source-and-correct`](features/source-and-correct/05_completion.md) | роадмап 3 | FR-SOURCE-001…003, FR-CORRECT-* | ImportFdcDump, AdjustPortion, ReplaceIngredient | §«Данные: миграции» (009) | G-06, G-07, G-12 | `tests/integration/source/`, `tests/unit/source/` | да |
| [`consent-and-telegram-auth`](features/consent-and-telegram-auth/05_completion.md) | роадмап 4 | FR-AUTH-002/003 | TelegramLogin, ConsentAndErasure | Security Architecture | — | `tests/integration/{consent,auth-telegram,account-delete}.test.ts` | согласие да; Telegram-вход не проверен |
| [`diary-and-streak`](features/diary-and-streak/05_completion.md) | роадмап 5 | FR-DIARY-* | CommitDiaryEntryAndDayTotals, ComputeSoftStreak | Data Architecture | G-02 | `tests/integration/get-diary-day.test.ts`, `tests/concurrency/confirm-diary-entry-parallel.test.ts` | да |
| [`share-card-and-growth-events`](features/share-card-and-growth-events/05_completion.md) | роадмап 6, RV-04/06 28.09 | FR-SHARE-001, FR-SHARE-002, FR-GROWTH-* | BuildShareCard | маршруты `/internal/share-cards` | G-16, G-20, G-21 | `tests/unit/share-card-*.test.ts`, `render-card-image*.test.ts` | да |
| [`partner-codes-and-cabinet`](features/partner-codes-and-cabinet/05_completion.md) | роадмап 7 | FR-PARTNER-001…003 | ApplyPartnerCode, AntiFraudOnCode, PartnerDashboard | Data Architecture | — | `tests/{integration,concurrency}/partner/` | да |
| [`pro-interest-and-limits-ui`](features/pro-interest-and-limits-ui/05_completion.md) | роадмап 8 | FR-LIMIT-003 | RecordProInterest | — | — | `tests/integration/interest.test.ts`, `limit-screen*.test.tsx` | да (экран лимита ведёт на Pro) |
| [`subscription-and-commission`](features/subscription-and-commission/05_completion.md) | роадмап 9, OWN-001…011 | FR-SUB-001, FR-PAY-001, FR-COM-001 | Checkout, HandlePaymentWebhook, AccrueCommission, RenewDueSubscriptions, PreviewNextPayout | маршруты, миграция 010 | G-05 | `tests/integration/payments-webhook.test.ts`, `tests/concurrency/{payments-webhook-parallel,renewal-lease}.test.ts` | да, тестовый магазин |
| [`partner-links-and-admin`](features/partner-links-and-admin/05_completion.md) | роадмап 10, DEC-A-057/058 | FR-PARTNER-004, FR-PARTNER-005 | ApplyCodeFromLink, AdminCreatePartnerAndInvite | маршруты, миграция 011 | G-22 | `tests/integration/partner/apply-code.test.ts`, `anti-fraud-ip-consistency.test.ts` | да |
| [`partner-notifications-and-payouts`](features/partner-notifications-and-payouts/05_completion.md) | роадмап 11, DEC-A-059…062 | FR-PARTNER-006, FR-PARTNER-007 | NotifyPartner, SavePayoutDetailsAndExport | миграции 012, 013 | — | `tests/integration/notifications.test.ts`, `tests/unit/{payout-details,export-csv}.test.ts` | запись да; доставка в Telegram нет |
| [`food-synonyms-fix`](features/food-synonyms-fix/05_completion.md) | DEC-A-064, 29.09 | FR-SOURCE-004 | SeedFoodSynonyms | §«Данные о питании» | G-13, G-14, G-15 | `tests/unit/food-synonym-seed.test.ts`, `tests/integration/source/seed-synonyms.test.ts` | да, перезалито 29.09 |
| вход по почте (без каталога фичи) | OWN-012, `a02d3edb` | FR-AUTH-004 | EmailRegisterAndLogin | миграция 011 | — | `tests/integration/auth-email.test.ts`, `tests/unit/auth-password.test.ts` | да |
| поставщик OpenRouter (без каталога) | DEC-A-045/046/052 | FR-RECOGNIZE-003 | — (адаптер RecognizeScan) | внешние зависимости | G-09 | `tests/unit/provider-openrouter.test.ts` | да |
| кнопка съёмки и фото результата (без каталога) | DEC-A-049/050 | FR-CAPTURE-003 | — | маршрут `/scans/{id}/photo` | G-10 | `tests/unit/capture-upload*.test.ts`, `tests/integration/web-result-route.test.ts` | да |
| уборка бесхозных объектов (без каталога) | DEC-A-063, `1c4ceaba` | NFR-OPS-002 | PurgeOrphanObjects | фоновые циклы `api` | G-16 | `tests/integration/photo/purge-orphans.test.ts` | да |
| страж тестовой базы (без каталога) | DEC-A-056, `dfdf5582`, ревью 28.09 | NFR-OPS-003 | — | — | G-08 | `tests/guard/create-test-database-project.test.ts` | — (про тесты) |
