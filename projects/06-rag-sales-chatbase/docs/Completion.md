# Completion — N6 «Суфлёр», план выпуска и эксплуатации

**Версия:** 0.2 · **Дата:** 2026-09-25, дополнено 2026-09-27 · **Канон:** [`canon.md`](canon.md) · **Архитектура:**
[`Architecture.md`](Architecture.md) · **Решения:** [`ADR.md`](ADR.md). Разделы до «Стенд проверки» — план Phase 1,
пороги в нём проектные. Как развёрнуто на самом деле — раздел «Стенд проверки: как развёрнуто на самом деле»;
пошаговое повторение с нуля — [`REPRODUCE.md`](REPRODUCE.md).

## Deployment Plan

### Pre-Deployment

- [ ] **All tests passing:** `npm test` во всех workspace (unit + integration на compose-файле тестов
      с `name: n6-test`), конкурентные прогоны квоты и идемпотентности, мутационные прогоны стражей
      (Refinement «Стражи и мутации») — каждый страж показал красное на внедрённом дефекте.
- [ ] **Security audit complete:** SSRF-набор 12 адресов, XSS виджета (`textContent`), CORS
      «ровно один ACAO», 403 без списания, `npm audit --omit=dev` без high/critical.
- [ ] **Docs updated:** `docs/REPRODUCE.md` (по образцу N5), [`embed-contract.md`](embed-contract.md),
      [`long-job-contract.md`](long-job-contract.md), [`model-cost-contract.md`](model-cost-contract.md)
      отражают развёрнутое, а не задуманное.
- [ ] **Rollback tested:** откат на предыдущий тег образов выполнен на стенде хотя бы раз (ниже).
- [ ] **Порты:** `node ../../.claude/hooks/check-ports.cjs .` → `0` (хранилища без публикации, `web`
      не опубликован мимо `proxy`) И `bash ../../scripts/check-port-conflicts.sh .` → свободен
      `${HTTP_PORT:-8086}`. Хостовые порты — только `${VAR:-default}`; у `db` и `redis` нет `ports:`.
- [ ] **Проброс переменных:** `bash ../../scripts/check-env-wiring.sh` → `0`: каждый `process.env.X`
      сервиса есть в его `environment:`; секреты, модели и 14 переменных потолков (`QUOTA_*`, канон §7) — `${VAR:?}` без дефолта.
- [ ] **Гигиена compose:** явные теги образов (`pgvector/pgvector:0.8.6-pg16`, `redis:7.4-alpine`,
      `caddy:2.8-alpine`), `restart: unless-stopped` у каждого сервиса, `service_healthy` в
      `depends_on`, `.dockerignore`.
- [ ] **Калибровка порога** 20 + 20 выполнена и записана (Refinement), критерий достигнут.

### Deployment Sequence

1. **Подготовка машины.** `.env` из `.env.example` на VPS: `N6_PUBLIC_ORIGIN` (выданный DNS-адрес,
   `https:`), `DATABASE_URL`, `REDIS_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`),
   `OPENROUTER_API_KEY`, `ANSWER_MODEL=anthropic/claude-haiku-4.5`,
   `EMBED_MODEL=openai/text-embedding-3-small`, 14 `QUOTA_*` из канона §7 (10 scope, 14 переменных). Блок в общем
   TLS-прокси машины → `proxy:${HTTP_PORT:-8086}`.
2. **Сборка и миграции.** `docker compose build` (бандл виджета собирается в образе `web`, сборка
   падает при > 45 КБ gzip) → `docker compose up -d db redis` → `migrate` (`CREATE EXTENSION
   vector`, таблицы, HNSW) → `service_completed_successfully`.
3. **Проба `EmbedProbe` с ключом OpenRouter.** Старт `worker-index` выполняет один эмбеддинг
   строки «проба» через `https://openrouter.ai/api/v1/embeddings` и сверяет длину вектора с 1536;
   ответ ≠ 200 или длина ≠ 1536 — процесс не стартует. Одновременно `web` выполняет пробный вызов
   `ANSWER_MODEL` с `max_tokens 5`. Стоимость пробы — доли цента, строка в `model-spend.jsonl`.
   Сетевая доступность УЖЕ подтверждена (A-N6-019, чужим ключом стенда N5); при первом деплое
   `EmbedProbe` повторяет пробу СВОИМ ключом N6 — это отдельная проверка (ключ, не сеть), и она
   остаётся обязательной. Не путать «сеть доступна» (доказано) и «ключ N6 работает» (ещё нет).
