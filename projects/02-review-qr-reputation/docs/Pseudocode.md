# Pseudocode — умный QR для отзывов (проект 02)

> SPARC Phase: **Pseudocode**. Источники: [`Specification.md`](Specification.md) (что),
> [`Architecture.md`](Architecture.md) (чем и как названо), [`PRD.md`](PRD.md),
> [`DECISIONS-PHASE-0.md`](DECISIONS-PHASE-0.md). Имена — по канону `Architecture.md` §12; при
> расхождении с `Specification.md` побеждает канон Architecture, при расхождении в **числах** —
> Specification. Оба случая ниже названы поимённо, а не разрешены молча.
>
> Алгоритмы даны на **все** FR-001…FR-013 и FR-GROWTH-001…004. Порядок разделов — по риску, а не
> по номеру: несущий инвариант первым.

---

## 0. Шесть расхождений входных документов — разрешены явно

Молчаливое разрешение расхождения — тот же класс дефекта, что тихий дефолт: система выглядит
согласованной, а два документа расходятся дальше. Каждое разрешено здесь и вынесено на Phase 2.

| # | Расхождение | Решение здесь | Кому подтвердить |
|---|---|---|---|
| K-1 | Spec NFR-SEC-002: публичных путей **два**. Arch §3.2: **три** (`/go/:slug/:platform`, ADR-004) | Реализуем **четыре** — см. K-2. Несущий запрет сохранён: роута, **принимающего оценку** и возвращающего URL или 3xx, нет | Phase 2, вместе с ADR-004 |
| K-2 | Ни один документ не называет путь, отдающий **форму** приватной двери | Вводится `GET /r/:slug/private`. **Он структурно обязателен:** T6 запрещает виджет звёзд в разметке `/r/:slug`, FR-006 разрешает звёзды в приватной форме — значит форма физически не может жить в том же документе. Плюс FR-005 требует работы без JS, то есть раскрыть форму на месте нечем | Phase 2 |
| K-3 | Spec FR-006: текст **10–2000**. Arch §5.3: `body` ≤ **4000** | Берём **10–2000** (число из требования). Верхняя граница влияет на предел чтения тела (§1.4) | `arch` |
| K-4 | Spec NFR-SEC-003: у `app_render` **записи НЕТ**. Arch §3.1: `INSERT` на `guest_events` без `SELECT` | Берём Arch: гейтинг обеспечивает **чтение**; запись, результат которой некому прочитать, на ответ повлиять не может. Условие: `SELECT` на `guest_events` не выдан, UNIQUE-индексов нет (T3, T8) | Phase 2 |
| K-5 | Arch §4: `device_hash = HMAC(секрет‖неделя, IP‖UA)` — **сквозной между точками**. Spec FR-013: «без сквозного идентификатора между точками» | Берём Spec: `place_id` входит **в сообщение** HMAC (§1.2). Иначе одно и то же устройство связывается между заведениями — ровно то, что FR-013 запрещает | `arch` — правка §4 |
| K-6 | Spec FR-010: «любое значение, кроме ровно `paid`». Arch §4: `plan enum(free,point,network,agency)` | Значения `paid` в схеме нет. Берём канон Arch; правило fail-closed выражено **явным множеством** платных планов (§5.1) | `spec` — правка формулировки |

**Что из этого меняет схему:** только K-5 (сообщение HMAC) и `places.badge_required` (§1.3).
Остальное — тексты и маршрутизация.

---

## 1. Гостевая поверхность — несущий инвариант (FR-005, FR-012, NFR-SEC-001…003)

> **`GET /r/:slug` — чистая функция от `slug`.** Ниже это не декларация, а свойство сигнатур:
> у функции, порождающей разметку, **нет аргумента**, куда подать контекст запроса; у функции,
> видящей запрос, **нет возвращаемого значения**, через которое контекст вернулся бы в ответ.
> Пути от контекста к ответу не существует — оба его конца отсутствуют.

### 1.1 Рендер страницы выбора — единственный модуль, порождающий разметку

```
# apps/guest/src/render.ts — роль СУБД app_render
# ЗАПРЕЩЁННЫЕ импорты (страж T9): headers(), cookies(), Date/now, гео-разбор, UA-разбор, Math.random
function renderChoicePage(slug: string) -> Html:
  cached = LRU.get(slug)                       # ключ кэша — РОВНО slug, ничего больше
  if cached is not null and not cached.expired: # TTL 60 c (NFR-PERF-001: инвалидация ≤ 60 c)
    return cached.html
  place = selectPlace(slug)                    # SELECT id, slug, name, badge_required FROM places
  if place is null:
    return notFoundHtml()                      # 404 одинаков для всех: несуществующий и чужой слаг неразличимы
  if place.archived_at is not null:
    return notFoundHtml()
  links = selectPlatformLinks(place.id)        # SELECT place_id, platform, url, link_kind
  doors = []
  for link in links:
    doors.append({ key: "platform:" + link.platform,
                   href: BASE_URL + "/go/" + slug + "/" + link.platform,
                   title: platformTitle(link.platform),          # "Яндекс.Карты" | "2ГИС"
                   note:  (link.link_kind == "card")
                          ? "карточка организации, отзыв — следующим шагом"   # честная деградация, бриф §Т.5 п.2
                          : null })
  # Приватная дверь — ЭЛЕМЕНТ ТОГО ЖЕ МНОЖЕСТВА, а не отдельная сущность ниже списка.
  # Название снято с Birdeye; намёка на сортировку по тональности не содержит (FR-005).
  doors.append({ key: "private", href: BASE_URL + "/r/" + slug + "/private",
                 title: "Написать нам напрямую", note: null })
  # Р1 «равновесно» (D-03): порядок — детерминированная перестановка ИЗ slug.
  # Не случайный (это был бы A/B), не хранимый (поля sort_order нет — NFR-SEC-002).
  doors = sortBy(doors, door -> sha256(slug + "|" + door.key))
  html = template(place.name, doors, badge = place.badge_required)   # см. §1.3
  LRU.put(slug, html, ttl = 60 seconds)
  return html
```

