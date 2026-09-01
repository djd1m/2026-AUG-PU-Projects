# Pseudocode — кабинет владельца (проект 02)

> Вынесено из [`Pseudocode.md`](Pseudocode.md) по лимиту 500 строк. Разрез — **не по объёму,
> а по границе доверия, которую проводит сама архитектура**: `Pseudocode.md` описывает гостевую
> поверхность (`apps/guest`, `services/intake`, `services/notifier` — роли `app_render`,
> `app_intake`, `app_notify`), этот файл — кабинет владельца (`apps/web`, роль `app_owner` под
> RLS). Именно эта граница несёт запрет гейтинга (Arch §3.1), поэтому она же — естественный шов
> документа. Growth-механики — [`Pseudocode-GROWTH.md`](Pseudocode-GROWTH.md).
>
> Соглашения, помощники и разрешения расхождений K-1…K-6 — из [`Pseudocode.md`](Pseudocode.md)
> §0. Здесь: **FR-001…FR-004** (онбординг), **FR-009…FR-013** (тарифы, оплата, дашборд, метрика).

---

## 4. Онбординг (FR-001…FR-004)

### 4.1 Регистрация и точка — уникальность ограничением БД, а не проверкой перед вставкой

```
function createPlace(account_id, slug, name, address) -> Place | Error:
  if not matches(slug, "^[a-z0-9-]{3,40}$"): return Error("slug: 3-40, a-z 0-9 дефис")
  if slug in RESERVED_SLUGS: return Error("slug занят")   # api, go, r, admin, static, health
  try:
    INSERT INTO places(id, account_id, slug, name, address, badge_required, created_at)
      VALUES (uuidV4(), account_id, slug, name, address, TRUE, now())     # badge TRUE по умолчанию
  catch UniqueViolation on places_slug_key: return Error("slug занят")
  # Проверка занятости в интерфейсе (FR-001) — ПОДСКАЗКА, а не решение: между её ответом и
  # сабмитом слаг может занять кто угодно. Решает ограничение БД, потому что оно атомарно.
  return place
```

**До заполнения ссылок площадок `/r/<slug>` отдаёт «точка настраивается», а не 404 и не пустую
страницу** (FR-001): `platform_links` пуст → в `doors` ([main](Pseudocode.md) §1.1) остаётся одна приватная дверь плюс явное
пояснение. Пустота показывается как пустота.

### 4.2 Ссылка площадки — allowlist в коде, отказ вместо подчистки (FR-002)

```
ALLOWED_HOSTS = {                        # ЗАШИТО В КОД: в переменной окружения список однажды
  "yandex_maps": ["yandex.ru", "yandex.com", "maps.yandex.ru"],   # приедет пустым, а пустой
  "twogis":      ["2gis.ru", "2gis.com"]                          # allowlist читается как
}                                                                 # «пускать всех»

function validatePlatformLink(platform, raw) -> {url, link_kind} | Error:
  if raw is null or trim(raw) == "": return Error("ссылка пуста")
  try: u = new URL(trim(raw))            # ВАЛИДИРУЕМ разбором, а не регэкспом и не «подчистим»
  catch: return Error("это не ссылка")
  if u.protocol != "https:": return Error("только https")
  host = lowercase(u.hostname); ok = false
  for apex in ALLOWED_HOSTS[platform]:
    # Сравнение ПО ГРАНИЦЕ МЕТКИ, не подстрокой: "yandex.ru.evil.example" и "evil-yandex.ru"
    # обязаны отвергаться, а contains("yandex.ru") пропустил бы оба.
    if host == apex or host.endsWith("." + apex): ok = true
  if not ok: return Error("домен не принадлежит площадке")
  if platform == "yandex_maps" and not (u.path startsWith "/maps/org/" or u.path startsWith "/maps/-/"):
    return Error("это не карточка организации в Яндекс.Картах")
  if platform == "twogis" and not (u.path startsWith "/firm/" or host == "go.2gis.com"):
    return Error("это не карточка организации в 2ГИС")
  return { url: u.href, link_kind: "card" }   # пока Q1 не закрыт — card у обеих площадок

function savePlatformLinks(place_id, inputs, actor):
  results = [ validatePlatformLink(p, inputs[p]) for p in inputs ]
  if any(results is Error):
    # НИ ОДНА ссылка не изменяется: частичное сохранение оставило бы точку в состоянии,
    # о котором владелец не знает.
    emitAnalytics("onboarding_links_failed", { place_id, reasons: codesOf(results) })
    return HTTP 400 { errors }
  if count(results) < 1: return HTTP 400 { error: "минимум одна площадка обязательна" }
  transaction:
    for (p, r) in results:
      INSERT INTO platform_links(place_id, platform, url, link_kind) VALUES (place_id, p, r.url, r.link_kind)
        ON CONFLICT (place_id, platform) DO UPDATE SET url = excluded.url, link_kind = excluded.link_kind
      INSERT INTO audit_log(...) VALUES (..., 'platform_links', place_id, actor, 'link_changed')
  emitAnalytics("onboarding_links_saved", { place_id })   # КОНВЕРСИЯ ГЛАВНОГО ОТВАЛА ВОРОНКИ
```