4. **Старт приложения.** `docker compose up -d web worker-index proxy`; healthcheck зелёный.
5. **Сквозной сценарий на ВЫДАННОМ адресе** (не на localhost, [`deployment-seams`](../../../.claude/rules/deployment-seams.md)):
   URL → предпросмотр → ответ с источником → регистрация → claim → домен → код → виджет на чужой
   странице (порт 8099) → первый ответ → установка засчитана.
6. **Закрытие контрактов** (раздел ниже) и запись результатов в `docs/REPRODUCE.md`.

### Rollback Procedure

1. Образы помечаются тегом коммита; предыдущий тег хранится на машине.
2. Откат: `IMAGE_TAG=<предыдущий> docker compose up -d web worker-index` — схема БД совместима назад
   (миграции только добавляющие в неделю; удаляющие — отдельным релизом после отката окна).
3. При порче данных — восстановление из суточного `pg_dump` (том `backups`, 7 дней); фрагменты
   восстанавливаются переиндексацией, а не из резервной копии, если копия старше изменений.
4. Бандл виджета иммутабелен по хэшу: откат `web` возвращает старый хэш в сниппете, уже вставленные
   теги указывают на `widget.<hash>.js`, который остаётся в образе (старые хэши не удаляются в неделю).

## Стенд проверки: как развёрнуто на самом деле (26–27.09.2026)

| Что | Как на самом деле | Решение |
|---|---|---|
| Адрес | `https://sufler.aicoding.space` (запись A → `194.85.249.105` в Yandex Cloud DNS, внёс владелец); старое имя `n6.194.85.249.105.sslip.io` в том же блоке | A-N6-037, A-N6-042 |
| TLS | общий прокси машины `ai-hub-tls-proxy` (`/home/dz-projects-2026/edge/Caddyfile`), блок `sufler.aicoding.space, n6.194.85.249.105.sslip.io { reverse_proxy n6-sufler-proxy-1:80 }`; правку вносит владелец | A-N6-037 |
| Сеть | дверь `proxy` дополнительно в сети `talk-ai-public` — надстройка `compose.stand.yml`, основной compose не меняется | A-N6-037 |
| Публикация | единственная: `127.0.0.1:8086` у `proxy`; `db`, `redis`, `web` — без `ports:` | docker-ports |
| Env | `/home/dz-projects-2026/.n6-stand/stand.env` (права 600, вне git): свежие пароли, `SESSION_SECRET`, ключ OpenRouter стенда N5 (вписан владельцем), `N6_PUBLIC_ORIGIN=https://sufler.aicoding.space`, глобальные потолки ниже канона (ответов 300/сутки, предпросмотров 30, эмбеддингов 3 млн токенов) | A-N6-037 |
| Команда | `docker compose -f docker-compose.yml -f compose.stand.yml --env-file /home/dz-projects-2026/.n6-stand/stand.env up -d --build` | — |
| Оплата | `N6_PAYMENTS_MODE` не задан → `off`, экран интереса; включение — `bash scripts/stand-set-yookassa.sh` (спрашивает shopId, ключ без эха, тестовый ли магазин; резервная копия env; перезапуск `web`; откат при нездоровом `web`) | A-N6-040 |
| Адрес уведомлений ЮKassa | `https://sufler.aicoding.space/api/webhooks/yookassa`, события `payment.succeeded`, `refund.succeeded` | A-N6-042 |
| Служебный аккаунт для приборов | `ui-fixture@n6-stand.invalid`, фикстура `.responsive-artifacts/ui-fixture.json` (600, в `.gitignore`); демо-бот `/b/pekarnya-kolos-stend-proverki-i90u` с источниками info.cern.ch, w3.org, example.com | A-N6-063 |

**Команды оператора** (внутри контейнера `web`: `docker exec n6-sufler-web-1 npm run -s <команда> -- …`):

