# Фича `scan-pipeline` — архитектура

Системная архитектура принадлежит [`docs/Architecture.md`](../../Architecture.md) и здесь не
переписывается: ниже только то, что создаёт ЭТА фича, поверх каркаса `foundation`
([`../foundation/03_architecture.md`](../foundation/03_architecture.md)).

## Размещение по пакетам и сервисам

| Требование фичи | Пакет / сервис | Файлы (целевые) |
|---|---|---|
| FR-scan-pipeline-1 приём и валидация | `apps/api` | `src/routes/scans.ts`, `src/photo/validate-content.ts` (сигнатура по байтам, decompression-bomb), `src/photo/store-original.ts` (загрузка в MinIO) |
| FR-scan-pipeline-2 идемпотентность | `apps/api` | `src/routes/scans.ts` (заявка `INSERT … ON CONFLICT DO NOTHING`) |
| FR-scan-pipeline-3 квота | `apps/api` | вызывает `src/quota/check-and-consume.ts` (`foundation`, не создаётся заново) |
| FR-scan-pipeline-4 сохранение и ответ | `apps/api` | `src/routes/scans.ts`, `src/photo/store-original.ts` |
| FR-scan-pipeline-5 нормализация | `apps/recognizer` | `src/photo/normalize.ts` (`sharp` + `libheif`) |
| FR-scan-pipeline-6 вызов модели | `apps/recognizer` | `src/provider/anthropic.ts` (реализация `ModelProvider` из `foundation`), `src/recognize/validate-ranges.ts` |
| FR-scan-pipeline-7 эскалация | `apps/recognizer` | `src/recognize/escalate.ts` |
| FR-scan-pipeline-8 порт сопоставления | `apps/recognizer` | `src/match/port.ts` (интерфейс `MatchIngredientPort`), `src/match/null-port.ts` (`NullMatchIngredientPort`) |
| FR-scan-pipeline-9 чтение статуса | `apps/api` | `src/routes/scans.ts` (`GET /scans/{id}`) |
| FR-scan-pipeline-10 частота | `apps/api` | `src/http/rate-limit-scans.ts` (расширяет `foundation` `src/http/rate-limit.ts`) |
| FR-scan-pipeline-11 уборка фото | `apps/recognizer` (cron-подобная задача, не HTTP) | `src/photo/purge-expired.ts` |
| FR-scan-pipeline-12 наблюдаемость | `apps/recognizer` | `src/observability/model-call-log.ts` |
| FR-scan-pipeline-13 живой провайдер | `apps/recognizer` | `src/provider/anthropic.ts` |
| FR-scan-pipeline-14 атомарная публикация | `apps/api` | `src/routes/scans.ts` (генерация `recognition_id`/`object_key` ДО `PUT`, короткая транзакция `photo`+`recognition`+квота), `src/photo/purge-orphans.ts` (шаг 12, уборка объектов без строки `photo`) |
| FR-scan-pipeline-15 повторный захват списывает квоту | `apps/recognizer` | `src/recognize/recognize-scan.ts` (шаги 1а/3 — решение о повторном списании по `fence`/`day`) |
| FR-scan-pipeline-16 дедлайны и sweeper | `apps/recognizer` | `src/recognize/sweep-stuck-scans.ts` (`SweepStuckScans`, отдельный шаг цикла опроса, не отдельный процесс) |
| FR-scan-pipeline-17 ограниченная декодируемость | `apps/api` | `src/photo/validate-content.ts` (`sharp(buffer, {limitInputPixels}).metadata()` + декодирование одной страницы) |
| FR-scan-pipeline-18 сутки по моменту попытки | `apps/api`, `apps/recognizer` | `src/routes/scans.ts` (день `POST`), `src/recognize/recognize-scan.ts` (день ПЕРЕД вызовом, шаг 3) — общая функция `day(now, 'Europe/Moscow')` в `packages/shared/src/domain/time.ts` |
| FR-scan-pipeline-19 владение объектом | `apps/api` | `src/photo/store-original.ts` (`object_key = device_session_id/recognition_id.ext`, удаление СВОЕГО объекта при откате) |
| FR-scan-pipeline-20 общий бюджет задачи | `apps/recognizer` | `src/recognize/recognize-scan.ts` (шаги 1а/2/4 — `AbortSignal` на нормализацию и на вызов модели, каждый со своим таймером) |
| FR-scan-pipeline-21 агрегатор журнала | `scripts/telemetry/` | `scripts/telemetry/model-calls.sh` (или `.cjs`) — читает JSON-журнал `api`/`recognizer` за сутки, группирует по `attempt_id`, печатает счётчики `reason`/`outcome`/`model` и суммарное `ms`; НЕ сервис compose, вызывается по требованию |