**Почему в списке `doors` нет ни одного признака, влияющего на оформление.** Каждая дверь несёт
`key`, `href`, `title`, `note` — и ничего, что шаблон мог бы прочитать как «эта важнее».
Равновесность (NFR-UX-001) обеспечена не дисциплиной вёрстки, а отсутствием входа для различия:
шаблон рисует **один и тот же узел** в цикле, ему нечем отличить приватную строку от площадки.

**Что здесь НЕ вызывается и почему это проверяемо:** `headers()`, `cookies()`, `Date.now()`,
`req` в любом виде. Их отсутствие утверждает страж **T9** по исходнику, а не ревью.

### 1.2 Хэш устройства — уникальность без персональных данных

```
# apps/guest/src/journal.ts и services/intake — единственные модули, видящие Request
function deviceHash(req: Request, place_id: UUID) -> Bytes16:
  ip = extractClientIP(req)     # ПРЕДПОСЛЕДНИЙ элемент X-Forwarded-For — верно ТОЛЬКО за нашим
                                # Caddy. Условие корректности: guest/intake НЕ опубликованы на хост
                                # (Arch §9). Опубликованный рядом сервис обнуляет и лимит, и метрику.
  ua = req.header("User-Agent") or ""
  week = isoWeek(now())                       # соль привязана к КАЛЕНДАРНОЙ неделе — окно
                                              # уникальности задано криптографически и совпадает
                                              # с определением метрики (FR-013)
  # K-5: place_id — В СООБЩЕНИИ. Без него один и тот же телефон связывается МЕЖДУ заведениями,
  # что FR-013 прямо запрещает. Сырые IP и UA не сохраняются нигде.
  return truncate(hmacSha256(key = DEVICE_HASH_SECRET + "|" + week,
                             msg = place_id + "|" + ip + "|" + ua), 16 bytes)
```

**Честная граница этого механизма — назвать до, а не после.** Ключ грубый: за одним NAT два гостя
с одинаковой моделью телефона и одинаковой версией ОС дают **один** хэш. Направление ошибки —
**занижение** числа уникальных устройств. Это верное направление: метрика недели обязана не врать
в приятную сторону (PRD §2.5). Для ограничения частоты то же свойство означает общий счётчик у
добросовестных соседей — поэтому порог берётся заведомо выше живого поведения (§2.1), а не «поплотнее».

### 1.3 `badge_required` считает сервер — и он не может ошибиться в опасную сторону

`app_render` **не имеет** прав ни на `accounts`, ни на `subscriptions` (Arch §3.1), поэтому тариф
на гостевой странице не вычисляется — он **читается уже вычисленным** из `places.badge_required`.

```
# apps/web (роль app_owner), при регистрации / оплате / истечении периода / смене плана
function recomputeBadgeRequired(place_id):
  account = getAccount(placeAccountId(place_id))
  sub     = getActiveSubscription(account.id)              # null, если нет или период истёк
  update places set badge_required = badgeRequiredFor(account.plan, sub) where id = place_id

function badgeRequiredFor(plan, sub) -> bool:
  PAID_PLANS = { "point", "network", "agency" }            # ЯВНОЕ множество, не «всё, что не free»
  if sub is null: return true
  if sub.status != "active": return true
  if sub.current_period_end <= now(): return true
  return not PAID_PLANS.contains(plan)                     # любое неопознанное значение → true
```

Три свойства, каждое заслужено проектом 01:

1. **Колонка объявлена `NOT NULL DEFAULT true`.** Новая точка получает бренд-строку до того, как
   кто-либо что-либо вычислил: отсутствие данных = самый строгий вариант
   ([`fail-closed-defaults`](../../../.claude/rules/fail-closed-defaults.md)).
2. **`badgeRequiredFor` — чистая функция**, поэтому проверяется списком мусорного входа
   (`null`, `''`, `'PAID'`, `' point'`, `0`, `true`, `{}`, `['point']`) одним тестом, а не ревью.
3. **Снятие бренд-строки видно гостю не позднее 60 c** — через TTL кэша §1.1. Явной инвалидации
   между контейнерами нет и не требуется: TTL исполняет требование без канала «web → guest»,
   которого в архитектуре нет.

### 1.4 Журнал сканов — побочный эффект, у которого нет обратного пути

```
# apps/guest — вызывается ПОСЛЕ формирования ответа, результат не влияет на ответ
function recordGuestEvent(req: Request, kind: EventKind, place_id: UUID, platform: Platform|null) -> void:
  try:
    INSERT INTO guest_events(place_id, kind, platform, device_hash, created_at)
    VALUES (place_id, kind, platform, deviceHash(req, place_id), now())
    # НЕ "RETURNING id": у app_render нет SELECT на guest_events, и RETURNING потребовал бы его.
    # НЕ "ON CONFLICT": UNIQUE-индексов на guest_events нет (T8) — иначе "строка уже была"
    # стало бы каналом чтения, то есть персонализацией под постоянного гостя.
  catch DbError as e:
    logError("guest_event_write_failed", kind, place_id, e)   # фолбэк ОБЯЗАН быть виден в логе
    # Дальше — молча. Осознанно: сорвать гостю путь ради счётчика хуже, чем потерять счётчик.
    # Это единственный тихий фолбэк в продукте, и он назван здесь явно
    # ([`silent-fallbacks`](../../../.claude/rules/silent-fallbacks.md)).
```

**Канон Arch §12 даёт сигнатуру `recordGuestEvent(req, kind): void`.** Здесь она дополнена
аргументами `place_id` и `platform` — расширение **аддитивно**: возвращаемого значения по-прежнему
нет, `render.ts` по-прежнему не принимает `req`. Оба конца пути «контекст → ответ» остаются
отсутствующими, поэтому T9 не ослаблен. Подтвердить у `arch`.

