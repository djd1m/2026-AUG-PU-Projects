# Pseudocode — Proofwall

> SPARC Phase: **Pseudocode**. Источник: [`Specification.md`](Specification.md), [`PRD.md`](PRD.md). Алгоритмы для каждого FR. Стек (Architecture Constraints p-replicator): монорепо-монолит, Docker Compose, **PostgreSQL в контейнере**, MCP-серверы; Next.js + отдельный бандл виджета.
>
> **Итерация 1 после валидации Phase 2:** правки C-1, C-2, W-5, W-8, W-9 (см. Refinement.md), W-10. Имена — по [`Architecture.md`](Architecture.md); отдельного раздела «Канонические имена» там пока нет, использованы имена из основного текста (§3, §4.2, §5).

---
## 1. Приём отзыва: текст (FR-002) и видео (FR-003)

```
function submitTestimonial(request):
  # --- Rate limit: 5 отправок с IP в час на проект (FR-NFR-SEC-003) ---
  project = findProjectBySlug(request.slug)
  if project is null:
    return HTTP 404  # не раскрываем, существовал ли слаг
  ip = extractClientIP(request)
  key = hash(ip + project.id)
  if rateLimitStore.count(key, window = 1 hour) >= 5:
    return HTTP 429  # без деталей о лимите — anti-enumeration
  # --- Валидация на границе (W-5: видео-ограничения проверяются ЗДЕСЬ, до списания квоты) ---
  errors = []
  if not (2 <= len(request.name) <= 80):
    errors.append("name: 2-80 символов")
  if request.type == "text":
    if not (10 <= len(request.text) <= 2000):
      errors.append("text: 10-2000 символов")
  else if request.type == "video":
    errors.extend(validateVideoConstraints(request.video))  # см. §1.1 — чистая функция, без побочных эффектов
  else:
    errors.append("type: ожидается text|video")
  if errors is not empty:
    return HTTP 400 { errors }
  # W-5: квота списывается ТОЛЬКО после успешной валидации (не заранее с возвратом при отказе —
  # это исключает гонку/двойной decrement на параллельных невалидных запросах).
  rateLimitStore.increment(key, window = 1 hour)
  try:
    if request.type == "text":
      testimonial = createTestimonial(
        project_id = project.id, author_name = request.name,
        author_role = request.role or null,
        text = request.text,          # ИСХОДНЫЙ текст, побайтово как отправлен
        video_object_key = null, transcript = null,
        photo_url = uploadIfPresent(request.photo),
        status = "pending", created_at = now()
      )
    else:
      testimonial = handleVideoTestimonial(project, request)  # §1.1 — видео уже валидно
  catch StorageError as e:
    # Единственное исключение: инфраструктурный сбой ПОСЛЕ списания квоты — вины автора нет.
    rateLimitStore.decrement(key, window = 1 hour)
    logError("testimonial_storage_failed", project.id, e)
    return HTTP 503 { error: "сервис временно недоступен, попробуйте ещё раз" }
  writeAuditLog(action = "testimonial_created", entity = testimonial.id, actor = "public")
  return HTTP 201 { testimonial.public_id }
```

**Граничные случаи:** проект не найден → 404 без утечки; лимит превышен → 429 без счётчика; `type` вне `text|video` → 400. Текст сохраняется **как есть** (FR-NFR-SEC-002). Плохое видео теперь всегда получает `HTTP 400` с причиной и НЕ списывает квоту (было: необработанное исключение + впустую списанная квота — W-5).

### 1.1 Видео-путь (FR-003): валидация, загрузка, асинхронная транскрипция