Доменная логика (`recognize/`, `match/`, `photo/normalize.ts`) не знает ни `FastifyRequest`, ни
клиента `pg`, ни формы ответа Anthropic SDK: `src/provider/anthropic.ts` — единственный адаптер,
переводящий чужой ответ в `StructuredAnswer` интерфейса `ModelProvider` (`foundation`,
`apps/recognizer/src/provider/types.ts`). `apps/recognizer` не принимает HTTP-запросов извне
(`foundation`, границы, не меняется).

## Структура каталогов (добавления к `foundation`)

```
apps/
├── api/src/
│   ├── routes/scans.ts               # POST /scans, GET /scans/{id}
│   ├── photo/
│   │   ├── validate-content.ts       # сигнатура по байтам, decompression-bomb, размер/разрешение
│   │   └── store-original.ts         # загрузка оригинала в приватный бакет, expires_on
│   └── http/rate-limit-scans.ts      # расширение foundation-хука: 30/мин POST, 120/мин GET
└── recognizer/src/
    ├── photo/
    │   ├── normalize.ts              # HEIC→JPEG, ≤1568px, ≤5МБ, EXIF-strip
    │   └── purge-expired.ts          # PurgeExpiredPhotos
    ├── provider/anthropic.ts         # LiveModelProvider (Anthropic Messages API)
    ├── recognize/
    │   ├── validate-ranges.ts        # диапазоны confidence/mass_g/items после разбора
    │   └── escalate.ts               # решение об эскалации, CheckAndConsumeQuota(reason=escalation)
    ├── match/
    │   ├── port.ts                   # интерфейс MatchIngredientPort
    │   └── null-port.ts              # NullMatchIngredientPort (эта фича)
    └── observability/model-call-log.ts

tests/
├── unit/          photo/validate-content, recognize/validate-ranges, recognize/escalate (граница 0,59/0,60, unit с FixedMatchIngredientPort)
├── integration/   routes/scans (multipart, идемпотентность, квота, 404), photo/normalize (HEIC фикстура), provider/anthropic (контракт схемы, фейк как эталон формы)
└── concurrency/   routes/scans (идемпотентность под гонкой, квота primary под нагрузкой), recognize (эскалация 20×/остаток 1, устаревшая аренда с управляемой задержкой фейка)
```

## Зависимости npm (добавления к `foundation`)

| Пакет | Мажор | Где | Зачем |
|---|---|---|---|
| `sharp` | 0.33 | `apps/recognizer` | декодирование/перекодирование/ресайз/сжатие; поддержка HEIF — НЕ данность стандартной сборки libvips (см. ниже) |
| `@anthropic-ai/sdk` | 0.75 | `apps/recognizer` | клиент Anthropic Messages API (vision + structured outputs) для `LiveModelProvider` |
| `file-type` | 19 | `apps/api` | определение MIME по сигнатуре байтов, а не по заголовку/расширению |
| `minio` | 8 | `apps/api`, `apps/recognizer` | клиент MinIO: загрузка оригинала (`api`), чтение/запись нормализованной копии (`recognizer`), presigned URL |

**`sharp` с поддержкой HEIF — риск, названный явно (`.claude/rules/coding-style.md`).** Стандартная
сборка `libvips`, на которой основан `sharp`, HEIF НЕ включает по умолчанию (лицензионные
ограничения кодека HEVC). Требуется либо `sharp` с флагом сборки `--with-heif` на базе `libheif`,
либо отдельная библиотека декодирования HEIC (`heic-convert` / `libheif-js`) ПЕРЕД передачей в
`sharp`. Проверяется ПЕРВОЙ сборкой образа `recognizer` тестом на фикстуре реального HEIC-файла
iPhone, а не предположением; если флаг недоступен в базовом Alpine/Debian образе, `Dockerfile`
получает отдельный `apt-get install libheif-dev` (Debian slim) — Alpine-вариант помечается риском
из-за более раннего мусклового набора кодеков и требует отдельной проверки при первой сборке.

