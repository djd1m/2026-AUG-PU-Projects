# Фича `foundation` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Это ПЛАН выпуска фичи, а не отчёт о нём. Ни одного файла кода, миграции и теста ещё не существует
(состояние репозитория на 2026-09-12). Команды ниже — целевые; коды возврата в них не подставляются
заранее, а заполняются фактическими значениями в квитанции Phase 3.

## Порядок выполнения Phase 3

Порядок не произволен: каждая ступень делает проверяемой следующую.

1. **Каркас монорепо.** Корневой `package.json` с пятью workspace, `tsconfig.base.json`,
   `vitest.config.ts`, ESLint, `.gitignore` уже существует. Критерий готовности: `npm ci` и
   `npm run lint` проходят на пустых пакетах.
2. **`packages/shared`.** Типы конверта ответа, закрытые перечисления канона, единицы, валидатор
   окружения, журнал с редактором запрещённых значений. Тесты: `tests/unit/config.test.ts`,
   `tests/unit/ip-prefix.test.ts`, `tests/unit/log-redaction.test.ts`.
3. **`packages/db`.** `migrations/001_init.sql` на 14 таблиц, роли, раннер, пул с
   `connectionTimeoutMillis`. Тесты: `tests/integration/migrations.test.ts`,
   `tests/integration/db-roles.test.ts` на настоящем PostgreSQL профиля `test`.
4. **`apps/api`.** Загрузка с валидацией конфигурации, хук частоты, `GET /health`,
   `POST /api/v1/auth/device`, модуль `CheckAndConsumeQuota`. Тесты: сессия, последовательная квота,
   частота, здоровье; затем конкурентный `tests/concurrency/quota-parallel.test.ts`.
5. **`apps/recognizer`.** Цикл аренды с предикатом `leased_until`, `lease_owner`, `lease_fence`,
   адаптер поставщика с фейком. Тесты: `tests/concurrency/lease.test.ts`,
   `tests/integration/provider-adapter.test.ts`.
6. **`apps/web`.** Экран видоискателя, `manifest.json`. Тест: `tests/integration/web-shell.test.ts`.
7. **`Caddyfile` и стенд.** Сборка образов, поднятие профиля `app`, затем `edge`; проверка здоровья
   через дверь Caddy по выданному адресу, а не по `localhost` изнутри контейнера.
8. **`scripts/check-env-wiring.sh`** и его испытание на трёх входах.

Коммиты — по логическим группам (`feat(foundation): …`), с трейлером
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; push делает координатор.

## Команды

```bash
# 1. Сборка и проверки монорепо (из каталога проекта)
npm ci
npm run build
npm run lint
npm test                      # unit + integration + конкурентные, vitest 3

# 2. Миграции и тесты, которым нужна настоящая база
docker compose --profile test run --rm test npm run migrate
docker compose --profile test run --rm test npm test

# 3. Порты — ДО любого up, две проверки, а не одна
node ../../.claude/hooks/check-ports.cjs .
bash ../../scripts/check-port-conflicts.sh .

# 4. Стек
docker compose build
docker compose --profile app up -d
docker compose ps                       # db, storage, api, web — healthy
docker compose --profile edge up -d
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${N4_EDGE_PORT:-4180}/health

# 5. Стражи фичи
bash scripts/check-env-wiring.sh                    # 0 | 1 | 2, третий код обязателен
node ../../.claude/hooks/check-model-cost.cjs .
node ../../.claude/hooks/check-job-contract.cjs .

# 6. Ворота трассировки фичи
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

## Чеклист готовности

- [ ] `npm ci`, `npm run build`, `npm run lint`, `npm test` — код `0` каждая, вывод в квитанции.
- [ ] Пять workspace и ни одного лишнего; локфайл один, в корне проекта.
- [ ] `001_init.sql` создаёт 14 таблиц канона, `pg_trgm`, все названные уникальности и частичные
      индексы; повторный прогон применяет ноль файлов.
- [ ] Три роли БД созданы; `n4_app` не может менять схему — проверено запросом, а не обещанием.
- [ ] Старт `api` без КАЖДОЙ из трёх переменных потолка проверен ОТДЕЛЬНЫМ прогоном (три прогона).
- [ ] Конкурентный тест квоты зелёный; тот же тест краснеет на редакции с «прочитать-записать» —
      обе строки в квитанции.
- [ ] Конкурентный тест аренды зелёный; запись с устаревшим `fence` затрагивает ноль строк.
- [ ] `docker compose build` собрал три образа; `up --profile app` довёл четыре сервиса до `healthy`.
- [ ] `GET /health` отвечает `200` через дверь Caddy по ВЫДАННОМУ адресу и `503` при остановленном
      `db`.
- [ ] `check-ports.cjs` и `check-port-conflicts.sh` — код `0` ДО первого `up`.
- [ ] `check-env-wiring.sh` предъявлен на трёх входах с кодами `0`, `1`, `2`.
- [ ] Ни в одном журнале нет секретов, сырого токена cookie и полного IP-адреса.
- [ ] `## Criterion coverage` ниже заполнен ФАКТИЧЕСКИМИ заголовками тестов, и ворота
      `--completion` возвращают `0`.