```
# Чистая функция без побочных эффектов — вызывается ДО rateLimitStore.increment (W-5)
function validateVideoConstraints(video):
  errors = []
  if video is null:
    errors.append("video: обязателен для type=video")
    return errors
  if video.duration_sec > 120:
    errors.append("video: длиннее 120 секунд")
  if video.size_bytes > 100 * MB:
    errors.append("video: больше 100 MB")
  if video.mime not in ["video/webm", "video/mp4"]:
    errors.append("video: недопустимый формат, разрешены webm, mp4")
  return errors
  # отказ в доступе к камере обрабатывается на клиенте ДО сабмита — см. §1.2
function handleVideoTestimonial(project, request):
  # Ограничения уже проверены в submitTestimonial до списания квоты — сюда попадает валидное видео.
  video_object_key = uploadToStorage(bucket = "testimonial-videos", file = request.video)
  # W-10: video_object_key — КЛЮЧ объекта в MinIO (Architecture §5), не постоянный URL — presigned
  # ссылки недолговечны и выдаются отдельно в момент рендера/скачивания.
  testimonial = createTestimonial(
    project_id = project.id, author_name = request.name,
    author_role = request.role or null,
    text = request.text_caption or "",   # опциональная подпись автора, НЕ транскрипт
    video_object_key = video_object_key,
    transcript = null, transcript_source = 'machine', transcript_status = 'pending',  # канон: Architecture §10
    status = "pending", created_at = now()
  )
  return testimonial
# Вызывается воркером (services/worker), забравшим строку с transcript_status='pending' (Architecture §5, SELECT ... FOR UPDATE SKIP LOCKED).
function transcribeVideoJob(testimonial_id, video_object_key):
  testimonial = getTestimonial(testimonial_id)
  if testimonial is null:
    return  # отзыв удалён до обработки — не ошибка
  try:
    presigned_url = generatePresignedGetUrl(video_object_key, ttl = 10 minutes)  # только для этого вызова, не хранится
    audio = extractAudioTrack(presigned_url)
    transcript_text = claudeApi.transcribe(audio)   # MCP tool transcribe_video, ТОЛЬКО расшифровка речи
    # FR-NFR-SEC-002: транскрипт — ОТДЕЛЬНОЕ поле, никогда не пишется в testimonial.text
    updateTestimonial(testimonial_id, {
      transcript: transcript_text, transcript_source: 'machine', transcript_status: 'completed'
    })
  catch ClaudeApiError as e:
    # Канон Architecture §10 даёт transcript_status enum(pending,completed,failed) —
    # неудача выразима в схеме, а не только в логах.
    updateTestimonial(testimonial_id, { transcript_status: 'failed' })
    logError("transcription_failed", testimonial_id, e)
    # отзыв остаётся валидным и модерируемым даже без транскрипта
```

### 1.2 Клиент: отказ в доступе к камере → fallback на загрузку файла

```
function onCameraAccessRequest():
  try:
    return renderRecorder(requestCameraPermission())
  catch PermissionDeniedError:
    showMessage("Доступ к камере не разрешён. Загрузите файл вместо записи.")
    return renderFileUploadFallback()
  catch DeviceNotFoundError:
    showMessage("Камера не найдена. Загрузите файл.")
    return renderFileUploadFallback()
```

---
## 2. Модерация (FR-004): переходы состояний, обратимость, audit log

```
ALLOWED_TRANSITIONS = {
  pending:  [approved, rejected],
  approved: [rejected, hidden],
  rejected: [approved, hidden],     # обратимость: можно передумать
  hidden:   [approved, rejected]    # обратимость: можно вернуть
}
function moderateTestimonial(actor, testimonial_id, target_state):
  testimonial = getTestimonial(testimonial_id)
  if testimonial is null:
    return HTTP 404
  # Мульти-арендность (FR-NFR-SEC-001): проверка владения ДО любого действия
  if testimonial.project_id != actor.project_id:
    writeAuditLog(action = "moderation_denied_cross_project",
                  entity = testimonial_id, actor = actor.id)
    return HTTP 403
  if target_state not in ALLOWED_TRANSITIONS[testimonial.status]:
    return HTTP 400 { error: "недопустимый переход " + testimonial.status + " -> " + target_state }
  previous_state = testimonial.status
  updateTestimonial(testimonial_id, { status: target_state, moderated_at: now() })
  writeAuditLog(action = "state_transition", entity = testimonial_id, actor = actor.id,
                from = previous_state, to = target_state, timestamp = now())
  # Переход в/из approved влияет на видимость и на порог FR-GROWTH-005
  if target_state == "approved" or previous_state == "approved":
    recomputeContentThreshold(testimonial.project_id)   # см. §6
  return HTTP 200 { testimonial }
```

