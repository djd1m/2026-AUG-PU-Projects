# Pseudocode — Proofwall

> SPARC Phase: **Pseudocode**. Источник: [`Specification.md`](Specification.md), [`PRD.md`](PRD.md).
> Алгоритмы для каждого FR из Specification. Явная обработка ошибок и граничных случаев.
> Стек: Next.js + Supabase (Postgres + Storage + Auth) + Claude API + отдельный JS-виджет.

---

## 1. Приём отзыва: текст (FR-002) и видео (FR-003)

### 1.1 Общая точка входа формы

```
function submitTestimonial(request):
  # --- Rate limit: 5 отправок с IP в час на проект (FR-NFR-SEC-003) ---
  project = findProjectBySlug(request.slug)
  if project is null:
    return HTTP 404  # не раскрываем существование/несуществование деталей

  ip = extractClientIP(request)
  key = hash(ip + project.id)
  count = rateLimitStore.count(key, window = 1 hour)
  if count >= 5:
    return HTTP 429  # без деталей о лимите — anti-enumeration

  # --- Валидация входа на границе системы ---
  errors = []
  if not (2 <= len(request.name) <= 80):
    errors.append("name: 2-80 символов")
  if request.type == "text":
    if not (10 <= len(request.text) <= 2000):
      errors.append("text: 10-2000 символов")
  else if request.type == "video":
    # см. 1.2 — отдельная ветка с собственными лимитами
    pass
  else:
    errors.append("type: ожидается text|video")

  if errors is not empty:
    return HTTP 400 { errors }

  rateLimitStore.increment(key, window = 1 hour)

  if request.type == "text":
    testimonial = createTestimonial(
      project_id = project.id,
      author_name = request.name,
      author_role = request.role or null,
      text = request.text,          # ИСХОДНЫЙ текст, побайтово как отправлен
      transcript = null,
      photo_url = uploadIfPresent(request.photo),
      status = "pending",
      created_at = now()
    )
  else:
    testimonial = handleVideoTestimonial(project, request)  # 1.2

  writeAuditLog(action = "testimonial_created", entity = testimonial.id, actor = "public")
  return HTTP 201 { testimonial.public_id }
```

**Граничные случаи, покрытые явно:**
- Проект не найден → 404, без утечки, попадал ли когда-либо слаг в систему.
- Лимит превышен → 429 без деталей (не сообщаем текущий счётчик — защита от подбора окна).
- Пустой/некорректный `type` → 400 с явным перечислением допустимых значений.
- Текст сохраняется **как есть** — ни один шаг не переписывает `request.text` (FR-NFR-SEC-002).

### 1.2 Видео-путь (FR-003)

```
function handleVideoTestimonial(project, request):
  # --- Лимиты видео: 120 сек, 100 MB, webm/mp4 ---
  if request.video.duration_sec > 120:
    raise ValidationError("видео длиннее 120 секунд")
  if request.video.size_bytes > 100 * MB:
    raise ValidationError("видео больше 100 MB")
  if request.video.mime not in ["video/webm", "video/mp4"]:
    raise ValidationError("недопустимый формат: разрешены webm, mp4")

  # --- Доступ к камере отказан на клиенте → форма уже прислала fallback-файл ---
  # (обработка "отказано в доступе" происходит на клиенте ДО сабмита: см. 1.3)

  video_url = uploadToStorage(bucket = "testimonial-videos", file = request.video)

  testimonial = createTestimonial(
    project_id = project.id,
    author_name = request.name,
    author_role = request.role or null,
    text = request.text_caption or "",   # опциональная подпись автора, НЕ транскрипт
    video_url = video_url,
    transcript = null,                    # заполняется асинхронно, см. ниже
    status = "pending",
    created_at = now()
  )

  # --- Транскрипция асинхронная: не блокирует ответ пользователю ---
  enqueueJob("transcribe_video", { testimonial_id: testimonial.id, video_url: video_url })

  return testimonial

function transcribeVideoJob(testimonial_id, video_url):
  testimonial = getTestimonial(testimonial_id)
  if testimonial is null:
    return  # отзыв удалён до обработки — не ошибка

  try:
    audio = extractAudioTrack(video_url)
    transcript_text = claudeApi.transcribe(audio)   # ТОЛЬКО расшифровка речи
    # ВАЖНО (FR-NFR-SEC-002): транскрипт — ОТДЕЛЬНОЕ поле.
    # Он НИКОГДА не пишется в testimonial.text и не подменяет исходный текст/подпись.
    updateTestimonial(testimonial_id, {
      transcript: transcript_text,
      transcript_source: "machine",        # обязательная пометка для публичного рендера
      transcript_status: "ready"
    })
  catch ClaudeApiError as e:
    updateTestimonial(testimonial_id, { transcript_status: "failed" })
    logError("transcription_failed", testimonial_id, e)
    # отзыв остаётся валидным и модерируемым даже без транскрипта
```

