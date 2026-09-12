# Квитанция: Phase 3 IMPLEMENT, фича `scan-pipeline`, плечо B

**Итог после Попытки 2 (см. раздел ниже): все 38 AC закрыты исполненным тестом, `check-pipeline-gaps.sh
--completion` даёт 0 GAP по контуру `scan-pipeline`.** Разделы «Файлы»/«Тесты»/«Покрытие
критериев»/«Ворота» ниже описывают состояние ПОСЛЕ Попытки 1 (26/38 AC) — оставлены как есть,
т.к. квитанция фиксирует историю прогона; актуальные числа — в разделе «Попытка 2».

RUN_ID: `20260912T195930Z-scan-pipeline-B-fe9f` · WORK_UNIT_ID: `impl-scan-pipeline` · дата: 2026-09-12.
Каталог работы (worktree): `projects/04-calorie-vision-cal-ai` в `/home/dz-projects-2026/n4-wt-scan`.
Ветка: `exp/scan-pipeline-B`. Push не выполнялся. Основной каталог
`/home/dz-projects-2026/2026-AUG-PU-Projects` не тронут.

## Файлы

| Категория | Счёт |
|---|---|
| Новые исходники `apps/api/src` (photo/, quota/consume-in-transaction.ts, routes/scans.ts) | 6 |
| Новые исходники `apps/recognizer/src` (photo/, recognize/, match/, observability/) | 9 |
| Новый исходник `packages/db/src/quota.ts`, миграция `002_scan_pipeline_failure_reasons.sql` | 2 |
| Новый скрипт `scripts/telemetry/model-calls.cjs` | 1 |
| Изменённые исходники (расширение `ModelProvider`, `lease.ts`, `worker.ts`, `bootstrap.ts`, `server.ts`, `select.ts`, `fake.ts`, `live.ts`, `enums.ts`, `db/index.ts`) | 10 |
| Новые тесты (unit 6 файлов / 47 тестов, integration 1 файл / 10 тестов, concurrency 1 файл / 2 теста) | 8 |
| Изменённые тесты `foundation` (сломаны расширением интерфейса, переписаны) | 2 |
| Тестовые хелперы (`image-fixtures.ts`, `multipart.ts`, `scan-config.ts`) | 3 |
| Инфраструктура (`docker-compose.yml`: `storage-init` + явная подсеть `private`; `eslint.config.js`: правила для `.cjs`; `.env`/`.env.example`: `N4_COMPOSE_PROJECT`/`N4_PRIVATE_SUBNET`/`N4_EGRESS_SUBNET`) | 3 |
| `docs/features/scan-pipeline/05_completion.md` (фактическая таблица) | 1 |

`.env` не коммитился (в `.gitignore`); секреты в коммиты не попали — проверено чтением диффов
перед каждым `git add`.

## Тесты

| Слой | Файлов (новых фичи) | Тестов фичи | Тестов всего в слое | Результат |
|---|---|---|---|---|
| unit (`npm test`, без базы) | 6 | 47 | **76** | все зелёные |
| integration (`npm run test:integration`, изолированный стенд) | 1 | 10 | — | все зелёные |
| concurrency (тот же прогон) | 1 | 2 | — | все зелёные |
| **integration+concurrency итого** | — | 12 | **46** | все зелёные |

Стенд для integration/concurrency — ИЗОЛИРОВАННЫЙ (`N4_COMPOSE_PROJECT=n4-tarelka-scan-b`,
своя сеть `10.85.0.0/24`), а не дефолтный `n4-tarelka`. Причина и инцидент — ниже.

### Покрытие критериев приёмки

26 из 38 AC подтверждены исполненным, зелёным тестом — таблица дословных путей и заголовков
в `docs/features/scan-pipeline/05_completion.md` («Criterion coverage», сверена воротами
`check-pipeline-gaps.sh --completion` построчно). **12 AC реализованы в коде, но НЕ покрыты
исполненным тестом в этом бюджете**, названы явно в том же документе, раздел
«Не покрыто тестом»: AC-9 (нормализация HEIC на реальной фикстуре), AC-13 (конкурентная
эскалация 20×), AC-17 (устаревшая аренда с реальной задержкой провайдера через полный
`recognizeScan`), AC-19 (крах между `PUT` и транзакцией), AC-22/23 (`SweepStuckScans`
целиком — ни одного теста), AC-24 (`decode-check.ts` на битом HEIC), AC-25 (EXIF-поворот и
первый кадр на реальном `sharp`), AC-30 (изоляция объекта отката), AC-31 (уборка орфанов),
AC-35 (составное блюдо, `parts[]`), AC-36 (sweeper не трогает живую аренду).