**Цена ошибки объясняется в тексте отказа, а не констатируется.** Опечатка превращает QR на
пятидесяти столах в битую ссылку, и узнаем мы об этом от гостя — самым дорогим способом из
возможных. Сообщение «домен не принадлежит площадке» без этого объяснения читается как придирка,
и владелец будет искать, как её обойти.

### 4.3 Мессенджер (FR-003) и печатный макет (FR-004)

```
function bindChannel(place_id, channel) -> deep_link:
  token = randomToken(32)
  INSERT INTO channel_bindings(place_id, channel, bind_token_hash, bound_at)
    VALUES (place_id, channel, hash(token), NULL)        # bound_at NULL = ещё не подтверждено
  return deepLinkFor(channel, token)

function onBotStart(channel, chat_id, token):
  b = findBindingByTokenHash(hash(token))
  if b is null or b.bound_at is not null: return         # одноразовость: повтор не связывает
  UPDATE channel_bindings SET chat_id = chat_id WHERE id = b.id
  if not sendToMessenger(channel, chat_id, "Канал подключён.", timeout = 10 s): return
  UPDATE channel_bindings SET bound_at = now() WHERE id = b.id   # ПОДТВЕРЖДАЕТ ДОСТАВЛЕННОЕ
  emitAnalytics("onboarding_channel_bound", { place_id: b.place_id })   # СООБЩЕНИЕ (FR-003),
                                                                        # а не запись в БД
function buildPrintLayout(place, template) -> Pdf:
  assertBaseUrlConfigured()                              # §5.3 — БЕЗ дефолта в проде
  if not isAbsolute(BASE_URL) or not (BASE_URL startsWith "https://"):
    throw Error("BASE_URL обязан быть абсолютным https: он уходит В ПЕЧАТЬ")
  qr = renderQr(BASE_URL + "/r/" + place.slug)     # QR ведёт на НАШ домен: целевые ссылки
                                                   # площадок меняются на сервере без перепечатки
  assert template in CARRY_AWAY_TEMPLATES or template == "table_tent"
  # Сценарий «общий планшет / стойка со сканом» НЕ ПОДДЕРЖИВАЕТСЯ: макета для него нет вовсе.
  # Не «не рекомендуется» — отсутствует в продукте (04b §0.4.1).
  warn = (template == "table_tent") ? WIFI_WARNING : null   # безопасен, пока гость сканирует
                                                            # СВОИМ телефоном на СВОЕЙ сети
  # NFR-LEGAL-001: ни подсказок содержания отзыва, ни упоминания вознаграждения,
  # ни блока «свободный Wi-Fi + QR отзыва» одним куском.
  return compose(qr, place.name, warn, badge = place.badge_required ? SERVICE_LOGO : null)
```

---

## 5. Тарифы, оплата, дашборд, метрика (FR-009…FR-013)

### 5.1 Оплата (FR-011) — подлинность ДО заявки, недоступность провайдера как ИСКЛЮЧЕНИЕ