**Инвариант:** только `approved` виден на `/w/<slug>` и в виджете — запрос всегда фильтрует `WHERE status='approved' AND project_id=:current_project`.

---
## 3. Жизненный цикл виджета (FR-006)

```
# Клиент: <script src=".../widget.js" data-slug="acme" async>
function widgetBootstrap(scriptTag):
  slug = scriptTag.getAttribute("data-slug")
  if slug is empty:
    logWarning("widget: data-slug отсутствует, рендер отменён")
    return
  host = shadowDom.attach(mountPoint())   # изоляция стилей хоста
  injectScopedStyles(host)                # префиксованные/scoped CSS, не глобальные
  config = fetchWidgetConfig(slug, currentDomain())   # §5 — серверная проверка тарифа
  if config is null:
    renderEmptyPlaceholder(host)          # проект не найден/деактивирован — тихий no-op
    return
  renderTestimonials(host, config.testimonials)
  renderBadge(host, config.badge_required)  # FR-GROWTH-003 — решение сервера, не клиента
  recordInstallAndInviteIfNeeded(slug, currentDomain())  # §4 — widget_installed + invite_shown
  startBadgeIntegrityWatch(host, config.badge_required)  # §5.2
  emitEvent("badge_impression", { slug, domain: currentDomain() })
function fetchWidgetConfig(slug, domain):
  # W-10: путь и query — как в Architecture §4.2 (`/api/widget/config`, параметр `domain`)
  response = httpGet("/api/widget/config?slug=" + slug + "&domain=" + domain, timeout = 300ms)
  return (response.status == 200) ? response.json() : null
```

**NFR:** `widgetBootstrap` не блокирует `window.onload` хоста (`async`); бандл ≤ 30 KB gzip и p95 ≤ 300 мс измеряются в CI (см. Refinement.md). Фиксация установки на новом домене — единственный источник и метрики недели, и share-CTA; логика обеих — в §4.

---
## 4. FR-GROWTH-001: `widget_installed` и `invite_shown` — одна гранулярность, одна вставка

> **Решение (PRD §2.4.1, актуальная редакция — версия «invite_shown раз на проект» ОТМЕНЕНА):** считаем сайты, не людей — обе метрики имеют одну уникальность `(project_id, domain)`. Share-CTA показывается при **каждой** новой установке; повторный рендер на известном домене не порождает ничего. Одной атомарной вставки в `widget_installs` (`unique(project_id, domain)`, Architecture §3/§4.2) хватает на оба события — две разные таблицы (C-1) больше не нужны.

```
function recordInstallAndInviteIfNeeded(project_slug, domain):
  project = findProjectBySlug(project_slug)
  if project is null:
    return
  if domain == OUR_APP_DOMAIN or domain is empty:
    return  # рендер в превью/дашборде не считается установкой
  # Атомарная вставка — ЕДИНСТВЕННЫЙ механизм разрешения гонки. НЕ "exists() затем insert()":
  # это оставляет окно между чтением и записью, где два конкурентных запроса оба увидят "домена
  # ещё нет" — гонка не решена. ON CONFLICT ... DO NOTHING RETURNING id атомарен на уровне СУБД:
  # из N параллельных INSERT ровно один получает непустой RETURNING, остальные — молчаливый конфликт.
  inserted = db.execute(
    "INSERT INTO widget_installs (project_id, domain, first_seen_at, last_seen_at) " +
    "VALUES (:project_id, :domain, :now, :now) " +
    "ON CONFLICT (project_id, domain) DO NOTHING RETURNING id",
    { project_id: project.id, domain: domain, now: now() }
  )
  if inserted.rows.length == 0:
    # Домен уже известен (или гонка проиграна конкуренту — эффект тот же) — PRD §2.4.1:
    # ни одно событие не эмитируется, обновляем только last_seen_at.
    db.execute(
      "UPDATE widget_installs SET last_seen_at = :now WHERE project_id = :project_id AND domain = :domain",
      { now: now(), project_id: project.id, domain: domain }
    )
    return
  # Новый домен — единственная точка эмиссии ОБОИХ событий сразу; гарантия "ровно один раз
  # на (project_id, domain)" — на уровне БД (unique-индекс + успешный INSERT), не приложения.
  emitEvent("widget_installed", { project_id: project.id, domain: domain })
  emitEvent("invite_shown", { project_id: project.id, domain: domain })
  notifyOwnerDashboard(project.id, type = "show_share_cta")  # при КАЖДОЙ новой установке — PRD §2.4.1
```

