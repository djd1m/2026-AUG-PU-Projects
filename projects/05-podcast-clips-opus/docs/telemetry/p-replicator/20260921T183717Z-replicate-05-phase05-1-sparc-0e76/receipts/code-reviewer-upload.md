# Квитанция — независимое ревью `upload-and-quota`

| Поле | Значение |
|---|---|
| WORK_UNIT_ID | `code-reviewer-upload-attempt-1` |
| RUN_ID | `20260921T183717Z-replicate-05-phase05-1-sparc-0e76` |
| Ревьюер | Claude Opus 5 (`claude-opus-5[1m]`), семейство Anthropic — cross-family review, OWN-002 |
| Автор кода | Codex `gpt-6-astra` (хостом не аттестован) |
| Ревизия | `10991a38a3adac8523cff491123d8d1b0227e0de` |
| Дата | 2026-09-22 |
| Файл ревью | `docs/features/upload-and-quota/08_review_report.md` |
| Код | НЕ правился; рабочее дерево проекта ревью не меняло |

## Прочитано

Постановка `00_brief_codex.md`, самоотчёт `07_code_report.md` (246 строк, критически),
`codex-last-message.md`. Код целиком: `packages/s3/src/{client,presign,multipart,operations,index}.ts`,
`packages/db/src/{index,quota,migrate}.ts`, `packages/shared/src/{config,upload}.ts`,
`apps/web/src/server/{video,upload-contract,upload-handler,upload-runtime,media-type,trpc,ip,
rate-limit,runtime}.ts`, `apps/web/src/lib/upload-parts.ts`, оба новых маршрута,
миграции `001_init.sql`/`003_upload.sql`/`004_ipv6_prefix_masklen.sql`, тесты
`upload.integration`, `upload-guards`, `upload-route`, `s3`, `ip-prefix`, `database.integration`,
раннер `scripts/test-upload-mutations.mjs`.
Контракты: `CLAUDE.md`, `.claude/rules/{security,coding-style,testing}.md`, `docs/canon.md`,
`docs/Pseudocode.md` (CreateVideo, CompleteUpload, CheckAndConsumeQuota, RefundUploadSlot),
`docs/Architecture.md`, `docs/reuse-map.md`. Корневые правила:
`shared-resource-verification`, `security-operation-order`, `fail-closed-defaults`,
`guard-must-be-able-to-fail`, `model-call-cost`, `deployment-seams`.
Клон: `.reference/jan-clone/packages/s3/src/{client,presign,multipart,operations}.ts`,
`myinsights/INS-007`.

## ЗАПУЩЕНО (Docker доступен, в отличие от сессии исполнителя)

| Проверка | Код / результат |
|---|---|
| `docker compose --project-directory . --profile test run --build --rm test` | **0** — **132 passed / 132**, 18 файлов, 24,61 с, пропущенных НОЛЬ |
| `node scripts/test-upload-mutations.mjs` (в контейнере) | **0** — три стража: `clean exit 0` / `mutant exit 1` каждый |
| probe A — потолок 5 с на `CompleteMultipartUpload` | `elapsed_ms=15092`, `TimeoutError … configured 5000 ms requestTimeout` |
| probe B — `pg_stat_activity` во время вызова S3 | `state="idle in transaction"` |
| probe C — возврат слота через границу суток | `{"returned":true,"refunds_today":1,"uploads_yesterday":0,"uploads_today":2}` |
| probe D — путь `stalled` целиком | `failed/stalled`, `uploads_used:1`, повтор против ЗДОРОВОГО хранилища → **409** |
| probe E — исчерпание пула `max:10` | посторонний `SELECT 1` → `timeout exceeded when trying to connect`, 3001 мс |
| probe — миграция 004 | `/64` под ограничением 001 → `session_ip_prefix_check`; 004 поверх `2001:d00::/24` → `violated by some row` |
| `node ../../.claude/hooks/check-ports.cjs .` | **0** |
| `node ../../.claude/hooks/check-model-cost.cjs .` | **0** |
| `bash scripts/check-env-wiring.sh` | **0** |
| `node ../../.claude/hooks/check-look-trace.cjs .` | **0** |
| `node ../../.claude/hooks/check-file-ownership.cjs .` | **0** |
| `grep -rn 'quota_counter' apps packages --include=*.ts` | второго пути списания НЕТ |

Пробные файлы лежали во временном каталоге сессии и монтировались в контейнер только на чтение.

## Находки

| Серьёзность | Идентификаторы |
|---|---|
| **blocker** | **RU-001** потолок 5 с на `CompleteMultipartUpload` → `failed(stalled)` без возврата слота и без права на повтор (409) · **RU-002** сетевые вызовы S3 ВНУТРИ транзакции БД → 10 одновременных загрузок исчерпывают общий с входом пул |
| **high** | **RU-003** 900 с + последовательная отправка + отсутствие возобновления ⇒ заявленные 2 ГБ недостижимы ниже ~17,8 Мбит/с |
| **medium** | **RU-004** возврат через границу суток тратит сегодняшнее право, уменьшая вчерашний счётчик · **RU-005** отказанная попытка навсегда оставляет строку `video`, потолка нет · **RU-006** один ограничитель на вход и загрузку, ключ только по префиксу IP |
| **low** | **RU-007** миграция 004 отказывает на базе со старым IPv6 `/24` · **RU-008** отказ `abort` оставляет объект и подменяет 422 на 503 · **RU-009** таймаут `initiate` оставляет сироту multipart · **RU-010** отчёт называет механизм таймаута, но не его последствие |

RU-001 и RU-002 — один корень: лечение RU-002 таймаутом и есть RU-001.

## Вердикт

**ВЕРНУТЬ** — два blocker, оба измерены исполнением, оба невидимы на MinIO.
Остальное проверено и опровергнуть не удалось: форма списания, порядок операций, идемпотентность,
возврат слота, граница файла, владение и коды, перенос из клона (INS-004/007/009/024), четыре
конкурентных теста, три стража.

Расхождение самоотчёта — в пользу кода: заявлено 107 passed / 25 skipped и `Status: failed`,
фактически 132/132. Мест, где отчёт утверждает БОЛЬШЕ сделанного, не найдено; единственный пробел —
умолчание о последствии таймаута (RU-010).

## НЕ проверено

Настоящий браузер (прямой PUT, предполёт, CORS) · Cloud.ru Object Storage (всё на MinIO) ·
объекты больше 11 MiB и физические 2 ГБ · развёрнутый стенд и сквозной путь человека ·
нагрузка сверх 10 соединений · фактическая модель исполнителя · `npm audit` ·
`media-type.ts` на реальном разнообразии контейнеров.

Status: completed