### 1.5 Роут страницы выбора целиком

```
# GET /r/:slug  (apps/guest, роль app_render)
function handleChoicePage(req) -> Response:
  slug = req.path.slug                        # query, cookie, заголовки НЕ читаются вообще
  html = renderChoicePage(slug)               # аргумент один — и другого взять неоткуда
  place = resolvePlaceIdCached(slug)          # тот же LRU; отсутствует → журнал не пишем
  if place is not null:
    recordGuestEvent(req, "scan", place.id, null)
  return Response(html, status = place is null ? 404 : 200,
                  headers = { "Cache-Control": "no-store" })   # ни Set-Cookie, ни nonce, ни CSRF
```

**Почему `Cache-Control: no-store` при наличии кэша.** Кэш живёт **в процессе** `apps/guest`
(Arch §3.3), а не на CDN: edge-кэш съел бы вместе с возможной веткой и **сканы**, а метрика недели
считается по ним. Каждый скан доезжает до origin; байты при этом одни и те же, потому что источник
у них один.

**Отсюда список нормализаций для T4 ПУСТ.** Нет cookie, нет инлайновых скриптов, значит нет ни
CSP-nonce, ни CSRF-токена, ни метки времени. sha256 сравнивается по сырому телу — самая сильная
форма теста: нормализация есть то место, где страж однажды начнёт стирать настоящее различие.

### 1.6 Переход на площадку и страница приватной формы

```
# GET /go/:slug/:platform  (apps/guest, роль app_render) — ADR-004
function handleDoorClick(req) -> Response:
  slug     = req.path.slug
  platform = req.path.platform                # ОБА аргумента из пути; query/cookie/заголовки — нет
  link = selectPlatformLink(slug, platform)   # JOIN places по slug
  if link is null:
    return Response(status = 404)             # НЕ редирект «куда-нибудь» — fail-closed
  recordGuestEvent(req, "door_click", link.place_id, platform)   # ДО редиректа
  return Response(status = 302, headers = { "Location": link.url, "Cache-Control": "no-store" })

# GET /r/:slug/private  (apps/guest, роль app_render) — K-2
function handlePrivateForm(req) -> Response:
  slug  = req.path.slug
  place = resolvePlace(slug)
  if place is null: return Response(status = 404)
  recordGuestEvent(req, "door_click", place.id, null)   # platform IS NULL = приватная дверь.
                                                        # Отсюда берётся private_door_click (FR-012)
  html = renderPrivateForm(slug)             # чистая функция от slug, как и §1.1
  return Response(html, headers = { "Cache-Control": "no-store" })
```

**`platform IS NULL` — это и есть различение публичной и приватной двери в метрике.** Отдельного
поля не заводится: `public_door_click` = `door_click AND platform IS NOT NULL`,
`private_door_click` = `door_click AND platform IS NULL`. Одно поле, две метрики, ноль новых
сущностей.

**Область действия T6 — только `/r/:slug`.** Виджет звёзд в приватной форме законен и полезен
(FR-006: оценка здесь **выход** уже сделанного выбора, а не вход маршрутизации). Страж, применённый
к `/r/:slug/private`, дал бы ложное красное — и был бы отключён через неделю вместе с настоящим.

---

## 2. Приём приватного сообщения (FR-006) — порядок операций и есть защита

```
# POST /api/feedback/private  (services/intake, роль app_intake)
function handlePrivateFeedback(req) -> Response:
  # ── ШАГ 1. Origin. Форма, которую мы отдаём, всегда заставляет браузер прислать Origin,
  #    поэтому его ОТСУТСТВИЕ трактуется как отказ, а не как «старый клиент» (fail-closed).
  if req.header("Origin") != originOf(BASE_URL):
    return HTTP 403
  # ── ШАГ 2. ЛИМИТ ДО ВСЕГО ОСТАЛЬНОГО, и до чтения тела.
  #    Ключ берётся из ЗАГОЛОВКОВ, тела ещё нет — иначе перебор мусорными телами бесплатен
  #    (NFR-SEC-004), а чтение тела — время, которым управляет КЛИЕНТ.
  dh = deviceHashHeadersOnly(req)             # place_id ещё неизвестен: на этом шаге хэш по IP‖UA
  if rateLimitConsume("private_device", dh, window = 10 min, limit = 5) == EXCEEDED:
    return HTTP 429                           # без счётчика в теле — anti-enumeration
  # ── ШАГ 3. Чтение тела: жёсткий предел и таймаут, БЕЗ занятого соединения пула.
  body_raw = readBody(req, max_bytes = 16 KB, timeout = 5 s)     # превышение → 413 / 408
  payload  = parseJson(body_raw)                                  # мусор → 400
  # ── ШАГ 4. Резолв точки и лимит по точке.
  place = selectPlaceBySlug(payload.slug)     # app_intake: SELECT places разрешён
  if place is null: return HTTP 404
  if rateLimitConsume("private_place", place.id, window = 1 min, limit = 30) == EXCEEDED:
    return HTTP 429
  # ── ШАГ 5. Валидация. ПОСЛЕ лимита (иначе он не защищает), ДО транзакции.
  errors = []
  if not (10 <= len(payload.body) <= 2000): errors.append("body: 10-2000 символов")   # K-3
  if payload.rating is present:
    if not isInteger(payload.rating) or not (1 <= payload.rating <= 5):
      errors.append("rating: целое 1-5 либо отсутствует")   # любое неопознанное → ОТКАЗ,
                                                            # никогда не подстановка
  if payload.contact is present and len(payload.contact) > 200: errors.append("contact: до 200")
  if errors is not empty: return HTTP 400 { errors }
  # ПРИЁМ НЕ САНИРУЕТ ВВОД (FR-006): текст сохраняется побайтово как отправлен.
  # Экранирование — при рендере владельцу. Санитайзер на приёме уничтожает улику необратимо.
  # ── ШАГ 6. Идентификатор порождается ПРИЛОЖЕНИЕМ, а не базой.
  #    У app_intake нет SELECT на private_feedback, значит "INSERT ... RETURNING id" НЕВОЗМОЖЕН:
  #    RETURNING требует SELECT-привилегии на возвращаемые колонки. Это не обход ограничения,
  #    а следствие того, что оно настоящее.
  pf_id = uuidV4()
  # ── ШАГ 7. ОДНА транзакция, обе вставки. Внешних вызовов внутри НЕТ.
  transaction:
    INSERT INTO private_feedback(id, place_id, body, rating, contact, created_at)
      VALUES (pf_id, place.id, payload.body, payload.rating, payload.contact, now())
    INSERT INTO notifications(private_feedback_id, channel, status, attempts)
      SELECT pf_id, cb.channel, 'pending', 0 FROM channel_bindings cb
       WHERE cb.place_id = place.id AND cb.bound_at IS NOT NULL
    # Канал не подключён → строк 0. Сообщение сохранено, момент ценности НЕ засчитывается
    # (FR-003, FR-007) — владелец увидит его в кабинете и подсказку подключить мессенджер.
  # ── ШАГ 8. Ответ. Ни URL, ни редиректа, ни «а теперь оставьте отзыв на картах» —
  #    последнее было бы гейтингом наизнанку.
  return HTTP 201 { ok: true }
```