**Разбор гонки (обязательное требование):** два параллельных первых рендера на разных страницах ОДНОГО сайта не дают два `invite_shown`: оба `INSERT` бьются за одну пару `(project_id, domain)` под одним unique-индексом — под MVCC ровно одна транзакция коммитит и получает непустой `RETURNING`, вторая получает `ON CONFLICT DO NOTHING` и пусто; события эмитирует только победившая ветка. Рендеры на **разных** доменах одного проекта — не гонка: у каждого своя строка, оба `INSERT` независимо успешны, обе пары событий корректны (PRD §2.4.1, не дефект).

**Edge-case (Specification):** онбординг никогда не вызывает `recordInstallAndInviteIfNeeded` — она выполняется только из `widgetBootstrap` на **чужом** домене, поэтому на онбординге или при рендере на `OUR_APP_DOMAIN` события физически не могут сработать.

---
## 5. FR-GROWTH-003: серверная конфигурация виджета и защита badge

### 5.1 Выдача конфигурации с проверкой тарифа

```
function apiWidgetConfig(request):
  project = findProjectBySlug(request.query.slug)
  if project is null or project.deactivated:
    return HTTP 200 { testimonials: [], badge_required: true }  # безопасный дефолт
  # КРИТИЧНО: тариф читается на сервере из БД. Любой request.query.hide_badge ИГНОРИРУЕТСЯ.
  tariff = getProjectTariff(project.id)          # "free" | "paid" — источник истины: БД
  badge_required = (tariff == "free")            # true всегда для free, независимо от клиента
  return HTTP 200 {
    testimonials: serialize(getApprovedTestimonials(project.id, limit = 50)),
    badge_required: badge_required, project_slug: project.slug
  }
```

### 5.2 Детект попытки скрыть badge на клиенте и восстановление

> **Явная граница механизма (ADR-002, «Принято», остаточный риск).** Ниже — что `checkAndRestore` детектирует и чинит, и что не может в принципе: не баг реализации, а ограничение CSS/DOM, признанное в ADR-002. Недетектируемый случай закрывается условиями оферты (ToS), а не кодом — здесь намеренно нет попытки «дотянуться» до DOM хоста выше собственного shadow-root.

