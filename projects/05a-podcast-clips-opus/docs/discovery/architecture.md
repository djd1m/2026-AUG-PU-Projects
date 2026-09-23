# architecture — квитанция

RUN_ID: 20260923T173212Z-replicate-05a-475b · WORK_UNIT_ID: architecture · исполнитель: Claude Opus 5.5

## Сделано
- `docs/Architecture.md` (437 строк). Разделы: Architecture Overview (Mermaid), Component Breakdown, Technology Stack,
  External Dependencies (12 строк: 11 CONFIRMED с цитатой провайдера, 1 UNCONFIRMED — SMTP), Deployment Topology
  (compose-скелет, правила, сборка монорепо, деплой в Нидерландах), Data Architecture (ER, индексы, хранение),
  Pipeline (sequence), Queues/Leases, Security Architecture, Scalability, Donor Reuse Map (ВЗЯТЬ/ДОРАБОТАТЬ/ПЕРЕПИСАТЬ/НЕ БРАТЬ
  по файлам), Reconciliation with Pseudocode (чек-лист; сверка НЕ выполнена — Pseudocode.md пишется параллельно),
  Открытые расхождения.
- `docs/C4_Diagrams.md`: Context, Container, Component (worker-ai, worker-render) в Mermaid C4.
- Канон и ADR не менял; check-canon.cjs после записи — exit 0.

## Новые находки по донору (чтение кода)
- `apps/web/lib/auth/rate-limit.ts` открывается при сбое Redis («fail open», прямо в комментарии) → ПЕРЕПИСАТЬ.
- `apps/web/lib/auth/email.ts` без SMTP_HOST уходит в Ethereal — тихий фолбэк → в prod отказ старта.
- `apps/web/lib/auth/password.ts` — bcrypt, а FR-clips-1 требует argon2id.
- `packages/config/src/env.ts` — дефолты S3_BUCKET/S3_REGION и необязательные ключи.
- `app/api/clips/[clipId]/file` стримит клип через web по заголовку x-user-id вместо подписанной ссылки.

## Предлагаемые правки канона (вношу не я — координатор, с новым хешем)
1. Очередь `stt`: задача подготовки `{job_id}:stt:prepare` (magic bytes, ffprobe, нарезка) — в каноне нет jobId для этого шага.
2. Оператор: принять `/admin/*` и роль `operator` из Specification FR-clips-11 → поле `account.role` (`author` | `operator`),
   маршруты `/admin/partners`, `/admin/publications`, `/admin/spend`, `/admin/metrics`, `/admin/users`; CLI `ops` снять.
3. Событие `caption_copied` (FR-clips-15) — добавить в канон §9 (станет 17 событий).
4. `REDIS_PASSWORD`, `APP_VERSION`, `MINIO_TAG`, `RENDER_CPUS` — переменные compose, в каноне §6 их нет.

## Расхождения Specification ↔ канон/ADR (Architecture следует канону; сообщено координатору)
usage_attempt vs spend_ledger; direct_visit/email_confirmed vs landing_visited/email_verified (Spec сама противоречит себе:
FR-clips-1 email_verified, FR-clips-12 email_confirmed); перекрытие 2 с vs 5 с; подписи спикеров на шве «как есть»
vs «не печатать при неуверенной сшивке» (ADR-002); ответ без speaker → failed (AC-clips-24) vs субтитры без подписи
(ADR-001); job_id = video_id (Spec §9) vs отдельный job_id.

## Источники (2026-09-23)
openrouter.ai/docs: multimodal/stt, features/structured-outputs, use-cases/usage-accounting; openrouter.ai/api/v1/models;
developers.openai.com speech-to-text; cloud.ru/docs/s3e: api__methods, api__aws-sig-v4; caddyserver.com/docs/automatic-https.

## Неуверенности
- SMTP-провайдер не выбран: FR-clips-1 п. 1 и AC-clips-21 по правилу навыка не входят в Phase 3 до выбора.
- Возвращает ли конкретная STT-модель `speaker` через OpenRouter — только проба дня 1.
- Размер VPS (4 vCPU / 8 ГБ) — предложение; площадка AdminVPS/HOSTKEY в Нидерландах не проверена.
- Трафик Нидерланды ↔ Cloud.ru не измерен.
- Mermaid-диаграммы не прогонялись рендером (диск VPS почти полон, mermaid-cli не ставил).


## Дополнение: обновлённый канон (правка координатора 2026-09-23)
- Architecture.md приведён к канону: `/admin/*` с ролью `operator` (`account.role` = `user` | `operator`, fail-closed,
  проверка в middleware и каждом обработчике), выдача роли только `docker compose exec worker-ai ops grant-operator <email>`,
  событие `caption_copied` и маршрут `…/caption-copied`; ссылка на хеш канона — через dispatch-plan.md; строки про /admin
  и caption_copied убраны из «Открытых расхождений».
- В канон пока не внесено, остаётся предложением: jobId `{job_id}:stt:prepare`; переменные compose `REDIS_PASSWORD`,
  `APP_VERSION`, `MINIO_TAG`, `RENDER_CPUS`.
- check-canon.cjs после правки — exit 0.


## Сверка с каноном после коммита 42a133f
- `{job_id}:stt:prepare` (канон §3): добавлен в таблицу очередей Architecture, пометка «правка предложена» в sequence-диаграмме снята.
- `REDIS_PASSWORD` (канон §6: redis, web, worker-ai, worker-render): в скелете compose у `redis` добавлен `environment`,
  иначе healthcheck `redis-cli -a $$REDIS_PASSWORD` внутри контейнера не видит пароль. `APP_VERSION`, `MINIO_TAG` —
  `${VAR:?}` без дефолта; `RENDER_CPUS` — `${RENDER_CPUS:-2}`; всё совпадает с каноном.
- Абзац «остаются предложением» в «Открытых расхождениях» заменён записью, что правки внесены.


## Дополнение: почтовый провайдер Resend (OWN-05A-011)
- ADR.md, ADR-011: в «Решение» записан SMTP Resend `smtps://resend:<API-ключ>@smtp.resend.com:465`, `MAIL_FROM` на `clipmkr.ru`
  с SPF/DKIM; в «Последствия» — FR-clips-1 п. 1 и AC-clips-21 входят в Phase 3, DNS-записи Resend — чек-лист до беты.
- Architecture.md, External Dependencies: строка SMTP из UNCONFIRMED стала двумя CONFIRMED с цитатами
  (resend.com/docs/send-with-smtp — порт 465 «Implicit SSL/TLS»; resend.com/docs/add-a-domain — «Provide the DKIM and SPF
  configurations…»), checked 2026-09-23. Итог: 13 строк, все CONFIRMED. Абзац-последствие UNCONFIRMED заменён.
- C4_Diagrams.md и обзорная диаграмма: «SMTP-провайдер» → Resend.
- Остаётся непроверенным: доставляемость на mail.ru/yandex.ru (письмо в день 1).

Status: completed
