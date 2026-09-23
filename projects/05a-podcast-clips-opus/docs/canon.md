# Канон имён — проект 05a «ClipMkr»

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** adr-architect · 2026-09-23
**Назначение:** единственный источник общих имён для пишущего фан-аута (Pseudocode, Architecture, Refinement/Completion
и далее код). Имя, которого здесь нет, исполнитель не придумывает, а спрашивает координатора. Решения — в
[`ADR.md`](ADR.md); требования — в [`Specification.md`](Specification.md). Где канон расходится со Specification,
действует канон; расхождения перечислены в разделе 12 и переданы автору Specification.

## 1. Сервисы compose

Файл `docker-compose.yml`, `name: clipmkr`. Профиль `prod` — сервер в Нидерландах; профиль `test` — эта машина.

| Сервис | Профиль | Образ / сборка | Порты на хосте | Зачем |
|---|---|---|---|---|
| `caddy` | prod | `caddy:2.8-alpine` | `${CADDY_HTTP_PORT:-80}:80`, `${CADDY_HTTPS_PORT:-443}:443` | единственная дверь, TLS для `clipmkr.ru` |
| `web` | prod, test | сборка, `command: web` | prod — нет; test — `127.0.0.1:${WEB_PORT:-3105}:3000` | Next.js: страницы, API, выдача ссылок S3 |
| `migrate` | prod, test | сборка, `command: migrate` | нет | `prisma migrate deploy`; остальные ждут `service_completed_successfully` |
| `worker-ai` | prod, test | сборка, `command: worker-ai` | нет | очереди `stt` и `llm`; единственный владелец ключей моделей |
| `worker-render` | prod, test | сборка, `command: worker-render` | нет | очередь `render`, ffmpeg, лимит `cpus` |
| `postgres` | prod, test | `postgres:16-alpine` | нет | БД |
| `redis` | prod, test | `redis:7-alpine`, `--requirepass` | нет | BullMQ |
| `minio` | test | `minio/minio` с явным тегом `RELEASE.…` (выбирается при первой сборке и фиксируется; `latest` запрещён) | нет | S3 только для тестов (OWN-004) |

Всего 8 сервисов: caddy, web, migrate, worker-ai, worker-render, postgres, redis, minio.
Порты тестового профиля перед `up` проверяются `bash scripts/check-port-conflicts.sh` (80 и 443 на этой машине заняты,
`caddy` здесь не стартует). У всех, кроме `migrate`, — `restart: unless-stopped`.

## 2. Рабочие пространства npm

| Пакет | Имя | Содержимое |
|---|---|---|
| `apps/web` | `@clipmkr/web` | страницы, маршруты API, вход |
| `apps/worker` | `@clipmkr/worker` | точки входа `worker-ai` и `worker-render`, конвейер, ffmpeg, CLI `ops` |
| `packages/db` | `@clipmkr/db` | схема Prisma, миграции, клиент |
| `packages/queue` | `@clipmkr/queue` | очереди BullMQ, имена, `jobId` |
| `packages/s3` | `@clipmkr/s3` | клиент S3, ключи объектов, подписанные ссылки |
| `packages/config` | `@clipmkr/config` | чтение и проверка окружения (раздел 6) |
| `packages/models` | `@clipmkr/models` | интерфейсы `Transcriber`, `SelectionModel` и адаптеры OpenRouter/OpenAI |
| `packages/payments` | `@clipmkr/payments` | интерфейс `PaymentProvider` и `FakePaymentProvider` (v1, на неделе не подключён к маршрутам) |
| `packages/types` | `@clipmkr/types` | общие типы и закрытые списки раздела 5 |

## 3. Очереди BullMQ

| Очередь | Потребитель | `jobId` | Полезная нагрузка |
|---|---|---|---|
| `stt` | `worker-ai` | `{job_id}:stt:prepare` — подготовка (magic bytes, ffprobe, нарезка) | `job_id` |
| `stt` | `worker-ai` | `{job_id}:stt:{chunk_idx}` | `job_id`, `chunk_idx` |
| `llm` | `worker-ai` | `{job_id}:llm` | `job_id` |
| `render` | `worker-render` | `{clip_id}:render` | `clip_id` |

