# Pseudocode — умный QR для отзывов (проект 02)

> SPARC Phase: **Pseudocode**. Источники: [`Specification.md`](Specification.md) (что),
> [`Architecture.md`](Architecture.md) (чем и как названо), [`PRD.md`](PRD.md),
> [`DECISIONS-PHASE-0.md`](DECISIONS-PHASE-0.md). Имена — по канону `Architecture.md` §12; при
> расхождении с `Specification.md` побеждает канон Architecture, при расхождении в **числах** —
> Specification. Оба случая ниже названы поимённо, а не разрешены молча.
>
> Алгоритмы даны на **каждый** FR. Документ разрезан по лимиту 500 строк — разрез идёт по границе
> ролей СУБД, той самой, что несёт запрет гейтинга (Arch §3.1), а не по объёму:
>
> | Файл | Что внутри | Роли СУБД |
> |---|---|---|
> | **этот** | FR-005, FR-006, FR-007, FR-008, FR-012 — гостевая поверхность и доставка | `app_render`, `app_intake`, `app_notify` |
> | [`Pseudocode-OWNER.md`](Pseudocode-OWNER.md) | FR-001…FR-004, FR-009…FR-013 — онбординг, тарифы, оплата, дашборд | `app_owner` под RLS |
> | [`Pseudocode-GROWTH.md`](Pseudocode-GROWTH.md) | FR-GROWTH-001…004 | `app_owner` |
>
> Порядок разделов — **по риску**, а не по номеру: несущий инвариант первым.

---

## 0. Расхождения входных документов — разрешены явно

Молчаливое разрешение расхождения — тот же класс дефекта, что тихий дефолт: система выглядит
согласованной, а два документа расходятся дальше. Каждое разрешено здесь и вынесено на Phase 2.
**Редакция 3.** K-1, K-2, K-3, K-6 закрыты правками `spec`; K-5, K-7…K-10 открыты.

| # | Расхождение | Решение здесь | Кому подтвердить |
|---|---|---|---|
| ~~K-1~~ | ~~публичных путей два против трёх~~ | **ЗАКРЫТО.** `spec` внёс исчерпывающий список из **четырёх**: `GET /r/:slug` · `GET /r/:slug/private` · `GET /go/:slug/:platform` · `POST /api/feedback/private`. Несущий запрет сохранён: роута, **принимающего оценку** и возвращающего URL или 3xx, нет | — |
| ~~K-2~~ | ~~путь, отдающий форму приватной двери, не назван~~ | **ЗАКРЫТО.** `GET /r/:slug/private` записан в NFR-SEC-002 как **вынужденный**, вместе с цепочкой T6 + FR-006 + «без JS» — чтобы через месяц его не «оптимизировали» обратно в один документ, не увидев, почему вынесли. Область T6 сужена до `/r/:slug` | — |
| ~~K-3~~ | ~~длина `body`: 10–2000 против ≤ 4000~~ | **ЗАКРЫТО.** `arch` дал `CHECK ck_private_feedback_body: length(btrim(body)) BETWEEN 1 AND 4000` — это внешняя граница СУБД, а требование 10–2000 держит приложение. Разные слои, не противоречие | — |
| K-4 | Spec NFR-SEC-003: у `app_render` **записи НЕТ**. Arch §3.1: `INSERT` на `guest_events` без `SELECT` | Берём Arch: гейтинг обеспечивает **чтение**; запись, результат которой некому прочитать, на ответ повлиять не может. Условие — `SELECT` не выдан, UNIQUE-индексов нет (T3, T8) | Phase 2 |
| **K-5** ⚠️ | Arch §4 (строка 232, **не исправлено**): `device_hash = HMAC(секрет‖неделя, IP‖UA)`. Spec FR-013: «без сквозного идентификатора между точками» | Берём Spec: `place_id` входит **в сообщение** HMAC (§1.2). **Это дефект, а не разночтение:** без `place_id` один телефон даёт одинаковый хэш в двух заведениях | `arch` — правка §4 **до первой миграции** |
| ~~K-6~~ | ~~`plan = 'paid'` против `enum(free,point,network,agency)`~~ | **ЗАКРЫТО** каноном Arch. Здесь — явное множество `{point, network, agency}`, fail-closed для всего остального | — |
| **K-7** | Таймауты названы дважды и по-разному: Spec NFR-SEC-004 — `connectionTimeoutMillis = 5000`, `statement_timeout = 5s`; выжимка `arch` — `2000` и `3000 ms` на гостевых трактах | Берём **меньшие** (`arch`): недоступность обязана становиться отказом раньше, а не позже. Но **два числа в двух документах разойдутся молча** — обязано остаться одно | `spec` + `arch` |
| **K-8** | Кэш `/r/:slug`: Spec NFR-PERF-001 — TTL **300 c**, инвалидация ≤ 60 c; выжимка `arch` — TTL **60 c** плюс явная инвалидация | Механизм — **явная инвалидация**, TTL — страховка на случай её недоступности (§1.1). Тогда TTL обязан быть **≤ 60 c**, иначе при отказе канала требование «≤ 60 c» не выполняется. TTL 300 c его нарушает | `spec` — правка NFR-PERF-001 |
| **K-9** | Имя поля брендинга: Arch §4 и §12 — `places.branding_required`; `Specification-GROWTH.md` §FR-GROWTH-003 — `badge_required` | Берём канон Arch: **`branding_required`**. Два имени одного поля — ровно то расхождение, которое канон §12 и заведён предотвращать | `spec` — правка `Specification-GROWTH.md` |
| **K-10** | **Внутреннее** расхождение `Architecture.md`: §4 (строка 217) даёт `kind enum(scan, door_click)` + `platform NULL`, канон §12 — `enum(scan, public_door_click, private_door_click)` | Берём канон §12: смысл, спрятанный в `NULL`, — тихий дефект, ждущий читателя. `platform IS NOT NULL` **тогда и только тогда**, когда `kind='public_door_click'` | `arch` — привести §4 к §12 |