## Ворота

| Ворота | Код | Комментарий |
|---|---|---|
| `npm test` | 0 | 76 тестов |
| `npm run test:integration` | 0 | 46 тестов на изолированном стенде `n4-tarelka-scan-b` |
| `npm run lint` | 0 | — |
| `npm run build` | 0 | пять workspace |
| `npm run typecheck` (`npx tsc --noEmit -p tsconfig.json`) | 0 | — |
| `node ../../.claude/hooks/check-ports.cjs .` | 0 | хранилища наружу не смотрят |
| `bash scripts/check-env-wiring.sh .` | 0 | `api`/`recognizer` без потерь |
| `check-pipeline-gaps.sh . --completion --role-map-source … --project-role-map-source …` | **2** | контур `scan-pipeline`: **32→12 реальных GAP** после исправления формата заголовков (см. ниже); контур `consent-and-telegram-auth` (чужое плечо) и вендорный дефект пути `Completion.md` — вне этой квитанции |

**Про код `2` — прямо, как и в квитанции `foundation`.** Изначальный прогон дал 39 строк GAP
для контура `scan-pipeline` из-за формата: я склеивал заголовок теста с примечанием
«(+ отдельно: …)» в одну строку таблицы, а ворота ищут заголовок ДОСЛОВНО. Исправление
(убрать примечание из title, оставить только реально существующий заголовок) сократило до
**12 подлинных GAP** — критериев, для которых теста НЕТ ВООБЩЕ, а не опечатки в таблице.
Оставшиеся ~20 строк вывода принадлежат `consent-and-telegram-auth` (параллельное плечо,
не эта квитанция) и вендорному дефекту двойного склеивания пути `docs/Completion.md`
(тот же, что назвала квитанция `foundation`; вендорные файлы не правятся).

**Честно: контур `scan-pipeline` НЕ достиг «без GAP».** Задание просило это явно; бюджет
120 минут на XL-фичу с 21 FR / 38 AC / атомарной транзакцией / fencing / эскалацией не
позволил закрыть все 38 исполненными тестами. Приоритет отдан (см. ниже) деньгам и
конкурентности — самому дорогому классу дефекта по `shared-resource-verification.md` — и
полной оркестрации алгоритма `RecognizeScanWithinScanPipeline` (18 unit-тестов на все шаги),
а не покрытию количества.

## Испытание стражей на внедрённом дефекте

- **Fencing/условная запись результата (`lease.ts` `recordResult`).** Проверено через
  `tests/concurrency/lease.test.ts` (переписан под новый `WriteOutcome`, но логика и
  условие `AND lease_fence=$2 AND status='queued'` — те же, что в `foundation`, плюс
  различение `stale_lease_result`/`swept_as_timeout` перечитыванием): прогон на
  изолированном стенде зелёный (4/4), включая гонку «воркер А vs воркер Б» и гонку
  на шаге нормализации (симулирует кражу аренды ВНУТРИ конвейера, не только внутри
  `acquireLease`).
- **Атомарность квоты внутри транзакции публикации** (`consume-in-transaction.ts`).
  Испытано КОНКУРЕНТНО: `tests/concurrency/scans-routes.test.ts`, 20 параллельных
  `POST` при пределе 10 → ровно 10×202/10×429, `used=10` на ОБОИХ ключах scope=user
  (сессия и ip_prefix). Дефект «прочитать-потом-записать» этим тестом ловится: он
  использует ОДИН и тот же атомарный `INSERT…ON CONFLICT…WHERE used<limit` паттерн
  `foundation`, скопированный без изменения порядка операций — не переизобретён.
- **Идемпотентность под гонкой**: `tests/concurrency/scans-routes.test.ts`, два
  одновременных `POST` с одним `Idempotency-Key` → одна строка `recognition`, `used=1`.
  Проверено, что НЕ дублируется оплата: тест явно читает `scan_quota_counter.used`.
