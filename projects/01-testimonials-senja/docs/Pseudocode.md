# Pseudocode — Proofwall

> SPARC Phase: **Pseudocode**. Источник: [`Specification.md`](Specification.md), [`PRD.md`](PRD.md).
> Алгоритмы для каждого FR из Specification. Явная обработка ошибок и граничных случаев.
> Стек (Architecture Constraints p-replicator): распределённый монолит в монорепо,
> Docker + Docker Compose, **PostgreSQL в контейнере**, MCP-серверы. Приложение — Next.js,
> виджет — отдельный бандл, Claude API через MCP.
>
> **Итерация 1 после валидации Phase 2:** правки по C-1, C-2, W-5, W-8, W-9 (см. Refinement.md),
> W-10. Имена таблиц/полей/путей приведены к [`Architecture.md`](Architecture.md) —
> отдельного раздела «Канонические имена» там на момент этой правки нет, использованы имена из
> основного текста Architecture.md (§3 «Таблицы», §4.2, §5).

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

  # --- Валидация на границе системы (W-5: видео-ограничения теперь проверяются ЗДЕСЬ,
  # ДО списания квоты — не внутри handleVideoTestimonial, которая раньше бросала
  # необработанное исключение) ---
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

  # W-5: квота списывается ТОЛЬКО после успешной валидации, включая видео-ограничения.
  # Решение: списывать после, а не списывать заранее и возвращать при отказе — это устраняет
  # саму возможность гонки/двойного decrement при параллельных невалидных запросах и не требует
  # отдельной операции возврата квоты на каждой из уже перечисленных 400-веток.
  rateLimitStore.increment(key, window = 1 hour)

  try:
    if request.type == "text":
      testimonial = createTestimonial(
        project_id = project.id, author_name = request.name,
        author_role = request.role or null,
        text = request.text,          # ИСХОДНЫЙ текст, побайтово как отправлен
        video_object_key = null, video_transcript = null,
        photo_url = uploadIfPresent(request.photo),
        status = "pending", created_at = now()
      )
    else:
      testimonial = handleVideoTestimonial(project, request)  # §1.1 — видео уже валидно
  catch StorageError as e:
    # Единственное исключение из "квота списывается один раз и не возвращается": инфраструктурный
    # сбой ПОСЛЕ уже списанной квоты — вины автора нет, поэтому возвращаем слот.
    rateLimitStore.decrement(key, window = 1 hour)
    logError("testimonial_storage_failed", project.id, e)
    return HTTP 503 { error: "сервис временно недоступен, попробуйте ещё раз" }

  writeAuditLog(action = "testimonial_created", entity = testimonial.id, actor = "public")
  return HTTP 201 { testimonial.public_id }