**Схему меняют два пункта:** K-5 (сообщение HMAC) и K-10 (значения enum). Остальное — тексты,
имена и числа.

## 1. Гостевая поверхность — несущий инвариант (FR-005, FR-012, NFR-SEC-001…003)

> **`GET /r/:slug` — чистая функция от `slug`.** Ниже это не декларация, а свойство сигнатур:
> у функции, порождающей разметку, **нет аргумента**, куда подать контекст запроса; у функции,
> видящей запрос, **нет возвращаемого значения**, через которое контекст вернулся бы в ответ.
> Пути от контекста к ответу не существует — оба его конца отсутствуют.

### 1.1 Рендер и роут страницы выбора

```
# apps/guest/src/render.ts — роль СУБД app_render. ЗАПРЕЩЁННЫЕ импорты (страж T9):
# headers(), cookies(), Date/now, гео-разбор, UA-разбор, random.
function renderChoicePage(slug: string) -> Html:
  cached = LRU.get(slug)                    # ключ кэша — РОВНО slug, ничего больше
  if cached is not null and not cached.expired: return cached.html   # TTL — страховка, не механизм
  place = selectPlace(slug)                 # SELECT id, slug, name, branding_required FROM places
  if place is null or place.archived_at is not null:
    return notFoundHtml()                   # 404 одинаков: несуществующий и чужой слаг неразличимы
  doors = []
  for link in selectPlatformLinks(place.id):          # SELECT place_id, platform, url, link_kind
    doors.append({ key: "platform:" + link.platform, title: platformTitle(link.platform),
                   href: BASE_URL + "/go/" + slug + "/" + link.platform,
                   note: (link.link_kind == "card")   # честная деградация числа тапов, бриф §Т.5
                         ? "карточка организации, отзыв — следующим шагом" : null })
  # Приватная дверь — ЭЛЕМЕНТ ТОГО ЖЕ МНОЖЕСТВА, а не сущность ниже списка. Название снято
  # с Birdeye, намёка на сортировку по тональности не содержит (FR-005).
  doors.append({ key: "private", title: "Написать нам напрямую", note: null,
                 href: BASE_URL + "/r/" + slug + "/private" })
  # Р1 «равновесно» (D-03): порядок — детерминированная перестановка ИЗ slug. Не случайная
  # (это был бы A/B), не хранимая (поля sort_order нет — NFR-SEC-002).
  doors = sortBy(doors, door -> sha256(slug + "|" + door.key))
  html = template(place.name, doors, branding = place.branding_required)   # §1.3
  LRU.put(slug, html, ttl = CACHE_TTL); return html

# Инвалидация — ЯВНАЯ, из владельческого тракта по внутреннему адресу (Arch §5.1): при правке
# places(name, branding_required), правке platform_links и смене плана аккаунта. TTL — только
# страховка на случай недоступности этого канала, и требование NFR-PERF-001 «≤ 60 c» держится
# ИМЕННО ей, когда канал не сработал. Отсюда K-8: значение TTL обязано быть ≤ 60 c.
function invalidateChoicePage(slug): LRU.delete(slug)

# GET /r/:slug
function handleChoicePage(req) -> Response:
  slug = req.path.slug                      # query, cookie, заголовки НЕ читаются вообще
  html = renderChoicePage(slug)             # аргумент один — и другого взять неоткуда
  place = resolvePlaceIdCached(slug)
  if place is not null: recordGuestEvent(req, "scan", place.id, null)
  return Response(html, status = place is null ? 404 : 200,
                  headers = { "Cache-Control": "no-store" })   # ни Set-Cookie, ни nonce, ни CSRF
```