```
function startBadgeIntegrityWatch(host, badge_required):
  if not badge_required:
    return  # paid — badge не рендерится, следить не за чем
  badgeNode = host.querySelector(".pw-badge")
  observer = new MutationObserver(() => checkAndRestore(badgeNode))
  observer.observe(host, { attributes: true, childList: true, subtree: true })
  interval = setInterval(() => checkAndRestore(badgeNode), 2000ms)  # подстраховка без MutationObserver-триггера
function checkAndRestore(badgeNode):
  if badgeNode is null:
    return recreateBadgeNode()   # удалён из DOM целиком — пересоздать через renderBadge(host, true)
  # --- ДЕТЕКТИРУЕТСЯ И ЧИНИТСЯ: вмешательство в САМ узел badge ---
  style = computedStyle(badgeNode)
  isHiddenDirectly = (style.display == "none") or (style.visibility == "hidden") or (style.opacity == "0")
  if isHiddenDirectly:
    forceVisibleStyles(badgeNode)   # инлайн style с !important — действует, т.к. проблема на самом узле
    logClientEvent("badge_hide_attempt_blocked")
    return
  # --- НЕ ДЕТЕКТИРУЕТСЯ КАК "ЧИНИМО": скрыт РОДИТЕЛЬСКИЙ/оборачивающий элемент ---
  # offsetWidth/offsetHeight == 0 БЕЗ isHiddenDirectly почти наверняка означает, что скрыт ПРЕДОК
  # (напр. весь <div id="proofwall-widget"> с display:none СНАРУЖИ shadow-хоста) — computedStyle
  # (badgeNode) честно вернёт display != "none". forceVisibleStyles(badgeNode) здесь НИЧЕГО НЕ
  # ЧИНИТ: инлайн-стиль на самом badge не пересилит display:none на предке (ограничение каскада
  # CSS, не пробел в коде) — виджет не имеет доступа к DOM хоста выше своего корня. Только
  # фиксируем факт для наблюдаемости, без магии.
  hasZeroSize = (badgeNode.offsetWidth == 0 and badgeNode.offsetHeight == 0)
  if hasZeroSize:
    logClientEvent("badge_zero_size_detected_possible_ancestor_hide")  # ADR-002 остаточный риск — не чинится кодом
```

**Инвариант:** видимость badge для `free` — решение сервера (`badge_required` в ответе §5.1), клиент лишь исполняет и защищает от локального вмешательства **в сам узел**; попытка передать флаг отключения через запрос конфигурации отбрасывается на сервере. Скрытие узла-обёртки — известный, задокументированный в ADR-002 остаточный риск, не техническая задача этой недели.

---
## 6. FR-GROWTH-005: порог содержательности и управление `noindex`

```
CONTENT_THRESHOLD = { min_approved_count: 3, min_total_chars: 400 }
function recomputeContentThreshold(project_id):
  approved = getApprovedTestimonials(project_id)
  total_chars = sum(len(t.text) for t in approved)   # transcript НЕ считается text-контентом
  meets_threshold = (len(approved) >= CONTENT_THRESHOLD.min_approved_count)
                 and (total_chars >= CONTENT_THRESHOLD.min_total_chars)
  project = getProject(project_id)
  if meets_threshold and project.noindex:
    setProjectNoindex(project_id, false)
    writeAuditLog(action = "noindex_removed", entity = project_id, reason = "threshold_met")
  else if not meets_threshold and not project.noindex:
    setProjectNoindex(project_id, true)
    writeAuditLog(action = "noindex_applied", entity = project_id, reason = "below_threshold")
  # состояние уже соответствует расчёту → ничего не пишем (идемпотентно)
function renderWallOfLovePage(slug):
  project = findProjectBySlug(slug)
  if project is null:
    return HTTP 404
  html = serverRenderTemplate(project, getApprovedTestimonials(project.id))  # SSR, без JS
  if project.noindex:
    html.head.append('<meta name="robots" content="noindex">')
  # страница ВСЕГДА доступна людям по прямой ссылке — noindex не значит 404/403
  return HTTP 200 html
```

**Двусторонность:** `recomputeContentThreshold` вызывается при каждом изменении статуса, влияющем на approved-множество (§2) — одна и та же функция одинаково надёжно и снимает, и накладывает noindex.

**Anti-abuse: массовое создание проектов (@security)**

```
function onProjectCreated(account_id, project):
  if countProjectsCreatedByAccount(account_id, window = 1 hour) > 20:
    setProjectNoindex(project.id, forced = true)
    writeAuditLog(action = "forced_noindex_bulk_creation", entity = project.id,
                  reason = "over_20_projects_per_hour")
  # forced-флаг снимается только через обычный recomputeContentThreshold —
  # то есть исключительно за счёт реального контента, обходного пути нет
```

---
## 7. FR-GROWTH-002: партнёрская атрибуция

### 7.1 Промокод приоритетнее cookie

