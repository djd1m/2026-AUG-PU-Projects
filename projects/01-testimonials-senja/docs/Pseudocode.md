# Pseudocode — Proofwall

> SPARC Phase: **Pseudocode**. Источник: [`Specification.md`](Specification.md), [`PRD.md`](PRD.md). Алгоритмы для каждого FR. Стек (Architecture Constraints p-replicator): монорепо-монолит, Docker Compose, **PostgreSQL в контейнере**, MCP-серверы; Next.js + отдельный бандл виджета.
>
> **Итерация 1 после валидации Phase 2:** правки C-1, C-2, W-5, W-8, W-9 (см. Refinement.md), W-10. Имена — по [`Architecture.md`](Architecture.md); отдельного раздела «Канонические имена» там пока нет, использованы имена из основного текста (§3, §4.2, §5). **Итерация 2:** rate-limit сведён к одному помощнику (Architecture §3.4, W-1), добавлен §7.3 (FR-008).
>
> **Сверка 29.09.2026:** §7.2–7.3 приведены к коду (ЮKassa без подписи, срок `paid_until`);
> алгоритмы фич после MVP — [§12](#post-mvp).

---
## 1. Приём отзыва: текст (FR-002) и видео (FR-003)

> **Rate limiting — единый помощник (Architecture §3.4, `packages/db`, `rate_limit_events`).** Три
> требования (это, FR-GROWTH-004 §8, FR-GROWTH-005 §6) используют один помощник, не три стора:
> `rateLimitCount(scope,key,window)` — COUNT без побочных эффектов; `rateLimitRecord(scope,key)` —
> INSERT, возвращает `id` (для отката, W-5); `rateLimitRevoke(id)` — DELETE строки при откате. Везде `exceeded = count >= порог`.

```
function submitTestimonial(request):
  # --- Rate limit: FR-NFR-SEC-003, scope=form_submission, key=ip+project_id, окно 1ч, порог 5 ---
  project = findProjectBySlug(request.slug)
  if project is null:
    return HTTP 404  # не раскрываем, существовал ли слаг
  ip = extractClientIP(request)
  rl_key = hash(ip + project.id)
  if rateLimitCount("form_submission", rl_key, window = 1 hour) >= 5:
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
  # W-5: событие списывается ТОЛЬКО после успешной валидации (не заранее с возвратом при отказе —
  # это исключает гонку/двойной откат на параллельных невалидных запросах).
  rl_event_id = rateLimitRecord("form_submission", rl_key)
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
    rateLimitRevoke(rl_event_id)
    logError("testimonial_storage_failed", project.id, e)
    return HTTP 503 { error: "сервис временно недоступен, попробуйте ещё раз" }
  writeAuditLog(action = "testimonial_created", entity = testimonial.id, actor = "public")
  return HTTP 201 { testimonial.public_id }
```

**Граничные случаи:** проект не найден → 404 без утечки; лимит превышен → 429 без счётчика; `type` вне `text|video` → 400. Текст сохраняется **как есть** (FR-NFR-SEC-002). Плохое видео теперь всегда получает `HTTP 400` с причиной и НЕ списывает квоту (было: необработанное исключение + впустую списанная квота — W-5).

### 1.1 Видео-путь (FR-003): валидация, загрузка, асинхронная транскрипция

```
# Чистая функция без побочных эффектов — вызывается ДО rateLimitRecord (W-5)
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
    transcript_text = sttApi.transcribe(audio)   # POST /transcribe на services/transcribe (D-007: OpenAI STT, не Claude API — см. ADR-005), ТОЛЬКО расшифровка речи
    # FR-NFR-SEC-002: транскрипт — ОТДЕЛЬНОЕ поле, никогда не пишется в testimonial.text
    updateTestimonial(testimonial_id, {
      transcript: transcript_text, transcript_source: 'machine', transcript_status: 'completed'
    })
  catch SttApiError as e:
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
## 5. FR-GROWTH-003 + FR-007: серверная конфигурация виджета и защита badge

> Реализует также **FR-007** (тарифы: `free`/`paid` как атрибут проекта, проверяемый на сервере)
> и **FR-NFR-PERF-001** (бюджет бандла и времени отрисовки — см. §5.3).
> Решение о серверной проверке тарифа — **ADR-002**.

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
## 6. FR-GROWTH-005 + FR-005: публичная стена, порог содержательности и `noindex`

> Реализует также **FR-005** (публичная страница Wall of Love `/w/<slug>`, серверный рендер,
> разметка `schema.org/Review`). Порог содержательности — **ADR-004**.

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
  # FR-GROWTH-005 @security — общий помощник (см. §1, Architecture §3.4): scope=project_created, key=account_id
  rateLimitRecord("project_created", account_id)
  if rateLimitCount("project_created", account_id, window = 1 hour) >= 20:
    setProjectNoindex(project.id, forced = true)
    writeAuditLog(action = "forced_noindex_bulk_creation", entity = project.id,
                  reason = "over_20_projects_per_hour")
  # forced-флаг снимается только через обычный recomputeContentThreshold —
  # то есть исключительно за счёт реального контента, обходного пути нет
```

---
## 7. FR-GROWTH-002: партнёрская атрибуция

### 7.1 Промокод приоритетнее cookie (ADR-003)

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
  # ФАКТ 29.09 (код apps/web/src/app/api/webhooks/payment/route.ts, D-009, коммиты b1ccb57b, 05017667):
  # ЮKassa уведомления НЕ подписывает — HMAC и PAYMENT_WEBHOOK_SECRET прежней редакции удалены.
  # ШАГ 1 — адрес источника, ДО записи event id: чужой адрес не может занять идентификатор.
  if not ipInAnyCidr(clientIp(request), YOOKASSA_NETWORKS):  # 7 сетей, зашиты в код (lib/payment.ts)
    auditLog("webhook_source_rejected", { ip }); return HTTP 400
  event = parseJson(raw_body)
  event_id = event.event + ":" + event.object.id
  # (ветки агентных покупок и моста N3 разбираются здесь же, до обычной — FR-AGENT-001, FR-N3-001)
  withService(tx):
    if not claimWebhookEvent(tx, "yookassa", event_id):   # insert … on conflict do nothing
      return HTTP 200                                        # дубль — тихий no-op
    # ШАГ 2 — подлинность: перезапрос статуса у ЮKassa (таймаут 10 с).
    # Недоступность — ИСКЛЮЧЕНИЕ ProviderUnavailable, не значение: транзакция откатывается
    # ВМЕСТЕ с заявкой event id, ответ 500, повтор уведомления проходит полный путь.
    payment = fetchRemotePayment(event.object.id)            # throws ProviderUnavailable
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

## 7.3 FR-008: инициация checkout и обновление тарифа
```
function initiateCheckout(project_id, actor):   # actor — app_authenticated владелец проекта
  session = yookassa.createPayment(project_id)  # провайдер выбран: ЮKassa, decisions/D-009
  createCheckoutSession(project_id, session.id, status = "pending")
  return HTTP 200 { redirect_url: session.redirect_url }
function applyTariffUpgrade(tx, payment):  # ФАКТ 29.09: та же транзакция, что onPaymentWebhook; lib/payment.ts
  if payment.status == "canceled": markCheckoutExpired(payment.id); return   # удержание снимается
  if payment.status != "succeeded": return
  cs = select cs.*, p.paid_until from checkout_sessions cs join projects p …
        where cs.provider_session_id = payment.id FOR UPDATE OF p, cs
  if cs is null: return "unknown_session"          # не ошибка: магазин может быть общим
  if cs.status == "completed": return             # повтор — no-op
  # FR-PAY-001: срок, а не вечный paid. extendPaidUntil (lib/tariff.ts) — от БОЛЬШЕГО из
  # now и paid_until + 30 дней; считается в коде рядом с правилом badge, не в SQL.
  update projects set tier = 'paid', paid_until = extendPaidUntil(cs.paid_until) where id = cs.project_id
  updateCheckoutSession(cs.id, { status: "completed" }); auditLog("tariff_upgraded")
```

---
## 8. Anti-fraud: накрутка регистраций по партнёрскому коду

Отдельно от self-referral (§7.2) — детект **массовой** накрутки с одного IP (FR-GROWTH-004 `@security`), только для регистраций с непустым `partner_code_id`: общий помощник (см. §1, Architecture §3.4) — scope=signup_via_partner_code, key=ip, окно 10 минут, порог 50.

```
function onSignupViaPartnerCode(code, request):
  ip = extractClientIP(request)
  rateLimitRecord("signup_via_partner_code", ip)
  if rateLimitCount("signup_via_partner_code", ip, window = 10 minutes) >= 50:
    writeAuditLog(action = "suspected_fraud_flagged", entity = request.new_account_id,
                  reason = "suspected_fraud", code = code, ip_hash = hash(ip))
    attribution = findAttribution(request.new_account_id, status = "pending")  # регистрация НЕ блокируется
    if attribution is not null:
      updateAttribution(attribution.id, { status: "blocked" })  # getPendingAttribution (§7.2) её не найдёт
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

- [ЗАКРЫТО FR-013 — §12.5] [GAP: точное определение "внешнего домена" — allowlist поддоменов клиента или просто `!= OUR_APP_DOMAIN`; влияет на §4 при staging/preview-доменах владельца]
- [ЗАКРЫТО FR-012 — §12.4] [GAP: политика повторной попытки транскрипции при `SttApiError` — одна попытка или retry с backoff; §1.1 сейчас ставит `transcript_status: 'failed'` без ретрая, но статус позволяет вернуть строку в очередь]
- Ставка комиссии по умолчанию (`partner.rate`) — **30 %**, как у référence-продукта (Senja). Верхнего предела нет; для сравнения, Trustmary ограничивает выплату €1500. Решение владельца продукта 2026-08-26.
- [ЗАКРЫТО FR-011 — §12.3] [GAP: способ аутентификации партнёра для доступа к своему когортному дашборду (§10) — не описан в PRD/Specification]

---

<a id="post-mvp"></a>
## 12. Алгоритмы после MVP — по факту кода (сверено 29.09.2026)

Требования — [Specification §6](Specification.md#post-mvp). Здесь — порядок шагов, как он стоит
в коде; подробные псевдокоды с ревизиями — `features/<slug>/02_pseudocode.md`. Порядок операций —
часть защиты (лимит до argon2, адрес до записи `event_id`, сеть вне транзакции).

<a id="alg-fr-009"></a>
### 12.1 FR-009 `login` (`apps/web/src/lib/login.ts`)
```
function login(request):
  body = readBodyAtMost(request, 4096)                 # ВНЕ транзакции: клиент не держит соединение пула
  email = normalizeEmail(body.email); password = isString(body.password) ? body.password : ""
  withService(tx):
    set local lock_timeout = '250ms'
    if not pg_try_advisory_xact_lock(90009, hashtext(hashKey(email, ip))): return 429   # try, без очереди
    if exceeded('login_ip', ip, 30/час) or exceeded('login_pair', email+ip, 5/час): return 429
    row = select id, password_hash from accounts where email = $email
    ok = verifyPassword(row?.password_hash ?? dummyHash(), len(password) <= 200 ? password : "")  # argon2 ВСЕГДА
    if not (row and ok and len(password) <= 200):
      record('login_ip'); record('login_pair'); return 401 SAME_BODY
    session = createSession(tx, row.id)                 # единственный insert into sessions в проекте
    return 200 { projects: listProjectsForAccount(row.id) } + Set-Cookie pw_session (httpOnly, 30 дней)
# клиент: redirect → safeNextPath(?next) ИЛИ /dashboard/<первый по created_at>
```

<a id="alg-fr-010"></a>
### 12.2 FR-010 `changePassword` (`lib/password-change.ts`)
```
body = readBodyAtMost(4096); account = currentAccountId() or 401; validNewPassword(next) or 400
withAccount(tx):  lock_timeout 250 мс, statement_timeout 10 с
  try-lock(90010, account+ip) or 409
  limits: pwchange_ip 30/ч, pwchange_pair 5/ч, pwchange_success 10/ч  → 429
  hash = select password_hash; if hash is null → отказ (учётка SSO)
  if not verifyPassword(hash, current): record ×2; return 401
  newHash = hashPassword(next)                          # только ПОСЛЕ verify
  update accounts set password_hash=newHash where id=$ and password_hash=hash   # CAS; 0 строк → 401
  update sessions set revoked_at=now() where account_id=$ and revoked_at is null  # ВСЕ, включая текущую
  record success; return 200 + createSession(...)
```

<a id="alg-fr-011"></a>
### 12.3 FR-011 кабинет партнёра (`lib/partner-auth.ts`)
```
POST /api/partner/session: token = readBodyAtMost(4096).token (не строка → "")
  withService: resolvePartner(tx, token, ip)
    if exceeded('partner_token_ip', ip, 30/ч): tooMany
    id = select id from partner_codes where dashboard_token_hash = sha256(token) and status='active'
    if none: record ip; return 401 'ключ доступа не подошёл'
    if exceeded('partner_dashboard_success', id, 200/ч): tooMany; record success
  Set-Cookie pw_partner (path /partner, 30 дней) ; body {ok:true}
/partner/dashboard: ОДНА транзакция — resolvePartner(cookie) → getPartnerCohortDashboardById; иначе redirect /partner
```

<a id="alg-fr-012"></a>
### 12.4 FR-012 повтор транскрипции (`services/worker/src/transcribe-job.ts`)
```
BEGIN
row = select … from testimonials where transcript_status='pending' and video_object_key is not null
        and (transcript_next_attempt_at is null or transcript_next_attempt_at <= now())
      for update skip locked limit 1
if none: COMMIT; sleep WORKER_POLL_INTERVAL_MS (5000)
try: text = transcribe(presignedUrl(row)); update … transcript=text, status='completed'; COMMIT
catch SttApiError:
  n = attempts+1; if n < 3: set attempts=n, next_attempt_at = clock_timestamp() + 60s·2^(n−1)
                  else: status='failed'; COMMIT
catch other: ROLLBACK; BEGIN; (то же учётное обновление); COMMIT; rethrow
finally: если откат не удался — release(poisoned) уничтожает соединение
```

<a id="alg-fr-013"></a>
### 12.5 FR-013 внешний домен (`lib/widget-install.ts`)
```
domain = normalizeDomain(Origin ?? Referer ?? param)     # lower, без порта/пути/www., "null"→null
own = host(APP_DOMAIN) ?? host(BASE_URL)
if domain is null or domain in LOCAL_HOSTS or domain endsWith '.localhost'
   or (own and (domain == own or domain endsWith '.' + own)): return   # ни записи, ни событий
insert into widget_installs … on conflict (project_id, domain) do nothing returning id
if inserted: emitEvents(['widget_installed','invite_shown']) одной вставкой else update last_seen_at
```

<a id="alg-fr-014"></a>
### 12.6 FR-014 импорт CSV (`api/import/route.ts`, `lib/csv-import.ts`)
```
account = currentAccountId() or 401                    # ДО чтения тела
body = readBodyAtMost(3 МиБ) or 413                     # {slug, csv, mode, mapping}; project_id из тела не читается
withService: check+record 'csv_import' (account, 20/ч) or 429   # ДО разбора, на каждую попытку
rows = parseCsv(csv)  # U+FFFD → отказ; BOM срезать; ; или , по 1-й строке; стоп на 501-й записи → отказ
each row: validateTextSubmission (как форма), отклонённые с line = index+2
if mode == preview: return {accepted, rejected, sample(5)}      # без записи
withAccount: project = by slug and account_id and not deactivated or 404
  each accepted: insert … status 'pending', source 'import', import_fingerprint = sha256(trim(name)\0trim(text))
                 on conflict (project_id, import_fingerprint) do nothing
return {inserted, skipped, rejected}
```

<a id="alg-fr-015"></a>
### 12.7 FR-015 восстановление пароля (`api/auth/forgot`, `lib/password-reset.ts`, `lib/email.ts`)
```
forgot:
  body = readBodyAtMost(4096)
  if not mailConfigured(): return 503                    # ДО выпуска токена (21f8f148)
  result = withService(issueResetToken):                 # try-lock 90015; лимиты pair 5/ч, ip 30/ч — запись КАЖДОЙ попытки
     account = by email; if none: return {issued:false}
     update password_reset_tokens set used_at=now() where account_id=$ and used_at is null
     insert token_hash = sha256(token), expires_at = now()+1h   # 23505 → ответ как обычно
  if result.tooMany: return 429
  if result.issued: defer(() => sendWithRetry(link))     # after(): ПОСЛЕ ответа, без await
  return 200 SENT                                        # одинаково для любого адреса
sendWithRetry: 2 попытки (пауза 2 с) только на сеть/таймаут 8 с/5xx/429; один Idempotency-Key;
  журнал reset_email_sent|_retry|_failed с категорией, без адреса и ссылки
reset: validNewPassword → withService: update … set used_at=now() where token_hash=$ and used_at is null
       and expires_at > now() returning account_id (иначе 400) → argon2 → update accounts → revoke all sessions
       (сессия НЕ выдаётся)
```

<a id="alg-fr-016"></a>
### 12.8 FR-016 Yandex ID (`api/auth/yandex/*`, `lib/sso.ts`, `lib/sso-account.ts`)
```
start: нет YANDEX_CLIENT_ID/SECRET → 503; state, PKCE verifier → HMAC-cookie pw_sso_state (10 мин); 302 oauth.yandex.ru
callback:
  ?error → /login?sso=cancelled
  limit ip 30/ч (запись каждого вызова, отдельная транзакция, ДО сети)
  cookie/state не совпали → clearState; /login?sso=invalid_state
  clearState; token = exchangeCode(code, verifier); profile = fetchProfile(token)   # 8 с каждый, ВНЕ транзакции
  withService(resolveSsoAccount):
    by (yandex, external_id) → вход
    email занят → 'password_account_exists' (автосвязывания нет)
    иначе insert accounts (password_hash null) + sso_identities (on conflict → перечитать и проверить)
  createSession; 302 /dashboard/<первый slug> или /
```

<a id="alg-fr-pay-001"></a>
### 12.9 FR-PAY-001 checkout (`api/checkout/route.ts`)
```
account = currentAccountId() or 401; project = владельца по slug
price = PAID_TIER_PRICE_RUB ?? 990
if PAYMENTS_STUB == 'true': redirect = stub; elif нет YOOKASSA_*: 501
payment = yookassa.createPayment(price, Idempotence-Key = randomUUID() на попытку, timeout 10 с)  # иначе 502
insert checkout_sessions(project, payment.id, 'pending', idempotence_key)
return { redirect_url: payment.confirmation_url }
# вебхук — §7.2/§7.3 выше (адрес → event id → перезапрос → extendPaidUntil)
```

<a id="alg-fr-intake"></a>
### 12.10 FR-INTAKE-001/002 фото и выключатель видео
```
text submit: validatePhoto(file) ДО квоты (сигнатура JPEG/PNG/WebP, ≤ 5 МБ) → квота формы →
  uploadPhoto(S3_PHOTO_BUCKET) — сбой: revoke квоты, 503 → photo_url = '/api/photo/<uuid>/<uuid>.<ext>'
GET /api/photo/[...key]: ключ по регэкспу → тип заново по содержимому → nosniff, CSP sandbox, immutable
video submit: if VIDEO_INTAKE_ENABLED !== 'true': 403   # ДО arrayBuffer()
```

<a id="alg-fr-proof-001"></a>
### 12.11 FR-PROOF-001 отзыв с площадки (`api/testimonials/platform/route.ts`)
```
account or 401 (до тела) → multipart → platform = body.platform ?? detectPlatform(url)
url: только https, хост по суффиксу через точку; неизвестный → 'other'
нет ни url, ни снимка → 422; снимок: validatePhoto (≤ 5 МБ)
withService: project by slug+account, not deactivated or 404 → upload screenshot → insert status 'pending', source 'platform' → 201
```

<a id="alg-fr-n3-001"></a>
### 12.12 FR-N3-001 мост в N3
```
/n3/start?token: проверка → cookie n3_ref_<tenant> → 302 /
register: n3_signup_contexts; подтверждение почты: одноразовый токен (24 ч) → proof + outbox 'signup' одной транзакцией
worker n3-outbox: раз в 5 с до 10 заданий, 4 параллельно, аренда 60 с → N3 (https, 8 с, ≤ 1 MiB, redirect:error)
  успех 'signup' → bound_at; неудача → next = min(3600, 60·2^min(6,n−1)) с
checkout с привязкой: intent (нет bound_at → 409/503) → external-order N3 (99000 RUB test) → платёж ЮKassa (ключ = intent.id)
webhook bridgeNotification: GET payment (+ GET refund) → одна транзакция: outbox + claim event + тариф + completed;
  refund → manual_review; очередь > 10 000 → откат всего (повтор возможен)
пропущено уведомление → оператор: scripts/reconcile-n3-payment.ts <paymentId>
```

<a id="alg-fr-agent-001"></a>
### 12.13 FR-AGENT-001 агентная покупка
```
агент → gateway (MCP /mcp | A2A /a2a) → web /api/agent-payments/commands (секрет шлюза)
1 buyer_link_start → approvalUrl + pollToken (ссылка 10 мин)
2 человек: вход → подтверждение почты → pairing_approve → ключ агента (24 ч, показан один раз)
3 offer_get (котировка 5 мин) → order_create(quoteId, requestKey) → payment_execute
4 нет поручения → nextAction human_approval (A2A input-required) → человек order_approve → hosted ЮKassa TEST
5 подтверждение ТОЛЬКО вебхуком /api/agent-payments/webhook или сверкой воркера (раз в 30 с) → fulfillment
  одной транзакцией (тариф, журнал, outbox)
6 mandate_create (≤ 90 дней, ≤ 99000 коп.) → в последние 3 дня срока payment_execute(mandateId) по сохранённому методу
7 grant_revoke / mandate_revoke → следующий запрос агента 401; неизвестный исход не пересоздаётся — его сверяет воркер
```
