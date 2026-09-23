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


## Задание 4: ячейки вердикта External Dependencies
- Причина exit 1: в ячейках вердикта было лишнее текстовое пояснение («CONFIRMED (механизм); модель — проба», «CONFIRMED (…DNS…)»).
  Теперь в каждой ячейке ровно одно слово; пояснения перенесены в колонку доказательства.
- Строку «метки спикеров» разбил на две: механизм диаризации OpenRouter — CONFIRMED (цитата про `provider.options`);
  конкретная модель OpenRouter с метками спикеров на русском — UNCONFIRMED до пробы дня 1. Она блокирует только
  подписи спикеров в FR-clips-7 и AC-clips-24; прочее входит в Phase 3. Абзац-последствие в Architecture переписан.
- Строкам про предел запроса, CORS и lifecycle добавлены полные ссылки (было «та же страница», «methods»).
- Итог: 14 строк — 13 CONFIRMED и 1 UNCONFIRMED.
- Вывод `node .claude/hooks/check-external-deps.cjs projects/05a-podcast-clips-opus`:
```
✅ инвентарь на месте: 14 способност(ей), у каждой вердикт из закрытой тройки (13 CONFIRMED, 1 UNCONFIRMED)
   UNCONFIRMED — не отказ, но и не бесплатный пропуск. Требования этих строк НЕ входят в Фазу 3, пока их не отложат, не уберут или не перепишут:
   • Конкретная модель OpenRouter, которая возвращает метки спикеров на русской речи с нужной точностью (OpenRouter: кандидаты `assemblyai/universal-3-5-pro`, `deepgram/nova-3`, `microsoft/mai-transcribe-2`, `meta/muse-voice-transcribe-1.0`, `x-ai/grok-stt-1.0`) ← FR-clips-7 (подписи спикеров), AC-clips-24
   Ограничение: проверка НЕ ОТКРЫВАЕТ ссылку и не отличает настоящую цитату от выдуманной. Доказано, что доказательство ПРЕДЪЯВЛЕНО в требуемой форме, — не что оно истинно (слой 3).
exit=0
```


## Итерация исправлений 1 (валидация Phase 2)

| Находка | Что сделано | Где |
|---|---|---|
| VT-04 | транспорт сессии по канону: оба токена в cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, без Bearer, CSRF — проверка `Origin`; сброс пароля ссылкой из `/admin/users` | ADR-011, Architecture «Security», reuse map `middleware.ts` |
| VT-05 | CORS бакета `AllowedOrigins=BASE_URL`, `PUT`, `ExposeHeaders=ETag`; `migrate` применяет CORS и lifecycle; проверка — браузерный E2E на реальном бакете; строка зависимости с цитатой Cloud.ru (`<ExposeHeader>…</ExposeHeader>` в GetBucketCors) | ADR-007, Architecture |
| VT-13 | эскиз compose запускаемый: `environment:` каждого сервиса по канону §6, `POSTGRES_*`, тома `pgdata`/`redisdata`/`caddy_data`/`caddy_config`/`minio_data`, Caddyfile с `request_body max_size 1MB` и `reverse_proxy web:3000`, `minio command server /data`, `mem_limit` | Architecture «Deployment Topology» |
| VT-15 | `usage.cost` у `/audio/transcriptions` подтверждён цитатой примера ответа (`"cost": 0.000508`); без поля — `usage.seconds` × цена из `/api/v1/models`, помечается оценочной; ноль не пишется | ADR-006, Architecture |
| VT-16 | в схеме запроса нет `minimum/maximum/multipleOf/minLength/maxLength` — по «Not supported» документации Anthropic; все ограничения проверяет код; приём очищенной схемы проверяет один вызов пробы | ADR-005 п. 4, Architecture |
| VT-21 | ADR догнаны до канона: `/admin/spend`, `/admin/publications`; резерв STT на всё видео + секунды повторного куска; magic bytes сначала в `web` (В-14); jobId через точку | ADR-006/007/008/014 |
| VT-22 | строка «25 МБ и ~60 с» разбита на две, у каждой своя цитата | Architecture |
| VA-08 | проба не требует развёрнутого стека: `node apps/worker/dist/cli/ops.js stt-probe <файл>` с хоста (Node 20, ffmpeg, ключ); критерии разделены на продуктовые и подписи; порядок: OpenRouter → прямой OpenAI → субтитры без подписи → стоп, только если не прошли продуктовые | ADR-001, Architecture «Деплой», C4 |
| VA-21 | один стиль API — REST route handlers по канону §7; tRPC не используется, роутеры донора — источник логики (ПЕРЕПИСАТЬ); `JWT_SECRET` вместо `NEXTAUTH_SECRET` | ADR-012, Architecture, C4 |
| VA-22 | три сетевых пути названы, замер дня 0 (2 ГБ из Cloud.ru, открытие с 2 операторов РФ, цена трафика); рендер читает отрезок по HTTP range, исходник качает только подготовка | ADR-003 п. 4–5, Architecture |
| VA-23 | `mem_limit` у каждого сервиса (сумма 6,75 ГБ при 8 ГБ), redis `maxmemory 384mb noeviction`; отказ `file_invalid` выше 3840×2160; ffmpeg `-threads 2` | ADR-007/010, Architecture |