### 1.3 Клиентская обработка отказа в доступе к камере

```
function onCameraAccessRequest():
  try:
    stream = requestCameraPermission()
    return renderRecorder(stream)
  catch PermissionDeniedError:
    showMessage("Доступ к камере не разрешён. Загрузите файл вместо записи.")
    return renderFileUploadFallback()
  catch DeviceNotFoundError:
    showMessage("Камера не найдена. Загрузите файл.")
    return renderFileUploadFallback()
```

---

## 2. Модерация (FR-004): переходы состояний

```
STATES = { pending, approved, rejected, hidden }

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

  # --- Мульти-арендность (FR-NFR-SEC-001): проверка владения ДО любого действия ---
  if testimonial.project_id != actor.project_id:
    writeAuditLog(action = "moderation_denied_cross_project",
                  entity = testimonial_id, actor = actor.id)
    return HTTP 403

  if target_state not in ALLOWED_TRANSITIONS[testimonial.status]:
    return HTTP 400 { error: "недопустимый переход "
                      + testimonial.status + " -> " + target_state }

  previous_state = testimonial.status
  updateTestimonial(testimonial_id, { status: target_state, moderated_at: now() })

  writeAuditLog(
    action = "state_transition",
    entity = testimonial_id,
    actor = actor.id,
    from = previous_state,
    to = target_state,
    timestamp = now()
  )

  # Переход в/из approved влияет на публичную видимость и на порог FR-GROWTH-005
  if target_state == "approved" or previous_state == "approved":
    recomputeContentThreshold(testimonial.project_id)   # см. §6

  return HTTP 200 { testimonial }
```

**Инвариант:** только `approved` виден на `/w/<slug>` и в виджете (запрос данных виджета/стены
всегда фильтрует `WHERE status = 'approved' AND project_id = :current_project`).

---

## 3. Жизненный цикл виджета (FR-006)

```
# --- Клиентская часть: <script src=".../widget.js" data-slug="acme" async> ---

function widgetBootstrap(scriptTag):
  slug = scriptTag.getAttribute("data-slug")
  if slug is empty:
    logWarning("widget: data-slug отсутствует, рендер отменён")
    return

  host = shadowDom.attach(mountPoint())   # изоляция стилей хоста
  injectScopedStyles(host)                # префиксованные/scoped CSS, не глобальные

  config = fetchWidgetConfig(slug, currentDomain())   # см. §5 — серверная проверка тарифа
  if config is null:
    renderEmptyPlaceholder(host)          # проект не найден/деактивирован — тихий no-op
    return

  renderTestimonials(host, config.testimonials)
  renderBadge(host, config.badge_required)  # FR-GROWTH-003 — решение сервера, не клиента

  recordFirstRenderIfNeeded(slug, currentDomain())    # см. §4 — invite_shown
  startBadgeIntegrityWatch(host, config.badge_required)  # см. §5.2
  emitEvent("badge_impression", { slug, domain: currentDomain() })

function fetchWidgetConfig(slug, domain):
  response = httpGet("/api/widget-config?slug=" + slug, timeout = 300ms)
  if response.status != 200:
    return null
  return response.json()
```

**Производительность (NFR):** `widgetBootstrap` не должна блокировать `window.onload` хоста —
скрипт подключается с `async`; бандл ≤ 30 KB gzip измеряется в CI (см. Refinement.md).