**Почему обратный порядок шагов 7 и «отправить» был бы потерей сообщения.** Отправить сначала, а
записать потом — значит терять сообщение при любом сетевом сбое. Строка `notifications` создаётся
в **той же** транзакции, что и `private_feedback`, поэтому недоступность мессенджера — задержка,
а не потеря ([`security-operation-order`](../../../.claude/rules/security-operation-order.md)).

### 2.1 Ограничение частоты — атомарно, иначе последовательный тест зеленеет напрасно

```
function rateLimitConsume(scope, key, window, limit) -> ALLOWED | EXCEEDED:
  transaction:                                          # короткая, серверная, без внешних вызовов
    pg_advisory_xact_lock(hashtext(scope + "|" + key))  # сериализация РОВНО по этому ключу
    c = SELECT count(*) FROM rate_limit_events
         WHERE scope = scope AND key = key AND created_at > now() - window
    if c >= limit: return EXCEEDED                      # запись НЕ делается: отказ не жжёт окно
    INSERT INTO rate_limit_events(scope, key, created_at) VALUES (scope, key, now())
    return ALLOWED
```

Три свойства, каждое проверяется тестом, а не рассуждением:

- **Атомарность.** `count` и `INSERT` под одной блокировкой по ключу. Без неё двадцать
  одновременных запросов читают `c = 0` каждый и проходят все — а последовательный тест
  «шестая попытка → 429» при этом зеленеет. Именно поэтому тест обязан быть **конкурентным**.
- **Гранулярность.** Блокировка по `(scope, key)`, а не общая: сосед по NAT с другим устройством
  имеет другой ключ и не ждёт. Блокировка с грубым ключом при насыщении наказывает добросовестных
  ([`shared-resource-verification`](../../../.claude/rules/shared-resource-verification.md)).
- **Время удержания.** Внутри блокировки нет ни чтения тела, ни сетевого вызова, ни argon2 —
  только два запроса к своей же БД. Ничего, чьей длительностью управляет клиент.

**Двойная отправка формы.** Дедупликации на вставке нет: `INSERT ... ON CONFLICT` потребовал бы
уникальности по `(place_id, device_hash, …)`, то есть хранения признака устройства **рядом с
текстом сообщения** — против NFR-DATA-001. Вместо этого: (1) форма отвечает по схеме
POST-Redirect-GET, поэтому «назад» не переотправляет; (2) лимит `private_device` = 5 за 10 минут
ограничивает ущерб сверху; (3) в кабинете владельца сообщения одной точки, пришедшие в пределах
60 секунд с совпадающим текстом, показываются одной карточкой — группировка на **чтении**, где
права на `SELECT` есть. `[GAP: если владельцы сообщат о дублях, вернуться к варианту с UNIQUE и
явно взвесить его против NFR-DATA-001]`

---

## 3. Доставка владельцу (FR-007) и ответ гостю (FR-008)

```
# services/notifier, роль app_notify. Цикл воркера.
function deliverLoop():
  loop:
    batch = transaction:                                  # ЗАЯВКА: короткая транзакция
      SELECT id, private_feedback_id, channel FROM notifications
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY created_at LIMIT 20
        FOR UPDATE SKIP LOCKED                            # параллельные воркеры не дерутся
      UPDATE notifications SET status = 'sending', attempts = attempts + 1 WHERE id IN (...)
      return rows
    # ── СОЕДИНЕНИЕ ПУЛА ОСВОБОЖДЕНО. Внешний вызов — ВНЕ транзакции и вне удержания.
    for n in batch:
      pf   = selectPrivateFeedback(n.private_feedback_id)  # app_notify: SELECT разрешён
      bind = selectBinding(pf.place_id, n.channel)
      try:
        sendToMessenger(n.channel, bind.chat_id, formatMessage(pf), timeout = 10 s)
        transaction: UPDATE notifications SET status='sent', sent_at=now() WHERE id = n.id
      catch MessengerError as e:
        if n.attempts >= 6:
          transaction:
            UPDATE notifications SET status='failed', last_error=e.message WHERE id = n.id
            INSERT INTO audit_log(entity_type,entity_id,action,reason)
              VALUES ('notifications', n.id, 'delivery_failed', e.code)
        else:
          delay = min(2 ^ n.attempts * 5 s, 10 min)        # экспоненциальная задержка с потолком
          transaction: UPDATE notifications
                          SET status='pending', next_attempt_at = now() + delay,
                              last_error = e.message
                        WHERE id = n.id
```

