# C4-диаграммы — N5 «КлипМейкер»

**Дата:** 2026-09-21 · **Канон:** [`canon.md`](canon.md) §5–6 · Уровни: контекст, контейнеры,
компоненты воркера. Имена сервисов — ровно из канона §6.

## Уровень 1 · Контекст

```mermaid
C4Context
  title Контекст — КлипМейкер
  Person(host, "Ведущий / эксперт", "загружает запись, публикует клипы вручную, отправляет гостю")
  Person(guest, "Гость выпуска", "открывает гостевую страницу без входа, скачивает клипы с меткой")
  Person(viewer, "Зритель на площадке", "видит метку, переходит по /c/<code>")
  Person(partner, "Блогер-партнёр", "раздаёт код, смотрит кабинет")
  System(cm, "КлипМейкер", "длинная запись → 3–8 вертикальных клипов с субтитрами, объяснённая оценка, метка на free")
  System_Ext(s3, "Cloud.ru Object Storage", "оригиналы, клипы, превью; presigned URL")
  System_Ext(openai, "OpenAI Audio API", "whisper-1: транскрипция с таймкодами слов")
  System_Ext(anthropic, "Anthropic Messages API", "Claude Sonnet 5: выделение фрагментов и оценка")
  System_Ext(platforms, "VK Клипы · Telegram · Rutube · Дзен", "публикует пользователь вручную")
  Rel(host, cm, "загружает, смотрит клипы, скачивает", "HTTPS")
  Rel(guest, cm, "открывает /g/<guest_code>", "HTTPS")
  Rel(viewer, cm, "открывает /c/<code>", "HTTPS из WebView площадки")
  Rel(partner, cm, "кабинет партнёра", "HTTPS")
  Rel(host, s3, "грузит файл по подписанной ссылке", "HTTPS, multipart")
  Rel(cm, s3, "подписывает ссылки, читает/пишет объекты", "S3 API, SigV4")
  Rel(cm, openai, "аудиочанки ≤ 25 МБ", "HTTPS")
  Rel(cm, anthropic, "транскрипт → фрагменты по JSON-схеме", "HTTPS")
  Rel(host, platforms, "публикует скачанный клип", "вручную")
```

## Уровень 2 · Контейнеры (сервисы compose, боевой профиль)

```mermaid
C4Container
  title Контейнеры — боевой профиль (7 сервисов)
  Person(user, "Пользователь", "браузер")
  Container_Boundary(vps, "VPS · Docker Compose") {
    Container(proxy, "proxy", "Caddy", "единственная публичная дверь: TLS, лимит частоты, 60 с окно")
    Container(web, "web", "Next.js 15 · App Router · tRPC", "экраны, API, подпись ссылок для браузера, постановка в очередь")
    Container(wstt, "worker-stt", "Node · BullMQ · ffprobe", "probe: скачивание, ffprobe длительности, списание минут ДО Whisper; затем извлечение аудио, чанкинг, whisper-1")
    Container(wllm, "worker-llm", "Node · BullMQ", "выделение фрагментов, оценка с объяснением")
    Container(wvid, "worker-video", "Node · BullMQ · ffmpeg 7", "кроп 9:16, субтитры, метка; concurrency 1; том рабочей области")
    ContainerDb(db, "db", "PostgreSQL 16", "источник истины: video, clip, job_attempt, quota_counter, attribution")
    ContainerDb(redis, "redis", "Redis 7 · AOF · noeviction", "транспорт заданий BullMQ")
  }
  System_Ext(s3, "Cloud.ru Object Storage", "S3")
  System_Ext(openai, "OpenAI Audio API", "whisper-1")
  System_Ext(anthropic, "Anthropic Messages API", "Sonnet 5")
  Rel(user, proxy, "HTTPS")
  Rel(proxy, web, "HTTP внутри сети compose")
  Rel(user, s3, "PUT частей по подписанной ссылке", "HTTPS")
  Rel(web, db, "SQL")
  Rel(web, redis, "add job", "BullMQ")
  Rel(web, s3, "presign, complete multipart, HEAD", "S3 API")
  Rel(wstt, redis, "очередь stt")
  Rel(wllm, redis, "очередь select")
  Rel(wvid, redis, "очередь render")
  Rel(wstt, db, "job_attempt, transcript")
  Rel(wllm, db, "clip (кандидаты), оценка")
  Rel(wvid, db, "clip.status, объекты")
  Rel(wstt, s3, "GET оригинал → аудио")
  Rel(wvid, s3, "GET оригинал, PUT клипы и превью")
  Rel(wstt, openai, "чанки")
  Rel(wllm, anthropic, "транскрипт")
```

