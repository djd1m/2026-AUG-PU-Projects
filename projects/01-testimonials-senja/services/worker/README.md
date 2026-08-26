# services/worker

Фоновый обработчик очереди видео-транскрипции и очистки `rate_limit_events`. Читай вместе с
[`docs/Architecture.md`](../../docs/Architecture.md) §5 и §3.4,
[`docs/Pseudocode.md`](../../docs/Pseudocode.md) §1.1 и
[`.claude/rules/security.md`](../../.claude/rules/security.md) §4-5.

## Что делает

1. **Очередь транскрипции** (`src/transcribe-job.ts`, Architecture §5): забирает строки
   `testimonials` со статусом `transcript_status = 'pending'` через
   `SELECT ... FOR UPDATE SKIP LOCKED`, формирует presigned GET URL из
   `video_object_key` (не из `video_url` — канон Architecture §10), вызывает единственный
   tool `services/mcp-claude` (`transcribe_video`), пишет `transcript`/`transcript_source`/
   `transcript_status` обратно.
2. **Очистка `rate_limit_events`** (`src/cleanup-job.ts`, Architecture §3.4): раз в час
   удаляет строки старше 24 часов из единой таблицы, обслуживающей три анти-фрод
   требования (FR-NFR-SEC-003, FR-GROWTH-004, FR-GROWTH-005).

Worker **не имеет** `ANTHROPIC_API_KEY` и никогда не вызывает Claude API напрямую — только
HTTP к `services/mcp-claude` (ADR-005, coding-style.md §1). Секрет физически недостижим из
этого процесса.

## `SELECT ... FOR UPDATE SKIP LOCKED` — что это гарантирует и чего не гарантирует

Гарантирует: два параллельных экземпляра воркера никогда не обработают одну и ту же строку
дважды — `tests/skip-locked.test.ts` проверяет это на реальной Postgres.

**Осознанный компромисс** (см. подробный комментарий в `src/transcribe-job.ts`): транзакция,
держащая блокировку строки, остаётся открытой на всё время обработки — включая сетевой вызов
к `mcp-claude` (скачивание видео + Claude API, потенциально десятки секунд). Альтернатива
(промежуточный статус `in_progress` + короткие транзакции) потребовала бы четвёртого значения
enum `transcript_status`, а канон Architecture §10 явно фиксирует ровно три
(`pending`/`completed`/`failed`). При масштабе одной MVP-недели длинная транзакция — приемлемая
цена за то, чтобы не расходиться с зафиксированным каноном схемы.

## Presigned URL никогда не попадает в БД

`src/storage.ts` генерирует presigned GET URL из `video_object_key` по требованию, с TTL
10 минут (`WORKER_PRESIGNED_TTL_SECONDS`, Pseudocode §1.1). URL передаётся в `mcp-claude`
через MCP-вызов и забывается сразу после — ни в одной таблице `video_url`/presigned-ссылка не
хранится (Architecture §5, §10).

## Почему прямой SQL, а не `@proofwall/db`

`packages/db` на момент генерации этого сервиса (Phase 2 `/start`) собирает параллельный
агент в этом же прогоне — его экспортируемый API ещё не зафиксирован (см. системное сообщение
сессии: другие активные агенты — `pkg-db`, `pkg-widget`). Запросы к `testimonials` и
`rate_limit_events` в `src/db.ts`/`src/transcribe-job.ts`/`src/cleanup-job.ts` написаны прямым
SQL по снипетам из Architecture.md §5 и §3.4 — самодостаточно, не блокируется на чужой работе.
Миграция на общий помощник `packages/db`, когда он появится (`rateLimitCount`/`rateLimitRecord`/
`rateLimitRevoke` по coding-style.md §4), — механическая замена внутри этих файлов, контракт
вызывающего кода (`claimAndProcessOneTestimonial`, `cleanupRateLimitEvents`) не меняется.

## Исправление Dockerfile (Phase 2)

`ffmpeg` перенесён из `services/worker/Dockerfile` в `services/mcp-claude/Dockerfile` —
извлечение аудио-дорожки закреплено за mcp-claude (Architecture §5, шаги 3-4), worker передаёт
только presigned URL. Подробное обоснование — `services/mcp-claude/README.md` раздел
«Исправление Dockerfile».

## Тесты

```bash
npm install
npm test              # юнит-тесты transcribe-job.ts/cleanup-job.ts (без БД)
TEST_DATABASE_URL=postgres://... npm test   # + интеграционные тесты SKIP LOCKED
```

`tests/skip-locked.test.ts` и часть `tests/transcribe-job.test.ts` требуют реальную тестовую
Postgres (testing.md §1: "Integration ... с реальной тестовой Postgres") — они автоматически
пропускаются (`describe.skipIf`), если `TEST_DATABASE_URL` не задан, и создают минимальную
таблицу `testimonials` (только поля, нужные этому сервису) в своём `beforeAll`/`afterAll` —
полная схема из `packages/db` здесь не предполагается.

## Разработка

```bash
npm install
cp ../../.env.example ../../.env
npm run dev      # tsx watch, локально без Docker (нужен доступный mcp-claude и Postgres)
npm run build    # tsc → dist/index.js (то, что запускает Dockerfile)
```

## [GAP] Политика повторных попыток

Architecture §5, дословно: `[GAP: политика повторных попыток — вне scope MVP-недели]`.
`transcript_status = 'failed'` — терминальное состояние в этой реализации; ручной или
автоматический retry не реализован и не спроектирован — отзыв остаётся видимым и модерируемым
без транскрипта (Pseudocode §1.1).