**Почему в `doors` нет ни одного признака, влияющего на оформление.** Каждая дверь несёт `key`,
`title`, `href`, `note` — и ничего, что шаблон мог бы прочитать как «эта важнее». Равновесность
(NFR-UX-001) обеспечена не дисциплиной вёрстки, а **отсутствием входа для различия**: шаблон рисует
один и тот же узел в цикле, ему нечем отличить приватную строку от площадки.

**Почему `no-store` при наличии кэша.** Кэш живёт **в процессе** `apps/guest` (Arch §3.3), а не на
CDN: edge-кэш съел бы вместе с возможной веткой и **сканы**, а метрика недели считается по ним.
Каждый скан доезжает до origin; байты при этом одни и те же, потому что источник у них один.
**Отсюда список нормализаций для T4 ПУСТ** — нет cookie и инлайновых скриптов, значит нет ни
CSP-nonce, ни CSRF-токена, ни метки времени: sha256 сравнивается по сырому телу. Это самая сильная
форма теста, потому что нормализация есть то место, где страж однажды начнёт стирать настоящее
различие.

### 1.2 Хэш устройства — уникальность без персональных данных

```
# apps/guest/src/journal.ts и services/intake — единственные модули, видящие Request
function deviceHash(req: Request, place_id: UUID) -> Bytes16:
  ip = extractClientIP(req)   # ПРЕДПОСЛЕДНИЙ элемент X-Forwarded-For — верно ТОЛЬКО за нашим
                              # Caddy. Условие корректности: guest/intake НЕ опубликованы на хост
                              # (Arch §9). Опубликованный рядом сервис обнуляет и лимит, и метрику.
  week = isoWeek(now())       # соль привязана к КАЛЕНДАРНОЙ неделе: окно уникальности задано
                              # криптографически и совпадает с определением метрики (FR-013)
  # K-5: place_id — В СООБЩЕНИИ. Без него один телефон связывается МЕЖДУ заведениями, что FR-013
  # прямо запрещает. Сырые IP и UA не сохраняются нигде.
  return truncate(hmacSha256(key = DEVICE_HASH_SECRET + "|" + week,
                             msg = place_id + "|" + ip + "|" + req.header("User-Agent")), 16 bytes)
```

**Честная граница механизма — назвать до, а не после.** Ключ грубый: за одним NAT два гостя с
одинаковой моделью телефона и версией ОС дают **один** хэш. Направление ошибки — **занижение**
числа уникальных устройств, и это верное направление: метрика недели обязана не врать в приятную
сторону (PRD §2.5). Для ограничения частоты то же свойство означает общий счётчик у добросовестных
соседей — поэтому порог берётся заведомо выше живого поведения (§2.1), а не «поплотнее».

### 1.3 `branding_required` считает сервер — и не может ошибиться в опасную сторону

`app_render` не имеет прав ни на `accounts`, ни на `subscriptions` (Arch §3.1), поэтому тариф на
гостевой странице не вычисляется — он **читается уже вычисленным** из `places.branding_required`.