```bash
npm run ops:set-plan -- <email> <free|nobadge|studio> --by <кто> --reason "<зачем>"
npm run ops:partner -- issue <код> --group <seed-net|seed-studio-имя|seed-dogfood|studio|partner> [--owner <почта>] [--rate-bp 2000] --by <кто> --reason "<зачем>"
npm run ops:partner -- unfreeze <код> --by <кто> --reason "<зачем>"
npm run ops:partner -- payout <почта партнёра> --amount <рубли> --key <ключ выплаты, не erased:…> --by <кто> --reason "<зачем>"
npm run ops:partner -- due        # к выплате на ближайшее 5-е (CSV)
npm run ops:partner -- export     # все движения денег партнёров (CSV), без данных плательщиков
npm run ops:erasure -- list | overdue | owed
npm run ops:erasure -- write-off <id аккаунта> --by <кто> --reason "<зачем>"
```

**Что проверено на стенде (квитанции — `docs/features/<slug>/05_completion.md` «Проверка на стенде»):** демо-страница и
виджет в трёх движках; прибор адаптивности по выданному адресу — код 0, 148 страниц; предпросмотр `aicoding.space` с
усечением и ответом настоящей модели; индексация, «Обновить», удаление источника; CL+TE через прокси — 400; реферальная
ссылка и кабинеты партнёра и студии; тарифы, экран интереса, вебхук при `off` — 404; удаление аккаунта одноразовым
аккаунтом (сессии, виджет и вход — отказ сразу; стирание сторожем ≈ 60 с после тихого часа). **Не проверено на стенде:**
живой платёж и возврат, начисление и выплата партнёру, удаление партнёра с долгом и студии с переданными ботами.

**Чек-лист пересборки стенда после слияния фичи:**
- [ ] `set -a; . /home/dz-projects-2026/.n6-stand/stand.env; set +a; bash ../../scripts/check-port-conflicts.sh .` — хранилища и прокси ✅ (строка «8086 занят `n6-sufler-proxy-1`» при пересборке ожидаема);
- [ ] `node ../../.claude/hooks/check-ports.cjs .` → `0`;
- [ ] `up -d --build`, все сервисы `healthy`, `migrate` `Exited (0)`, последняя строка `_schema_migration` — новая миграция;
- [ ] `curl https://sufler.aicoding.space/health` → 200; соседи на общем прокси отвечают;
- [ ] прибор адаптивности по выданному адресу (REPRODUCE шаг 8) → код 0; новые экраны фичи — скриптом Playwright в трёх движках.

## CI/CD

```yaml
stages: [test, build, deploy]
test:
  script:
    - npm ci
    - npm run lint
    - npm test          # unit + integration (compose n6-test), конкурентные прогоны
build:
  script:
    - npm run build     # Next.js + бандл виджета, check-bundle-size ≤ 45 КБ gzip
    - docker compose build
deploy:
  when: manual
  script:
    - ./deploy.sh       # ssh на VPS: pull, migrate, EmbedProbe, up -d, сквозной сценарий
```

`deploy.sh` останавливается на первой ошибке и не трогает `db`/`redis` при откате приложения.

## Monitoring

| Метрика | Порог | Источник | Реакция |
|---|---|---|---|
| Response time p99 | > 500ms | наш журнал | PagerDuty |
| Error rate | > 1% | наш журнал | Slack |
| CPU usage | > 80% | ручное измерение: метрики контейнера | Email |
| Ответ посетителю p95 (NFR-PERF-001) | > 6 с | наш журнал | Telegram владельцу |
| Доля `unknown` среди ответов посетителям | > 35 % при n ≥ 100 за сутки | наша БД, `question_log` | Telegram владельцу; владельцам ботов — сводка в кабинете |
| Отказы по потолку, доля от попыток, по `scope` | > 5 % суммарно | наша БД, `quota_counter` + `question_log` | Telegram владельцу |
| `global_answers` использовано | > 90 % от `QUOTA_GLOBAL_ANSWERS` | наша БД | Telegram владельцу |
| Стоимость суток по журналу попыток | > $15 (≈ 70 % худших $20,9) | наш журнал, `model-spend.jsonl` × цены каталога | Telegram владельцу; сверка со https://openrouter.ai/activity |
| Stalled-задачи индексации за сутки | > 0 | наша БД, `index_job.failure_reason = stalled` | Telegram владельцу |
| `embedding_unavailable` за час | > 0 | наша БД | Telegram владельцу, проверка шлюза |
| Отказы по origin (`refused_origin`) по боту | > 20 в сутки | наша БД | подсказка владельцу бота «виджет вставлен на домене вне списка» |
| Размер тома `uploads` | > 1 ГБ | ручное измерение: `du` тома | проверить удаление PDF (ADR-018) |