## External Dependencies

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| принимает изображение в теле запроса и анализирует его | Anthropic Messages API (vision) | цитата уже подтверждена и приведена в `docs/Architecture.md`, External Dependencies, строка 1 — не повторяется здесь дословно, ссылка обязательна | CONFIRMED (унаследовано) | FR-scan-pipeline-5, FR-scan-pipeline-6 |
| принимает изображения ТОЛЬКО в четырёх форматах и не больше 10 МБ | Anthropic Messages API (vision) | `docs/Architecture.md`, External Dependencies, строка 2 | CONFIRMED (унаследовано) | FR-scan-pipeline-5, FR-scan-pipeline-6 |
| возвращает ответ, обязанный соответствовать заданной JSON-схеме | Anthropic Messages API (structured outputs) | `docs/Architecture.md`, External Dependencies, строка 4; граница подтверждённого — ТИП и ФОРМА, не `minimum`/`maximum`/`maxItems` (см. FR-scan-pipeline-6) | CONFIRMED (унаследовано) | FR-scan-pipeline-6, FR-scan-pipeline-7 |
| генерирует временную подписанную ссылку для PUT (загрузка) и GET (чтение) объекта в приватном бакете | MinIO JavaScript SDK, методы `presignedPutObject` / `presignedGetObject` | Первоисточник `min.io/docs/minio/linux/developers/javascript/API.html` вернул `404` при проверке 2026-09-12 (страница переехала/переименована в рамках миграции документации MinIO на `docs.min.io`); вторичная проверка по исходнику пакета через DeepWiki (`deepwiki.com/minio/minio-js/4.3-presigned-urls`, читает `README.md`/JSDoc репозитория `minio/minio-js`), дословно: «`presignedGetObject` — Convenience method for generating presigned download URLs. Internally calls `presignedUrl` with `GET` method»; «`presignedPutObject` — Convenience method for generating presigned upload URLs. Internally calls `presignedUrl` with `PUT` method»; «Expiry time in seconds (optional, default: 604800)»; «Maximum Expiry: 7 days (604800 seconds)» | CONFIRMED — способность существует и синтаксис назван, ИСТОЧНИК ВТОРИЧНЫЙ (агрегатор по исходнику пакета, не страница вендора: прямой URL документации MinIO не открылся при проверке). Наш срок ≤ 15 минут (900 с) СТРОГО внутри допустимого окна 1 с…604800 с | FR-scan-pipeline-4, FR-scan-pipeline-9, NFR-scan-pipeline-2 |

**Отклонение от обычного формата этой таблицы — явно.** Остальные строки проекта цитируют страницу
вендора напрямую (`Architecture.md` — 8 строк, все CONFIRMED первоисточником). Для MinIO
first-party-страница вернула `404` на прямой запрос 2026-09-12; вместо того чтобы промолчать об
этом или подставить непроверенную догадку (`honest-configuration.md` CFG-I4: недоступность источника
истины — отказ, а не «наверное, всё хорошо»), несоответствие названо, и вердикт снижен до
вторичного источника с указанием, ПОЧЕМУ. Перепроверить первоисточник — задача, не заслуга плана:
`https://docs.min.io/aistor/developers/sdk/javascript/api/` отвечает, но не отдаёт нужный раздел
статическим HTML (страница на JS-рендеринге) — WebFetch получает урезанный текст.

**Чего в этом списке нет и почему.** USDA FoodData Central не вызывается в этой фиче вовсе:
матчинг стоит за `NullMatchIngredientPort`, обращения к внешнему API нет (см.
`01_specification.md` «Стык с `source-and-correct`»). Telegram Bot API и Usage & Cost Admin API —
не предмет этой фичи, они уже в инвентаре `docs/Architecture.md`.

## Переменные окружения

