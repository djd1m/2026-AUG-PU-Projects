# Pseudocode — Proofwall

> SPARC Phase: **Pseudocode**. Источник: [`Specification.md`](Specification.md), [`PRD.md`](PRD.md).
> Алгоритмы для каждого FR из Specification. Явная обработка ошибок и граничных случаев.
> Стек (Architecture Constraints p-replicator): распределённый монолит в монорепо,
> Docker + Docker Compose, **PostgreSQL в контейнере**, MCP-серверы. Приложение — Next.js,
> виджет — отдельный бандл, Claude API через MCP.

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

  # --- Валидация на границе системы ---
  errors = []
  if not (2 <= len(request.name) <= 80):
    errors.append("name: 2-80 символов")
  if request.type == "text" and not (10 <= len(request.text) <= 2000):
    errors.append("text: 10-2000 символов")
  else if request.type not in ["text", "video"]:
    errors.append("type: ожидается text|video")
  if errors is not empty:
    return HTTP 400 { errors }

  rateLimitStore.increment(key, window = 1 hour)

  if request.type == "text":
    testimonial = createTestimonial(
      project_id = project.id, author_name = request.name,
      author_role = request.role or null,
      text = request.text,          # ИСХОДНЫЙ текст, побайтово как отправлен
      transcript = null, photo_url = uploadIfPresent(request.photo),
      status = "pending", created_at = now()
    )
  else:
    testimonial = handleVideoTestimonial(project, request)  # §1.1

  writeAuditLog(action = "testimonial_created", entity = testimonial.id, actor = "public")
  return HTTP 201 { testimonial.public_id }
```

**Граничные случаи:** проект не найден → 404 без утечки; лимит превышен → 429 без счётчика
(защита от подбора окна); `type` вне `text|video` → 400. Текст сохраняется **как есть** — ни
один шаг пайплайна не переписывает `request.text` (FR-NFR-SEC-002).

### 1.1 Видео-путь (FR-003): лимиты, загрузка, асинхронная транскрипция

```
function handleVideoTestimonial(project, request):
  if request.video.duration_sec > 120:
    raise ValidationError("видео длиннее 120 секунд")
  if request.video.size_bytes > 100 * MB:
    raise ValidationError("видео больше 100 MB")
  if request.video.mime not in ["video/webm", "video/mp4"]:
    raise ValidationError("недопустимый формат: разрешены webm, mp4")
  # отказ в доступе к камере обрабатывается на клиенте ДО сабмита — см. §1.2

  video_url = uploadToStorage(bucket = "testimonial-videos", file = request.video)
  testimonial = createTestimonial(
    project_id = project.id, author_name = request.name,
    author_role = request.role or null,
    text = request.text_caption or "",   # опциональная подпись автора, НЕ транскрипт
    video_url = video_url, transcript = null,   # заполняется асинхронно
    status = "pending", created_at = now()
  )
  enqueueJob("transcribe_video", { testimonial_id: testimonial.id, video_url: video_url })
  return testimonial

function transcribeVideoJob(testimonial_id, video_url):
  testimonial = getTestimonial(testimonial_id)
  if testimonial is null:
    return  # отзыв удалён до обработки — не ошибка
  try:
    audio = extractAudioTrack(video_url)
    transcript_text = claudeApi.transcribe(audio)   # ТОЛЬКО расшифровка речи
    # FR-NFR-SEC-002: транскрипт — ОТДЕЛЬНОЕ поле, никогда не пишется в testimonial.text
    updateTestimonial(testimonial_id, {
      transcript: transcript_text, transcript_source: "machine", transcript_status: "ready"
    })
  catch ClaudeApiError as e:
    updateTestimonial(testimonial_id, { transcript_status: "failed" })
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

**Инвариант:** только `approved` виден на `/w/<slug>` и в виджете — запрос всегда фильтрует
`WHERE status='approved' AND project_id=:current_project`.

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
  recordFirstRenderIfNeeded(slug, currentDomain())       # §4 — invite_shown
  startBadgeIntegrityWatch(host, config.badge_required)  # §5.2
  emitEvent("badge_impression", { slug, domain: currentDomain() })

function fetchWidgetConfig(slug, domain):
  response = httpGet("/api/widget-config?slug=" + slug, timeout = 300ms)
  return (response.status == 200) ? response.json() : null
