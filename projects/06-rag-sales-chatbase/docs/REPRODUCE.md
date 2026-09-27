# Как повторить «Суфлёр» (N6) с нуля

Дата: 2026-09-27 · Основа: основная ветка после фич 1–17 · Образец — `projects/05-podcast-clips-opus/docs/REPRODUCE.md`.

Документ для человека или агента, который поднимает N6 на новой машине или повторяет разработку. Каждая команда ниже
взята из работающего репозитория и выполнялась на стенде 26–27.09.2026. Что пошло не так по дороге и почему команды
именно такие — [`Refinement.md`](Refinement.md) «Грабли, найденные при реализации и на стенде» (G-01…G-25); решения —
[`decisions-autonomous.md`](decisions-autonomous.md) (A-N6-nnn).

Все команды — из каталога проекта `projects/06-rag-sales-chatbase`, если не сказано иначе.

## 0. Что получится в конце

- Стенд `https://<домен>` за общим TLS-прокси машины: 6 сервисов compose (`proxy`, `web`, `worker-index`, `db`, `redis`,
  `migrate`), единственная публикация — `127.0.0.1:${N6_HTTP_PORT:-8086}` у двери.
- Лендинг, предпросмотр бота по адресу сайта, кабинет, виджет на чужом сайте, демо-страница `/b/{slug}`, тарифы
  (оплата ЮKassa выключена до своего магазина), партнёры и студии, удаление аккаунта.
- Контракты по выданному адресу: embed → 0, long-job → 0, model-cost → 0, webhook → 2 (честно, см. G-18).

## 1. Что нужно заранее

| Что | Зачем | Кто делает |
|---|---|---|
| Linux, Docker ≥ 27 с compose v2, Node 20+ на хосте (только для скриптов), `openssl`, `curl` | сборка и запуск | — |
| Общий TLS-прокси машины (у нас `ai-hub-tls-proxy`, Caddy, сеть `talk-ai-public`) | TLS и домен | владелец |
| Домен и запись A на IP машины | внешний адрес `N6_PUBLIC_ORIGIN` | владелец (DNS) |
| Ключ OpenRouter | ответы Haiku 4.5 и эмбеддинги 1536; без него `web` не стартует (G-01) | владелец вписывает в env сам (G-24) |
| Магазин ЮKassa для N6 (необязательно) | живая оплата; у магазина один адрес уведомлений, магазины N1–N4 заняты | владелец |
| Codex CLI, вход через `codex login --device-auth` (необязательно) | независимое ревью фич | владелец |

## 2. Код и зависимости

```bash
git clone git@github.com:djd1m/2026-AUG-PU-Projects.git && cd 2026-AUG-PU-Projects/projects/06-rag-sales-chatbase
# зависимости ставятся ВНУТРИ контейнера Playwright, чтобы версия Node совпадала с браузерными прогонами:
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v "$PWD:/w" -w /w \
  mcr.microsoft.com/playwright:v1.60.0-noble sh -c 'npm ci && npm ci --prefix scripts/responsive \
  && npm run build --workspace=packages/rag && npm run build --workspace=packages/db && node apps/widget/scripts/build.mjs'
```

Последняя строка печатает размер бандла виджета (`gzip ≈ 5,8 КБ`, потолок 45 КБ — сборка падает выше).

## 3. Тесты — до всякого запуска

Тестовый стек — настоящие Postgres 16 + pgvector 0.8.6 и Redis 7.4 без публикации портов. Env — одноразовый, вне
репозитория и НЕ в `/tmp` (G-02):

```bash
umask 077; mkdir -p ~/.n6-test
printf 'N6_DB_PASSWORD=%s\nREDIS_PASSWORD=%s\nIMAGE_TAG=foundation\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > ~/.n6-test/test.env
docker compose -p n6-test-main -f compose.test.yml --project-directory . --env-file ~/.n6-test/test.env \
  run --rm --build test sh -c 'npm run lint && node scripts/test-db.mjs && npm test -- --run'
docker compose -p n6-test-main -f compose.test.yml --project-directory . --env-file ~/.n6-test/test.env down -v
```

- `--build` обязателен: без него прогон молча проверяет старый образ.
- `-p <имя>` — у каждого параллельного прогона своё (G-07).
- Ожидаемо на 27.09: `Test Files 56 passed (56)`, `Tests 1032 passed (1032)`, `Статические правила: ошибок нет`.

## 4. Типы и браузер — только в контейнере Playwright

```bash
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.60.0-noble \
  sh -c 'npm run typecheck'                       # 0 ошибок; в тестовом образе нет Playwright → ложные ошибки (G-08)
bash scripts/check-responsive.sh --test tests/browser   # Chromium + Firefox + WebKit; 27.09: 609 passed (609)
```

Браузерный прогон перезаписывает скриншоты `tests/artifacts/widget-runtime-and-badge/`: перед коммитом верните их
`git checkout -- tests/artifacts/widget-runtime-and-badge/`, если меняли не виджет.