```
# apps/web (роль app_owner): при регистрации, оплате, истечении периода, смене плана
function recomputeBrandingRequired(place_id):
  sub = getActiveSubscription(placeAccountId(place_id))      # null, если нет или период истёк
  UPDATE places SET branding_required = brandingRequiredFor(planOf(place_id), sub) WHERE id = place_id
function brandingRequiredFor(plan, sub) -> bool:
  PAID_PLANS = { "point", "network", "agency" }    # ЯВНОЕ множество, не «всё, что не free»
  if sub is null or sub.status != "active" or sub.current_period_end <= now(): return true
  return not PAID_PLANS.contains(plan)             # любое неопознанное значение → true
```

Три свойства, заслуженные проектом 01: колонка объявлена **`NOT NULL DEFAULT true`** — новая точка
получает бренд-строку до того, как кто-либо что-либо вычислил
([`fail-closed-defaults`](../../../.claude/rules/fail-closed-defaults.md)); `brandingRequiredFor` —
**чистая функция**, поэтому проверяется списком мусорного входа (`null`, `''`, `'PAID'`, `' point'`,
`0`, `true`, `{}`, `['point']`) одним тестом, а не ревью; снятие бренд-строки видно гостю **не
позднее 60 c** через TTL кэша §1.1 — без канала «web → guest», которого в архитектуре нет.

### 1.4 Журнал сканов — побочный эффект, у которого нет обратного пути

```
# apps/guest — вызывается ПОСЛЕ формирования ответа, результат на ответ не влияет
function recordGuestEvent(req, kind: EventKind, place_id: UUID, platform: Platform|null) -> void:
  try:
    INSERT INTO guest_events(place_id, kind, platform, device_hash, created_at)
    VALUES (place_id, kind, platform, deviceHash(req, place_id), now())
    # НЕ "RETURNING id": у app_render нет SELECT на guest_events, а RETURNING его требует.
    # НЕ "ON CONFLICT": UNIQUE-индексов на guest_events нет (T8) — иначе «строка уже была»
    # стало бы каналом чтения, то есть персонализацией под постоянного гостя.
  catch DbError as e:
    logError("guest_event_write_failed", kind, place_id, e)   # фолбэк ОБЯЗАН быть виден в логе
    # Дальше молча — осознанно: сорвать гостю путь ради счётчика хуже, чем потерять счётчик.
    # ЕДИНСТВЕННЫЙ тихий фолбэк в продукте, и он назван здесь явно
    # ([`silent-fallbacks`](../../../.claude/rules/silent-fallbacks.md)).
```

**Канон Arch §12 даёт `recordGuestEvent(req, kind): void`.** Здесь она дополнена `place_id` и
`platform` — расширение **аддитивно**: возвращаемого значения по-прежнему нет, `render.ts`
по-прежнему не принимает `req`. Оба конца пути «контекст → ответ» отсутствуют, T9 не ослаблен.
Подтвердить у `arch`.

### 1.5 Переход на площадку и страница приватной формы

```
# GET /go/:slug/:platform  (apps/guest, app_render) — ADR-004
function handleDoorClick(req) -> Response:
  link = selectPlatformLink(req.path.slug, req.path.platform)   # ОБА аргумента из пути
  if link is null: return Response(status = 404)                # НЕ редирект «куда-нибудь»
  recordGuestEvent(req, "public_door_click", link.place_id, req.path.platform)  # ДО редиректа
  return Response(302, headers = { "Location": link.url, "Cache-Control": "no-store" })

# GET /r/:slug/private  (apps/guest, app_render) — K-2
function handlePrivateForm(req) -> Response:
  place = resolvePlace(req.path.slug)
  if place is null: return Response(status = 404)
  recordGuestEvent(req, "private_door_click", place.id, null)   # ОТДЕЛЬНОЕ значение enum,
  return Response(renderPrivateForm(req.path.slug),             # а не platform IS NULL
                  headers = { "Cache-Control": "no-store" })
```

**Три условия, без которых отклонение ADR-004 перестаёт быть безопасным** (внесены `spec` в
NFR-SEC-002; здесь они выражены кодом, а не обещанием). Роут, отдающий `3xx`, — это ровно та форма,
которой определяется гейтинг; отличает его **только содержимое входа**, поэтому условия несущие:

1. **`/go` — чистая функция пары (`slug`, `platform`).** Оба аргумента берутся из пути; `query`,
   cookie и заголовки не читаются ни разу. Одинаковый `Location` любому запросившему.
2. **`/go` не читает `private_feedback`.** Роль `app_render` — без `SELECT`; NFR-SEC-003
   распространён на `/go` и `/r/:slug/private` наравне с `/r/:slug`.
3. **Запись аналитики — «отправил и забыл».** Её отказ не меняет ни `Location`, ни код ответа: это
   обеспечено сигнатурой `recordGuestEvent(...): void` и глушением `DbError` внутри неё (§1.4).
   Обратное сделало бы аналитику **входом** в решение о переходе — то есть тем самым аргументом,
   которого у функции быть не должно.

**Различение дверей — отдельными значениями `guest_event_kind`, а не `platform IS NULL`.**
Первая редакция этого документа кодировала приватную дверь как `door_click` с `platform IS NULL`;
канон Arch §12 это отверг, и по верной причине: **смысл, спрятанный в `NULL`, — тихий дефект,
ждущий читателя.** Значения взяты дословно из FR-012: `scan`, `public_door_click`,
`private_door_click`. Инвариант схемы при этом сохраняется: `platform IS NOT NULL` **тогда и только
тогда**, когда `kind = 'public_door_click'`, и это выражается CHECK-ограничением, а не соглашением.

**Область действия T6 — только `/r/:slug`.** Виджет звёзд в приватной форме законен и полезен
(FR-006: оценка здесь **выход** уже сделанного выбора, а не вход маршрутизации). Страж, применённый
к `/r/:slug/private`, дал бы ложное красное — и был бы отключён через неделю вместе с настоящим.

---

## 2. Приём приватного сообщения (FR-006) — порядок операций и есть защита