Не тронуто по указанию: VA-03/VT-03, VA-05, VA-09 (ждут владельца).

### Проверки
- Эскиз compose вынут из Architecture.md в scratchpad: `docker compose --profile prod --profile test config -q` → 0; без
  `POSTGRES_PASSWORD` → «required variable POSTGRES_PASSWORD is missing a value» (страж падает).
- `COMPOSE_PROFILES=prod,test node .claude/hooks/check-ports.cjs <эскиз>` → exit 0 (8 сервисов, 3 хранилища, 1 прокси).
  Без `COMPOSE_PROFILES` проверка видит только 2 сервиса — записано в правило 1 Architecture.
- check-external-deps и check-canon:
```
✅ инвентарь на месте: 17 способност(ей), у каждой вердикт из закрытой тройки (16 CONFIRMED, 1 UNCONFIRMED)
   UNCONFIRMED — не отказ, но и не бесплатный пропуск. Требования этих строк НЕ входят в Фазу 3, пока их не отложат, не уберут или не перепишут:
   • Конкретная модель OpenRouter, которая возвращает метки спикеров на русской речи с нужной точностью (OpenRouter: кандидаты `assemblyai/universal-3-5-pro`, `deepgram/nova-3`, `microsoft/mai-transcribe-2`, `meta/muse-voice-transcribe-1.0`, `x-ai/grok-stt-1.0`) ← FR-clips-7 (подписи спикеров), AC-clips-24
   Ограничение: проверка НЕ ОТКРЫВАЕТ ссылку и не отличает настоящую цитату от выдуманной. Доказано, что доказательство ПРЕДЪЯВЛЕНО в требуемой форме, — не что оно истинно (слой 3).
exit=0
✅ канон зафиксирован и цел: docs/canon.md (sha256 совпал), 25 параллельных пишущих единиц
   Проверено внутри канона: порядковые номера различимы у соседей (13 заголовков), перечни держат своё число (10)
   Ограничение: совпавший хеш доказывает, что канон НЕ МЕНЯЛСЯ, — но не то, что он перечислил все разделяемые выборы. Полнота канона остаётся суждением координатора (слой 3).
exit=0
```