**Момент ценности не требует отдельной таблицы событий.** `private_message_sent` —
`private_feedback.created_at`; `private_message_delivered` — `notifications.status='sent'` вместе
с `sent_at`. У `app_notify` нет прав на `analytics_events`, и они не нужны: обе метки уже есть в
той строке, которую он и так обновляет. **Задержка доставки = `sent_at − created_at`**; NFR: p95
≤ 30 c, потолок FR-007 — 60 c. «В ту же смену» без числа непроверяемо.

**Три свойства, которые в этом цикле несущие:**

1. **`timeout = 10 s` задан явно.** Вызов без таймаута ждёт бесконечно, а недоступность внешнего
   сервиса обязана быть отказом, а не ожиданием.
2. **`status='sending'` ставится ДО вызова.** Иначе перезапуск воркера в момент отправки даёт
   второе сообщение владельцу по той же строке.
3. **Исчерпание попыток видно.** `failed` + `audit_log` + явная ошибка канала в кабинете —
   а не «сообщений нет». Тихая недоставка неотличима от тишины гостей, и это худший вид отказа.

```
# FR-008 — ответ владельца гостю (Priority: Should)
function ownerReply(pf_id, text, actor):
  pf = selectPrivateFeedback(pf_id)             # app_owner под RLS
  if pf.contact is null:
    # Кнопки ответа в интерфейсе НЕТ ВОВСЕ — она не появляется и не выдаёт ошибку после нажатия
    return HTTP 409 { error: "гость не оставил контакт" }
  return deliverReply(pf.contact, text)
```

`[GAP: FR-008 — в Architecture §9 нет ни одного исходящего канала к гостю: SMTP/SMS-сервиса в
compose не объявлено, а Telegram/MAX — каналы ВЛАДЕЛЬЦА, не гостя. В MVP `deliverReply` реализуем
как показ контакта владельцу с копированием в один клик; автоматическая доставка ответа не
заявляется. Требует решения `arch`: либо компонент, либо понижение AC FR-008.]`

---

## 4. Онбординг (FR-001…FR-004)

### 4.1 Регистрация и точка — уникальность ограничением БД, а не проверкой перед вставкой

```
function createPlace(account_id, slug, name, address) -> Place | Error:
  if not matches(slug, "^[a-z0-9-]{3,40}$"): return Error("slug: 3-40, a-z 0-9 дефис")
  if slug in RESERVED_SLUGS: return Error("slug занят")     # api, go, r, admin, static, health
  try:
    INSERT INTO places(id, account_id, slug, name, address, badge_required, created_at)
      VALUES (uuidV4(), account_id, slug, name, address, TRUE, now())   # badge TRUE по умолчанию
  catch UniqueViolation on places_slug_key:
    return Error("slug занят")
  # Проверка занятости в интерфейсе (FR-001) — ПОДСКАЗКА, а не решение: между её ответом и
  # сабмитом слаг может занять кто угодно. Решает ограничение БД, потому что оно атомарно.
  return place
```

**До заполнения ссылок площадок `/r/<slug>` отдаёт «точка настраивается», а не 404 и не пустую
страницу** (FR-001): `platform_links` пуст → в `doors` остаётся одна приватная дверь плюс явное
пояснение. Пустота показывается как пустота.

### 4.2 Ссылка площадки — allowlist в коде, отказ вместо подчистки (FR-002)

```
ALLOWED_HOSTS = {                              # ЗАШИТО В КОД. В переменной окружения список
  "yandex_maps": ["yandex.ru", "yandex.com", "maps.yandex.ru"],   # однажды приедет пустым,
  "twogis":      ["2gis.ru", "2gis.com"]                          # а пустой allowlist читается
}                                                                 # как «пускать всех»

function validatePlatformLink(platform, raw) -> {url, link_kind} | Error:
  if raw is null or trim(raw) == "": return Error("ссылка пуста")
  try: u = new URL(trim(raw))                  # ВАЛИДИРУЕМ разбором, а не регэкспом и не «подчистим»
  catch: return Error("это не ссылка")
  if u.protocol != "https:": return Error("только https")
  host = lowercase(u.hostname)
  ok = false
  for apex in ALLOWED_HOSTS[platform]:
    # Сравнение ПО ГРАНИЦЕ МЕТКИ, не подстрокой: "yandex.ru.evil.example" и "evil-yandex.ru"
    # обязаны отвергаться, а contains("yandex.ru") пропустил бы оба.
    if host == apex or host.endsWith("." + apex): ok = true
  if not ok: return Error("домен не принадлежит площадке")
  if platform == "yandex_maps" and not (u.path startsWith "/maps/org/" or u.path startsWith "/maps/-/"):
    return Error("это не карточка организации в Яндекс.Картах")
  if platform == "twogis" and not (u.path startsWith "/firm/" or host == "go.2gis.com"):
    return Error("это не карточка организации в 2ГИС")
  # link_kind: пока Q1 не закрыт ручной проверкой на телефоне — обе площадки card (Arch §6)
  return { url: u.href, link_kind: "card" }

function savePlatformLinks(place_id, inputs, actor):
  results = [ validatePlatformLink(p, inputs[p]) for p in inputs ]
  if any(results is Error):
    # НИ ОДНА ссылка точки не изменяется: частичное сохранение оставило бы точку в состоянии,
    # о котором владелец не знает.
    emitAnalytics("onboarding_links_failed", { place_id, reasons: codesOf(results) })
    return HTTP 400 { errors }
  if count(results) < 1: return HTTP 400 { error: "минимум одна площадка обязательна" }
  transaction:
    for (p, r) in results:
      INSERT INTO platform_links(place_id, platform, url, link_kind)
        VALUES (place_id, p, r.url, r.link_kind)
        ON CONFLICT (place_id, platform) DO UPDATE SET url = excluded.url,
                                                        link_kind = excluded.link_kind
      INSERT INTO audit_log(account_id, entity_type, entity_id, actor_id, action)
        VALUES (..., 'platform_links', place_id, actor, 'link_changed')
  invalidatePlaceCache(place_id)                # LRU гостя истечёт сам за 60 c (§1.1)
  emitAnalytics("onboarding_links_saved", { place_id })   # КОНВЕРСИЯ ГЛАВНОГО ОТВАЛА ВОРОНКИ
```