```
# POST /api/feedback/private  (services/intake, роль app_intake)
function handlePrivateFeedback(req) -> Response:
  # ── ШАГ 1. Origin. Форма, которую мы отдаём, всегда заставляет браузер прислать Origin,
  #    поэтому его ОТСУТСТВИЕ — отказ, а не «старый клиент» (fail-closed).
  if req.header("Origin") != originOf(BASE_URL): return HTTP 403
  # ── ШАГ 2. ГРУБЫЙ лимит по одному адресу, ДО чтения тела. Нужен потому, что оба порога
  #    Specification заданы «на точку», а `slug` лежит В ТЕЛЕ: без этого шага перебор мусорными
  #    телами оплачивался бы нашим чтением, а чтение тела — время, которым управляет КЛИЕНТ.
  #    Порог заведомо выше суммы точечных: он ловит не злоупотребление, а поток.
  ip = extractClientIP(req)
  if rateLimitConsume("private_ip_coarse", ip, 1 hour, 200) == EXCEEDED:
    return HTTP 429                        # без счётчика в теле — anti-enumeration
  # ── ШАГ 3. Чтение тела: жёсткий предел и таймаут, БЕЗ занятого соединения пула.
  payload = parseJson(readBody(req, max_bytes = 16 KB, timeout = 5 s))   # → 413 / 408 / 422
  # ── ШАГ 4. Резолв точки и ОБА порога Specification — по-прежнему ДО валидации тела.
  place = selectPlaceBySlug(payload.slug)  # app_intake: SELECT places разрешён
  if place is null: return HTTP 404
  # 10 отправок с одного адреса в час НА ТОЧКУ. Порог намеренно с запасом: за одним операторским
  # NAT сидят РАЗНЫЕ гости одной точки, и грубый ключ при насыщении бьёт по добросовестным.
  if rateLimitConsume("private_ip_place", ip + "|" + place.id, 1 hour, 10) == EXCEEDED:
    return HTTP 429
  # 100 на точку в час суммарно — потолок, не зависящий от числа адресов.
  if rateLimitConsume("private_place", place.id, 1 hour, 100) == EXCEEDED: return HTTP 429
  # ── ШАГ 5. Валидация: ПОСЛЕ лимита (иначе он не защищает), ДО транзакции.
  errors = []
  if not (10 <= len(payload.body) <= 2000): errors.append("body: 10-2000 символов")     # K-3
  if payload.rating is present and (not isInteger(payload.rating) or not (1 <= payload.rating <= 5)):
    errors.append("rating: целое 1-5 либо отсутствует")   # неопознанное → ОТКАЗ, не подстановка
  if payload.contact is present and len(payload.contact) > 200: errors.append("contact: до 200")
  if errors is not empty: return HTTP 422 { errors }
  # ПРИЁМ НЕ САНИРУЕТ ВВОД (FR-006): текст сохраняется побайтово. Экранирование — при рендере
  # владельцу. Санитайзер на приёме уничтожает улику необратимо.
  # ── ШАГ 6. Идентификатор порождает ПРИЛОЖЕНИЕ. У app_intake нет SELECT на private_feedback,
  #    значит "INSERT ... RETURNING id" НЕВОЗМОЖЕН: RETURNING требует SELECT-привилегии на
  #    возвращаемые колонки. Это не обход ограничения, а следствие того, что оно настоящее.
  pf_id = uuidV4()
  # ── ШАГ 7. ОДНА транзакция, обе вставки. Внешних вызовов внутри НЕТ.
  transaction:
    INSERT INTO private_feedback(id, place_id, body, rating, contact, created_at)
      VALUES (pf_id, place.id, payload.body, payload.rating, payload.contact, now())
    INSERT INTO notifications(private_feedback_id, channel, status, attempts)
      SELECT pf_id, cb.channel, 'pending', 0 FROM channel_bindings cb
       WHERE cb.place_id = place.id AND cb.bound_at IS NOT NULL
      ON CONFLICT (private_feedback_id, channel) DO NOTHING   # uq_notifications_feedback_channel:
      # идемпотентность ДОСТАВКИ. Здесь она недостижима иначе — повторный прогон этой транзакции
      # (ретрай на уровне сервера) не должен порождать второе сообщение владельцу по одному
      # обращению. rowcount не читается: у app_intake нет SELECT, и знать его не требуется.
    # Канал не подключён → строк 0. Сообщение сохранено, момент ценности НЕ засчитывается
    # (FR-003, FR-007): владелец увидит его в кабинете и подсказку подключить мессенджер.
  # ── ШАГ 8. Ни URL, ни редиректа, ни «а теперь оставьте отзыв на картах» — последнее было бы
  #    гейтингом наизнанку.
  return HTTP 201 { ok: true }
```

**Почему «отправить, потом записать» было бы потерей сообщения.** Строка `notifications` создаётся
в **той же** транзакции, что и `private_feedback`, поэтому недоступность мессенджера — задержка, а
не потеря ([`security-operation-order`](../../../.claude/rules/security-operation-order.md)).

### 2.1 Ограничение частоты — атомарно, иначе последовательный тест зеленеет напрасно

```
function rateLimitConsume(scope, key, window, limit) -> ALLOWED | EXCEEDED:
  transaction:                                         # короткая, серверная, без внешних вызовов
    pg_advisory_xact_lock(hashtext(scope + "|" + key))  # сериализация РОВНО по этому ключу
    c = SELECT count(*) FROM rate_limit_events
         WHERE scope = scope AND key = key AND created_at > now() - window
    if c >= limit: return EXCEEDED                      # запись НЕ делается: отказ не жжёт окно
    INSERT INTO rate_limit_events(scope, key, created_at) VALUES (scope, key, now())
    return ALLOWED
```

- **Атомарность.** `count` и `INSERT` под одной блокировкой по ключу. Без неё двадцать
  одновременных запросов читают `c = 0` каждый и проходят все — а последовательный тест «шестая
  попытка → 429» при этом **зеленеет**. Поэтому тест обязан быть конкурентным.
- **Гранулярность.** Блокировка по `(scope,key)`, а не общая: сосед по NAT с другим устройством
  имеет другой ключ и не ждёт. Грубый ключ при насыщении наказывает добросовестных
  ([`shared-resource-verification`](../../../.claude/rules/shared-resource-verification.md)).
- **Время удержания.** Внутри блокировки нет ни чтения тела, ни сетевого вызова, ни argon2 — только
  два запроса к своей же БД. Ничего, чьей длительностью управляет клиент.