Фича НЕ добавляет ни одной новой переменной — все нужные уже объявлены и провалидированы
`ValidateRuntimeConfig` (`foundation`, `FR-foundation-2`): `S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY`
(потребитель — `store-original.ts`, `normalize.ts`, `purge-expired.ts`), `N4_MODEL_PROVIDER` и
`ANTHROPIC_API_KEY` (потребитель — `provider/anthropic.ts`, впервые РЕАЛЬНО используется в этой
фиче при `live`), `N4_SCAN_LIMIT_USER/DAY`, `N4_ESCALATION_LIMIT_DAY` (потребитель —
`escalate.ts`, впервые РЕАЛЬНО списывает четвёртый ключ). Фича — первый ПОТРЕБИТЕЛЬ этих значений;
их ВАЛИДАЦИЯ и стражи (`AC-foundation-2/3/11`) остаются заслугой `foundation` и здесь не
переиспытываются заново, кроме как в сквозном прогоне.

## Зависимости от `foundation`, требующие правки (DEC-A-015, PC-02/PC-03/PC-09)

Ревизия 2 плана обнаружила ДВЕ точки, где корректность этой фичи опирается на поведение, которого в
`foundation` (Попытка 1 её собственного плана) ещё НЕТ. Обе — правки ЧУЖОГО файла
(`docs/features/foundation/02_pseudocode.md`), и эта квитанция их НЕ вносит — только называет и
маршрутизирует координатору:

1. **Предикат выборки воркера** (`LeaseRecognitionJob`) обязан требовать `photo_id IS NOT NULL` И
   `lease_fence < 3` в дополнение к текущему `status = 'queued' AND (leased_until IS NULL OR
   leased_until < now())`. Без первого условия — defense-in-depth рубеж атомарной публикации
   (`FR-scan-pipeline-14`) остаётся без второй линии защиты (первая, главная — атомарность самой
   транзакции, всё ещё держит инвариант). Без второго условия — предел захватов `lease_fence ≤ 3`
   (`FR-scan-pipeline-16`) не защищён на уровне запроса: `SweepStuckScans` продолжит подчищать
   последствия, но воркеры будут пытаться захватывать задания, обречённые на `failed(timeout)`.
2. **`ModelProvider.recognize(image, schema)`** расширяется до `recognize(image, schema, { model,
   deadlineMs, signal: AbortSignal })` — третий параметр добавлен в Попытке 6 (PC2-02): без него
   `AbortController` этой фичи не способен физически прервать HTTP-вызов внутри адаптера. **Статус
   (PC-09): ВНЕСЕНО в план `foundation` — сообщение координатора от 2026-09-12 20:33, исполнитель
   `foundation` реализует правку параллельно.** Эта фича проверяет расширенный контракт СВОИМ тестом
   транспортного адаптера (`AC-scan-pipeline-29`: фейк возвращает переданный `model`, эскалация
   обязана нести `N4_MODEL_ESCALATION`) — не полагается на одно сообщение как на доказательство, а
   держит проверку на своей стороне границы.

**Если координатор НЕ переносит эти правки в `foundation` до Phase 3**, единственный резервный путь —
обернуть оба интерфейса локальной адаптирующей прослойкой в `apps/recognizer` этой фичи (дублирует
логику предиката и добавляет параметры на границе вызова, не трогая сам `foundation`); это ХУЖЕ
архитектурно (два места, где формулируется одно правило) и потому не выбрано планом по умолчанию.

## Границы, которые фича обязана сохранить

- `web` по-прежнему не получает ни одного секрета и не участвует в этой фиче: приём фото происходит
  через `api`, вызов модели — только через `recognizer` (`.claude/rules/secrets-management.md`).
- Соединение с базой НЕ удерживается во время вызова Anthropic Messages API: аренда закрывает
  транзакцию ДО `NormalizePhotoForModel` и ДО `ModelProvider.recognize` (NFR-scan-pipeline-1/3,
  `foundation` `LeaseRecognitionJob`, не переопределяется).
- `db` и `storage` не публикуют портов (без изменений к `foundation`).
- Живой вызов Anthropic делается ТОЛЬКО из `recognizer`; `ANTHROPIC_API_KEY` не покидает этот сервис
  ни в журнале (редактор запрещённых значений `foundation`), ни в ответе API.