**Цена ошибки объясняется в тексте отказа, а не констатируется.** Опечатка превращает QR на
пятидесяти столах в битую ссылку, и узнаем мы об этом от гостя — то есть самым дорогим способом
из возможных. Сообщение «домен не принадлежит площадке» без этого объяснения читается как
придирка, и владелец будет искать, как её обойти.

### 4.3 Мессенджер (FR-003) и печатный макет (FR-004)

```
function bindChannel(place_id, channel) -> {deep_link}:
  token = randomToken(32)
  INSERT INTO channel_bindings(place_id, channel, bind_token_hash, bound_at)
    VALUES (place_id, channel, hash(token), NULL)          # bound_at NULL = ещё не подтверждено
  return deepLinkFor(channel, token)                       # владелец жмёт «Старт» у бота

function onBotStart(channel, chat_id, token):
  binding = findBindingByTokenHash(hash(token))
  if binding is null or binding.bound_at is not null: return  # одноразовость: повтор не связывает
  UPDATE channel_bindings SET chat_id = chat_id WHERE id = binding.id
  ok = sendToMessenger(channel, chat_id, "Канал подключён. Сюда придут сообщения гостей.", timeout = 10 s)
  if not ok: return                                        # ПОДТВЕРЖДАЕТ ДОСТАВЛЕННОЕ СООБЩЕНИЕ,
  UPDATE channel_bindings SET bound_at = now() WHERE id = binding.id   # а не запись в БД (FR-003)
  emitAnalytics("onboarding_channel_bound", { place_id: binding.place_id })

function buildPrintLayout(place, template) -> Pdf:
  assertBaseUrlConfigured()                     # см. §6.1 — БЕЗ дефолта
  if not (BASE_URL startsWith "https://") or not isAbsolute(BASE_URL):
    throw Error("BASE_URL обязан быть абсолютным https: он уходит В ПЕЧАТЬ")
  qr = renderQr(BASE_URL + "/r/" + place.slug)  # QR ведёт на НАШ домен: целевые ссылки площадок
                                                # меняются на сервере без перепечатки носителей
  assert template in CARRY_AWAY_TEMPLATES or template == "table_tent"
  # Сценарий «общий планшет / стойка со сканом» НЕ ПОДДЕРЖИВАЕТСЯ: макета для него нет вовсе.
  # Не «не рекомендуется» — отсутствует в продукте (04b §0.4.1).
  warn = (template == "table_tent") ? WIFI_WARNING : null   # безопасен, пока гость сканирует
                                                            # СВОИМ телефоном на СВОЕЙ сети
  # NFR-LEGAL-001: макет не содержит ни подсказок содержания отзыва, ни упоминания вознаграждения,
  # ни блока «свободный Wi-Fi + QR отзыва» одним куском.
  return compose(qr, place.name, warn, badge = place.badge_required ? SERVICE_LOGO : null)
```

---

## 5. Тарифы, оплата, дашборд, метрика (FR-009…FR-013)

### 5.1 Оплата (FR-011) — подлинность ДО заявки, недоступность провайдера как ИСКЛЮЧЕНИЕ

```
function onPaymentWebhook(req) -> Response:
  # ── ШАГ 1. Сеть источника. Список подсетей ЮKassa ЗАШИТ В КОД (Arch §10):
  #    вынесенный в переменную окружения он однажды приедет пустым, а пустой allowlist —
  #    это «принимать отовсюду».
  if not ipInAnyCidr(extractClientIP(req), YOOKASSA_NETWORKS):
    auditLog("webhook_origin_rejected", { ip_hash: hash(ip) })
    return HTTP 400
  event = parseJson(readBody(req, max_bytes = 64 KB, timeout = 5 s))
  # ── ШАГ 2. ВТОРАЯ, более сильная проверка подлинности: перезапрос статуса у провайдера.
  #    HMAC НЕТ: ЮKassa уведомления не подписывает. Держать в коде проверку подписи, которой
  #    провайдер не присылает, значит держать ВИДИМОСТЬ защиты — она хуже её отсутствия,
  #    потому что отсутствие видно, а видимость нет (урок проекта 01, коммит b1ccb57).
  #    Сетевой вызов — ВНЕ транзакции: он не должен удерживать соединение пула.
  remote = fetchRemotePayment(event.object.id, timeout = 10 s)
      # недоступность провайдера бросает ProviderUnavailable, НЕ возвращает значение
  if remote.status != "succeeded": return HTTP 200        # не наш случай, но уведомление принято
  # ── ШАГ 3. Заявка на event_id и применение тарифа — ОДНА транзакция, ПОСЛЕ подлинности.
  try:
    transaction:
      INSERT INTO webhook_events(provider, event_id, payload, processed_at)
        VALUES ('yookassa', event.id, event, now())
        ON CONFLICT (event_id) DO NOTHING
      if rowcount == 0: return HTTP 200                   # уже обработан — тихий, штатный no-op
      cs = SELECT * FROM checkout_sessions WHERE provider_session_id = remote.id
      if cs is null: return HTTP 200
      UPDATE checkout_sessions SET status = 'completed' WHERE id = cs.id
      upsertSubscription(cs.account_id, plan = cs.plan,
                         current_period_end = remote.paid_until, status = 'active')
      for place in placesOf(cs.account_id): recomputeBadgeRequired(place.id)   # §1.3, ≤ 60 c
  catch ProviderUnavailable:
    return HTTP 500      # РЕТРАИБЕЛЬНЫЙ отказ, транзакция ОТКАЧЕНА, event_id СВОБОДЕН
  return HTTP 200
```

