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

### 4.1 Регистрация и точка — адрес из названия, уникальность ограничением БД

> **Сверено с кодом 29.09.2026** (`apps/web/src/slug.ts`, `apps/web/src/places.ts`, миграция
> `010_slug_check.sql`; фича `1d66ec4e`). Первая редакция принимала слаг от владельца
> (`^[a-z0-9-]{3,40}$`, «занято» в лицо) — **поле адреса убрано**: ссылку сканируют, а не набирают
> ([`research/slug-constraints-ux.md`](research/slug-constraints-ux.md)). Требование — FR-PLACE-001
> в [`Specification-OWNER.md`](Specification-OWNER.md).

```
function createPlace(account_id, name) -> Place | Error:          # POST /places, роль app_owner
  if trim(name) == "" or len(name) > 200: return Error("название: 1–200 символов")
  withAccount(account_id):                         # set_config app.current_account_id → RLS
    for attempt in 0..3:
      slug = translit(name)                        # кириллица → латиница, «не то» → дефис,
                                                   # ≤ 24 символа, края без дефиса
      if attempt > 0 or len(slug) < 3 or slug in RESERVED:     # api admin internal static assets
        slug = (slug ? slug[0:19] + "-" : "p-") + randomHex(4) # r go v login register logout
                                                   # dashboard places private; хвост СЛУЧАЙНЫЙ,
                                                   # а не «-2»: не подсказывает перебор соседей
      if not SLUG_RE.test(slug): continue          # ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$
      SAVEPOINT create_place                       # ошибка ограничения отравляет транзакцию
      try: INSERT INTO places(account_id, slug, name) ... RETURNING id; return place
      catch UniqueViolation: ROLLBACK TO SAVEPOINT create_place   # коллизия — молча, новый хвост
    return Error("не удалось подобрать адрес — попробуйте ещё раз")    # 4 неудачи подряд
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
    return HTTP 422 { errors }
  if count(results) < 1: return HTTP 422 { error: "минимум одна площадка обязательна" }
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

> **Как реализовано (сверено с `apps/web/src/places.ts` 29.09.2026) — отличия от алгоритма выше:**
> хосты — регэкспы `yandex.(ru|com)`, `ya.ru` и `2gis.(ru|com)` с поддоменами по границе метки;
> **путь не проверяется** (площадки меняют пути без предупреждения); только `https:`;
> `link_kind` всегда `card`; сохранение — `UPSERT` по одной площадке, пустое поле пропускается,
> первая непригодная ссылка даёт `422`, но **уже сохранённая до неё площадка остаётся**
> (не «ни одна не изменяется»); событий `onboarding_links_*` и строки `audit_log` в коде нет.
> После сохранения кабинет просит `guest` сбросить кэш точки (`POST /internal/invalidate/<slug>`,
> [`Pseudocode-GROWTH.md`](Pseudocode-GROWTH.md) §3.1).

### 4.3 Мессенджер (FR-003, FR-BIND-001…003) и печатный макет (FR-004)

> **Сверено с кодом 29.09.2026:** `apps/web/src/server.ts` (маршруты `/places/:id/bind`, `/places/:id/qr`),
> `apps/web/src/pages.ts` (`bindStartPage`, `bindPage`, `botDeepLink`, `qrPage`), `apps/web/src/qr.ts`,
> `services/notifier/src/binder.ts`, миграции `009_binding_grants.sql`, `012_bind_token_burn.sql`.
> Реализован **только Telegram**; MAX — нет (`MAX_BOT_TOKEN` в `.env.example` ничем не читается).
> Первая редакция (одноразовость флагом `bound_at IS NULL`, обнуление привязки при выдаче токена,
> PDF-макет) заменена: фиксы `27ee2e6b`, `637c3a75`, `16bdcb75`, `d2420ffb`.

```
# ── кабинет (apps/web, app_owner под RLS)
GET  /places/:id/bind   -> bindStartPage(place, bound = exists chat_id)    # БЕЗВРЕДНЫЙ показ:
                                                   # предзагрузка ссылок браузером/мессенджером
                                                   # не должна перевыпускать токен