**Двойная отправка формы.** Дедупликации на вставке нет: `ON CONFLICT` потребовал бы уникальности
по `(place_id, device_hash, …)`, то есть хранения признака устройства **рядом с текстом сообщения**
— против NFR-DATA-001. Вместо этого: POST-Redirect-GET (кнопка «назад» не переотправляет), порог
`private_ip_place` 10/час ограничивает ущерб сверху, а в кабинете сообщения одной точки с
совпадающим текстом в пределах 60 c показываются одной карточкой — группировка на **чтении**, где
права на `SELECT` есть. `[GAP: если владельцы сообщат о дублях — вернуться к UNIQUE и явно
взвесить его против NFR-DATA-001]`

---

## 3. Доставка владельцу (FR-007) и ответ гостю (FR-008)

```
# services/notifier, роль app_notify
function deliverLoop():
  loop:
    batch = transaction:                                # ЗАЯВКА — короткая транзакция
      SELECT id, private_feedback_id, channel FROM notifications
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED   # воркеры не дерутся
      UPDATE notifications SET status='sending', attempts = attempts + 1 WHERE id IN (...)
      return rows
    # ── СОЕДИНЕНИЕ ПУЛА ОСВОБОЖДЕНО. Внешний вызов — ВНЕ транзакции и вне удержания.
    for n in batch:
      pf   = selectPrivateFeedback(n.private_feedback_id)     # app_notify: SELECT разрешён
      bind = selectBinding(pf.place_id, n.channel)
      try:
        sendToMessenger(n.channel, bind.chat_id, formatMessage(pf), timeout = 5 s)
        transaction: UPDATE notifications SET status='sent', sent_at=now() WHERE id = n.id
      catch MessengerError as e:
        if n.attempts >= 6:
          transaction:
            UPDATE notifications SET status='failed', last_error=e.message WHERE id = n.id
            INSERT INTO audit_log(entity_type, entity_id, action, reason)
              VALUES ('notifications', n.id, 'delivery_failed', e.code)
        else:
          transaction: UPDATE notifications
                          SET status='pending', last_error = e.message,
                              next_attempt_at = now() + min(2^n.attempts * 5 s, 10 min)
                        WHERE id = n.id
```

**Момент ценности не требует отдельной таблицы событий.** `private_message_sent` —
`private_feedback.created_at`; `private_message_delivered` — `notifications.status='sent'` вместе с
`sent_at`. У `app_notify` нет прав на `analytics_events`, и они не нужны: обе метки уже в той
строке, которую он и так обновляет. **Задержка = `sent_at − created_at`**; p95 ≤ 30 c (Arch §7.1),
потолок FR-007 — 60 c. «В ту же смену» без числа непроверяемо.

Три несущих свойства цикла: **`timeout = 5 s` задан явно** (вызов без таймаута ждёт бесконечно, а
недоступность внешнего сервиса обязана быть отказом); **`status='sending'` ставится ДО вызова**
(иначе перезапуск воркера в момент отправки даёт владельцу второе сообщение по той же строке);
**исчерпание попыток видно** — `failed` + `audit_log` + явная ошибка канала в кабинете, а не
«сообщений нет»: тихая недоставка неотличима от тишины гостей, и это худший вид отказа.

```
# FR-008 — ответ владельца гостю (Priority: Should)
function ownerReply(pf_id, text, actor):
  pf = selectPrivateFeedback(pf_id)                  # app_owner под RLS
  if pf.contact is null:
    return HTTP 409   # кнопки ответа в интерфейсе НЕТ ВОВСЕ — она не появляется и не выдаёт
  return deliverReply(pf.contact, text)              # ошибку после нажатия
```

`[GAP: FR-008 — исходящего канала к гостю в архитектуре нет: SMTP/SMS в compose не объявлено, а
Telegram/MAX — каналы ВЛАДЕЛЬЦА, не гостя. В MVP `deliverReply` = показ контакта владельцу с
копированием в один клик; автоматическая доставка не заявляется. Решает `arch`: либо компонент,
либо понижение AC FR-008]`

---

## 4-5. Кабинет владельца (FR-001…FR-004, FR-009…FR-013)