**Дефект, который этот порядок предотвращает — реальный, найден в проекте 01 и стоил бы денег.**
Если заявку на `event_id` поставить раньше подлинности, а недоступность провайдера **вернуть
значением** из колбэка транзакции, то транзакция коммитится вместе с заявкой; роут отдаёт 500;
провайдер повторяет уведомление; повтор упирается в занятый `event_id` и коротит в «дубль» с
кодом 200. **Оплата не применяется никогда: деньги списаны, тариф не повышен, повторить нечем.**
Разбор — [`security-operation-order`](../../../.claude/rules/security-operation-order.md).

```
function ipInAnyCidr(ip, cidrs) -> bool:
  for c in cidrs:
    (net, prefixRaw) = splitOnce(c, "/")
    # "1.2.3.4/" → Number('') === 0 → префикс /0 → «принимать с любого адреса».
    # Одна опечатка в списке обнуляла бы всю проверку (fail-closed-defaults).
    if prefixRaw is undefined or trim(prefixRaw) == "": continue   # опечатка ≠ /0
    if not isInteger(prefixRaw): continue
    if matchCidr(ip, net, toInt(prefixRaw)): return true
  return false
```

### 5.2 Дашборд (FR-009), воронка (FR-012) и метрика недели (FR-013)

```
function placeDashboard(place_id, actor) -> View:            # app_owner, RLS по account_id
  scans   = countGuestEvents(place_id, "scan")
  pubc    = countGuestEvents(place_id, "door_click", platform_is_null = false)
  privc   = countGuestEvents(place_id, "door_click", platform_is_null = true)
  msgs    = countPrivateFeedback(place_id)
  if scans == 0:
    return View(empty = "данных нет")     # НЕ "0/0" и НЕ полоса прогресса на нуле:
                                          # отсутствие данных выдавать за измеренный ноль запрещено
  return View(
    scans, public_share = pubc / scans, private_share = privc / scans, messages = msgs,
    # ПРОДУКТ НЕ УТВЕРЖДАЕТ, ЧТО ОТЗЫВ ОПУБЛИКОВАН. API отзывов у площадок нет: система знает
    # о переходе и не знает его судьбы. Формулировка — «гость перешёл на площадку»,
    # плюс пояснение, что модерация занимает от 2 часов до 7 дней.
    moderation_note = "от 2 часов до 7 дней", published_count = null)

function activePlacesThisWeek() -> int:                      # МЕТРИКА НЕДЕЛИ, цель 10
  SELECT count(DISTINCT place_id) FROM (
    SELECT place_id, device_hash FROM guest_events
     WHERE kind = 'scan' AND created_at >= date_trunc('week', now())
     GROUP BY 1, 2) t
  # Дедупликация ЗДЕСЬ, при агрегации под app_owner, а НЕ при вставке: у app_render нет SELECT
  # на guest_events, поэтому «эта строка уже была» ему недоступно — и это часть защиты (§1.4).
```

**Оговорка «с уникального устройства» несущая, а не украшение:** без неё владелец, показывающий
QR сотрудникам, создаёт активность на пустом месте, и метрика начинает врать в приятную сторону.

---

## 6. Growth-механики (FR-GROWTH-001…004)

### 6.1 FR-GROWTH-001 — share в момент ценности, без единого слова гостя

```
function onFirstDeliveredMessage(place_id, notification):    # вызывается notifier'ом после 'sent'
  if existsAnalytics("invite_shown", place_id): return       # ровно один раз НА ТОЧКУ
  emitAnalytics("invite_shown", { place_id })
  attachButton(notification, "показать коллеге")             # кнопка ПОД сообщением, в мессенджере

function buildShiftCard(place_id) -> Card:
  # Карточка смены — ТОЛЬКО агрегаты. Ни строки текста гостя, ни имени, ни телефона, ни контакта
  # (NFR-DATA-001). Адресат — коллеги-владельцы в отраслевых чатах, а не гости.
  return Card(scans = ..., door_clicks = ..., messages = countOnly(...), place_name = ...)

function onShareTap(place_id, owner):
  card = buildShiftCard(place_id)
  showConfirmDialog(card)                # БЕЗ подтверждения владельца не уходит НИ ОДИН запрос
  on confirm:                            # во внешнюю сеть. Рассылка от имени пользователя без
    emitAnalytics("invite_sent", { place_id })   # явного согласия судебно наказуема (LinkedIn, $13M)
```

### 6.2 FR-GROWTH-002 — атрибуция промокодом, засчитанная в момент ОПЛАТЫ

```
function resolveAttribution(request) -> {source, partner_id}:
  code = trim(request.body.promo_code)
  if code != "":
    partner = findPartnerByCode(code)
    # Невалидный промокод НЕ откатывается на cookie: явное намерение пользователя, даже ошибочное,
    # сильнее следа, о котором он не знает.
    return partner is null ? {source: null} : {source: "promo_code", partner_id: partner.id}
  ref = readCookie(request, "rq_ref")      # вторичный канал: ITP гасит JS-cookie за 7 дней,
  if ref != "":                            # а цикл решения 2-6 недель — офлайн-разрыв он не переживёт
    partner = findPartnerByCode(ref)
    if partner is not null: return {source: "cookie", partner_id: partner.id}
  if request.created_by_partner_account_id is not null:      # третий путь: агентство само создало
    return {source: "sub_account", partner_id: request.created_by_partner_account_id}
  return {source: null}

function onSignup(request):
  a = resolveAttribution(request)
  if a.source is not null:
    createAttribution(account_id, a.partner_id, a.source, status = "pending")   # НЕ начисляем

function accrueOnPayment(account_id, payment_event_id):       # ВЫЗОВ ИЗ §5.1, шаг 3, в той же транзакции
  att = findAttribution(account_id, status = "pending")
  if att is null: return
  if now() - att.created_at > 90 days:                        # окно промокода — 90 дней
    updateAttribution(att.id, status = "expired"); return
  if isSelfReferral(att):                                     # три пути, все три закрыты
    updateAttribution(att.id, status = "rejected", reason = "self_referral")
    auditLog("self_referral_blocked", att.id)
    return                                                    # ОПЛАТА ПРИ ЭТОМ ПРОХОДИТ ШТАТНО
  if att.status_flag == "frozen": return                      # см. §6.4
  recordCommission(att.partner_id, payment_event_id, amount = commissionOf(...))
  updateAttribution(att.id, status = "converted")
  emitAnalytics("referral_attributed", { partner_id: att.partner_id })

function isSelfReferral(att) -> bool:
  return partnerEmail(att.partner_id) == accountEmail(att.account_id)
      or partnerAccountId(att.partner_id) == att.account_id
      or parentAccountOf(att.account_id) == partnerAccountId(att.partner_id)   # суб-аккаунт себе
```