POST /places/:id/bind   (Origin == BASE_URL, иначе 403):
  token = base64url(randomBytes(24))               # показывается ОДИН раз, в БД — только sha256
  UPSERT channel_bindings(place_id, 'telegram', bind_token_hash = sha256(token), chat_id NULL,
         bound_at NULL) ON CONFLICT (place_id, channel) DO UPDATE SET bind_token_hash = excluded
                                                   # chat_id/bound_at НЕ трогаются: действующая
                                                   # доставка живёт до УСПЕХА нового /start
  deep = TELEGRAM_BOT_USERNAME ? "https://t.me/<bot>?start=<token>" : ""   # botDeepLink — ОДНО
  return bindPage(deep, qrSvg(deep), "tg://resolve?domain=<bot>&start=<token>",   # место сборки
                  webTelegramLink, "/start <token>" текстом)   # три обходных пути мимо t.me

# ── нотифаер (services/notifier, app_notify), каждый тик ≈ 5 с, до доставки
function pollBindings():
  if TELEGRAM_BOT_TOKEN == "": return 0            # бот не заведён — привязка спит
  updates = GET api.telegram.org/bot<token>/getUpdates?offset=<offset>&timeout=0 (8 с)
  on network error: return 0                       # offset не сдвинут — ничего не потеряно
  for u in updates:
    offset = max(offset, u.update_id + 1)
    m = match(u.message.text, "^/start[ =]([A-Za-z0-9_-]{16,64})$")
    if not m:
      if text startsWith "/start": log bind_start_without_token; reply "откройте по ССЫЛКЕ из кабинета"
      else if text: log tg_message_ignored
      continue
    rows = UPDATE channel_bindings SET chat_id = chat, bound_at = now(),
              bind_token_hash = randomBytes(32)    # СЖИГАНИЕ хеша = одноразовость, атомарно:
            WHERE bind_token_hash = sha256(m[1]) AND channel = 'telegram' RETURNING place_id
    if rows: reply "Готово…"                       # подтверждение доставленным сообщением
    else:    log bind_token_unknown(hash[0:8]); reply "Ссылка устарела…"

# ── QR и макеты (GET /places/:id/qr, только своя точка — чужая неотличима от несуществующей: 404)
href = BASE_URL + "/r/" + place.slug               # QR ведёт на НАШ домен (ADR-001)
svg  = QRCode.toString(href, svg, errorCorrection "M", margin 4, dark #00132e)
qrPage: «Подвал счёта», «Оборот визитки», «Наклейка на упаковку» (уносимые — первыми),
        затем «Тейбл-тент» с предупреждением про гостевой Wi-Fi и общий планшет; печать — print()
        # NFR-LEGAL-001: ни подсказок содержания, ни вознаграждения — стережёт http.test.ts
```

**Не реализовано из первой редакции:** проверка «`BASE_URL` — абсолютный `https`» перед
построением QR (кабинет берёт `BASE_URL` с дефолтом `http://localhost:3000`, см.
[`Refinement.md`](Refinement.md) §9, G-12); бренд-логотип сервиса на макете бесплатной точки —
на макетах его нет, бренд-строка живёт только на гостевой странице.

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
  remote = fetchRemotePayment(event.object.id, timeout = 5 s)    # недоступность БРОСАЕТ
  if remote.status != "succeeded": return HTTP 200               # ProviderUnavailable
  # ── ШАГ 3. Заявка на event_id и применение тарифа — ОДНА транзакция, ПОСЛЕ подлинности.
  try:
    transaction:
      # event_id СОБИРАЕТСЯ: у ЮKassa отдельного идентификатора события НЕТ (канон `arch`).
      # Ключ — '<тип события>:<id объекта>', первичный ключ pk_webhook_events(provider, event_id).
      # Голый id объекта схлопнул бы 'succeeded' и 'canceled' по одному платежу в один ключ:
      # второе уведомление отбросилось бы как дубль первого.
      event_key = event.event + ":" + event.object.id
      INSERT INTO webhook_events(provider, event_id, payload, processed_at)
        VALUES ('yookassa', event_key, event, now()) ON CONFLICT (provider, event_id) DO NOTHING
      if rowcount == 0: return HTTP 200            # уже обработан — тихий, штатный no-op
      cs = SELECT * FROM checkout_sessions WHERE provider_session_id = remote.id
      if cs is null: return HTTP 200
      UPDATE checkout_sessions SET status = 'completed' WHERE id = cs.id
      upsertSubscription(cs.account_id, cs.plan, remote.paid_until, status = 'active')
      accrueOnPayment(cs.account_id, event_key)     # [GROWTH](Pseudocode-GROWTH.md) §2, та же транзакция
      for place in placesOf(cs.account_id): recomputeBrandingRequired(place.id)   # main §1.3
  # Инвалидация кэша гостевой страницы — ПОСЛЕ коммита, а не внутри транзакции: сброс изнутри
  # обнулил бы кэш на ещё не видимое состояние, и следующий скан закэшировал бы старое.
  for place in placesOf(cs.account_id): invalidateChoicePage(place.slug)          # main §1.1, ≤ 60 c
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