**Фиксация домена установки** — единственный источник метрики недели (`widget_installed`),
логика — в §4, так как она пересекается с определением момента ценности.

---

## 4. FR-GROWTH-001: момент ценности и `invite_shown` ровно один раз

Ключевая сложность: «первый рендер на внешнем домене» должен фиксироваться **идемпотентно**
при параллельных загрузках страницы (несколько вкладок, несколько посетителей одновременно).

```
function recordFirstRenderIfNeeded(project_slug, domain):
  project = findProjectBySlug(project_slug)
  if project is null:
    return

  # domain здесь — домен, на котором рендерится виджет (может отличаться от домена панели)
  # "внешний" = не наш собственный домен приложения/панели
  if domain == OUR_APP_DOMAIN:
    return  # рендер в превью/дашборде не считается установкой

  # --- Атомарная операция на сервере: UPSERT с условием "ещё не было" ---
  # Используем уникальный индекс (project_id) на таблице widget_install_events
  # и INSERT ... ON CONFLICT DO NOTHING, чтобы конкурентные запросы не создали дубль.
  inserted = db.transaction(() => {
    result = db.execute(
      "INSERT INTO widget_install_events (project_id, domain, installed_at) "
      + "VALUES (:project_id, :domain, :now) "
      + "ON CONFLICT (project_id) DO NOTHING "
      + "RETURNING id",
      { project_id: project.id, domain: domain, now: now() }
    )
    return result.rows.length > 0   # true только у ТОГО запроса, что реально вставил строку
  })

  if not inserted:
    return  # это не первый рендер (или гонка — конкурент уже вставил) — не событие

  # --- Мы точно первый рендер на внешнем домене: единственная точка эмиссии invite_shown ---
  emitEvent("widget_installed", { project_id: project.id, domain: domain })
  emitEvent("invite_shown", { project_id: project.id })   # пишется РОВНО 1 раз — гарантия БД, не приложения

  notifyOwnerDashboard(project.id, type = "show_share_cta")
```

**Почему гарантия на уровне БД, а не в коде сервиса:** без уникального индекса + `ON CONFLICT`
гонка из двух одновременных первых визитов на новый домен могла бы дважды пройти проверку
`if not exists(...)` до записи и дважды выполнить `emitEvent`. `INSERT ... ON CONFLICT DO
NOTHING RETURNING id` делает "первый вставил — тот и событие" атомарным на уровне СУБД.

**Условие показа CTA (edge-case из Specification):**
- 0 одобренных отзывов → `fetchWidgetConfig` не должен даже отдавать успешный конфиг для
  внешнего рендера в продовом сценарии, но даже если бы отрендерился — `invite_shown`
  триггерится только реальным первым внешним рендером, не действием на онбординге.
- Онбординг никогда не вызывает `recordFirstRenderIfNeeded` — эта функция вызывается только
  из `widgetBootstrap`, который выполняется на **чужом** домене.

---

## 5. FR-GROWTH-003: серверная конфигурация виджета и защита badge

### 5.1 Выдача конфигурации с проверкой тарифа

```
function apiWidgetConfig(request):
  slug = request.query.slug
  project = findProjectBySlug(slug)
  if project is null or project.deactivated:
    return HTTP 200 { testimonials: [], badge_required: true }  # безопасный дефолт

  # --- КРИТИЧНО: тариф читается на сервере из БД, НЕ из query/тела запроса ---
  # Любой параметр вида request.query.hide_badge ИГНОРИРУЕТСЯ полностью.
  tariff = getProjectTariff(project.id)   # "free" | "paid" — источник истины: БД

  badge_required = (tariff == "free")     # true всегда для free, независимо от клиента

  testimonials = getApprovedTestimonials(project.id, limit = 50)

  return HTTP 200 {
    testimonials: serialize(testimonials),
    badge_required: badge_required,
    project_slug: slug
  }
```

### 5.2 Детект попытки скрыть badge на клиенте и восстановление