Попытки BullMQ: `attempts: 3`, экспонента от 5 000 мс. `lockDuration` 120 000 мс. Heartbeat задачи — раз в 30 с в
`job.heartbeat_at`; нет heartbeat 300 с → задача переставляется; 3 попытки → `failed/worker_lost` (ADR-008).

## 4. Таблицы и ключевые поля

Имена таблиц и колонок — `snake_case` в единственном числе. Первичные ключи — `uuid`. Время — `timestamptz` (UTC).

| Таблица | Ключевые поля |
|---|---|
| `account` | `id`, `email` (уникальный, нижний регистр), `password_hash`, `email_verified_at`, `plan`, `role`, `created_at` |
| `email_token` | `id`, `account_id`, `purpose` (`verify` \| `reset`), `token_hash`, `expires_at`, `used_at`, `created_at` |
| `refresh_token` | `id`, `account_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` |
| `video` | `id`, `account_id`, `s3_key_source`, `size_bytes`, `duration_ms`, `container`, `s3_upload_id`, `rights_confirmed_at`, `source_deleted_at`, `deleted_at`, `created_at` |
| `job` | `id` (это `job_id`), `video_id`, `account_id`, `idempotency_key`, `status`, `step`, `fail_reason`, `attempt_count`, `heartbeat_at`, `clips_total`, `clips_done`, `created_at` (задаёт день job-счётчиков), `finished_at`; уникально (`account_id`, `idempotency_key`) |
| `transcript_chunk` | `id`, `job_id`, `chunk_idx`, `offset_ms`, `duration_ms`, `status`, `units` (jsonb), `speaker_map` (jsonb), `speaker_map_confident`, `model`, `attempt_count`, `created_at`; уникально (`job_id`, `chunk_idx`) |
| `clip` | `id`, `job_id`, `clip_code` (уникальный), `start_unit`, `end_unit`, `start_ms`, `end_ms`, `title`, `hook_quote`, `hook_reason`, `hook_score`, `completeness_quote`, `completeness_reason`, `completeness_score`, `length_score`, `total_score`, `render_status`, `watermarked`, `s3_key_clip`, `speaker_labels_shown`, `created_at` |
| `quota_counter` | `scope` (`account` \| `global` \| `job`), `scope_id`, `day` (дата Europe/Moscow), `kind`, `used`; первичный ключ из всех, кроме `used` |
| `spend_ledger` | `id`, `account_id`, `job_id`, `call` (`stt` \| `llm`), `model`, `attempt`, `units_reserved`, `units_actual`, `cost_usd_micro`, `cost_kop`, `outcome`, `created_at` |
| `event` | `id`, `name`, `account_id`, `clip_id`, `session_id`, `props` (jsonb), `created_at`; сырой IP не пишется |
| `publication` | `id`, `clip_id`, `account_id`, `url`, `url_normalized` (уникальный), `platform`, `status`, `reason`, `verified_at`, `rechecked_at`, `created_at`; удаляется вместе с клипом |
| `partner` | `id`, `name`, `contact`, `audience_url`, `partner_code` (уникальный, верхний регистр), `account_id`, `created_at` |
| `attribution` | `id`, `account_id`, `partner_id`, `stage`, `source`, `self_referral`, `created_at`; уникально (`account_id`, `stage`) |
| `audit_log` | `id`, `actor`, `action`, `target`, `reason`, `created_at` |

Таблицы v1 (на неделе НЕ создаются, имена зарезервированы по проекту 04): `subscription`, `payment_intent`,
`payment_event`, `payment`.

## 5. Закрытые списки значений

Живут в `@clipmkr/types`, не в окружении.