```

**Граничные случаи:** проект не найден → 404 без утечки; лимит превышен → 429 без счётчика
(защита от подбора окна); `type` вне `text|video` → 400. Текст сохраняется **как есть** — ни
один шаг пайплайна не переписывает `request.text` (FR-NFR-SEC-002). Плохое видео теперь всегда
получает `HTTP 400` с конкретной причиной и НЕ списывает квоту (было: необработанное исключение
+ квота списана впустую — W-5).

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
  # Ограничения уже проверены в submitTestimonial до списания квоты — сюда попадает
  # только видео, прошедшее validateVideoConstraints.
  video_object_key = uploadToStorage(bucket = "testimonial-videos", file = request.video)
  # W-10: video_object_key — КЛЮЧ объекта в MinIO (Architecture §5), а не постоянный URL.
  # Presigned-ссылки на просмотр недолговечны и выдаются отдельно в момент рендера/скачивания —
  # хранить сам URL означало бы хранить протухающую ссылку.
  testimonial = createTestimonial(
    project_id = project.id, author_name = request.name,
    author_role = request.role or null,
    text = request.text_caption or "",   # опциональная подпись автора, НЕ транскрипт
    video_object_key = video_object_key,
    video_transcript = null, video_transcript_is_machine = true,  # W-10: имена полей из Architecture §3
    pending_transcription = true,        # Architecture §5 — драйвер очереди воркера (SELECT ... FOR UPDATE SKIP LOCKED)
    status = "pending", created_at = now()
  )
  return testimonial

# Вызывается воркером (services/worker), забравшим строку с pending_transcription=true —
# не отдельной очередью в приложении (Architecture §5).
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
      video_transcript: transcript_text, video_transcript_is_machine: true, pending_transcription: false
    })
  catch ClaudeApiError as e:
    # W-10: Architecture не описывает отдельный "failed"-статус транскрипции — используем только
    # канонические поля. Фиксируем как "попытка завершена, транскрипта нет"; наблюдаемость — через
    # logError/audit, не через поле схемы, которого в Architecture.md нет.
    updateTestimonial(testimonial_id, { pending_transcription: false })
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
  recordInstallAndInviteIfNeeded(slug, currentDomain())  # §4 — widget_installed + invite_shown
  startBadgeIntegrityWatch(host, config.badge_required)  # §5.2
  emitEvent("badge_impression", { slug, domain: currentDomain() })

function fetchWidgetConfig(slug, domain):
  # W-10: путь и query — как в Architecture §4.2 (`/api/widget/config`, параметр `domain`)
  response = httpGet("/api/widget/config?slug=" + slug + "&domain=" + domain, timeout = 300ms)
  return (response.status == 200) ? response.json() : null
```

**NFR:** `widgetBootstrap` не блокирует `window.onload` хоста (`async`); бандл ≤ 30 KB gzip и
p95 ≤ 300 мс измеряются в CI (см. Refinement.md). Фиксация установки на новом домене —
единственный источник и метрики недели, и share-CTA; логика обеих — в §4.

---

## 4. FR-GROWTH-001: `widget_installed` и `invite_shown` — одна гранулярность, одна вставка

> **Решение зафиксировано в PRD §2.4.1 (актуальная редакция, принята владельцем продукта —
> предыдущая версия «invite_shown один раз на проект» ОТМЕНЕНА, не переоткрывать заново):**
> считаем сайты, а не людей. Оба события имеют ОДНУ И ТУ ЖЕ уникальность — `(project_id, domain)`.
> Share-CTA показывается при **каждой** новой установке на новый домен, а не только при первой.
> Повторный рендер на уже известном домене не порождает ни одного из двух событий. Это снимает
> нужду в двух разных таблицах с разной семантикой (C-1) — обеим событиям достаточно одной
> атомарной вставки в `widget_installs` (`unique(project_id, domain)`, как в Architecture §3/§4.2).

```
function recordInstallAndInviteIfNeeded(project_slug, domain):
  project = findProjectBySlug(project_slug)
  if project is null:
    return
  if domain == OUR_APP_DOMAIN or domain is empty:
    return  # рендер в превью/дашборде не считается установкой

  # Атомарная вставка — ЕДИНСТВЕННЫЙ механизм разрешения гонки. НЕ "exists() затем insert()":
  # проверка существования перед вставкой оставляет окно между чтением и записью, в которое
  # два конкурентных запроса оба увидят "домена ещё нет" и оба эмитируют события — гонка
  # осталась бы нерешённой. ON CONFLICT ... DO NOTHING RETURNING id — атомарная операция
  # уровня СУБД: при N параллельных INSERT с одинаковым (project_id, domain) ровно один
  # получает непустой RETURNING (выигравшая транзакция), остальные молча получают конфликт
  # и пустой RETURNING — без ошибки, без ретрая приложения.
  inserted = db.execute(
    "INSERT INTO widget_installs (project_id, domain, first_seen_at, last_seen_at) " +
    "VALUES (:project_id, :domain, :now, :now) " +
    "ON CONFLICT (project_id, domain) DO NOTHING RETURNING id",
    { project_id: project.id, domain: domain, now: now() }
  )
  if inserted.rows.length == 0:
    # Домен уже известен (или гонка проиграна конкуренту, что для эффекта эквивалентно) —
    # PRD §2.4.1: ни одно из двух событий не эмитируется. Обновляем только last_seen_at.
    db.execute(
      "UPDATE widget_installs SET last_seen_at = :now WHERE project_id = :project_id AND domain = :domain",
      { now: now(), project_id: project.id, domain: domain }
    )
    return

  # Новый домен для проекта — единственная точка эмиссии ОБОИХ событий одновременно.
  # Гарантия "ровно один раз на пару (project_id, domain)" — на уровне БД (уникальный
  # индекс + успешный INSERT), не на уровне приложения.
  emitEvent("widget_installed", { project_id: project.id, domain: domain })
  emitEvent("invite_shown", { project_id: project.id, domain: domain })
  notifyOwnerDashboard(project.id, type = "show_share_cta")  # при КАЖДОЙ новой установке — PRD §2.4.1
```

