# Квитанция: Phase 3 IMPLEMENT, фича `foundation`, плечо A

RUN_ID: `20260912T193004Z-foundation-A-7a62` · WORK_UNIT_ID: `impl-foundation` · дата: 2026-09-12.
Каталог работы: `projects/04-calorie-vision-cal-ai`. Ветка: `claude/install-npm-packages-n7l3m5`.
Push не выполнялся.

## Файлы

| Категория | Счёт |
|---|---|
| Исходники `apps/*` и `packages/*` (ts, tsx, sql, json, css, png) | 49 |
| Файлы тестов (`*.test.ts`, `*.test.tsx`) | 16 |
| Хелперы тестов (`tests/helpers/`) | 2 |
| Корневые конфигурации и скрипты (`package.json`, два `vitest.*`, `tsconfig*`, `eslint.config.js`, `.editorconfig`, `Caddyfile`, `scripts/check-env-wiring.sh`, `scripts/init-foundation-db.sh`) | 10 |
| Изменённые существующие | 6: `Dockerfile`, `docker-compose.yml`, `.env`, `.env.example`, `04_refinement.md`, `05_completion.md` |

`.env` не коммитился (в `.gitignore`); `node_modules`, `dist`, `.next` — тоже.
Секреты брались только из `.env`; в git уехали имена переменных и безопасные примеры.

## Тесты

| Слой | Файлов | Тестов | Результат |
|---|---|---|---|
| unit (без базы, `npm test`) | 4 | **29** | все зелёные |
| integration + конкурентные (`npm run test:integration` в профиле `test`) | 12 | **33** | все зелёные |
| **Итого** | 16 | **62** | все зелёные |

E2E на поднятом стенде (не vitest, прогон руками, все шаги пройдены): `docker compose --profile app
build` — три образа; `--profile edge up -d` — шесть сервисов, пять `healthy`; `GET /health` через
дверь Caddy по ВЫДАННОМУ адресу `http://127.0.0.1:4180` → `200 {"data":{"status":"ok","db":"ok"}}`;
`POST /api/v1/auth/device` через Caddy → `201` + `Set-Cookie: n4_session=…; HttpOnly; Secure;
SameSite=Lax; Path=/`; корневой маршрут → `200`, видоискатель и две подписи режимов, ОДИН заголовок
CSP с nonce; `docker compose stop db` → `GET /health` = `503 database_unavailable`, процесс `api`
ЖИВ, после возврата базы снова `200`; `docker compose --profile edge down` — **стенд не оставлен**.

Конкурентные прогоны (предмет фичи): 20 одновременных попыток при пределе 10 → ровно 10 `granted`,
`used = 10`, общий счётчик не увеличен отказавшими; 20 одновременных эскалаций при остатке 1 → ровно
один успех; соседняя сессия из другой сети не заблокирована, пик занятых соединений пула ≤ 10 и не
растёт с числом ожидающих; два воркера на одно задание → один захват; 10 воркеров на 3 задания → ни
одного двойного и ни одного потерянного; запись с устаревшим `fence` → ноль строк и
`stale_lease_result`.

## Ворота

| Ворота | Код | Комментарий |
|---|---|---|
| `npm test` | 0 | 29 тестов |
| `npm run test:integration` (профиль `test`) | 0 | 33 теста |
| `npm run lint` | 0 | — |
| `npm run build` | 0 | пять workspace |
| `npm run typecheck` | 0 | — |
| `node ../../.claude/hooks/check-ports.cjs .` | 0 | хранилища наружу не смотрят |
| `bash ../../scripts/check-port-conflicts.sh .` | 0 | прогон ДО `up`; при поднятом стенде честно даёт `1` — порт занят нами же |
| `bash scripts/check-env-wiring.sh .` | 0 | `api` и `recognizer` без потерь; `web` не читает ни одной переменной |
| `check-pipeline-gaps.sh . --completion …` | **2** | см. ниже: по контуру `foundation` — НОЛЬ расхождений |

**Про код `2` у ворот трассировки — прямо, потому что «ворота = 0» было бы неправдой.**
`GAP contour=foundation` — ноль строк; на копии, где оставлен только этот контур, вердикт
`features=1 gaps=0 inconclusive=1`. Код `2` возникает по двум причинам ВНЕ этой фичи:

1. **Дефект вендорного скрипта на контуре ПРОЕКТА.** `NOT-ESTABLISHED contour=project
   role=completion path=./docs/./docs/Completion.md missing or unreadable`: вызывающий код передаёт
   уже собранный `PROJECT_COMPLETION="$DOCS_ROOT/$PROJECT_COMPLETION"`, а `process_completion_contour`
   снова делает `"$directory/$completion_target"` — путь склеен дважды. Файл существует и читается.
   Контуры ФИЧ не задеты. Вендорные файлы не правятся (правило репозитория); кандидат в кузницу.
2. **Планы соседних фич без кода:** `scan-pipeline` (29 критериев) и `consent-and-telegram-auth`
   (20) написаны параллельно другими исполнителями, их тестов ещё не существует.

## Испытание стражей на внедрённом дефекте

Проверка, ни разу не показавшая красное, проверкой не является. Все девять прогонов выполнены.