```
function resolveAttribution(request):
  promo_code = request.body.promo_code              # вводится явно при оплате
  if promo_code is not empty:
    partner = findPartnerByCode(promo_code)
    return (partner is null) ? { source: null } : { source: "promo_code", partner_id: partner.id }
  cookie_ref = readCookie(request, "pw_ref")         # может отсутствовать (Safari ITP ~7 дней)
  if cookie_ref is not empty:
    partner = findPartnerByCode(cookie_ref)
    if partner is not null:
      return { source: "cookie", partner_id: partner.id }
  return { source: null }
```

**Правило приоритета зафиксировано порядком проверок**: промокод проверяется первым и, если валиден, **полностью замещает** cookie — расхождение (cookie у A, промокод у B) разрешается в пользу B как явного намерения пользователя.

### 7.2 `pending` до оплаты, начисление по вебхуку, идемпотентность, self-referral

```
function onSignup(request):
  attribution = resolveAttribution(request)
  if attribution.source is not null:
    createAttributionRecord(account_id = newAccount.id, partner_id = attribution.partner_id,
                             source = attribution.source, status = "pending")  # НЕ начисляем на регистрации
function onPaymentWebhook(raw_body, headers):
  # ШАГ 1 — подпись, ДО всего остального (FR-GROWTH-002 @security).
  # Порядок принципиален: если сначала записать event.id, а подпись проверить после,
  # злоумышленник шлёт поддельный вебхук с угаданным id → мы его записываем →
  # настоящий вебхук отбрасывается как дубль. Комиссия не начисляется никогда.
  # Считаем HMAC от СЫРОГО тела: любая пере-сериализация JSON ломает подпись.
  expected = hmacSha256(raw_body, env.PAYMENT_WEBHOOK_SECRET)
  if not constantTimeEquals(expected, headers.signature):   # не ==, защита от timing-атаки
    auditLog("webhook_signature_invalid", { ip: request.ip })
    return HTTP 400                                 # НЕ 200: провайдер должен увидеть отказ
  if isReplayTooOld(headers.timestamp, max_age = 5 minutes):
    auditLog("webhook_timestamp_stale", { ip: request.ip })
    return HTTP 400                                 # защита от повтора старого валидного тела

  event = parseJson(raw_body)                       # парсим ТОЛЬКО после проверки подписи

  if webhookEventStore.exists(event.id):           # идемпотентность по event id (@security)
    return HTTP 200                                 # уже обработан — тихий no-op
  webhookEventStore.record(event.id)
  if event.type != "payment_succeeded":
    return HTTP 200
  attribution = getPendingAttribution(event.account_id)
  if attribution is null:
    return HTTP 200  # нет атрибуции — обычная оплата без партнёра
  partner = getPartner(attribution.partner_id)
  account = getAccount(event.account_id)
  if partner.email == account.email or partner.account_id == account.id:   # self-referral
    updateAttribution(attribution.id, { status: "rejected", reason: "self_referral" })
    writeAuditLog(action = "self_referral_blocked", entity = attribution.id, actor = account.id)
    return HTTP 200
  recordCommission(partner_id = partner.id, payment_event_id = event.id,   # ссылка на платёж
                    amount = calculateCommission(event.amount, partner.rate))
  updateAttribution(attribution.id, { status: "converted" })
  emitEvent("referral_attributed", { partner_id: partner.id, account_id: account.id })
  return HTTP 200
function getPendingAttribution(account_id):         # окно атрибуции: 30 дней
  attribution = findAttribution(account_id, status = "pending")
  if attribution is null:
    return null
  if now() - attribution.created_at > 30 days:
    updateAttribution(attribution.id, { status: "expired" })
    return null
  return attribution
```

---
## 8. Anti-fraud: накрутка регистраций по партнёрскому коду

Отдельно от self-referral (§7.2) — детект **массовой** накрутки с одного IP (FR-GROWTH-004 `@security`): >50 регистраций по одному коду с одного IP за 10 минут.