```
function onPaymentWebhook(req) -> Response:
  # ── ШАГ 1. Сеть источника. Список подсетей ЮKassa ЗАШИТ В КОД (Arch §10): вынесенный
  #    в переменную окружения он однажды приедет пустым, а пустой allowlist — «принимать отовсюду».
  if not ipInAnyCidr(extractClientIP(req), YOOKASSA_NETWORKS):
    auditLog("webhook_origin_rejected", { ip_hash: hash(ip) }); return HTTP 400
  event = parseJson(readBody(req, max_bytes = 64 KB, timeout = 5 s))
  # ── ШАГ 2. ВТОРАЯ, более сильная проверка подлинности — перезапрос статуса у провайдера.
  #    HMAC НЕТ: ЮKassa уведомления не подписывает. Держать проверку подписи, которой провайдер
  #    не присылает, значит держать ВИДИМОСТЬ защиты — она хуже отсутствия, потому что
  #    отсутствие видно, а видимость нет (урок проекта 01, коммит b1ccb57).
  #    Вызов ВНЕ транзакции: он не должен удерживать соединение пула.
  remote = fetchRemotePayment(event.object.id, timeout = 10 s)   # недоступность БРОСАЕТ
  if remote.status != "succeeded": return HTTP 200               # ProviderUnavailable
  # ── ШАГ 3. Заявка на event_id и применение тарифа — ОДНА транзакция, ПОСЛЕ подлинности.
  try:
    transaction:
      INSERT INTO webhook_events(provider, event_id, payload, processed_at)
        VALUES ('yookassa', event.id, event, now()) ON CONFLICT (event_id) DO NOTHING
      if rowcount == 0: return HTTP 200            # уже обработан — тихий, штатный no-op
      cs = SELECT * FROM checkout_sessions WHERE provider_session_id = remote.id
      if cs is null: return HTTP 200
      UPDATE checkout_sessions SET status = 'completed' WHERE id = cs.id
      upsertSubscription(cs.account_id, cs.plan, remote.paid_until, status = 'active')
      accrueOnPayment(cs.account_id, event.id)     # [GROWTH](Pseudocode-GROWTH.md) §2, та же транзакция
      for place in placesOf(cs.account_id): recomputeBadgeRequired(place.id)   # main §1.3, ≤ 60 c
  catch ProviderUnavailable:
    return HTTP 500        # РЕТРАИБЕЛЬНЫЙ отказ, транзакция ОТКАЧЕНА, event_id СВОБОДЕН
  return HTTP 200

function ipInAnyCidr(ip, cidrs) -> bool:
  for c in cidrs:
    (net, prefixRaw) = splitOnce(c, "/")
    # "1.2.3.4/" → Number('') === 0 → префикс /0 → «принимать с любого адреса».
    # Одна опечатка в списке обнуляла бы всю проверку (fail-closed-defaults).
    if prefixRaw is undefined or trim(prefixRaw) == "" or not isInteger(prefixRaw): continue
    if matchCidr(ip, net, toInt(prefixRaw)): return true
  return false
```

**Дефект, который этот порядок предотвращает, — реальный: найден в проекте 01 и стоил бы денег.**
Если заявку на `event_id` поставить раньше подлинности, а недоступность провайдера **вернуть
значением** из колбэка транзакции, то транзакция коммитится вместе с заявкой; роут отдаёт 500;
провайдер повторяет уведомление; повтор упирается в занятый `event_id` и коротит в «дубль» с кодом
200. **Оплата не применяется никогда: деньги списаны, тариф не повышен, повторить нечем.**

### 5.2 Дашборд (FR-009), воронка (FR-012), метрика недели (FR-013)

```
function placeDashboard(place_id, actor) -> View:          # app_owner, RLS по account_id
  scans = countGuestEvents(place_id, "scan")
  if scans == 0:
    return View(empty = "данных нет")   # НЕ «0/0» и НЕ полоса прогресса на нуле: отсутствие
                                        # данных выдавать за измеренный ноль запрещено
  return View(scans,
    public_share  = countGuestEvents(place_id, "door_click", platform_null = false) / scans,
    private_share = countGuestEvents(place_id, "door_click", platform_null = true)  / scans,
    messages = countPrivateFeedback(place_id),
    # ПРОДУКТ НЕ УТВЕРЖДАЕТ, ЧТО ОТЗЫВ ОПУБЛИКОВАН: API отзывов у площадок нет — система знает
    # о переходе и не знает его судьбы. Формулировка «гость перешёл на площадку» плюс пояснение.
    published_count = null, moderation_note = "от 2 часов до 7 дней")

function activePlacesThisWeek() -> int:                    # МЕТРИКА НЕДЕЛИ, цель 10
  SELECT count(DISTINCT place_id) FROM (
    SELECT place_id, device_hash FROM guest_events
     WHERE kind = 'scan' AND created_at >= date_trunc('week', now()) GROUP BY 1, 2) t
  # Дедупликация ЗДЕСЬ, при агрегации под app_owner, а НЕ при вставке: у app_render нет SELECT
  # на guest_events, поэтому «эта строка уже была» ему недоступно — и это часть защиты ([main](Pseudocode.md) §1.4).
```

**Оговорка «с уникального устройства» несущая, а не украшение:** без неё владелец, показывающий QR
сотрудникам, создаёт активность на пустом месте, и метрика начинает врать в приятную сторону.

### 5.3 `BASE_URL` — у внешнего адреса нет права на дефолт (NFR-OPS-001)

```
function assertBaseUrlConfigured():
  if NODE_ENV != "production": return                    # в dev и test дефолт законен
  if NEXT_PHASE == "phase-production-build": return      # сборке внешний адрес не нужен;
                                                         # без этого первый docker build упрётся
                                                         # в защиту и её снимут ЦЕЛИКОМ
  if BASE_URL is not empty: return
  throw Error("BASE_URL не задан. Он определяет КАЖДУЮ выдаваемую наружу ссылку, включая ту,
               что уходит В ПЕЧАТЬ: с дефолтом все они повели бы на localhost — навсегда,
               потому что носители не перепечатать.")
```

Сообщение объясняет **цену**, а не факт: «BASE_URL не задан» читается как придирка, и защиту снимут.

---