| Страж | Дефект возвращён | Код восстановлен |
|---|---|---|
| атомарность квоты («прочитать, потом записать») | конкурентный 2 failed \| 1 passed, **последовательный остался ЗЕЛЁНЫМ** | 6 passed |
| аренда: из предиката убран `leased_until` | 2 failed \| 2 passed | 4 passed |
| fencing: запись без `AND lease_fence = $2` | 2 failed \| 2 passed | 4 passed |
| частота: хук `onRequest` → `preHandler` | 1 failed \| 3 passed (пять `400 invalid json` вместо `429`) | 4 passed |
| конфигурация: `?? 10` вместо отказа | 3 failed \| 13 passed | 16 passed |
| гигиена журнала: сырой токен cookie в вызове журналирования | 1 failed \| 4 passed | 6 passed |
| ADR-001: в схему ответа модели возвращено `calories` | 2 failed \| 3 passed | 6 passed |
| `check-env-wiring.sh`: у `api` убрана читаемая `S3_BUCKET` | код `1`, названы сервис и переменная | код `0` |
| `check-env-wiring.sh`: пустой вывод `docker compose config` | код `2`, «проверка НЕ ВЫПОЛНЕНА» | код `0` |

Строка про квоту — главная: последовательный тест ЗЕЛЁН при сломанной атомарности, и это
предъявленное доказательство того, что различает только конкурентный прогон.

## Дефекты, найденные сборкой и живым стендом (пять)

1. `Dockerfile` валил сборку всех трёх образов проверкой `sharp` на HEIF — `sharp` не зависимость
   этой фичи; проверка перенесена туда, где появится сама зависимость.
2. `npm run build --workspaces` идёт в порядке ОБЪЯВЛЕНИЯ: `apps/api` компилировался без
   `packages/shared/dist` — 18 ошибок «Cannot find module». Порядок объявлен явно.
3. Сеть `egress` не создавалась: «all predefined address pools have been fully subnetted» — на
   машине 31 чужая сеть. Подсеть задана явно через `${N4_EGRESS_SUBNET:-10.83.0.0/24}`.
4. `--profile edge` в одиночку не стартовал: `proxy` зависит от `api` и `web`.
5. **Остановка `db` на 10 секунд УБИВАЛА процесс `api`**: событие `error` простаивающего клиента
   `pg.Pool` никто не слушал. Добавлен `pool.on('error', …)` в оба загрузчика и страж по исходнику.

## Отклонения от плана

| Что | Почему |
|---|---|
| Роли создаёт `scripts/init-foundation-db.sh`, а не `001_init.sql` | роль — объект КЛАСТЕРА, её пароль не имеет права лежать в коммитимом SQL. `n4_migrate` без пароля и без права входа: раннер делает `SET ROLE` из-под `n4_admin` |
| Введены `N4_RATE_LIMIT_MUTATE_PER_MIN` и `N4_RATE_LIMIT_READ_PER_MIN` (30/120) | закрытие VF-02: у порога частоты не было ИСТОЧНИКА |
| Введена `N4_EGRESS_SUBNET` | дефект №3 выше; классифицируется как хостовая настройка машины |
| Имя `N4_MODEL_PROVIDER`, а не `N4_MODEL_MODE` | так в `docker-compose.yml`, `.env.example` и `03_architecture.md`; `N4_MODEL_MODE` есть только в тексте ранбука |
| Проба здоровья `api` — HTTP вместо TCP | предусмотрено `03_architecture.md`; TCP говорит «процесс слушает», HTTP — «база отвечает» |
| CSP ставит `apps/web/middleware.ts`, не `Caddyfile` | политика несёт nonce; второй заголовок браузер пересекает и ломает страницу молча |
| Воркер закрывает задание `refused(no_food_matched)` | сопоставления с базой в этой фиче нет, а `done` без ссылки на `food_item` нарушил бы ADR-001 |
| Тест AC-foundation-12 — `.tsx` | файл содержит JSX |
| Правки `04_refinement.md` и `05_completion.md` уехали в чужой коммит `a7a6ad5` | параллельный исполнитель `scan-pipeline` закоммитил рабочее дерево целиком. Содержимое на месте и проверено в `HEAD`; это ровно тот случай, против которого написано правило одного писателя на файл в общем worktree |

## Что НЕ сделано и почему

- Живого вызова модели нет: работает детерминированный фейк, ключа на машине нет (DEC-A-009).
  «Живое распознавание не выполнено: нет ключа» — состояние, а не пропуск.
- NFR-PERF-001 и NFR-PERF-002 НЕ измерены: измерять нечего, продукта на экране нет.
- Публичного адреса у стенда нет: только петля `127.0.0.1:4180`. Сквозной сценарий CJM E — за
  следующими фичами.
- Проверка «в клиентском бандле нет строк `ANTHROPIC_API_KEY`/`TELEGRAM_BOT_TOKEN`» выполнена по
  ИСХОДНИКАМ `apps/web`, а не по собранному бандлу; у `web` нет ни одной такой переменной ни в коде,
  ни в `environment:` сервиса.

## Коммиты (7, без push)

`5196429` каркас монорепо · `51fd6d3` shared и db · `4e488ab` api · `a0b1546` recognizer ·
`dfdbbae` web и Caddyfile · `d1f20cb` тесты · `707d694` страж проброса и правки compose/Dockerfile.
Трейлер `Co-Authored-By: Claude Fable 5.1` во всех.

requested: claude-opus-5; actual: unknown to worker

Status: completed