> **Как реализовано (сверено с `apps/web/src/payment.ts`, `apps/web/src/server.ts` 29.09.2026):**
> вебхук — `POST /webhooks/yookassa` (вне сессии и Origin), тело до 64 КБ; адрес источника —
> **последний** элемент `X-Forwarded-For` (дописан общим Caddy), сеть — `YOOKASSA_NETWORKS` в коде,
> **включая IPv6 `2a02:5180::/32`** (без неё оплата по IPv6 не применялась бы никогда, фикс `dfb6497e`).
> Принимаются `payment.succeeded` и `payment.canceled`; перезапрос `GET /v3/payments/{id}`: `404` —
> подделка, `200` без записи; статус не совпал с заявленным — `200` без записи; сбой — `500`.
> `succeeded`: `checkout_sessions → completed`, подписка `point` на 30 дней (повтор оплаты продлевает
> `current_period_end + 30 days`), `branding_required = false` у **всех** точек аккаунта, комиссия
> партнёру по `pending`-атрибуции (`on conflict (payment_event_id) do nothing`). `canceled` помечает
> только незавершённый checkout (`expired`) и не затирает тариф. `auditLog` в коде нет.
> Создание платежа — `POST /billing/checkout`: цена `PRICE_POINT_RUB` (нет → 990, мусор → отказ),
> `Idempotence-Key` = UUID, `return_url = BASE_URL/dashboard?paid=1`; причина отказа пишется в лог
> `checkout_failed` (фикс `db10f349`). Полный план и DoD — [`features/payment/`](features/payment/01_specification.md).

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
    public_share  = countGuestEvents(place_id, "public_door_click") / scans,
    private_share = countGuestEvents(place_id, "private_door_click") / scans,
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

> **Как реализовано (сверено с `apps/web/src/places.ts`, `pages.ts` 29.09.2026):** кабинет показывает
> по каждой точке две плашки — «сканы» (`count(distinct device_hash)` по `kind='scan'` **за всё
> время**, не за неделю) и «обращения» (число `private_feedback`) — и список обращений на
> `/places/:id`. Долей дверей, пояснения о модерации, `activePlacesThisWeek` и недельной сводки в
> мессенджер **в коде нет**: метрика недели снимается запросом к БД вручную.

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

> **Как реализовано (сверено с кодом 29.09.2026) — защита есть только у `guest`:**
> `apps/guest/src/server.ts` `requireBaseUrl()` роняет старт в `NODE_ENV=production` без `BASE_URL`.
> У `web` — **тихий дефолт** `http://localhost:3000` (`apps/web/src/server.ts:17`), у `intake` пустой
> `BASE_URL` **отключает** проверку Origin (`services/intake/src/server.ts`: `if (ORIGIN && …)`).
> На стенде переменная задана, поэтому дефект не проявлен; в коде он есть — [`Refinement.md`](Refinement.md) §9, G-12.

