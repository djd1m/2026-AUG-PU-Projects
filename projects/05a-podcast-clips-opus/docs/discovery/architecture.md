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


## Правки канона внесены координатором — приведение
- Сняты пометки «[правка канона запрошена]» в `Architecture-compose.md` (POSTGRES_*, MINIO_ROOT_* теперь в каноне §6).
- CORS бакета: `AllowedMethods = PUT, GET` в ADR-007, Architecture (Security, `migrate`, строка зависимости — добавлена цитата
  `<AllowedMethod>GET</AllowedMethod>` из GetBucketCors).
- Оценочная стоимость STT помечается `spend_ledger.cost_estimated = true` (ADR-006, Architecture).
- `file_invalid` также при расхождении фактической длительности с заявленной (ADR-007, Architecture sequence, C4).
- Размеры: Architecture.md 425, Architecture-compose.md 131, ADR.md 449 строк — все < 500.
- Проверки: check-external-deps → 0; эскиз `docker compose … config -q` → 0; check-file-ownership → 0;
  check-canon → 2 «в таблице единиц повторяются строки: docs/architecture-compose.md» — известная несовместимость стражей при
  разрезе (validation-report, «Дефект стражей»). Целостность канона проверена вручную: sha256 `docs/canon.md` =
  dc2cb9b8…c57566 совпадает с записью в dispatch-plan.md.

- Знак приведён к Specification FR-GROWTH-003: ADR-010 п. 2 и reuse map Architecture — x = 70 / y = 444 (16:9), x = 158 (4:3), x = 70 / y = 200 (вертикальный), плашка 0,5–0,6, радиус 12 px; пометка о проверке OCR и телефоном сохранена.


## Итерация исправлений 2

| Находка | Что сделано | Где |
|---|---|---|
| VT2-01 / VA2-05 (high) | правило выполнимости LLM переписано дословно по Specification FR-clips-10: оценка LLM по длительности записи > `LIMIT_LLM_KOP_JOB` → `quota_user`; > остатка автора → `quota_user`; > остатка сервиса → `quota_global`; это проверка, а не резерв. Пример «3 × 24 ₽ > 50 ₽» и тест «осталось 20 ₽» убраны, тесты переписаны под правило | ADR-006 п. 3 и «Как проверить»; Architecture — sequence-диаграмма, сверка |
| VT2-07 | резерв STT: автору `ceil(Σ unique_ms / 1000)` по длительности записи, сервису `Σ ceil(chunk.duration_ms / 1000)` по секундам провайдера | ADR-006 п. 2, Architecture — диаграмма |
| VT2-03 / VA2-06 | ADR оставляет вариант, рекомендованный VA2-06: цена секунды STT из `pricing.prompt` `GET /api/v1/models` при старте, признак `cost_estimated`; единица цены помечена `[ВЫВОД]`, проба сверяет `usage.cost` с `seconds × price`. Расхождение с Pseudocode (`STT_PRICES`, `cost_usd_micro IS NULL`) записано в сверку | ADR-006 п. 2; Architecture «Reconciliation» |
| VT2-17 | сверка с Pseudocode выполнена по-настоящему (45 алгоритмов; поля, `SET` и `INSERT` сверены с каноном §4 скриптом): расхождения — только `cost_estimated` и источник цены STT; раздел «Открытые расхождения» закрыт; тело `POST /api/videos` — `{size_bytes, ext, rights_confirmed}`; в Caddyfile добавлено `respond /api/health 404` | Architecture, Architecture-compose |
| VA2-10 | один файл шрифта в `/app/fonts`, `fontsdir` у `ass=` и `fontfile` у `drawtext`, метрики плашки — по тому же файлу; самопроверка пробного кадра при старте `worker-render` | ADR-010 п. 1, Architecture «Сборка» |
| VA2-11 | клиент S3: `requestChecksumCalculation`/`responseChecksumValidation = 'WHEN_REQUIRED'`, SDK из lock-файла; CORS + `AllowedHeaders = content-type` (правка канона запрошена); E2E — с SDK из lock-файла | ADR-007 п. 3a и «Как проверить»; Architecture |
| VA2-20 | ADR-009: фильтр `scale=1080:608:force_original_aspect_ratio=decrease,pad=…:420+(608-ih)/2` (4:3 больше не наезжает на субтитры) и ветка вертикального исходника; ADR-007 п. 3: `AbortIncompleteMultipartUpload` через 1 день | ADR-009, ADR-007, C4 |