Вынесены в **[`Pseudocode-OWNER.md`](Pseudocode-OWNER.md)**: онбординг (регистрация и точка,
ссылки площадок, мессенджер, печатный макет), тарифы, оплата, дашборд и метрика недели. Разрез —
по границе ролей СУБД, которая и несёт запрет гейтинга: здесь `app_render` / `app_intake` /
`app_notify`, там `app_owner` под RLS.

## 6. Growth-механики (FR-GROWTH-001…004)

Вынесены в **[`Pseudocode-GROWTH.md`](Pseudocode-GROWTH.md)** (лимит 500 строк, тем же приёмом,
что `Specification-GROWTH.md`). Там же `accrueOnPayment`, вызываемый из [`Pseudocode-OWNER.md`](Pseudocode-OWNER.md) §5.1 шага 3 в **той же**
транзакции, что и применение тарифа.

---

## 7. Гонки — что именно проверяется, а не «учтено»

| Гонка | Разрешение | Почему не проверкой перед вставкой |
|---|---|---|
| Два владельца просят один `slug` | `UNIQUE(places.slug)` + перехват `UniqueViolation` ([OWNER](Pseudocode-OWNER.md) §4.1) | Между `SELECT` «свободен» и `INSERT` слаг занимает кто угодно. Атомарно только ограничение |
| Параллельные сканы одной точки | Ничего не нужно: `guest_events` append-only, UNIQUE-индексов **нет** (T8) | Уникальный индекс сделал бы `ON CONFLICT` выразимым, а его результат — каналом чтения «гость уже приходил» |
| 20 одновременных `POST /api/feedback/private` | `pg_advisory_xact_lock` по `(scope,key)` (§2.1) | `count` и `INSERT` без блокировки дают всем `c = 0`; последовательный тест этого не видит |
| Двойной клик по двери площадки | Не разрешается и не должен: два `door_click` — две записи. Доля считается от **сканов**, а не от уникальных кликов | Дедупликация потребовала бы `SELECT` на `guest_events`, которого у рендера нет по замыслу |
| Повторная доставка вебхука | `UNIQUE(webhook_events.event_id)` + `ON CONFLICT DO NOTHING` **после** подлинности ([OWNER](Pseudocode-OWNER.md) §5.1) | Заявка раньше подлинности делает подделку первой записью, и настоящее уведомление отбрасывается как дубль |
| Два воркера берут одну `notifications` | `FOR UPDATE SKIP LOCKED` + `status='sending'` до вызова (§3) | Без этого перезапуск воркера шлёт владельцу второе сообщение по той же строке |
| Оплата и рендер расходятся по `branding_required` | Явная инвалидация из `apps/web` по внутреннему адресу **плюс** TTL как страховка (§1.1) | Одна явная инвалидация без TTL молча растянула бы расхождение на всё время недоступности канала |
| Инвалидация пришла раньше, чем оплата закоммичена | Инвалидация вызывается **после** COMMIT транзакции оплаты, не внутри | Вызов внутри транзакции сбросил бы кэш на ещё не видимое другим соединениям состояние — и следующий скан заново закэшировал бы старое |

---

## 8. Открытые вопросы

- `[GAP: K-5 — формула `device_hash` в Architecture §4 не содержит `place_id` и потому нарушает
  FR-013. Здесь исправлено; правку обязан принять `arch`]`
- `[GAP: K-2 — путь `GET /r/:slug/private` отсутствует в исчерпывающих списках обоих документов,
  но структурно обязателен (T6 против FR-006). Подтвердить на Phase 2 вместе с ADR-004]`
- `[GAP: FR-008 — исходящего канала к гостю в архитектуре нет (§3)]`
- `[GAP: Q1 — открывает ли какая-либо ссылка форму отзыва Яндекс.Карт напрямую. До ответа
  `link_kind = card` у обеих площадок; меняется данными, не кодом]`
- `[GAP: пороги лимитов (`private_device` 5/10 мин, `private_place` 30/1 мин,
  `signup_partner_code` 50/10 мин) — оценка, не измерение. Пересмотреть по первым живым точкам;
  занижать нельзя, ключ грубый (§1.2)]`
- `[GAP: таблиц `partners`, `attributions`, `commissions` в схеме `Architecture.md` §4 нет —
  нужны для FR-GROWTH-002/004]`