Первые три строки — обязательные строки шаблона. **У проекта нет подключённых PagerDuty, Slack и
почтового канала**: их наличие в таблице не означает, что оповещение сработает. Фактический канал
оповещений — ровно один: сообщение владельцу в Telegram (Bot API `sendMessage`, как в N5), и он
внесён в инвентарь Architecture строкой `UNCONFIRMED` — до цитаты и пробы это
допущение, а не опора; до тех пор мониторинг читается вручную командами из
[`model-cost-contract.md`](model-cost-contract.md) раз в сутки.

## Logging

Уровни `info`/`warn`/`error`/`fatal`, JSON в stdout контейнера; correlation id — `index_job_id` для
задач и `visitor_session` + `bot_id` для ответов. `model-spend.jsonl` — строка на КАЖДУЮ попытку
(`phase=attempt` до вызова с `fsync`, `phase=outcome` после): вызов, `bot_id`, токены, исход.
**Не логировать:** текст вопросов посетителей (кроме `question_log` для `unknown`, 14 дней), полный
IP (только префикс), ключ OpenRouter, токены сессий и приглашений, тексты фрагментов целиком.
Retention: операционные логи — 30 суток (ротация Docker `max-size 50m`, `max-file 5`); журнал
расхода — 90 суток для сверки со счётом поставщика. Агрегация в неделю — `docker compose logs`
на машине; централизованного сборщика нет.

## Handoff

**Development**
- [ ] Доступ к репозиторию; `.env.example` с именами всех переменных канона §6 без значений.
- [ ] Environment setup: `docker compose -f compose.test.yml up` (`name: n6-test`), подменный сервер
      OpenRouter с граничными ответами (503, неразбираемый JSON, цитата вне контекста).
- [ ] Review guidelines: `.claude/rules/*`; ответ по каждой строке переиспользования ADR-012…016.

**QA**
- [ ] Test environment: стенд с выданным адресом + страница-хозяин на порту 8099 с CSP и враждебным CSS.
- [ ] Test data: два бота с одинаковым прайсом (изоляция), вредоносная страница (injection), скан PDF,
      JS-сайт, набор калибровки 20 + 20.
- [ ] Bug reporting: дефект = сценарий `SC-US-nnn-k` или строка Edge Cases Matrix + шаги + ожидание.

**Operations**
- [ ] Production access: SSH к VPS; секреты — только в `.env` машины, не в чате.
- [ ] Runbooks: исчерпание потолков (поднять число = решение владельца, не оператора), stalled-задачи
      («Повторить» продолжает), недоступность OpenRouter (ответы деградируют в «не знаю»),
      назначение плана `npm run ops:set-plan -- <email> <plan> --by --reason`, выплаты партнёрам
      `ops:partner due|payout`, удаления `ops:erasure list|overdue|owed|write-off` (полный синтаксис —
      раздел «Стенд проверки»).
- [ ] Escalation: владелец проекта — единственный получатель; изменение потолков, запасной маршрут
      эмбеддингов и включение оплаты — только его решения.

## Seeding недели

Ответ на FR-GROWTH-007 и PD-GROWTH-005: первые 20–50 установок — поимённые группы, у каждой свой
код партнёра, чтобы установки считались по группе (`partner_code.group`), а не «вообще».