Не тронуто: VA2-02 (место знака — ждёт владельца).

### Нужны правки канона (вношу не я)
1. §8 CORS: `AllowedHeaders = content-type` (VA2-11).
2. §1: для `web` в prod разрешить публикацию только на петлю `127.0.0.1` (эскиз так и делает; правило docker-ports это
   разрешает) — либо я уберу `ports:` из prod, если координатор оставит «нет» (VT2-17).
3. §4/§6: закрепить источник цены секунды STT — `pricing.prompt` из `GET /api/v1/models` при старте (ADR) или константа
   `STT_PRICES` из пробы (Pseudocode); и что `cost_estimated` пишется явно (VT2-03, VA2-06).

### Проверки
- эскиз `docker compose --profile prod --profile test config -q` → 0;
- check-external-deps → 0 (16 CONFIRMED, 1 UNCONFIRMED);
- check-file-ownership → 0;
- check-canon → 2 («повторяются строки: docs/architecture-compose.md» — известная несовместимость стражей при разрезе);
  sha256 canon.md вручную совпал с dispatch-plan (2acd0f443199f4e3…).
- Размеры: ADR.md 472, Architecture.md 416, Architecture-compose.md 132, C4_Diagrams.md 140 — все < 500.


## Итерация 2, дополнение: OWN-05A-015/016
- OWN-05A-015: ADR-009 «Последствия» и ADR-010 п. 2 — знак по центру у нижней кромки полосы видео, над субтитрами:
  `x = video_x + (vw − pw)/2`, `y = min(video_y + vh, 1100) − 24 − ph` (низ плашки 1004 для 16:9 и 4:3, 1076 для
  вертикального); точные числа — по Specification FR-GROWTH-003 после её правки. Architecture reuse map `ffmpeg.ts`, C4.
- OWN-05A-016: ADR-006 — строки новичка (1 800 с) и общего пула (45 000 с, `stt_sec_newbie`), определение новичка
  (младше 24 ч без `beta_at`), резерв на допуске тремя счётчиками одной атомарной операцией; ADR-011 — открытая регистрация
  с квотой новичка, `ops beta-add`, два теста; Architecture — абзац «Квота новичка» в Security, шаг резерва в sequence;
  Architecture-compose — `LIMIT_STT_NEWBIE_SEC_DAY`, `LIMIT_STT_NEWBIE_GLOBAL_SEC_DAY` в `x-limits` (web, worker-ai).
- Проверки: compose config → 0; check-external-deps → 0; check-canon → 2 (известная проблема разреза), sha256 канона
  вручную совпал с dispatch-plan (372e9b0361ca5c16…). Размеры: ADR 486, Architecture 421, compose 133, C4 140.


## Сверка с каноном после трёх правок координатора (+ §11, ops reset-link)
- `web` в prod не публикуется: у `web` убраны `ports:`; для dev добавлен оверлей `docker-compose.dev.yml`
  (`127.0.0.1:${WEB_PORT:-3105}:3000`, `name: clipmkr`). Проверки: base `config -q` → 0; оверлей даёт `host_ip: 127.0.0.1`;
  `COMPOSE_PROFILES=prod,test check-ports.cjs` → 0. Architecture (сводка, правило 2), C4 — поправлены.
- CORS `AllowedHeaders = content-type` — пометки «[правка канона запрошена]» сняты в ADR-007 и Architecture.
- Цена STT (канон §11): ADR-006 п. 2 — цена из `GET /api/v1/models` при старте `worker-ai`; до ответа — оценка с
  `cost_estimated = true`, при `usage.cost` — факт с `false`.
- Формула выполнимости LLM (канон §11) совпадает с ADR-006 п. 3 (формулировка Specification); правило секунд STT совпадает
  с ADR-006 п. 2.
- `ops reset-link <email>`: ADR-011 и reuse map Architecture; C4 — связь оператора (`ops beta-add`, `ops reset-link`).
- OWN-05A-015/016 уже внесены (раздел выше).
- check-external-deps → 0; check-canon → 2 (известная проблема разреза), sha256 канона вручную совпал с dispatch-plan
  (73fce1cb70205de5…). Размеры: ADR 487, Architecture 421, compose 144, C4 140.

Status: completed
