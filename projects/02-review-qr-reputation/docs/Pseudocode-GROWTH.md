# Pseudocode — growth-механики (проект 02)

> Вынесено из [`Pseudocode.md`](Pseudocode.md) по лимиту 500 строк — тем же приёмом, что
> [`Specification-GROWTH.md`](Specification-GROWTH.md). Источники: `Specification-GROWTH.md`,
> [`discovery/04a-growth-gherkin.md`](discovery/04a-growth-gherkin.md),
> [`discovery/04-cjm-variants.md`](discovery/04-cjm-variants.md) §2.3. Имена — канон
> [`Architecture.md`](Architecture.md) §12. Помощники `rateLimitConsume`, `emitAnalytics`,
> `auditLog` — из [`Pseudocode.md`](Pseudocode.md) §2.1 и [`Pseudocode-OWNER.md`](Pseudocode-OWNER.md) §5.

**Продукт не виральный, и это свойство, а не недоработка.** `K = 0` by design: гость, оставивший
отзыв, не приводит новое заведение. Офлайн-QR даёт **impression-loop** — продукт видят новые люди,
база не растёт. Ни один алгоритм ниже не притворяется виральной петлёй.

---

## 1. FR-GROWTH-001 — share в момент ценности, без единого слова гостя

```
function onFirstDeliveredMessage(place_id, notification):   # зовёт notifier после status='sent'
  if existsAnalytics("invite_shown", place_id): return      # РОВНО ОДИН РАЗ НА ТОЧКУ
  emitAnalytics("invite_shown", { place_id })
  attachButton(notification, "показать коллеге")            # кнопка ПОД сообщением, в мессенджере
  # Канал не подключён → строки notifications не создалось (Pseudocode §2, шаг 7) → эта функция
  # не вызывается вовсе: invite_shown не пишется, момент ценности не засчитывается.

function buildShiftCard(place_id) -> Card:
  # ТОЛЬКО агрегаты: сканы, переходы, ЧИСЛО сообщений. Ни строки текста гостя, ни имени,
  # ни телефона, ни контакта (NFR-DATA-001). Адресат карточки — коллеги-владельцы в отраслевых
  # чатах, то есть покупатели; гости её не видят никогда.
  return Card(place_name, scans = ..., door_clicks = ..., messages = countOnly(...))

function onShareTap(place_id, owner):
  card = buildShiftCard(place_id)
  showConfirmDialog(card)          # БЕЗ явного подтверждения владельца во внешнюю сеть
  on confirm:                      # не уходит НИ ОДНОГО запроса. Рассылка от имени пользователя
    emitAnalytics("invite_sent", { place_id })    # без явного согласия судебно наказуема
    openShareSheet(card)                          # (LinkedIn Add Connections, $13M settlement)
```

**`i` и `conv%` считаются раздельно и с первого релиза:** `i = invite_sent / владельцы с ≥ 1
активной точкой`, `conv% = регистрации по инвайту / invite_sent`. Постфактум события не
восстанавливаются, а без обоих `K = i × conv%` не посчитать никогда. Целевого значения `i` на
неделе **не ставим**: на 10 точках оно непосчитаемо (`n < 30` — статистический самообман).

---

## 2. FR-GROWTH-002 — атрибуция, засчитанная в момент ОПЛАТЫ, а не регистрации

```
function resolveAttribution(request) -> {source, partner_id}:
  code = trim(request.body.promo_code)
  if code != "":
    partner = findPartnerByCode(code)
    # Невалидный промокод НЕ откатывается на cookie: явное намерение пользователя, даже ошибочное,
    # сильнее следа, о котором он не знает. Порядок проверок И ЕСТЬ правило приоритета.
    return partner is null ? {source: null} : {source: "promo_code", partner_id: partner.id}
  ref = readCookie(request, "rq_ref")     # вторичный канал: ITP гасит JS-cookie за 7 дней,
  if ref != "":                           # а цикл решения 2-6 недель; офлайн-встречу он не переживёт
    partner = findPartnerByCode(ref)
    if partner is not null: return {source: "cookie", partner_id: partner.id}
  if request.created_by_partner_account_id is not null:   # третий путь: агентство создало суб-аккаунт
    return {source: "sub_account", partner_id: request.created_by_partner_account_id}
  return {source: null}

function onSignup(request):
  a = resolveAttribution(request)
  if a.source is not null:
    createAttribution(account_id, a.partner_id, a.source, status = "pending")   # НЕ начисляем

function accrueOnPayment(account_id, payment_event_id):   # ЗОВЁТСЯ ИЗ Pseudocode §5.1, шаг 3,
  att = findAttribution(account_id, status = "pending")   # в ТОЙ ЖЕ транзакции
  if att is null: return
  if now() - att.created_at > 90 days:                    # окно промокода — 90 дней
    updateAttribution(att.id, status = "expired"); return
  if att.frozen: return                                   # §4: заморозка при накрутке
  if isSelfReferral(att):
    updateAttribution(att.id, status = "rejected", reason = "self_referral")
    auditLog("self_referral_blocked", att.id)
    return                                                # ОПЛАТА ПРИ ЭТОМ ПРОХОДИТ ШТАТНО
  recordCommission(att.partner_id, payment_event_id, amount = commissionOf(...))
  updateAttribution(att.id, status = "converted")
  emitAnalytics("referral_attributed", { partner_id: att.partner_id })

function isSelfReferral(att) -> bool:                     # три пути, закрыты все три
  return partnerEmail(att.partner_id) == accountEmail(att.account_id)
      or partnerAccountId(att.partner_id) == att.account_id
      or parentAccountOf(att.account_id) == partnerAccountId(att.partner_id)
```