| Группа | Сколько | Код | Почему поставят | Канал | Бюджет |
|---|---|---|---|---|---|
| Сеть владельца курса / выпускники с сайтом | 10–15 | `seed-net` | бесплатно, 5 минут, «покажи своим» | личные чаты, Telegram | 0 ₽ |
| Веб-студии-партнёры | 3–5 студий × 3 клиента | `seed-studio-<имя>` (по коду на студию; план `studio` назначает оператор) | допродажа клиенту, будущий доход с «Без бейджа» | прямой контакт, Рейтинг Рунета | 0 ₽ + будущая комиссия |
| Сайты проектов N1–N5 (dogfooding) | 3–5 | `seed-dogfood` | свои продукты с FAQ и лендингом | — | 0 ₽ |

Регистрации без кода учитываются в группе «без кода». Отчёт по когортам: регистрации → установки
(FR-BOT-003) → ответы, по каждой группе. Цель недели — 15 установок на внешних доменах (A-N6-005).

## Сознательные пропуски недели

| Пропуск | Почему | Что вместо |
|---|---|---|
| Сброс пароля | нет почтового провайдера в инвентаре | обращение к оператору; v1 — донор N1 |
| OCR сканов PDF | вне недели | отказ `no_text_layer` с объяснением |
| Скриншот сайта в предпросмотре | браузер в воркере не по бюджету VPS (ADR-007) | макет: заголовок, H1, фавикон + живой виджет |
| White-label (знак студии вместо нашего) | нет донора, самый дорогой кусок (CJM H) | колонка `bot.brand` и строка тарифа; v1 |
| Приём оплаты | ~~спящий код~~ — с 26.09 код живой оплаты готов (A-N6-040); до своего магазина ЮKassa `N6_PAYMENTS_MODE=off` | экран интереса + назначение плана оператором; включение — `scripts/stand-set-yookassa.sh` |
| Рассылка сводки «ответил / не знал» | нет канала доставки владельцу бота | сводка в кабинете (FR-BOT-004); v1 — донор N2 |

## Закрытие контрактов на стенде

Два контракта объявлены `НЕ ВЫПОЛНЕНА (not-deployed)` и закрываются только на развёрнутом стенде —
с адресом, который ВЫДАЛО развёртывание, а не известным заранее:

1. **[`embed-contract.md`](embed-contract.md):** `Origin виджета` заменяется выданным
   `N6_PUBLIC_ORIGIN`; страница-хозяин на `http://localhost:8099` (другой origin) с ограничительным CSP
   и враждебным CSS; по каждому из трёх классов — строка `ПРОВЕРЕН` с адресом страницы и датой;
   `node ../../.claude/hooks/check-embed-contract.cjs .` → `0`.
2. **[`long-job-contract.md`](long-job-contract.md):** три состояния сняты `GET
   /api/index-jobs/<index_job_id>` на стенде (успешный сайт, `kill -9` воркера → `stalled`, сайт с
   `Disallow: /` → отказ) с названным `index_job_id` в каждой строке;
   `node ../../.claude/hooks/check-job-contract.cjs .` → `0`.
3. **[`model-cost-contract.md`](model-cost-contract.md):** прогон, упёршийся в `visitor_answers`, и
   сверка суммы журнала попыток со страницей activity OpenRouter за те же сутки (расхождение
   записывается числом).
4. **[`webhook-contract.md`](webhook-contract.md):** остаётся «вебхуков нет» до пробуждения оплаты.

**Состояние на 27.09.2026 (стенд `https://sufler.aicoding.space`):**

| Контракт | Код проверки | Как закрыт |
|---|---|---|
| embed | `0` | хозяйская страница внутри контейнера Playwright на `http://stand.example:8099` (имя → 127.0.0.1 в контейнере, порт на хост не публикуется), строгий CSP, враждебный CSS; три движка; `:8098` вне списка — 403 (A-N6-063) |
| long-job | `0` | три состояния по `index_job_id` через API стенда (`running` 1 из 18 → `done` 50/50; `failed no_text`); повтор с тем же `Idempotency-Key` — та же задача; настоящий обрыв посредником не моделировался |
| model-cost | `0` | декларация; прогон, упёршийся в `visitor_answers`, на стенде не делался |
| webhook | `2` (честно) | вебхук ЮKassa есть (A-N6-040), но проверка требует подписи, а ЮKassa уведомления не подписывает — защита: IP из кода + перезапрос + сверка; как в N3 |