| Поле | Значения |
|---|---|
| `job.status` | `running`, `succeeded`, `failed` — ровно три (long-running-job) |
| `job.step` | `transcribing`, `selecting`, `rendering` |
| `job.fail_reason` | `file_invalid`, `duration_exceeded`, `quota_user`, `quota_global`, `stt_failed`, `no_timestamps`, `selection_failed`, `render_failed`, `worker_lost` |
| `transcript_chunk.status` | `pending`, `done` |
| `clip.render_status` | `queued`, `rendering`, `ready`, `failed` |
| `account.plan` | `free`, `paid`; всё прочее читается как `free` |
| `account.role` | `user`, `operator`; всё прочее читается как `user` |
| `publication.status` | `candidate`, `confirmed`, `rejected`, `removed` |
| `publication.platform` по хосту | `tiktok.com`, `vt.tiktok.com`, `youtube.com`, `youtu.be`, `vk.com`, `vkvideo.ru`, `t.me`, `rutube.ru`, `dzen.ru` |
| `attribution.stage` | `signup`, `fakedoor` |
| `attribution.source` | `cookie`, `code` |
| `spend_ledger.outcome` | `ok`, `provider_error`, `timeout`, `schema_invalid` |
| `quota_counter.kind` | `stt_sec`, `uploads`, `llm_kop`, `llm_attempts`; для `scope = global` `scope_id` = нулевой UUID |
| `landing_visited.props.source` | `direct`, `partner`, `clip_link`, `other` |
| `STT_PROVIDER` | `openrouter`, `openai` |
| `PAYMENTS_MODE` | `fake`, `live` |
| `PAYMENTS_PROVIDER` | `yookassa`, `cloudpayments` |

Всего 9 причин отказа: file_invalid, duration_exceeded, quota_user, quota_global, stt_failed, no_timestamps, selection_failed, render_failed, worker_lost.

## 6. Переменные окружения

«Без дефолта» — отсутствие, пустая строка или невалидное значение валит старт процесса с именем переменной и
последствием (NFR-clips-3). Исключение — фаза сборки образа.

| Переменная | Сервисы | В prod | Пример / смысл |
|---|---|---|---|
| `BASE_URL` | web, worker-render | без дефолта | `https://clipmkr.ru`; только `https:` в prod |
| `BRAND_NAME` | web | без дефолта | `ClipMkr` |
| `WATERMARK_TEXT` | worker-render | без дефолта | `clipmkr.ru` |
| `DATABASE_URL` | web, migrate, worker-ai, worker-render | без дефолта | Postgres в сети compose |
| `REDIS_URL` | web, worker-ai, worker-render | без дефолта | с паролем |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | web, worker-ai, worker-render | без дефолта | Cloud.ru Evolution |
| `S3_TENANT_ID` | web, worker-ai, worker-render | без дефолта (в test пусто разрешено) | префикс ключа Cloud.ru `tenant_id:key_id` |
| `JWT_SECRET` | web | без дефолта, ≥ 32 байт | — |
| `SMTP_URL`, `MAIL_FROM` | web | без дефолта | письма подтверждения; провайдер Resend (`smtps://resend:<key>@smtp.resend.com:465`), `MAIL_FROM` на домене `clipmkr.ru` (OWN-05A-011) |
| `OPENROUTER_API_KEY` | worker-ai | без дефолта | только здесь |
| `STT_PROVIDER` | worker-ai | без дефолта | раздел 5 |
| `STT_MODEL` | worker-ai | без дефолта | выбирает проба дня 1 (ADR-001) |
| `OPENAI_API_KEY` | worker-ai | без дефолта при `STT_PROVIDER=openai` | запасной путь |
| `LLM_MODEL` | worker-ai | без дефолта | `anthropic/claude-sonnet-5` |
| `FX_USD_RUB_KOP` | worker-ai | без дефолта | копеек за доллар, например `8600` |
| `LIMIT_STT_USER_SEC_DAY` | web, worker-ai | без дефолта | `7200` |
| `LIMIT_UPLOADS_USER_DAY` | web | без дефолта | `3` |
| `LIMIT_LLM_USER_KOP_DAY` | worker-ai | без дефолта | `3000` |
| `LIMIT_STT_GLOBAL_SEC_DAY` | web, worker-ai | без дефолта | `90000` |
| `LIMIT_LLM_GLOBAL_KOP_DAY` | worker-ai | без дефолта | `30000` |
| `LIMIT_LLM_ATTEMPTS_JOB` | worker-ai | без дефолта | `2` |
| `LIMIT_LLM_KOP_JOB` | worker-ai | без дефолта | `1000` |
| `PAYMENTS_MODE` | web | без дефолта | на неделе `fake` |
| `PAYMENTS_PROVIDER`, `PAYMENTS_SHOP_ID`, `PAYMENTS_SECRET_KEY` | web | без дефолта только при `live` | v1 |
| `RENDER_CONCURRENCY` | worker-render | дефолт `1` разрешён | параллельные рендеры |
| `LOG_LEVEL` | все | дефолт `info` разрешён | — |
| `WEB_PORT`, `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT` | compose | `${VAR:-default}` | хостовые порты |
| `REDIS_PASSWORD` | redis, web, worker-ai, worker-render | без дефолта | пароль Redis в сети compose |
| `APP_VERSION` | compose | без дефолта | тег собранных образов |
| `MINIO_TAG` | compose (тестовый профиль) | без дефолта | явный тег образа MinIO |
| `RENDER_CPUS` | compose | дефолт `2` разрешён | лимит CPU контейнера `worker-render` |