**Вознаграждение структурно не может зависеть от отзывов** (NFR-LEGAL-001, вторая норма площадок).
Единственный триггер начисления — оплата приведённого заведения. Пути начисления, принимающего на
вход число отзывов, оценку или тональность, **в системе не существует** — как и поля, откуда их
взять: единственная оценка во всей схеме живёт в `private_feedback.rating` и недоступна ни одному
коду, кроме кабинета владельца.

**Атрибуция в момент оплаты, а не регистрации** — иначе накрутка регистраций сама по себе давала
бы выплату (§4), а конверсия партнёра измерялась бы намерением вместо работы.

---

## 3. FR-GROWTH-003 — бренд-строку решает исключительно сервер

Вычисление `branding_required` — [`Pseudocode.md`](Pseudocode.md) §1.3 (`brandingRequiredFor`,
fail-closed по явному множеству платных планов, колонка `NOT NULL DEFAULT true`).

```
# Три способа снять бренд-строку с клиента и почему ни один не работает:
#
# 1. "/r/:slug?badge=0" — handleChoicePage не обращается к query НИ РАЗУ, и ключ кэша —
#    ровно slug. Ответ байт в байт равен ответу без параметра, что уже утверждает страж T4:
#    отдельного теста на этот параметр не нужно, он частный случай инварианта.
# 2. Удаление узла из DOM — возможно и не восстанавливается: страница отдаётся БЕЗ JS,
#    восстанавливать нечем. Это осознанно: MutationObserver на гостевой странице потребовал бы
#    скрипта, а скрипт — nonce, а nonce — непустой список нормализаций T4 (Pseudocode §1.5).
#    Носитель impression-loop здесь не DOM, а ПЕЧАТНЫЙ МАКЕТ: логотип и короткий домен на
#    подвале счёта клиентом не правятся в принципе.
# 3. Подмена ответа конфигурации в браузере — конфигурации нет: страница цельная, серверная.
function brandingImpression(place_id): emitAnalytics("branding_impression", { place_id })
```

**Истёкшая подписка возвращает бренд-строку** не позднее 60 секунд: `recomputeBrandingRequired`
вызывается по истечении периода, гостевой LRU истекает по TTL 60 c. Успешная оплата снимает её
в тот же срок и тем же механизмом — один путь в обе стороны, а не два.

---

## 4. FR-GROWTH-004 — персональные коды и защита от накрутки

```
function onSignupViaPartnerCode(code, request):
  ip = extractClientIP(request)          # предпоследний X-Forwarded-For, за нашим Caddy
  if rateLimitConsume("signup_partner_code", ip, window = 10 min, limit = 50) == EXCEEDED:
    auditLog("partner_code_flood", { code, ip_hash: hash(ip) })
    freezeAttribution(request.account_id)   # начисления ЗАМОРОЖЕНЫ до ручной проверки,
    return HTTP 429                          # регистрации сверх порога отклоняются
  # Заведение зарегистрировано, но не оплатило → комиссии нет: триггер начисления — ОПЛАТА (§2).
  # Отдельной проверки «есть ли сканы» не требуется, и её сознательно нет: она была бы вторым
  # условием начисления, то есть вторым местом, где однажды появится третье.

function revokePartner(partner_id):
  setPartnerStatus(partner_id, "revoked")
  # ТОЛЬКО новые атрибуции. Ранее начисленные комиссии остаются к выплате — история immutable,
  # пересчёт задним числом не выполняется. Владелец нового заведения ошибки НЕ видит:
  # регистрация проходит штатно, просто без атрибуции.

function partnerDashboard(partner_id) -> View:
  return View(signups = countAttributions(partner_id),          # 12
              paid    = countAttributions(partner_id, "converted"),  # 4
              payout  = sumCommissions(partner_id),
              history = commissionsByAccount(partner_id))
```

---

## 5. Success Metric и Definition of Done

| FR | Success Metric | Число и срок |
|---|---|---|
| 001 | `i` = `invite_sent` / владельцев с ≥ 1 активной точкой | инструментирована к первому релизу; целевого значения на неделе **не ставим** |
| 002 | доля оплат с назначенной атрибуцией | ≥ 90 % оплат имеют разрешённый источник (`promo_code` / `cookie` / `sub_account`) либо явный `null` |
| 003 | доля страниц Free-точек с отданной **сервером** бренд-строкой | 100 %, проверяется на ответе сервера, не на рендере |
| 004 | число партнёров с ≥ 1 оплатившим заведением | ≥ 2 партнёра за первый месяц |

**DoD общий для всех четырёх, ни один не закрывается частично:** AC покрыты автотестами · механизм
атрибуции имеет владельца и `audit_log` · `@security`-сценарий имеет тест **и** митигацию · метрика
инструментирована **до** подписания `Completion.md` · страж правового инварианта прогнан с
внедрённым дефектом и показал красное.

## 6. Открытые вопросы

- `[GAP: ставка и база комиссии партнёра не зафиксированы ни в одном входном документе]`
- `[GAP: выплаты партнёрам-физлицам в РФ — прогрессивная шкала НДФЛ 13/15/18/20/22 % с 01.01.2026
  по накопленному годовому доходу. Захардкоженные 13 % посчитают неверное удержание у любого
  успешного партнёра, и это вскроется через год. В MVP выплат нет; при их появлении модель обязана
  вести year-to-date на партнёра (research/GROWTH-MECHANICS-REQUIREMENTS.md §6)]`
- `[GAP: таблицы `attributions`, `partners`, `commissions` в схеме `Architecture.md` §4
  отсутствуют — есть только `analytics_events` и `audit_log`. Нужны `arch`]`