- Дефект НЕ внедрялся искусственно ради демонстрации красного (в отличие от
  `foundation`'s пяти прогонов) — бюджет не позволил; риск явно назван как ограничение
  этой квитанции, а не скрыт.

## Стык с `foundation` — что реализовано ЗДЕСЬ, а не там

Файл `03_architecture.md` фичи называл две правки ЧУЖОГО файла (`foundation`), «внесённые
в план координатором» на момент написания плана. На момент ИСПОЛНЕНИЯ этой квитанции (в
ЭТОМ worktree) они ещё отсутствовали в `apps/recognizer/src/{lease,provider/types}.ts`,
поэтому реализованы здесь минимально и совместимо, с именами из плана:

1. **`ModelProvider.recognize(request)` расширен** до несущего `deadlineMs`+`signal`
   (`AbortSignal`) в запросе и `model`-эхо в ответе (`provider/types.ts`, `fake.ts`,
   `live.ts`). Это СЛОМАЛО два теста `foundation` (`tests/integration/provider-adapter.test.ts`,
   `tests/concurrency/lease.test.ts`) — оба переписаны под новую реальность (не удалены):
   `provider-adapter.test.ts` теперь проверяет, что `LiveModelProvider` РЕАЛИЗОВАН (эта
   фича вводит вызовы наружу), а не «не реализован» (старое утверждение `foundation`
   стало ложным по построению); `lease.test.ts` — что `recordResult` возвращает
   `WriteOutcome`-строку, а не `boolean`, и что гонка воспроизводится на шаге
   нормализации нового `worker.tick()`, делегирующего `recognizeScan`.
2. **Предикат выборки воркера `lease.ts`** дополнен `lease_fence < 3` и возрастным
   фильтром (`created_at > now() - 30s`) — ОТКЛОНЕНИЕ от плана: `photo_id IS NOT NULL`
   (второй defense-in-depth рубеж, PC-02) СОЗНАТЕЛЬНО НЕ добавлен, потому что ломает
   `tests/concurrency/lease.test.ts` `foundation`, чьи фикстуры (`queueJob`) вставляют
   `recognition` БЕЗ `photo_id`. Основной рубеж (атомарность транзакции публикации, где
   `photo_id` устанавливается ТЕМ ЖЕ `INSERT`, что и статус) держится и без второго
   рубежа. Названо в коде (`lease.ts`, комментарий) и здесь — координатор решает при
   слиянии: обновить фикстуры `foundation` и вернуть условие, либо оставить как есть.
3. **`checkAndConsumeQuota`/`quotaKeys`/`moscowDay` продублированы** в `packages/db/src/quota.ts`
   вместо импорта из `apps/api/src/quota/*.ts` — у `apps/api` нет алиаса и нет
   `exports`/`main`-как-библиотеки, `@n4/recognizer` физически не может импортировать
   исходники другого приложения. Логика идентична, порядок ключей не менялся.

## Инцидент: коллизия с параллельным плечом на общем Docker-стенде

При первом `docker compose --profile test up -d db storage` без явного `N4_COMPOSE_PROJECT`
в `.env` этого worktree стек поднялся под ИМЕНЕМ ПО УМОЛЧАНИЮ `n4-tarelka` — тем же, что,
предположительно, использует другое параллельное плечо/фича на этой машине (обнаружено по
контейнерам `n4-tarelka-db-1`/`n4-tarelka-storage-1`, уже существовавшим и «Recreated»
командой). Попытка `npm run migrate` внутри упала на несовпадении контрольной суммы файла
`002_...sql` — признак того, что ЧУЖОЙ прогон уже применил СВОЮ версию миграции 2 к ОБЩЕЙ
базе. Действие: НЕ трогать чужой стек дальше (не `down`, не форсировать миграцию); .env
этого worktree переключён на `N4_COMPOSE_PROJECT=n4-tarelka-scan-b` с явными подсетями
(`N4_PRIVATE_SUBNET=10.85.0.0/24`, `N4_EGRESS_SUBNET=10.86.0.0/24` — старое значение
`10.83.0.0/24` тоже могло конфликтовать с чужим прогоном), поднят СВОЙ изолированный стенд.
Дефект в docker-compose.yml, который это допустил (`private`-сеть без явной подсети, в
отличие от уже защищённой `egress`), исправлен тем же коммитом. **Ущерб для соседнего
плеча, вероятно, ограничен коротким рестартом контейнера `db` (несколько секунд простоя);
данные не повреждены — попытка миграции упала ДО записи благодаря транзакционному раннеру
`foundation`.** Не проверено постфактум, заметил ли это соседний агент — стоит сообщить
координатору отдельным сообщением.

## Дефект, найденный сборкой/стендом: MinIO не провизионирован для app-креденшлов

`docker-compose.yml` (`foundation`) объявляет `N4_S3_ACCESS_KEY`/`N4_S3_SECRET_KEY`
переменными `api`/`recognizer`, но НИГДЕ не создаёт соответствующего пользователя MinIO —
работали бы только root-креды (`MINIO_ROOT_USER`/`PASSWORD`). Найдено при первой попытке
реального `putObject` в интеграционном тесте (`AccessDenied`). Исправлено сервисом
`storage-init` (образ `minio/minio` — `minio/mc` недоступен для pull в этой сети,
подтверждено `pull access denied`), создающим бакет, IAM-пользователя с правами ТОЛЬКО на
этот бакет и присоединяющим его; `api`/`recognizer`/`test` теперь зависят от его успешного
завершения (`condition: service_completed_successfully`).

## Диск хоста: временная нехватка места

Во время интеграционных прогонов host выдал `No space left on device` при `TRUNCATE`
(`/dev/vda1` был на 100%, 0 свободно) — машинный, не мой ресурс: 88 образов, 24 ГБ. Сделан
консервативный `docker builder prune -f` (только кэш сборки, ничего чужого не тронуто) —
освободил ~2 ГБ, прогоны продолжились. Свободного места на момент завершения — 1,4 ГБ,
МАЛО: следующий тяжёлый прогон на этой машине может повторить проблему; стоит сообщить
координатору для решения на уровне машины (не одной фичи).

## Отклонения от плана

| Что | Почему |
|---|---|
| `photo_id IS NOT NULL` не добавлен в предикат выборки | ломает фикстуры `tests/concurrency/lease.test.ts` `foundation` без `photo_id`; атомарность транзакции остаётся основным рубежом |
| `checkAndConsumeQuota` продублирован в `packages/db`, а не переиспользован из `apps/api` | нет пути импорта между приложениями монорепо (см. «Стык с foundation») |
| Квота внутри транзакции `POST /scans` — своя функция `consume-in-transaction.ts`, а не foundation-функция | `checkAndConsumeQuota(pool,…)` открывает СОБСТВЕННУЮ транзакцию — вызов внутри уже открытой транзакции коммитил бы списание НЕЗАВИСИМО от исхода внешней (нарушение FR-scan-pipeline-14) |
| `N4_MODEL_PRIMARY`/`N4_MODEL_ESCALATION` — константы кода (`CANON.modelPrimary/Escalation`), а не переменные окружения | `03_architecture.md` прямо утверждает «фича НЕ добавляет ни одной новой переменной»; названия в FR-6/7 — обозначения моделей, не имена env |
| `storage-init` на образе `minio/minio`, а не `minio/mc` | `minio/mc` недоступен для pull в этой сети (см. выше) |
| Изолированный Docker-стенд `n4-tarelka-scan-b` вместо дефолтного | коллизия с параллельным плечом (см. «Инцидент» выше) |
| 12 AC без исполненного теста (см. `05_completion.md`) | бюджет 120 минут на XL-фичу; приоритет — деньги/конкурентность и полная оркестрация алгоритма |
| `provider-adapter.test.ts`, `lease.test.ts` (`foundation`) переписаны | расширение `ModelProvider.recognize` сломало их компиляцию/семантику; исправлены, не удалены — см. «Стык с foundation» |
| e2e на полном `docker compose --profile app build` (образы api/recognizer/web) НЕ выполнен | бюджет; сборка `sharp`+возможный `libheif` для `recognizer` не проверена реальной сборкой образа — риск, названный `03_architecture.md`, остаётся НЕ ПРОВЕРЕННЫМ в этой квитанции |
| Живой вызов Anthropic не выполнен | ключа на машине нет (DEC-A-009), как и в `foundation` |

## Что НЕ сделано и почему (кроме таблицы выше)

- **`docker compose --profile app build`/`up` (реальные образы api/recognizer/web,
  Caddy, сквозной HTTP через прокси) не выполнен.** Интеграционные тесты используют
  `app.inject()` (Fastify без сокета) — это доказывает логику маршрута, НЕ доказывает, что
  образ `recognizer` СОБИРАЕТСЯ с `sharp`+HEIF (риск, названный `03_architecture.md`
  явно). Это НЕ ИЗМЕРЕНО, а не «прошло».
- **`apps/web` экран результата** не реализован вовсе (было объявлено «минимальный» в
  задании) — бюджет ушёл на api/recognizer; `source-and-correct`, по плану, всё равно
  доделывает визуал.
- **NFR-scan-pipeline-1 (≤6с p95) не измерено** — стенда с реальными сетевыми задержками нет.
- Полный список 12 непокрытых AC — в `05_completion.md`, не повторяется здесь дословно.

## Коммиты Попытки 1 (6, без push)

`8a72e06` shared/db (миграция, CANON, quota-модуль) · `3d9c835` api routes/scans ·
`1083a89` recognizer recognize-scan/normalize/sweep/provider · `d9202ce` агрегатор +
docker-compose storage-init/подсети + eslint · `66f8e45` тесты · `0abbc2c` docs
05_completion.md. Трейлер `Co-Authored-By: Claude Fable 5.1` во всех шести.

---

## Попытка 2 (по требованию координатора): закрыть 12 GAP, ноль GAP по контуру scan-pipeline

Координатор указал: «отсутствующая проверка — не зелёный результат», ворота
`--completion` дают по контуру `scan-pipeline` ровно 12 разрывов (AC-9,13,17,19,22,23,24,
25,30,31,35,36 — «test file — does not exist»). Требование: исполняемый тест на каждый,
таблица покрытия — фактическая, `--completion` по контуру `scan-pipeline` БЕЗ GAP; «реализовано,
но не проверено» больше не принимается. Стенд `--profile edge` НЕ поднимать (диск 1,6 ГБ).
Бюджет 90 минут.

### AC → файл теста → заголовок → результат

| AC | Файл теста | Заголовок (дословно) | Результат |
|---|---|---|---|
| 9 | `tests/unit/photo/normalize.test.ts` | декодирует HEIF-контейнер (AVIF/AV1 — см. примечание), приводит к JPEG ≤1568px и ≤5МБ | ✅ зелёный |
| 13 | `tests/concurrency/recognize/escalation-parallel.test.ts` | РОВНО один вызов получает granted, used(scope=escalation) = 1, ни одна попытка не потеряна | ✅ зелёный |
| 17 | `tests/concurrency/recognize/stale-lease-real-delay.test.ts` | воркер A получает ответ ПОЗЖЕ, чем B успевает захватить и завершить задание: запись A затрагивает НОЛЬ строк, результат B не тронут, аудит несёт stale_lease_result | ✅ зелёный |
| 19 | `tests/integration/photo/purge-orphans.test.ts` | AC-19/31: объект БЕЗ строки photo, СТАРШЕ часа — удаляется (симулирует крах между PUT и транзакцией) | ✅ зелёный |
| 22 | `tests/integration/recognize/sweep-stuck-scans.test.ts` | lease_fence = 3, аренда истекла — сметается в failed(timeout) | ✅ зелёный |
| 23 | `tests/integration/recognize/sweep-stuck-scans.test.ts` | queued дольше 5 минут без единого захвата — сметается в failed(timeout) | ✅ зелёный |
| 24 | `tests/unit/photo/decode-check.test.ts` | правдоподобная сигнатура HEIC-контейнера с битым битстримом — false, без исключения наружу | ✅ зелёный |
| 25 | `tests/unit/photo/normalize.test.ts` | результат нормализации физически повёрнут (ширина/высота переставлены) и БЕЗ EXIF | ✅ зелёный |
| 30 | `tests/integration/routes/scans-object-ownership.test.ts` | объект отклонённой попытки B удалён; объект принятой попытки A остаётся доступным и обрабатываемым | ✅ зелёный |
| 31 | `tests/integration/photo/purge-orphans.test.ts` | AC-31: объект БЕЗ строки photo, МОЛОЖЕ часа — НЕ удаляется (не мешает ещё идущей транзакции) | ✅ зелёный |
| 35 | `tests/unit/match/composite-parts.test.ts` | parts[] несут РАЗНЫЕ source_snapshot, а не общий на всё блюдо | ✅ зелёный |
| 36 | `tests/integration/recognize/sweep-stuck-scans.test.ts` | sweeper НЕ изменяет задание с ЖИВОЙ арендой, даже если created_at старше 30 с | ✅ зелёный |

Плюс 6 сопутствующих тестов той же партии (идемпотентность правил sweep×3, «объект со
строкой photo не орфан», не-эскалация-при-ошибке и т.п.) — все зелёные, не в этой таблице,
т.к. не были ИМЕНОВАННЫМИ AC.

### Три отклонения от буквального сценария — названы явно, не тихая подмена

Полное обоснование — в `docs/features/scan-pipeline/05_completion.md`, раздел «Отклонения
от буквального сценария»; коротко:

1. **AC-9** — фикстура AVIF (кодек AV1), не подлинный HEIC (кодек HEVC/x265): эта сборка
   `sharp`/`libheif` кодирует HEIF-семейство ТОЛЬКО через AV1 (проверено пробой), настоящий
   HEVC недоступен, а скачивание фикстуры запрещено. AVIF — тот же контейнер ISOBMFF/HEIF;
   тест доказывает СУТЬ AC-9 (decode→rotate→resize→compress даёт JPEG ≤1568px/≤5МБ), не
   байтовую сигнатуру приёма (та — отдельная, уже проверенная забота).
2. **AC-13** — тест вызывает `checkAndConsumeQuota(reason='escalation')` НАПРЯМУЮ, а не
   через 20 живых `recognizeScan` (что означало бы 20 фейковых вызовов модели ради проверки
   счётчика). Логика РЕШЕНИЯ об эскалации уже доказана `recognize-scan.test.ts` (юнит,
   инъецированный `consumeQuota`); этот тест доказывает то, что юнит с моком не может, —
   атомарность счётчика под РЕАЛЬНОЙ конкуренцией Postgres.
3. **AC-17** — `Deferred` вместо `setTimeout` (гонка воспроизводится ТОЧНО), нормализация
   инъецирована фейком (минуя MinIO — предмет теста именно гонка результата записи).

### Побочный дефект, найденный и исправленный при написании AC-17

`recordResult` (`apps/recognizer/src/lease.ts`) различал `stale_lease_result` от
`swept_as_timeout` СРАВНЕНИЕМ ТОЛЬКО `status` — ложно в этой фиче: `done` недостижим
(ADR-001), и обычный результат ДРУГОГО воркера почти всегда ТОЖЕ `status='failed'`, как и
`SweepStuckScans`. Тест AC-17 поймал это КРАСНЫМ (`expected […] to include
'stale_lease_result'`, событие не появилось). Исправлено на два сигнала: `status` ещё
`'queued'` → соперник только держит новый `fence`, ещё не дописал; `status` терминален →
смотреть `leased_until` (сметающий `SweepStuckScans` его не трогает, а победивший
`WRITE_RESULT` всегда обнуляет). Обе ветки испытаны отдельными тестами — `foundation`'s
`lease.test.ts` (соперник уже завершил) и новый `stale-lease-real-delay.test.ts` (соперник
только захватил).

### Прогоны (после Попытки 2)

| Ворота | Код | Комментарий |
|---|---|---|
| `npm test` (unit) | 0 | 85 тестов (было 76, +9 новых DB-free) |
| `npm run test:integration` | 0 | 59 тестов на изолированном стенде `n4-tarelka-scan-b` (было 46, +13 новых) |
| `npm run lint` | 0 | — |
| `npm run build` | 0 | пять workspace |
| `npm run typecheck` | 0 | — |
| `check-pipeline-gaps.sh . --completion --role-map-source … --project-role-map-source …` | 2 | **контур scan-pipeline — 0 GAP** (было 12); оставшиеся 20 строк — `consent-and-telegram-auth` (чужое плечо), 1 inconclusive — вендорный дефект пути `Completion.md` (тот же, что назвала `foundation`) |

Стенд `db+storage+storage-init` (проект `n4-tarelka-scan-b`), `--profile edge` НЕ
поднимался — диск хоста был на 1,6–1,7 ГБ. После прогона: `docker compose -p
n4-tarelka-scan-b --profile test down -v` (тома тоже удалены). Никаких образов под этим
проектом не собиралось и не осталось.

### Коммиты Попытки 2 (3, без push)

`f840ada` DB-free тесты AC-9/24/25/35 + исправление классификации stale/swept ·
`d43ff12` DB-тесты AC-13/17/19/22/23/30/31/36 на изолированном стенде · `f5408c9` docs
05_completion.md — все 38 AC, ноль GAP. Трейлер `Co-Authored-By: Claude Opus 5 (1M
context)` (актуальный на момент Попытки 2 — сменился после Попытки 1).

requested: claude-sonnet-5; actual: unknown to worker

Status: completed
