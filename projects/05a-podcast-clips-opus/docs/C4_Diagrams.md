# C4 — проект 05a «ClipMkr»

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** architecture · 2026-09-23
Имена контейнеров, очередей и таблиц — из [`canon.md`](canon.md); решения — [`ADR.md`](ADR.md); пояснения —
[`Architecture.md`](Architecture.md). Диаграммы в синтаксисе Mermaid C4.

## Уровень 1 — System Context

```mermaid
C4Context
  title ClipMkr — контекст системы
  Person(author, "Автор", "Подкастер: загружает запись, получает клипы, публикует их сам")
  Person(viewer, "Зритель", "Видит клип со знаком clipmkr.ru в чужой ленте")
  Person(operator, "Оператор", "Заводит партнёров, проверяет ссылки на публикации, смотрит расход")
  Person(partner, "Партнёр", "Автор с аудиторией; раздаёт ссылку /p/{partner_code}")
  System(clipmkr, "ClipMkr", "Длинное видео → вертикальные клипы с субтитрами, спикерами и объяснимой оценкой")
  System_Ext(openrouter, "OpenRouter", "STT с диаризацией; anthropic/claude-sonnet-5")
  System_Ext(openai, "OpenAI API", "Запасной STT gpt-4o-transcribe-diarize, включается конфигурацией")
  System_Ext(s3, "Cloud.ru Object Storage", "Исходники и клипы (S3)")
  System_Ext(smtp, "Resend", "SMTP smtp.resend.com:465; письма подтверждения с домена clipmkr.ru")
  System_Ext(social, "Площадки", "TikTok, YouTube Shorts, VK, Telegram, Rutube, Дзен — автор публикует вручную")
  Rel(author, clipmkr, "Регистрируется, загружает, смотрит, скачивает, возвращает ссылку", "HTTPS")
  Rel(author, social, "Публикует клип сам")
  Rel(viewer, social, "Смотрит клип")
  Rel(viewer, clipmkr, "Набирает clipmkr.ru или открывает /c/{clip_code}", "HTTPS")
  Rel(partner, clipmkr, "Приводит по /p/{partner_code}", "HTTPS")
  Rel(operator, clipmkr, "/admin/publications, /admin/metrics; неделя: ops partner-add, ops spend-today", "HTTPS / CLI")
  Rel(clipmkr, openrouter, "Транскрипция и выбор фрагментов", "HTTPS")
  Rel(clipmkr, openai, "Только при STT_PROVIDER=openai", "HTTPS")
  Rel(clipmkr, s3, "Подписанные ссылки, чтение и запись объектов", "HTTPS/S3")
  Rel(clipmkr, smtp, "Письмо подтверждения", "SMTP")
```

Граница системы: продукт ничего не публикует от имени автора и не открывает ссылки на посты — проверка
публикаций ручная (ADR-014).

## Уровень 2 — Containers

```mermaid
C4Container
  title ClipMkr — контейнеры (docker compose, name: clipmkr)
  Person(author, "Автор")
  Person(operator, "Оператор")
  System_Ext(openrouter, "OpenRouter")
  System_Ext(s3, "Cloud.ru Object Storage")
  System_Ext(smtp, "Resend SMTP")
  System_Boundary(vps, "VPS в Нидерландах") {
    Container(caddy, "caddy", "Caddy 2.8", "Единственная дверь: TLS clipmkr.ru, прокси на web:3000")
    Container(web, "web", "Next.js 15.5 (REST route handlers), Prisma", "Страницы, API, вход, выдача подписанных ссылок, события, /admin")
    Container(migrate, "migrate", "Prisma", "Одноразово: prisma migrate deploy")
    Container(workerai, "worker-ai", "Node.js 20, BullMQ", "Очереди stt и llm; единственный владелец OPENROUTER_API_KEY")
    Container(workerrender, "worker-render", "Node.js 20, ffmpeg", "Очередь render: чёрные поля, ASS, знак")
    ContainerDb(postgres, "postgres", "PostgreSQL 16", "account, video, job, transcript_chunk, clip, quota_counter, spend_ledger, event, publication, partner, attribution, audit_log")
    ContainerDb(redis, "redis", "Redis 7", "BullMQ: stt, llm, render; счётчики частоты")
  }
  Rel(author, caddy, "HTTPS")
  Rel(operator, caddy, "HTTPS")
  Rel(author, s3, "PUT частей по подписанным ссылкам", "HTTPS")
  Rel(caddy, web, "HTTP", "сеть compose")
  Rel(web, postgres, "SQL")
  Rel(web, s3, "magic bytes первых байт до создания задачи")
  Rel(web, redis, "Добавляет задачи, лимиты частоты")
  Rel(web, s3, "Multipart, HeadObject, подписанные ссылки")
  Rel(web, smtp, "Письмо подтверждения")
  Rel(migrate, postgres, "Миграции")
  Rel(redis, workerai, "stt, llm")
  Rel(redis, workerrender, "render")
  Rel(workerai, postgres, "job, transcript_chunk, clip, quota_counter, spend_ledger")
  Rel(workerai, s3, "Исходник, аудио-куски")
  Rel(workerai, openrouter, "transcriptions, chat.completions", "HTTPS")
  Rel(workerrender, postgres, "clip, job")
  Rel(workerrender, s3, "Исходник → клип, превью")
```