```
function onSignupViaPartnerCode(code, request):
  ip = extractClientIP(request)
  if signupStore.countByCodeAndIP(code, ip, window = 10 minutes) > 50:
    flagSignupAsSuspectedFraud(request.new_account_id, reason = "over_50_per_ip_per_10min")
    writeAuditLog(action = "suspected_fraud_flagged", entity = request.new_account_id,
                  code = code, ip_hash = hash(ip))
    blockCommissionUntilManualReview(request.new_account_id)   # без начисления до ручной проверки
    return
  signupStore.record(code, ip, timestamp = now())
function revokePartnerCode(code):
  setPartnerCodeStatus(code, "revoked")   # только НОВЫЕ атрибуции; история immutable, откат не выполняется
```

---
## 9. FR-001: регистрация, проект, слаг, три ссылки

```
SLUG_PATTERN = ^[a-z0-9-]{3,40}$
function registerAccountAndProject(request):
  errors = []
  if not isValidEmail(request.email):
    errors.append("email: некорректный формат")
  if len(request.password) < 8:
    errors.append("password: минимум 8 символов")
  if errors is not empty:
    return HTTP 400 { errors }
  if accountExistsByEmail(request.email):
    return HTTP 409 { error: "аккаунт с таким email уже существует" }
  account = createAccount(email = request.email, password_hash = hashPassword(request.password))
  if request.desired_slug is not empty:
    # Пользователь ЯВНО ввёл слаг — не подменяем его молча случайным вариантом.
    slug = normalizeSlug(request.desired_slug)
    if not matches(slug, SLUG_PATTERN):
      return HTTP 400 { errors: ["slug: ожидается " + SLUG_PATTERN] }
    if projectExistsBySlug(slug):
      return HTTP 409 { error: "slug уже занят", field: "slug" }
  else:
    # Слаг не задан явно — выведен из названия проекта, можно доподбирать автоматически.
    slug = ensureUniqueSlug(normalizeSlug(deriveSlugFrom(request.project_name)))
  project = createProject(account_id = account.id, slug = slug,
                           tier = "free", noindex = true, created_at = now())
  session = createSession(account.id)
  writeAuditLog(action = "account_and_project_created", entity = project.id, actor = account.id)
  return HTTP 201 {
    account_id: account.id, project_slug: project.slug, session_cookie: session.opaque_token,
    urls: {
      dashboard: BASE_URL + "/dashboard/" + project.slug,
      wall_of_love: BASE_URL + "/w/" + project.slug,
      submission_form: BASE_URL + "/f/" + project.slug
    }
  }
function normalizeSlug(raw):
  slug = lowercase(raw or "")
  slug = replaceAll(slug, /[^a-z0-9-]/, "-")   # пробелы/спецсимволы → дефис
  slug = collapseRepeatedDashes(slug)
  slug = trimLeadingTrailingDashes(slug)
  slug = slug[0:40]
  if len(slug) < 3:
    slug = slug + "-" + randomAlphaNum(3)      # "ab" -> "ab-x7q", гарантирует минимум 3 символа
  return slug
function ensureUniqueSlug(candidate):
  slug = candidate
  attempt = 0
  while projectExistsBySlug(slug):
    attempt += 1
    if attempt > 10:
      raise InternalError("не удалось подобрать уникальный слаг за 10 попыток")
    suffix = "-" + randomAlphaNum(4)
    slug = truncate(candidate, 40 - len(suffix)) + suffix
  return slug
```

**Граничные случаи:** email занят → 409; явно указанный слаг вне `SLUG_PATTERN` → 400; явно указанный и уже занятый слаг → 409 (пользователь выбирает другой сам, без магии); авто-слаг из названия проекта донабирается случайным суффиксом молча — это не пользовательский выбор, подменять нечего.

---
## 10. FR-GROWTH-004 (часть): персональные коды партнёрам и когортный дашборд