## Что эта фича НЕ доказывает

Записывается явно, чтобы зелёная квитанция не читалась шире, чем она есть.

- Ни одного вызова модели не сделано: адаптер работает фейком, ключа на машине нет (DEC-A-009).
  «Живое распознавание не выполнено: нет ключа» — это состояние, а не пропуск.
- NFR-PERF-001 (≤ 6 с p95) и NFR-PERF-002 (≤ 1 с) НЕ измерены: измерять нечего, продукта на экране
  нет. Статус — «не измерено», а не «в пределах нормы».
- Числа о еде не показываются и не считаются: ADR-001 в этой фиче не проверяется вовсе.
- Согласие, вход через Telegram, коды партнёра, карточки и дневник не реализованы и не проверены.
- Стенд поднимается локально на петле; публичного адреса у фичи нет, и сквозной сценарий CJM E
  (ADR-002 Confirmation) остаётся за следующими фичами.

## Criterion coverage

**Таблица ПЛАНОВАЯ.** Пути файлов и заголовки — ожидаемые; Phase 3 заменяет их фактическими и
только после этого ворота `--completion` имеют смысл: они открывают файл и ищут заголовок дословно,
поэтому таблица имён доказательством не является.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-foundation-1 | tests/integration/workspace.test.ts | чистый клон собирается и перечисляет ровно пять workspace |
| AC-foundation-2 | tests/unit/config.test.ts | отсутствие N4_SCAN_LIMIT_USER валит старт с названной переменной |
| AC-foundation-3 | tests/unit/config.test.ts | отсутствие APP_ORIGIN валит старт и не подставляет localhost |
| AC-foundation-4 | tests/integration/migrations.test.ts | миграции создают четырнадцать таблиц канона и расширение pg_trgm |
| AC-foundation-5 | tests/integration/db-roles.test.ts | роль приложения не может менять схему но выполняет DML |
| AC-foundation-6 | tests/integration/device-session.test.ts | первый запрос создаёт сессию с флагами HttpOnly Secure SameSite и хранит только хэш |
| AC-foundation-7 | tests/integration/device-session.test.ts | повторный запрос с действующей cookie не создаёт вторую сессию |
| AC-foundation-8 | tests/integration/quota-sequential.test.ts | одиннадцатая попытка получает refused с scope user |
| AC-foundation-9 | tests/concurrency/quota-parallel.test.ts | двадцать одновременных попыток при пределе десять дают ровно десять успехов |
| AC-foundation-10 | tests/concurrency/lease.test.ts | результат с устаревшим fence затрагивает ноль строк и пишет stale_lease_result |
| AC-foundation-11 | tests/integration/provider-adapter.test.ts | фейковый адаптер детерминирован и не ходит в сеть |
| AC-foundation-12 | tests/integration/web-shell.test.ts | корневой маршрут отдаёт видоискатель и две подписи режимов |
| AC-foundation-13 | tests/integration/rate-limit.test.ts | превышение частоты отвечает 429 до разбора тела |
| AC-foundation-14 | tests/integration/health.test.ts | health отвечает 200 при живой базе и 503 при недоступной |
| AC-foundation-15 | tests/integration/check-env-wiring.test.ts | страж проброса переменных возвращает 0 1 и 2 на трёх входах |
| AC-foundation-16 | tests/unit/source-guards.test.ts | в вызовы журналирования не передаются секреты и полный адрес |

Два критерия — AC-foundation-2 и AC-foundation-6 — закрываются НЕ одним утверждением: у первого три
прогона (по одному на переменную потолка), у второго — три проверки в одном тесте (флаги cookie,
хранение хэша, усечённый префикс). Ворота сверяют по одному заголовку на критерий; полноту
утверждений внутри теста сверяет Phase 4, и её надо предъявить явно, а не подразумевать.