Тестовый профиль добавляет `minio` (тот же S3-код, `S3_ENDPOINT=http://minio:9000`, без `ports:`) и
`test` (раннер). Хранилища `db`, `redis`, `minio` портов не публикуют; единственный публикуемый порт —
`127.0.0.1:${N5_EDGE_PORT:-4181}` у `proxy` в профиле `edge`.

Ключи по контейнерам (канон §6): `OPENAI_API_KEY` → только `worker-stt`; `ANTHROPIC_API_KEY` → только
`worker-llm`; `S3_*` → `web`, `worker-stt`, `worker-video`; `REDIS_PASSWORD` → `web` и три воркера;
`DATABASE_URL` → `web` и три воркера; `N5_PUBLIC_ORIGIN` (без дефолта) → `web` и `worker-video`; у `proxy` и
`db` секретов приложения нет.

## Уровень 3 · Компоненты `worker-video` (самый тяжёлый контейнер)

```mermaid
C4Component
  title Компоненты worker-video
  Container_Boundary(wv, "worker-video") {
    Component(consumer, "RenderConsumer", "BullMQ Worker, concurrency 1", "берёт задание render(video_id, clip_ids, fence)")
    Component(disk, "DiskGuard", "statvfs", "резерв ≥ 3× размера оригинала до скачивания; deferred(no_disk)")
    Component(fetch, "SourceFetcher", "s3-download.ts", "скачивает оригинал один раз во временный каталог тома")
    Component(subs, "SubtitleBuilder", "ASS из слов транскрипта", "строки ≤ 2, ≤ 32 символа, выделение слова")
    Component(ff, "FfmpegRunner", "child_process, таймаут 15 мин, SIGKILL", "scale→crop 9:16→ASS→drawtext(метка)→mp4")
    Component(wm, "WatermarkPolicy", "fail-closed по account.plan", "текст «КлипМейкер · N5_PUBLIC_ORIGIN/c/<code>» (переменная без дефолта), safe zone, ≥ 3,5 % высоты")
    Component(upload, "ResultPublisher", "S3 PUT + UPDATE clip WHERE fence = :mine", "результат принимается только с актуальным фенсом")
    Component(cleanup, "Cleanup", "finally", "удаляет временный каталог после успеха И отказа")
  }
  ContainerDb_Ext(db, "db", "PostgreSQL")
  System_Ext(s3, "Cloud.ru Object Storage")
  Rel(consumer, disk, "проверить место")
  Rel(disk, fetch, "если хватает")
  Rel(fetch, s3, "GET")
  Rel(consumer, subs, "слова из transcript")
  Rel(consumer, wm, "plan → метка?")
  Rel(subs, ff, "ASS")
  Rel(wm, ff, "drawtext")
  Rel(ff, upload, "mp4, jpg")
  Rel(upload, s3, "PUT")
  Rel(upload, db, "UPDATE clip … WHERE fence")
  Rel(consumer, cleanup, "всегда")
```

## Что диаграммы НЕ показывают (намеренно)

- Спящий код клона (ЮKassa, автопостинг `worker-publish`, команды) — не входит в неделю и не
  поднимается в compose; его контейнер отсутствует в боевом профиле (ADR-005).
- Telegram-бот для «отправить себе в Telegram» (FR-RESULT-003, Should) — появится отдельным
  внешним элементом контекста только при реализации; входящих вебхуков от него нет.