```
function startBadgeIntegrityWatch(host, badge_required):
  if not badge_required:
    return  # paid-тариф — badge и так не рендерится, следить не за чем

  badgeNode = host.querySelector(".pw-badge")

  observer = new MutationObserver(() => checkAndRestore(badgeNode))
  observer.observe(host, { attributes: true, childList: true, subtree: true })

  # Периодическая подстраховка на случай точечных inline-стилей без MutationObserver-триггера
  interval = setInterval(() => checkAndRestore(badgeNode), 2000ms)

function checkAndRestore(badgeNode):
  if badgeNode is null:
    return  # badge был удалён из DOM целиком — пересоздать
    # (в реализации: re-render badge через renderBadge(host, true))

  style = computedStyle(badgeNode)
  isHidden = (style.display == "none")
          or (style.visibility == "hidden")
          or (style.opacity == "0")
          or (badgeNode.offsetWidth == 0 and badgeNode.offsetHeight == 0)

  if isHidden:
    forceVisibleStyles(badgeNode)   # перезаписываем инлайновым style с !important
    logClientEvent("badge_hide_attempt_blocked")
```

**Инвариант:** видимость badge для `free` — это решение сервера (`badge_required` в ответе
`apiWidgetConfig`), клиент лишь исполняет и защищает от локального вмешательства. Любая попытка
передать флаг отключения badge в запросе конфигурации отбрасывается на сервере (см. 5.1).

---

## 6. FR-GROWTH-005: порог содержательности и управление `noindex`

```
CONTENT_THRESHOLD = {
  min_approved_count: 3,
  min_total_chars: 400
}

function recomputeContentThreshold(project_id):
  approved = getApprovedTestimonials(project_id)

  approved_count = len(approved)
  total_chars = sum(len(t.text) for t in approved)   # transcript НЕ считаем как text-контент

  meets_threshold = (approved_count >= CONTENT_THRESHOLD.min_approved_count)
                 and (total_chars >= CONTENT_THRESHOLD.min_total_chars)

  project = getProject(project_id)
  if meets_threshold and project.noindex:
    setProjectNoindex(project_id, false)
    writeAuditLog(action = "noindex_removed", entity = project_id, reason = "threshold_met")
  else if not meets_threshold and not project.noindex:
    setProjectNoindex(project_id, true)
    writeAuditLog(action = "noindex_applied", entity = project_id, reason = "below_threshold")
  # если состояние уже соответствует расчёту — ничего не пишем (идемпотентно)

function renderWallOfLovePage(slug):
  project = findProjectBySlug(slug)
  if project is null:
    return HTTP 404

  approved = getApprovedTestimonials(project.id)
  html = serverRenderTemplate(project, approved)  # SSR, отдаётся без JS

  if project.noindex:
    html.head.append('<meta name="robots" content="noindex">')
  # страница ВСЕГДА доступна людям по прямой ссылке — noindex не значит 404/403

  return HTTP 200 html
```

**Двусторонность (Specification @edge-case):** `recomputeContentThreshold` вызывается при
**каждом** изменении статуса, влияющем на approved-множество (§2), поэтому и падение ниже
порога (после отмены модерации), и достижение порога обрабатываются одной функцией — noindex
снимается и накладывается одинаково надёжно.

**Anti-abuse для scaled content (Specification @security):**

```
function onProjectCreated(account_id, project):
  recent_count = countProjectsCreatedByAccount(account_id, window = 1 hour)
  if recent_count > 20:
    setProjectNoindex(project.id, forced = true)
    writeAuditLog(action = "forced_noindex_bulk_creation",
                  entity = project.id, reason = "over_20_projects_per_hour")
  # forced-флаг снимается только через обычный recomputeContentThreshold,
  # то есть исключительно за счёт реального контента — принудительность не даёт обходной путь
```

---

## 7. FR-GROWTH-002: партнёрская атрибуция

### 7.1 Разрешение источника атрибуции: промокод приоритетнее cookie

```
function resolveAttribution(request):
  cookie_ref = readCookie(request, "pw_ref")           # может отсутствовать (Safari ITP ~7 дней)
  promo_code = request.body.promo_code                  # вводится явно при оплате

  if promo_code is not empty:
    partner = findPartnerByCode(promo_code)
    if partner is null:
      return { source: null }   # неизвестный код — не считаем атрибуцией, но и не блокируем оплату
    return { source: "promo_code", partner_id: partner.id }

  if cookie_ref is not empty:
    partner = findPartnerByCode(cookie_ref)
    if partner is not null:
      return { source: "cookie", partner_id: partner.id }

  return { source: null }
```