### Нужны правки канона (вношу не я)
1. §6: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (postgres; без дефолта) и `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
   (minio, тестовый профиль; без дефолта). В эскизе помечены `[правка канона запрошена]`.
2. §4 `spend_ledger`: признак оценочной стоимости STT, например `cost_estimated` (boolean), — иначе `/admin/spend` не отличит
   факт от оценки (VT-15).
3. §7: `ops stt-probe` запускается и с хоста без стека (`node apps/worker/dist/cli/ops.js stt-probe <файл>`), не только через
   `docker compose exec worker-ai` (VA-08).
4. Константа отказа `file_invalid` при разрешении больше 3840×2160 (VA-23) — в §5 или в правилах подготовки.
5. На будущее к VT-14 (pseudocode): «Поделиться» файлом тянет клип `fetch` с S3 — нужен `GET` в `AllowedMethods` CORS бакета; сейчас в каноне только `PUT`.

### Неуверенности
- Отдают ли `usage.cost` все STT-модели OpenRouter — только пример в документации; есть запасной расчёт.
- Примет ли OpenRouter очищенную схему для `anthropic/claude-sonnet-5` — проверит один вызов пробы.
- Все три сетевых пути по-прежнему не измерены (замер дня 0).
- Architecture.md — 536 строк, это больше предела в 500 строк из CLAUDE.md. Уменьшить можно, если вынести эскиз compose в отдельный файл
  (решение координатора: файл вне моего владения).


## Итерация исправлений 1, дополнение: решения владельца OWN-05A-012…014

| Решение | Что изменено |
|---|---|
| OWN-05A-012 | ADR-006: LLM 2 400 коп. на задачу, 5 000 коп. на автора в сутки, 30 000 коп. на сервис; новый пункт — выполнимость LLM проверяется при допуске STT (остаток автора и сервиса ≥ `LIMIT_LLM_KOP_JOB`, иначе `quota_*` до оплаты STT); названо следствие 3 × 24 ₽ > 50 ₽; тест на допуск. ADR-005 п. 6 → 24 ₽. Architecture: шаг допуска в sequence-диаграмме и в чек-листе Reconciliation; C4 — компонент Quota. |
| OWN-05A-013 | ADR-009/ADR-010: знак полупрозрачный в левом верхнем углу полосы видео (x = 24, y = 444 для 16:9; для вертикального исходника y не выше 200), не на чёрном поле; проверка — OCR после обрезки до полосы 1080×608. Architecture: reuse map `ffmpeg.ts`; C4 — FFmpeg runner. Позиция и прозрачность — `[ПРЕДЛОЖЕНИЕ]`. |
| OWN-05A-014 | ADR и Architecture: абзац «Объём первой недели»; сброс пароля, fake-door, `/plans`, `/admin/partners`, `/admin/spend` — 2-я очередь; на неделе `ops partner-add` и `ops spend-today` (ADR-006 п. 4, ADR-011, ADR-013 п. 1, ADR-015 п. 3; Architecture — Web UI, Ops, Security/оплата, reuse map; C4 — связь оператора). |

Проверки после правок:
```
✅ инвентарь на месте: 17 способност(ей), у каждой вердикт из закрытой тройки (16 CONFIRMED, 1 UNCONFIRMED)
exit=0
⚠️  проверка НЕ выполнена: в таблице единиц повторяются строки: docs/architecture-compose.md
exit=2
```
(Строка про 543 строки устарела — см. раздел «Разрез» ниже.)


## Разрез Architecture.md (объявлен координатором в dispatch-plan.md)
- Эскиз `docker-compose.yml` и `deploy/Caddyfile` перенесены в `docs/Architecture-compose.md` (131 строка); в Architecture.md
  вместо них ссылка и три главных свойства. Architecture.md теперь 425 строк (предел 500 соблюдён).
- Повторная проверка эскиза из нового файла: `docker compose … config -q` → 0; `COMPOSE_PROFILES=prod,test check-ports.cjs` → 0.
- Первый прогон check-canon в этом раунде дал exit 2 «в таблице единиц повторяются строки: docs/architecture-compose.md»
  (промежуточное состояние dispatch-plan.md у координатора); повторный прогон — exit 0, 28 единиц.
- check-external-deps → 0 (16 CONFIRMED, 1 UNCONFIRMED — подписи спикеров).

Status: completed