## 5. Конвейер разработки фичи (как делались фичи 12–17)

1. **Тир:** `bash ../../scripts/complexity-router.sh <файлы>` — `0` T/S/M, `1` L/XL, `2` не выполнено. Деньги,
   удаление данных, необратимое — XL.
2. **XL — остановка на плане у владельца.** План (`docs/features/<slug>/01_plan.md`, `02_validation.md`) с разделом
   «Вопросы владельцу» — 3–5 решений с рекомендацией; владелец отвечает в разговоре координатора. Исполнитель
   реализации запускается ПОСЛЕ ответов и наследует разговор (G-23): решения, пересланные сообщением посреди работы,
   среда блокирует как внедрённую инструкцию.
3. **Переиспользование:** сначала искать готовое в N1/N2/N4/N5 (`docs/reuse-inventory.md`, поле `reuse` в
   `.claude/feature-roadmap.json`); квитанция отвечает по каждой строке «перенесено | адаптировано | написано заново».
4. **Реализация** в отдельном git worktree; тесты шагов 3–4; стражи — мутациями (`scripts/test-<slug>-mutations.mjs`:
   дефект → красный, восстановление → зелёный). Коммитить исправление ДО мутационного прогона (G-20).
5. **Ревью Codex:** модель `gpt-6-astra`, усилие `medium` (решение владельца). Постановка — в файле:
   ```bash
   timeout 1500 codex exec --skip-git-repo-check -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only \
     -C "$PWD" -o <ответ.md> "Прочитай файл <бриф.md> и выполни ревью, как там написано." </dev/null > <журнал> 2>&1
   grep -m2 -E '^model:|^reasoning effort' <журнал>; test -s <ответ.md> || echo "ПУСТОЙ ОТВЕТ — не «чисто»"
   ```
   Находки blocker/high и конкретные medium чинятся в фиче. **Лимит кругов назначается ДО первого ревью** (G-22):
   после него — узкое ревью только последнего диффа и решение владельца о принятом остатке.
6. **Артефакты фичи:** `01_plan`, `02_validation`, `05_completion` (последняя строка `Status: completed`),
   `07_code_report`, `08_review` (ответ ревьюера дословно), `tests/artifacts/<slug>/`.
7. **Слияние** в основную ветку координатором, затем шаги 3–4 на объединённом дереве и пересборка стенда (шаг 6).

## 6. Стенд

```bash
# 1) env стенда — вне git, права 600
umask 077; mkdir -p /home/dz-projects-2026/.n6-stand; cp .env.example /home/dz-projects-2026/.n6-stand/stand.env
# вписать: N6_DB_PASSWORD, REDIS_PASSWORD (openssl rand -hex 24), SESSION_SECRET (openssl rand -hex 32),
# N6_PUBLIC_ORIGIN=https://<домен>, потолки QUOTA_* (14 штук, канон §7; для стенда можно ниже),
# OPENROUTER_API_KEY — вписывает ВЛАДЕЛЕЦ (агенту чужой ключ копировать запрещено, G-24)

# 2) проверки портов ДО up (правило репозитория)
set -a; . /home/dz-projects-2026/.n6-stand/stand.env; set +a
bash ../../scripts/check-port-conflicts.sh .        # ✅ хранилища, ✅ только прокси, ✅ 8086 свободен
node ../../.claude/hooks/check-ports.cjs .          # 0

# 3) подъём: надстройка compose.stand.yml подключает дверь к сети общего прокси talk-ai-public
docker compose -f docker-compose.yml -f compose.stand.yml --env-file /home/dz-projects-2026/.n6-stand/stand.env up -d --build
docker compose -f docker-compose.yml -f compose.stand.yml --env-file /home/dz-projects-2026/.n6-stand/stand.env ps -a
# ожидаемо: db, redis, proxy, web, worker-index — healthy; migrate — Exited (0)
docker exec n6-sufler-db-1 psql -U n6 -d n6 -tAc "select name from _schema_migration order by 1"   # 001…010
```

При пересборке `check-port-conflicts` сообщит «8086 занят `n6-sufler-proxy-1`» — это своя дверь (G-06).

## 7. Домен и общий прокси (делает владелец)

1. DNS: запись `A <имя> → <IP машины>`. Не открывать и не проверять имя, пока записи нет: отрицательный ответ
   кэшируется (G-04).
2. Блок в Caddyfile общего прокси — правка НА МЕСТЕ, без смены inode (G-05), затем проверка и перезагрузка:
   ```bash
   F=/home/dz-projects-2026/edge/Caddyfile; cp -p $F $F.bak-n6
   printf '\n<имя> {\n\tencode gzip zstd\n\theader X-Robots-Tag "noindex, nofollow"\n\treverse_proxy n6-sufler-proxy-1:80\n}\n' >> $F
   docker exec ai-hub-tls-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
     && docker exec ai-hub-tls-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```
   Добавить имя к существующему блоку: `sed '…' $F > /tmp/Caddyfile.new && cat /tmp/Caddyfile.new > $F` (не `sed -i`).