Порты на хосте: `caddy` — `${CADDY_HTTP_PORT:-80}`, `${CADDY_HTTPS_PORT:-443}` (только профиль `prod`); `web` —
`127.0.0.1:${WEB_PORT:-3105}`; `postgres`, `redis`, `minio` (тестовый профиль, на схеме не показан) — без публикации.

## Уровень 3 — Components: worker-ai

```mermaid
C4Component
  title worker-ai — компоненты
  ContainerDb(postgres, "postgres")
  ContainerDb(redis, "redis / BullMQ")
  System_Ext(openrouter, "OpenRouter")
  System_Ext(s3, "Cloud.ru S3")
  Container_Boundary(ai, "worker-ai") {
    Component(config, "Config guard", "@clipmkr/config", "Проверка окружения при старте; пусто или потолок ≤ 0 — процесс не стартует")
    Component(sttw, "STT worker", "BullMQ Worker: stt", "{job_id}.stt.prepare: magic bytes, ffprobe, ≤ 3840×2160, длительность совпадает с заявленной, нарезка; {job_id}.stt.{chunk_idx}: вызов Transcriber")
    Component(chunker, "Audio chunker", "ffmpeg silencedetect", "Куски 60–120 с по паузе, перекрытие, смещения в мс")
    Component(transcriber, "Transcriber", "@clipmkr/models", "OpenRouterTranscriber | OpenAiTranscriber; ответ → сегменты {speaker, start_ms, end_ms, text}")
    Component(stitch, "Merger & speaker stitcher", "чистые функции", "Склейка, монотонность, сшивка меток спикеров, флаг speaker_map_confident")
    Component(llmw, "LLM worker", "BullMQ Worker: llm", "Один вызов выбора и объяснения")
    Component(selection, "SelectionModel", "@clipmkr/models", "anthropic/claude-sonnet-5, json_schema, start_unit/end_unit")
    Component(scoring, "Scorer & quote check", "чистые функции", "Длина и итог считает код; цитаты сверяются с текстом")
    Component(quota, "Quota & spend", "SQL", "Допуск: остаток LLM ≥ LIMIT_LLM_KOP_JOB до STT; атомарный резерв quota_counter; spend_ledger по попыткам")
    Component(lease, "Lease & heartbeat", "таймер", "job.heartbeat_at раз в 30 с; worker.close() по SIGTERM")
    Component(probe, "ops stt-probe", "CLI", "Проба STT дня 1: тот же Transcriber; запускается и с хоста без Postgres, Redis, S3")
  }
  Rel(redis, sttw, "stt")
  Rel(redis, llmw, "llm")
  Rel(sttw, chunker, "исходник")
  Rel(sttw, quota, "резерв до вызова")
  Rel(sttw, transcriber, "кусок")
  Rel(transcriber, openrouter, "POST /api/v1/audio/transcriptions")
  Rel(probe, transcriber, "10 мин русского подкаста")
  Rel(sttw, stitch, "все куски done")
  Rel(sttw, postgres, "transcript_chunk")
  Rel(sttw, s3, "исходник, tmp/")
  Rel(llmw, quota, "резерв до вызова")
  Rel(llmw, selection, "транскрипт как данные")
  Rel(selection, openrouter, "POST /api/v1/chat/completions")
  Rel(llmw, scoring, "фрагменты")
  Rel(llmw, postgres, "clip × N")
  Rel(llmw, redis, "render {clip_id}")
```

## Уровень 3 — Components: worker-render

```mermaid
C4Component
  title worker-render — компоненты
  ContainerDb(postgres, "postgres")
  ContainerDb(redis, "redis / BullMQ")
  System_Ext(s3, "Cloud.ru S3")
  Container_Boundary(rw, "worker-render") {
    Component(renderw, "Render worker", "BullMQ Worker: render", "Идемпотентно: ready не рендерится повторно")
    Component(plan, "Watermark decision", "чистая функция", "watermark = plan !== 'paid'; план читается из БД")
    Component(ass, "Subtitle builder", "ASS", "Фразы ≤ 2 строк × 32 символа; префикс «Спикер N:» только при speaker_map_confident")
    Component(ffmpeg, "FFmpeg runner", "execFile без shell", "-ss по подписанной ссылке (HTTP range); scale=1080:608:force_original_aspect_ratio=decrease, pad в полосу y=420…1028, поля чёрные; шрифт /app/fonts; ass=; знак полупрозрачный в углу полосы видео; -threads 2; таймаут 5 мин")
    Component(finisher, "Job finisher", "SQL", "clips_done++; последний клип → job succeeded")
  }
  Rel(redis, renderw, "render")
  Rel(renderw, plan, "account.plan")
  Rel(renderw, ass, "сегменты фрагмента")
  Rel(renderw, ffmpeg, "исходник, ASS, текст знака")
  Rel(ffmpeg, s3, "отрезок исходника; клип и превью")
  Rel(renderw, finisher, "клип ready")
  Rel(finisher, postgres, "clip, job")
```