Всего 7 потолков: LIMIT_STT_USER_SEC_DAY, LIMIT_UPLOADS_USER_DAY, LIMIT_LLM_USER_KOP_DAY, LIMIT_STT_GLOBAL_SEC_DAY, LIMIT_LLM_GLOBAL_KOP_DAY, LIMIT_LLM_ATTEMPTS_JOB, LIMIT_LLM_KOP_JOB.

## 7. Маршруты

| Маршрут | Доступ | Назначение |
|---|---|---|
| `GET /` | публичный | лендинг; пишет `landing_visited` |
| `GET /plans` | публичный | таблица планов и fake-door |
| `GET /p/{partner_code}` | публичный | cookie `pref`, `partner_link_visited`, редирект на `/` |
| `GET /c/{clip_code}` | публичный | `clip_link_visited`, редирект на `/` |
| `POST /api/auth/resend-verification` | сессия, почта не подтверждена | повторная отправка письма, не чаще 1 раза в 60 с и 5 в сутки |
| `POST /api/videos/{video_id}/parts` | владелец | перевыдать подписанные ссылки на незагруженные части (TTL 15 мин) |
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` | публичный / сессия | вход |
| `GET /api/auth/verify?token=` | публичный | подтверждение почты |
| `POST /api/videos` | сессия, почта подтверждена | создать `video`, начать multipart, выдать ссылки на части |
| `POST /api/videos/{video_id}/complete` | то же, `Idempotency-Key` | завершить загрузку → `202 {job_id}` |
| `DELETE /api/videos/{video_id}` | владелец | удалить видео и клипы |
| `GET /api/jobs/{job_id}` | владелец | состояние задачи |
| `POST /api/jobs/{job_id}/retry` | владелец | повтор с сохранённых шагов |
| `GET /api/clips/{clip_id}/file` | владелец | подписанная ссылка на клип, TTL 15 мин; чужой → 404 |
| `POST /api/clips/{clip_id}/events` | владелец | `clip_viewed`, `download_clicked`, `share_clicked` |
| `POST /api/clips/{clip_id}/publications` | владелец | paste-back |
| `POST /api/clips/{clip_id}/self-report` | владелец | «я опубликовал» |
| `POST /api/fakedoor` | сессия | клик «Хочу без знака», промокод |
| `POST /api/clips/{clip_id}/caption-copied` | владелец | `caption_copied` |
| `GET /admin/partners` | роль `operator` | партнёры и `partner_code` (FR-GROWTH-004) |
| `GET /admin/publications` | роль `operator` | проверка paste-back, перепроверка на 7-й день |
| `GET /admin/spend` | роль `operator` | расход за сутки по вызовам и аккаунтам |
| `GET /admin/metrics?from=<YYYY-MM-DD>` | роль `operator` | метрики недели |
| `GET /admin/users` | роль `operator` | смена плана с причиной; сброс пароля пользователя (одноразовая ссылка на почту) |

Оператор работает на страницах `/admin/*` (FR-clips-11); роль `operator` проверяется и в middleware, и в каждом серверном обработчике. CLI `ops` внутри `worker-ai` (`docker compose exec worker-ai ops …`) остаётся только для выдачи роли: `ops grant-operator <email>` и `ops stt-probe <файл>` (проба STT дня 1, ADR-001). Cookie сессии посетителя — `sid` (дедупликация `clip_link_visited`).

## 8. Ключи объектов S3

| Объект | Ключ |
|---|---|
| исходник | `videos/{account_id}/{video_id}/source.{ext}` |
| аудио-кусок | `tmp/{job_id}/chunk-{chunk_idx}.mp3` |
| клип | `clips/{account_id}/{job_id}/{clip_id}.mp4` |
| превью | `clips/{account_id}/{job_id}/{clip_id}.jpg` |

## 9. События аналитики и метрики роста

Таблица `event`, набор закрытый. Всего 17 событий: signup, email_verified, upload_started, job_succeeded, job_failed, clip_viewed, download_clicked, share_clicked, caption_copied, self_reported_published, publication_submitted, publication_confirmed, fakedoor_clicked, promo_code_entered, partner_link_visited, clip_link_visited, landing_visited

| Метрика | Определение |
|---|---|
| Метрика недели | уникальные клипы с `publication.status = confirmed` на 7-й день и число их разных авторов; цель ≥ 5 клипов от ≥ 3 авторов (OWN-05A-002) |
| `i` | подтверждённые внешние клипы на активированного автора |
| `conv%` | активированные авторы с ≥ 1 подтверждённой публикацией / все активированные; при n < 30 — «k из n» |
| Активированный автор | автор с ≥ 1 `clip_viewed` |
| paste-back | `publication_submitted` → `publication_confirmed`; кандидаты и самоотчёты — отдельными строками |
| fake-door | `fakedoor_clicked`, не более 1 на автора в сутки; это интерес, не конверсия |
| Переходы | `clip_link_visited`, `partner_link_visited`, `landing_visited` по `source` — раздельно |

## 10. Машинные ключи требований

Ключи из `Specification.md` на 2026-09-23. Новые ключи добавляет только автор Specification.

Всего 15 FR-clips: FR-clips-1, FR-clips-2, FR-clips-3, FR-clips-4, FR-clips-5, FR-clips-6, FR-clips-7, FR-clips-8, FR-clips-9, FR-clips-10, FR-clips-11, FR-clips-12, FR-clips-13, FR-clips-14, FR-clips-15

Всего 5 FR-GROWTH: FR-GROWTH-001, FR-GROWTH-002, FR-GROWTH-003, FR-GROWTH-004, FR-GROWTH-005

Всего 8 FR-LOOK принятых: FR-LOOK-001, FR-LOOK-002, FR-LOOK-007, FR-LOOK-008, FR-LOOK-009, FR-LOOK-010, FR-LOOK-011, FR-LOOK-013

Всего 5 FR-LOOK отклонённых: FR-LOOK-003, FR-LOOK-004, FR-LOOK-005, FR-LOOK-006, FR-LOOK-012

Всего 8 NFR: NFR-clips-1, NFR-clips-2, NFR-clips-3, NFR-clips-4, NFR-clips-5, NFR-clips-6, NFR-clips-7, NFR-clips-8

Всего 24 AC: AC-clips-1, AC-clips-2, AC-clips-3, AC-clips-4, AC-clips-5, AC-clips-6, AC-clips-7, AC-clips-8, AC-clips-9, AC-clips-10, AC-clips-11, AC-clips-12, AC-clips-13, AC-clips-14, AC-clips-15, AC-clips-16, AC-clips-17, AC-clips-18, AC-clips-19, AC-clips-20, AC-clips-21, AC-clips-22, AC-clips-23, AC-clips-24

В Pseudocode каждое `### Algorithm:` несёт `REQUIREMENT:` с одним из этих ключей.

## 11. Единицы

| Величина | Единица и тип | Суффикс |
|---|---|---|
| позиция в медиа, длительность клипа | миллисекунды, целое | `_ms` |
| аудио в потолках STT | секунды, целое, округление куска вверх | `_sec` |
| деньги у нас | копейки, целое; плавающая точка запрещена | `_kop` |
| стоимость от OpenRouter | микродоллары, целое (`usage.cost` × 10⁶) | `_usd_micro` |
| размер файла | байты, целое | `_bytes` |
| время событий | `timestamptz` UTC | `_at` |
| граница суток для потолков | 00:00 Europe/Moscow | `day` |
| баллы оценки | целые: хук 0–40, завершённость 0–40, длина 0–20, итог 0–100 | `_score` |

## 12. Расхождения со Specification (канон действует, Specification правит её автор)

| Место Specification | Было | Стало по канону | Основание |
|---|---|---|---|
| FR-clips-1 п. 1 | подтверждения email на неделе нет | подтверждение до первой загрузки; `email_token`, событие `email_verified` | OWN-05A-007, ADR-011 |
| FR-clips-4 п. 1, FR-clips-7 п. 4, раздел 10 | `[ADR-PENDING: модель STT]`, караоке при пословных метках | диаризация через OpenRouter, фразы с подписью спикера, караоке нет | OWN-05A-003/005, ADR-001/002 |
| FR-clips-5 п. 1 | `[ADR-PENDING: LLM, шлюз]` | `anthropic/claude-sonnet-5` через OpenRouter | ADR-003/005 |
| FR-clips-5 п. 2 | модель возвращает `start_ms`, `end_ms` | модель возвращает `start_unit`, `end_unit`; мс считает код | ADR-005 |
| FR-clips-7 п. 2 | поля — размытая копия кадра | чёрные поля | OWN-05A-008, ADR-009 |
| FR-clips-9 п. 5 | `[ADR-PENDING: провайдер оплаты]` | адаптер `PaymentProvider`, ЮKassa или CloudPayments, фейк по умолчанию | OWN-05A-010, ADR-013 |
| FR-clips-10 | 180/1800 мин STT, LLM 12/150 попыток | 120 мин и 3 загрузки на автора, 1 500 мин STT, LLM 30 ₽ на автора, 300 ₽ на сервис | OWN-05A-007, ADR-006 |
| FR-clips-12 п. 1 | `watermark_path_visited` | снято; добавлены `clip_link_visited`, `landing_visited`, `email_verified` | ADR-015, ADR-011 |
| FR-clips-13 п. 1 | исходник 7 дней | исходник 72 ч (страховка бакета — 7 дней) | ADR-007 |
| FR-clips-14 п. 2 | на знаке домен с путём `/w` | на знаке `clipmkr.ru`; маршрут `/w` снят | OWN-05A-006, ADR-015 |
| `{BRAND}`, `{BRAND_HANDLE}` | OWNER-PENDING | `ClipMkr`, `clipmkr.ru` | OWN-05A-006 |
| раздел учёта расхода | таблица `usage_attempt` | таблица `spend_ledger` | ADR-006 |
| события FR-clips-12 | `direct_visit`, `email_confirmed` | `landing_visited` с `source=direct`; `email_verified` (`caption_copied` принят в канон) | ADR-015, ADR-011 |
| FR-clips-4, резка | перекрытие кусков 2 с | перекрытие 5 с | ADR-002 |
| FR-clips-4 п. 8 | метки спикеров на шве печатаются «как есть» | при неуверенной сшивке подпись спикера не печатается | ADR-002 |
| AC-clips-24 | нет `speaker` → задача падает | нет `speaker` → субтитры без подписи, задача продолжается | ADR-001 |
| §9 долгой задачи | `job_id = video_id`, выдаётся до загрузки | отдельный `job_id`, выдаётся `POST …/complete` (202) до начала обработки | FR-clips-3, long-running-job |
| LIMIT_LLM_ATTEMPTS_JOB | «2 попытки на задачу» | 2 попытки на задачу в сутки (повтор после `selection_failed` на следующий день возможен) | вопрос Pseudocode В-11 |
| FR-GROWTH-002 | «запись хранит оба источника» | `attribution` — одна строка на стадию; второй источник — в `props` события `promo_code_entered` | В-12 |
| AC-clips-2 / FR-clips-2 п. 3 | magic bytes только в подготовке воркера | проверка в web ДО создания задачи + перепроверка в `stt:prepare` | В-14, security-operation-order |
| FR-clips-2 п. 5 | лимит загрузок до проверки размера | квота ПОСЛЕ валидации (NFR-clips-2) | В-15 |
| FR-clips-11 | `/admin/*` и роль `operator` — не в каноне | приняты в канон (правка координатора 2026-09-23) | — |