Сообщение объясняет **цену**, а не факт: «BASE_URL не задан» читается как придирка, и защиту снимут.

---

---

## 6. Требования без алгоритма — чек-листы

`spec` назвал их прямо: у этих требований нет логики, которую можно выразить шагами, и попытка
написать её породила бы ветвление там, где его быть не должно.

**FR-004 (сверх сборки `https://<base>/r/<slug>` и отказа при неабсолютном `BASE_URL`, §4.3):**

- [ ] макеты по умолчанию — уносимые носители: подвал счёта, оборот визитки, наклейка на упаковке
- [ ] тейбл-тент доступен и несёт предупреждение про гостевой Wi-Fi и общее устройство
- [ ] макета «общий планшет / стойка со сканом» **не существует** — не «не рекомендуется»
- [ ] на плане Free макет несёт логотип сервиса и короткий домен (FR-GROWTH-003)

**FR-010 (сверх `brandingRequiredFor`, §1.3 основного файла):**

- [ ] цены видны **до** регистрации, формы захвата лида нет; первый CTA — «Начать бесплатно»
- [ ] «Сеть» и «Агентство» показаны анонсом и **не оформляются** в MVP

**NFR-LEGAL-001 — две нормы площадок, подтверждённые первоисточником.** Единственные внешние
ограничения во всём досье, и ни одно не про гейтинг:

- [ ] **ни подсказок содержания отзыва** — ни на `/r/:slug`, ни в печатном макете, ни в тексте
      push, ни в письмах
- [ ] **никаких стимулов за отзыв вообще** — берётся строжайшее из правил площадок
- [ ] реферальное вознаграждение начисляется **только за приведённое заведение** и структурно не
      может зависеть от отзывов: пути начисления, принимающего оценку, в системе нет
- [ ] в продукте, маркетинге и требованиях **не встречается** ни «gating запрещён законом», ни
      «Яндекс запрещает фильтрацию», ни «за это блокируют карточку», ни упоминания штрафа FTC.
      Каждое опровергается за пять минут, и один пойманный неверный довод обнуляет доверие ко
      всем остальным — **включая верные**

**NFR-ARCH-001 — архитектурные ограничения.** Проверяется скриптами, не глазами:

- [ ] монорепо, Docker Compose, VPS, **свой Postgres в контейнере**; managed BaaS запрещён
- [ ] у БД **нет публикации на хост**, кроме петли — `node .claude/hooks/check-ports.cjs .`
- [ ] хостовые порты только как `${VAR:-default}` — `bash scripts/check-port-conflicts.sh .`
- [ ] `name:` объявлен в **каждом** compose-файле, включая тестовый: без него соседний стек молча
      вытесняет этот, а диагноз уводит в сторону
- [ ] образы с явными тегами; `restart: unless-stopped` у всех сервисов; `depends_on` с
      `condition: service_healthy`, а не `service_started`

**NFR-DATA-001 — персональные данные гостя:**

- [ ] `contact` хранится только при явном согласии
- [ ] `contact` не попадает **ни в один** агрегат: ни в карточку смены (FR-GROWTH-001), ни в
      недельную сводку, ни в дашборд
- [ ] сырые IP и User-Agent не сохраняются нигде — только `device_hash` с недельной солью
- [ ] ретеншн `guest_events` — **90 дней**
- [ ] данные Яндекс API ППО не сохраняются (ограничение лицензии)

**NFR-A11Y-001 — доступность гостевой страницы:**

- [ ] контраст не ниже AA; семантическая разметка; обе двери достижимы табом
- [ ] страница полностью работоспособна **с отключённым JS** — это же условие пустого списка
      нормализаций T4, поэтому пункт не косметический

**NFR-UX-001 — равновесность.** Алгоритм здесь не продуктовый, а **тестовый**: собрать
`getComputedStyle` всех строк-дверей и сравнить множества. Развёрнут в
[`Refinement.md`](Refinement.md) §1, страж T5.3.