**Вознаграждение структурно не может зависеть от отзывов** (NFR-LEGAL-001): единственный триггер
начисления — событие оплаты приведённого заведения. Пути начисления, принимающего на вход число
отзывов, оценку или тональность, **в системе не существует** — как и поля, откуда их взять.

### 6.3 FR-GROWTH-003 — бренд-строку решает только сервер

```
# Гостевая страница читает places.badge_required (§1.3). Параметр ?badge=0:
#   - НЕ входит в ключ кэша (ключ — ровно slug, §1.1);
#   - НЕ читается вообще: handleChoicePage не обращается к query ни разу;
#   - значит ответ на "/r/x?badge=0" БАЙТ В БАЙТ равен ответу на "/r/x" — и это уже утверждает T4.
# Удаление узла бренд-строки из DOM возможно и не восстанавливается: страница без JS,
# восстанавливать нечем. Носитель impression-loop здесь не DOM, а ПЕЧАТНЫЙ МАКЕТ (§4.3),
# который гость держит в руках и который клиентом не правится в принципе.
function badgeImpression(place_id): emitAnalytics("badge_impression", { place_id })
```

### 6.4 FR-GROWTH-004 — коды партнёров и защита от накрутки

```
function onSignupViaPartnerCode(code, request):
  ip = extractClientIP(request)
  if rateLimitConsume("signup_partner_code", ip, window = 10 min, limit = 50) == EXCEEDED:
    auditLog("partner_code_flood", { code, ip_hash: hash(ip) })
    freezeAttribution(request.account_id)     # начисления ЗАМОРОЖЕНЫ до ручной проверки,
    return HTTP 429                            # регистрации сверх порога отклоняются
function revokePartner(partner_id):
  setPartnerStatus(partner_id, "revoked")     # только НОВЫЕ атрибуции; уже начисленное
                                              # остаётся к выплате, история immutable.
                                              # Владелец нового заведения ошибки НЕ видит.
```

---

## 7. Гонки — что именно проверяется, а не «учтено»

| Гонка | Разрешение | Почему не проверкой перед вставкой |
|---|---|---|
| Два владельца просят один `slug` | `UNIQUE(places.slug)` + перехват `UniqueViolation` (§4.1) | Между `SELECT` «свободен» и `INSERT` слаг занимает кто угодно. Атомарно только ограничение |
| Параллельные сканы одной точки | Ничего не нужно: `guest_events` append-only, UNIQUE-индексов **нет** (T8) | Уникальный индекс сделал бы `ON CONFLICT` выразимым, а его результат — каналом чтения «гость уже приходил» |
| 20 одновременных `POST /api/feedback/private` | `pg_advisory_xact_lock` по `(scope,key)` (§2.1) | `count` и `INSERT` без блокировки дают всем `c = 0`; последовательный тест этого не видит |
| Двойной клик по двери площадки | Не разрешается и не должен: два `door_click` — две записи. Доля считается от **сканов**, а не от уникальных кликов | Дедупликация потребовала бы `SELECT` на `guest_events`, которого у рендера нет по замыслу |
| Повторная доставка вебхука | `UNIQUE(webhook_events.event_id)` + `ON CONFLICT DO NOTHING` **после** подлинности (§5.1) | Заявка раньше подлинности делает подделку первой записью, и настоящее уведомление отбрасывается как дубль |
| Два воркера берут одну `notifications` | `FOR UPDATE SKIP LOCKED` + `status='sending'` до вызова (§3) | Без этого перезапуск воркера шлёт владельцу второе сообщение по той же строке |
| Оплата и рендер расходятся по `badge_required` | TTL кэша 60 c (§1.1) — требование NFR-PERF-001 исполнено без канала «web → guest» | Явная инвалидация между контейнерами потребовала бы связи, которой в архитектуре нет |

---

## 8. Открытые вопросы

- `[GAP: K-5 — формула `device_hash` в Architecture §4 не содержит `place_id` и потому нарушает
  FR-013. Здесь исправлено; правку обязан принять `arch`]`
- `[GAP: K-2 — путь `GET /r/:slug/private` отсутствует в исчерпывающих списках обоих документов.
  Он структурно обязателен (T6 против FR-006). Подтвердить на Phase 2 вместе с ADR-004]`
- `[GAP: FR-008 — исходящего канала к гостю в архитектуре нет (§3). Либо компонент, либо
  понижение критерия приёмки]`
- `[GAP: Q1 — открывает ли какая-либо ссылка форму отзыва Яндекс.Карт напрямую. До ответа
  `link_kind = card` у обеих площадок; меняется данными, не кодом]`
- `[GAP: пороги лимитов (`private_device` 5/10 мин, `private_place` 30/1 мин) — оценка, не
  измерение. Пересмотреть по первым живым точкам; занижать нельзя, ключ грубый (§1.2)]`
- `[GAP: комиссия партнёра — ставка и база не зафиксированы ни в одном документе]`