```

**NFR:** `widgetBootstrap` не блокирует `window.onload` хоста (`async`); бандл ≤ 30 KB gzip и
p95 ≤ 300 мс измеряются в CI (см. Refinement.md). Фиксация домена установки — единственный
источник метрики недели, логика — в §4, где она пересекается с моментом ценности.

---

## 4. FR-GROWTH-001: момент ценности и `invite_shown` ровно один раз

Сложность: «первый рендер на внешнем домене» должен фиксироваться **идемпотентно** при
параллельных загрузках (несколько вкладок/посетителей одновременно).

```
function recordFirstRenderIfNeeded(project_slug, domain):
  project = findProjectBySlug(project_slug)
  if project is null:
    return
  if domain == OUR_APP_DOMAIN:
    return  # рендер в превью/дашборде не считается установкой

  # Атомарная операция на СУБД: уникальный индекс (project_id) + ON CONFLICT DO NOTHING —
  # конкурентные первые визиты не могут создать дубль или дважды пройти проверку "ещё не было".
  inserted = db.transaction(() => {
    result = db.execute(
      "INSERT INTO widget_install_events (project_id, domain, installed_at) " +
      "VALUES (:project_id, :domain, :now) ON CONFLICT (project_id) DO NOTHING RETURNING id",
      { project_id: project.id, domain: domain, now: now() }
    )
    return result.rows.length > 0   # true только у запроса, что реально вставил строку
  })
  if not inserted:
    return  # не первый рендер (или проиграна гонка конкуренту) — не событие

  # Единственная точка эмиссии invite_shown — гарантия уникальности на уровне БД, не приложения
  emitEvent("widget_installed", { project_id: project.id, domain: domain })
  emitEvent("invite_shown", { project_id: project.id })
  notifyOwnerDashboard(project.id, type = "show_share_cta")
```

**Edge-case (Specification):** онбординг никогда не вызывает `recordFirstRenderIfNeeded` — она
выполняется только из `widgetBootstrap` на **чужом** домене, поэтому при 0 одобренных отзывов
или на онбординге `invite_shown` физически не может сработать.

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
  style = computedStyle(badgeNode)
  isHidden = (style.display == "none") or (style.visibility == "hidden") or
             (style.opacity == "0") or (badgeNode.offsetWidth == 0 and badgeNode.offsetHeight == 0)
  if isHidden:
    forceVisibleStyles(badgeNode)   # инлайн style с !important
    logClientEvent("badge_hide_attempt_blocked")
```

**Инвариант:** видимость badge для `free` — решение сервера (`badge_required` в ответе §5.1),
клиент лишь исполняет и защищает от локального вмешательства; попытка передать флаг отключения
через запрос конфигурации отбрасывается на сервере.

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

**Двусторонность:** `recomputeContentThreshold` вызывается при каждом изменении статуса,
влияющем на approved-множество (§2) — одна и та же функция одинаково надёжно и снимает, и
накладывает noindex.

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

**Правило приоритета зафиксировано порядком проверок**: промокод проверяется первым и, если
валиден, **полностью замещает** cookie — расхождение (cookie у A, промокод у B) разрешается в
пользу B как явного намерения пользователя.

### 7.2 `pending` до оплаты, начисление по вебхуку, идемпотентность, self-referral

```
function onSignup(request):
  attribution = resolveAttribution(request)
  if attribution.source is not null:
    createAttributionRecord(account_id = newAccount.id, partner_id = attribution.partner_id,
                             source = attribution.source, status = "pending")  # НЕ начисляем на регистрации

function onPaymentWebhook(event):
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

Отдельно от self-referral (§7.2) — детект **массовой** накрутки с одного IP (FR-GROWTH-004
`@security`): >50 регистраций по одному коду с одного IP за 10 минут.

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

## Открытые вопросы

- [GAP: точное определение "внешнего домена" — allowlist поддоменов клиента или просто
  `!= OUR_APP_DOMAIN`; влияет на §4 при staging/preview-доменах владельца]
- [GAP: политика повторной попытки транскрипции при `ClaudeApiError` — одна попытка или retry
  с backoff; §1.1 сейчас помечает `transcript_status: failed` без ретрая]
- [GAP: ставка комиссии по умолчанию (`partner.rate`) — не задана в PRD/Specification]