3. Ждать не время, а условие — 60 разрешений подряд, затем проверить адрес и соседей на прокси:
   ```bash
   ok=0; until [ $ok -ge 60 ]; do getent ahostsv4 <имя> >/dev/null && ok=$((ok+1)) || ok=0; sleep 5; done
   curl -s -o /dev/null -w '%{http_code}\n' https://<имя>/health     # 200
   ```
4. Сменили домен — поменять `N6_PUBLIC_ORIGIN` в env стенда и пересоздать `web` и `worker-index`
   (`up -d --no-deps --force-recreate web worker-index`). Вход работает только с домена из `N6_PUBLIC_ORIGIN`.

## 8. Проверки на стенде

**Прибор адаптивности по выданному адресу** — служебный аккаунт и фикстура в игнорируемом каталоге:

```bash
mkdir -p .responsive-artifacts && umask 077
B=https://<имя>; PW=$(openssl rand -hex 16); EM=ui-fixture@n6-stand.invalid
printf '{"email":"%s","password":"%s","origin":"%s"}\n' "$EM" "$PW" "$B" > .responsive-artifacts/ui-fixture.json
curl -s -o /dev/null -w "register %{http_code}\n" -X POST "$B/api/auth/register" -H "Origin: $B" \
  -H 'Content-Type: application/json' --data "{\"email\":\"$EM\",\"password\":\"$PW\"}"; unset PW
bash scripts/check-responsive.sh --base "$B" --fixture .responsive-artifacts/ui-fixture.json --out .responsive-artifacts/run
# 0 — чисто; 1 — нарушения (цели < 44×44 ловятся только здесь, G-11); 2 — не выполнено (например 429 двери, G-03)
```

**Контракты:**

```bash
node ../../.claude/hooks/check-embed-contract.cjs .     # 0 после квитанции стенда (embed-contract.md)
node ../../.claude/hooks/check-job-contract.cjs .       # 0 после квитанции стенда (long-job-contract.md)
node ../../.claude/hooks/check-model-cost.cjs .         # 0
node ../../.claude/hooks/check-webhook-contract.cjs .   # 2 — честно: ЮKassa не подписывает уведомления (G-18)
```

Как снималась квитанция embed: хозяйская страница — Node-сервер ВНУТРИ контейнера Playwright на `0.0.0.0:8099` и
`:8098`, имя `stand.example` → `127.0.0.1` через `docker run --add-host stand.example:127.0.0.1`; бот разрешает
origin `http://stand.example:8099`; CSP `default-src 'none'; script-src <стенд>; connect-src <стенд>; img-src <стенд>
data:; style-src 'self'` и враждебный CSS; сценарий — `tests/artifacts/embed-contract-stand/host-page-and-run.mjs`.
Снимки экрана делать ПОСЛЕ сбора нарушений CSP (G-10). Квитанция long-job — опрос `GET /api/index-jobs/{id}` раз в 3 с
по задаче маленького сайта и отказ на странице короче 200 символов.

## 9. Оплата ЮKassa (когда есть магазин)

```bash
bash scripts/stand-set-yookassa.sh     # shopId (цифры), секретный ключ (без эха), тестовый ли магазин [Y/n]
```

Скрипт проверяет ключи как `web` (`test_…` для тестового магазина, `live_…` для боевого), делает резервную копию env,
пишет `N6_PAYMENTS_MODE=live` и `YOOKASSA_*`, перезапускает `web` и при нездоровом `web` возвращает прежний env.
В кабинете ЮKassa: адрес уведомлений `https://<имя>/api/webhooks/yookassa`, события `payment.succeeded`,
`refund.succeeded`.

## 10. Операции оператора

Синтаксис — [`Completion.md`](Completion.md) «Стенд проверки»: `ops:set-plan`, `ops:partner issue|unfreeze|payout|due|export`,
`ops:erasure list|overdue|owed|write-off`. Запуск: `docker exec n6-sufler-web-1 npm run -s <команда> -- …`.

## 11. Уборка

```bash
docker compose -p <имя> -f compose.test.yml --project-directory . --env-file ~/.n6-test/test.env down -v   # тестовые стеки
git worktree list; git worktree remove <влитое дерево>; git branch -d <влитая ветка>   # -d откажет, если ветка не влита
# снять стенд (данные останутся в томах; с -v — вместе с данными):
docker compose -f docker-compose.yml -f compose.stand.yml --env-file /home/dz-projects-2026/.n6-stand/stand.env down
```

## 12. Чего стенд не доказывает

Живой платёж и возврат, начисление и выплата партнёру, удаление партнёра с долгом и студии с переданными ботами (нет
живых оплат); калибровка порога «не знаю» 20 + 20 (ручное измерение людьми); настоящий обрыв соединения посредником у
долгой задачи; прогон, упёршийся в суточный потолок ответов посетителей.