**Правило приоритета зафиксировано именно порядком проверок**: промокод проверяется первым и,
если валиден, **полностью замещает** cookie — расхождение (cookie у партнёра A, промокод у
партнёра B) разрешается в пользу B, как явного намерения пользователя (Specification §2).

### 7.2 Атрибуция держится в `pending` до оплаты, начисление — по вебхуку

```
function onSignup(request):
  attribution = resolveAttribution(request)
  if attribution.source is not null:
    createAttributionRecord(
      account_id = newAccount.id,
      partner_id = attribution.partner_id,
      source = attribution.source,
      status = "pending"          # НЕ начисляем на регистрации
    )

function onPaymentWebhook(event):
  # --- Идемпотентность по event id (обязательное требование @security) ---
  if webhookEventStore.exists(event.id):
    return HTTP 200  # уже обработан — тихий no-op, без повторного начисления
  webhookEventStore.record(event.id)

  if event.type != "payment_succeeded":
    return HTTP 200

  attribution = getPendingAttribution(event.account_id)
  if attribution is null:
    return HTTP 200  # нет атрибуции — обычная оплата без партнёра

  partner = getPartner(attribution.partner_id)
  account = getAccount(event.account_id)

  # --- Self-referral detection (@security) ---
  if partner.email == account.email or partner.account_id == account.id:
    updateAttribution(attribution.id, { status: "rejected", reason: "self_referral" })
    writeAuditLog(action = "self_referral_blocked",
                  entity = attribution.id, actor = account.id)
    return HTTP 200

  commission = calculateCommission(event.amount, partner.rate)
  recordCommission(
    partner_id = partner.id,
    payment_event_id = event.id,   # ссылка на платёж — обязательное требование DoD
    amount = commission
  )
  updateAttribution(attribution.id, { status: "converted" })
  emitEvent("referral_attributed", { partner_id: partner.id, account_id: account.id })

  return HTTP 200
```

**Окно атрибуции:** 30 дней от регистрации до оплаты (Specification, happy-path). Атрибуции
старше окна на момент оплаты не конвертируются:

```
function getPendingAttribution(account_id):
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

Отдельно от self-referral (§7.2) — детект **массовой** накрутки с одного источника
(Specification FR-GROWTH-004 @security).

```
function onSignupViaPartnerCode(code, request):
  ip = extractClientIP(request)
  window_key = hash(code + ip)

  recent_signups = signupStore.countByCodeAndIP(code, ip, window = 10 minutes)

  if recent_signups > 50:
    flagSignupAsSuspectedFraud(request.new_account_id, reason = "over_50_per_ip_per_10min")
    writeAuditLog(action = "suspected_fraud_flagged",
                  entity = request.new_account_id, code = code, ip_hash = hash(ip))
    # Комиссия по помеченным регистрациям не начисляется до ручной проверки:
    blockCommissionUntilManualReview(request.new_account_id)
    return

  signupStore.record(code, ip, timestamp = now())
```

**Отзыв кода не ретроактивен (Specification @edge-case):** ранее начисленные комиссии по
отозванному коду не пересчитываются — `revokePartnerCode` только помечает код неактивным для
**новых** атрибуций, историю не трогает:

```
function revokePartnerCode(code):
  setPartnerCodeStatus(code, "revoked")
  # НЕ вызывает пересчёт/откат уже записанных commission — история immutable
```

---

## Открытые вопросы (не додуманы за спецификацию)

- [GAP: нужно точное определение "внешнего домена" — allowlist поддоменов клиента или просто
  `!= OUR_APP_DOMAIN`; влияет на §4 при staging/preview-доменах владельца]
- [GAP: нужна политика повторной попытки транскрипции при `ClaudeApiError` — одна попытка или
  retry с backoff; §1.2 сейчас помечает `transcript_status: failed` без ретрая]
- [GAP: нужна ставка комиссии по умолчанию (`partner.rate`) — не задана в PRD/Specification]