```
function issuePartnerCode(admin_actor, partner_name):
  # Выдача — административное действие. Specification не описывает partner self-signup в MVP
  # недели, поэтому здесь нет отдельной аутентификации партнёра — см. GAP ниже.
  code = generateCode(partner_name)   # напр. "PARTNERNAME-XXXX" — человекочитаемый + случайный суффикс
  attempt = 0
  while partnerCodeExistsByCode(code):
    attempt += 1
    if attempt > 10:
      raise InternalError("не удалось подобрать уникальный код партнёра за 10 попыток")
    code = generateCode(partner_name)
  partner_code = createPartnerCode(code = code, partner_name = partner_name, status = "active")
  writeAuditLog(action = "partner_code_issued", entity = partner_code.id, actor = admin_actor.id)
  return HTTP 201 { code: partner_code.code, referral_url: BASE_URL + "?ref=" + partner_code.code }
function getPartnerCohortDashboard(partner_code):
  code_row = getPartnerCodeByCode(partner_code)
  if code_row is null:
    return HTTP 404
  attributions = findAttributionsByPartnerCode(code_row.id)   # все статусы: pending/converted/expired/rejected
  signups = count(attributions)
  conversions = count(a for a in attributions if a.status == "converted")
  return HTTP 200 {
    partner_name: code_row.partner_name, code_status: code_row.status,
    cohort: {
      signups: signups, conversions: conversions,
      conversion_rate: (signups > 0) ? (conversions / signups) : null,  # null ≠ 0 — "нет данных" не то же, что "0%"
      total_commission: sum(c.amount for c in getCommissionsByPartnerCode(code_row.id))
    }
  }
```

[GAP: способ аутентификации партнёра для самостоятельного просмотра своего когортного дашборда не описан в Specification/PRD — сейчас `getPartnerCohortDashboard` предполагается вызываемой из админки владельца продукта, не партнёром напрямую]

---
## 11. FR-NFR-A11Y-001: доступность публичной страницы — чек-лист, не алгоритм

Доступность — не ветвящаяся логика, а набор инвариантов, проверяемых при каждом рендере. Честнее описать их как чек-лист, привязанный к месту в разметке, чем изображать несуществующий «алгоритм доступности».

| # | Требование | Где проверяется |
|---|---|---|
| A1 | Семантика: `<main>`, `<h1>` заголовок стены, каждый отзыв — `<article>` | `renderWallOfLovePage` (§6) |
| A2 | Контраст текста ≥ 4.5:1 (WCAG AA) для цветов из `project.branding` | CI: детерминированная проверка контраста на билд-шаге |
| A3 | Видео-отзыв: `<video controls>` + `<track kind="captions">` из `transcript`, когда `transcript_status = 'completed'` | Шаблон рендера видео-карточки |
| A4 | У каждого поля формы (`/f/<slug>`) есть `<label>`; ошибки валидации объявлены через `aria-live="polite"`, не только цветом | Шаблон формы |
| A5 | Клавиатурная навигация: все интерактивные элементы (в т.ч. кнопки модерации) достижимы Tab, виден `:focus` | `axe-core` в E2E + ручной чек |
| A6 | Badge-ссылка (`.pw-badge`) имеет `aria-label="Powered by Proofwall"`, не только иконку | `renderBadge` (§5) |
| A7 | Shadow DOM виджета не ломает порядок табуляции хост-страницы | E2E-фикстура Refinement §1.1 |

**CI-гейт:** `axe-core` (или эквивалент) — по ladder-правилу проекта детерминированно проверяемые пункты (A2, A6, часть A5) уходят в CI, а не в чек-лист ревьюера; пункты, требующие живого взаимодействия (реальный порядок табуляции при загруженном виджете) — в E2E.

---
## Открытые вопросы

- [GAP: точное определение "внешнего домена" — allowlist поддоменов клиента или просто `!= OUR_APP_DOMAIN`; влияет на §4 при staging/preview-доменах владельца]
- [GAP: политика повторной попытки транскрипции при `ClaudeApiError` — одна попытка или retry с backoff; §1.1 сейчас ставит `transcript_status: 'failed'` без ретрая, но статус позволяет вернуть строку в очередь]
- [GAP: ставка комиссии по умолчанию (`partner.rate`) — не задана в PRD/Specification]
- [GAP: способ аутентификации партнёра для доступа к своему когортному дашборду (§10) — не описан в PRD/Specification]