**Разбор гонки (обязательное требование):** два параллельных первых рендера на разных
страницах ОДНОГО и того же сайта (одинаковый `domain`) — например, посетитель открыл лендинг
в двух вкладках одновременно — не могут дать два `invite_shown` для этого домена, потому что
оба конкурентных `INSERT` идут против одной и той же пары `(project_id, domain)` под одним
уникальным индексом: под MVCC PostgreSQL ровно одна транзакция коммитит вставку и получает
непустой `RETURNING`, вторая упирается в `ON CONFLICT DO NOTHING` и получает пустой результат
— события эмитируются ровно из ветки с непустым `RETURNING`, то есть ровно один раз. Если же
два параллельных рендера идут на **разных** доменах одного проекта — это не гонка вообще: у
каждого своя строка `(project_id, domain)`, оба INSERT успешны независимо, и оба домена
корректно порождают свою пару событий (ожидаемое поведение по PRD §2.4.1, не дефект).

**Edge-case (Specification):** онбординг никогда не вызывает `recordInstallAndInviteIfNeeded` —
она выполняется только из `widgetBootstrap` на **чужом** домене, поэтому на онбординге или при
рендере на `OUR_APP_DOMAIN` события физически не могут сработать.

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

> **Явная граница механизма (ADR-002, статус «Принято», остаточный риск).** Ниже — что
> `checkAndRestore` **детектирует и чинит**, и что **не может** детектировать и чинить в
> принципе. Второе — не баг реализации, а фундаментальное ограничение CSS/DOM, признанное
> в ADR-002. Недетектируемый случай закрывается условиями оферты (ToS: скрытие виджета
> целиком нарушает условия бесплатного тарифа), а не кодом — здесь **намеренно нет** попытки
> магически «дотянуться» до дерева DOM хоста выше собственного shadow-root.

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
  # offsetWidth/offsetHeight == 0 БЕЗ isHiddenDirectly почти наверняка означает, что скрыт
  # ПРЕДОК (например, весь <div id="proofwall-widget"> с display:none СНАРУЖИ shadow-хоста),
  # а не сам badgeNode — computedStyle(badgeNode) честно вернёт display != "none".
  # forceVisibleStyles(badgeNode) в этом случае НИЧЕГО НЕ ЧИНИТ: инлайн-стиль на самом badge не
  # может пересилить display:none на предке — это ограничение каскада CSS, а не пробел в коде.
  # Виджет физически не имеет доступа к дереву DOM хоста выше собственного корня, поэтому здесь
  # только фиксируем факт для наблюдаемости, а не изображаем несуществующее решение.
  hasZeroSize = (badgeNode.offsetWidth == 0 and badgeNode.offsetHeight == 0)
  if hasZeroSize:
    logClientEvent("badge_zero_size_detected_possible_ancestor_hide")  # ADR-002 остаточный риск — не чинится кодом
```

**Инвариант:** видимость badge для `free` — решение сервера (`badge_required` в ответе §5.1),
клиент лишь исполняет и защищает от локального вмешательства **в сам узел**; попытка передать
флаг отключения через запрос конфигурации отбрасывается на сервере. Скрытие узла-обёртки —
известный, задокументированный в ADR-002 остаточный риск, не техническая задача этой недели.

---

## 6. FR-GROWTH-005: порог содержательности и управление `noindex`

```
CONTENT_THRESHOLD = { min_approved_count: 3, min_total_chars: 400 }

function recomputeContentThreshold(project_id):
  approved = getApprovedTestimonials(project_id)
  total_chars = sum(len(t.text) for t in approved)   # video_transcript НЕ считается text-контентом
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

**Граничные случаи:** email занят → 409; явно указанный слаг вне `SLUG_PATTERN` → 400; явно
указанный и уже занятый слаг → 409 (пользователь выбирает другой сам, без магии); авто-слаг из
названия проекта донабирается случайным суффиксом молча — это не пользовательский выбор,
подменять нечего.

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

`[GAP: способ аутентификации партнёра для самостоятельного просмотра своего когортного
дашборда не описан в Specification/PRD — сейчас `getPartnerCohortDashboard` предполагается
вызываемой из админки владельца продукта, не партнёром напрямую]`

---

## 11. FR-NFR-A11Y-001: доступность публичной страницы — чек-лист, не алгоритм

Доступность — не ветвящаяся логика, а набор инвариантов, проверяемых при каждом рендере.
Честнее описать их как чек-лист, привязанный к месту в разметке, чем изображать несуществующий
«алгоритм доступности».

| # | Требование | Где проверяется |
|---|---|---|
| A1 | Семантика: `<main>`, `<h1>` заголовок стены, каждый отзыв — `<article>` | `renderWallOfLovePage` (§6) |
| A2 | Контраст текста ≥ 4.5:1 (WCAG AA) для цветов из `project.branding` | CI: детерминированная проверка контраста на билд-шаге |
| A3 | Видео-отзыв: `<video controls>` + `<track kind="captions">` из `video_transcript`, когда `video_transcript_is_machine` | Шаблон рендера видео-карточки |
| A4 | У каждого поля формы (`/f/<slug>`) есть `<label>`; ошибки валидации объявлены через `aria-live="polite"`, не только цветом | Шаблон формы |
| A5 | Клавиатурная навигация: все интерактивные элементы (в т.ч. кнопки модерации) достижимы Tab, виден `:focus` | `axe-core` в E2E + ручной чек |
| A6 | Badge-ссылка (`.pw-badge`) имеет `aria-label="Powered by Proofwall"`, не только иконку | `renderBadge` (§5) |
| A7 | Shadow DOM виджета не ломает порядок табуляции хост-страницы | E2E-фикстура Refinement §1.1 |

**CI-гейт:** `axe-core` (или эквивалент) — по ladder-правилу проекта детерминированно
проверяемые пункты (A2, A6, часть A5) уходят в CI, а не в чек-лист ревьюера; пункты, требующие
живого взаимодействия (реальный порядок табуляции при загруженном виджете) — в E2E.

---

## Открытые вопросы

- [GAP: точное определение "внешнего домена" — allowlist поддоменов клиента или просто
  `!= OUR_APP_DOMAIN`; влияет на §4 при staging/preview-доменах владельца]
- [GAP: политика повторной попытки транскрипции при `ClaudeApiError` — одна попытка или retry
  с backoff; §1.1 сейчас помечает `pending_transcription: false` без ретрая]
- [GAP: ставка комиссии по умолчанию (`partner.rate`) — не задана в PRD/Specification]
- [GAP: способ аутентификации партнёра для доступа к своему когортному дашборду (§10) —
  не описан в PRD/Specification]
