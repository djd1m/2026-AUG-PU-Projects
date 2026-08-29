# FR-011 · Псевдокод

## Константы

```
PARTNER_COOKIE      = 'pw_partner'
PARTNER_TOKEN_BYTES = 32                 # столько же, сколько у сессии владельца
PARTNER_IP_SCOPE    = 'partner_token_ip'
PARTNER_IP_THRESHOLD = 30                # ключ ТОЛЬКО по IP — см. NFR-011.4
PARTNER_WINDOW      = { seconds: 3600 }
```

**Почему ключ лимита только по IP, без пары.** У входа и у смены пароля пара нужна, чтобы
атакующий не запер владельца. Здесь запирать некого: учётной записи партнёра не существует,
есть только предъявительский секрет. А пара «токен + IP» дала бы атакующему **свежий бюджет
на каждый пробуемый токен** — то есть отменила бы лимит ровно там, где он нужен.

## Выдача токена — при создании партнёрского кода

```
function issuePartnerCode(client, { partnerName, actorId }):    # существующая функция
    code  = generateCode(partnerName)
    token = randomBytes(PARTNER_TOKEN_BYTES) -> base64url

    INSERT INTO partner_codes (code, partner_name, dashboard_token_hash)
           VALUES ($code, $partnerName, sha256($token))

    # Токен возвращается ОДИН раз и больше не восстановим: в БД лежит только хеш.
    # Та же дисциплина, что у сессий (session.ts): компрометация БД не даёт доступа.
    return { code, dashboard_token: token }
```

## Вход партнёра

```
# POST /api/partner/session
function POST(request):
    raw = readBodyAtMost(request, MAX_JSON_BODY)  or  413      # NFR-011.6
    body = parseJson(raw)  or  400
    token = string(body.token)
    ip = extractClientIP(request)

    result = withService(client -> authenticatePartner(client, token, ip))

    if result is TooMany:  return 429 TOO_MANY      # тот же литерал, что у входа
    if result is null:     return 401 UNAUTHORIZED  # ОДИН ответ на все отказы (NFR-011.3)

    response = 200
    response.setCookie(PARTNER_COOKIE, token, {
        httpOnly: true, secure: true, sameSite: 'lax',
        path: '/partner',        # уже cookie сессии владельца: чужие маршруты её не видят
        maxAge: 30 дней,
    })
```

```
function authenticatePartner(client, token, ip):
    keyIp = hashKey(PARTNER_IP_SCOPE, ip)

    if not try_advisory_xact_lock(PARTNER_LOCK_NAMESPACE, hashtext(keyIp)): return TooMany
    if rateLimit.exceeded(PARTNER_IP_SCOPE, keyIp, PARTNER_WINDOW, PARTNER_IP_THRESHOLD, client):
        return TooMany

    # Сверка ПО ХЕШУ и в SQL, по уникальному индексу (AC-011.15). Открытых строк не
    # сравниваем: восстановить токен из хеша нельзя, а равенство по 64 hex-символам
    # выполняет БД.
    #
    # status = 'active' стоит ЗДЕСЬ, а не отдельной проверкой с другим ответом:
    # «код отозван» отдельным текстом было бы оракулом (NFR-011.3).
    row = SELECT id FROM partner_codes
           WHERE dashboard_token_hash = sha256($token) AND status = 'active'

    if row is null:
        rateLimit.record(PARTNER_IP_SCOPE, keyIp, client)      # AC-011.12
        return null

    return { partnerCodeId: row.id }
```

## Дашборд

```
# GET /partner/dashboard  (серверный компонент)
function PartnerDashboardPage():
    token = cookies().get(PARTNER_COOKIE)
    if token is null:  redirect('/partner')

    # ЕДИНСТВЕННЫЙ источник (NFR-011.1). Ни адреса, ни параметра, ни заголовка.
    partner = withService(c -> resolvePartnerByToken(c, token))
    if partner is null:  redirect('/partner')     # включая отозванный код (AC-011.6):
                                                  # статус проверяется на КАЖДОМ показе,
                                                  # иначе отзыв не имел бы силы до
                                                  # истечения cookie

    data = withService(c -> getPartnerCohortDashboard(c, partner.code))
    render(data)
```

**`getPartnerCohortDashboard` переиспользуется как есть** — она уже фильтрует все три
запроса по `partner_code_id` (`partner.ts:141,148,155`) и уже возвращает `null` для
`conversion_rate` при нуле регистраций (`:160`). Дописывать в неё нечего; фича добавляет
только то, чего не было: способ узнать, ЧЕЙ это дашборд.

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `getPartnerCohortDashboard` | `lib/partner.ts:132` | да, целиком |
| `issuePartnerCode` | `lib/partner.ts:31` | правится: добавляется выдача токена |
| `readBodyAtMost`, `MAX_JSON_BODY` | `lib/request-body.ts` | да, единственной реализацией |
| `extractClientIP` | `lib/client-ip.ts` | да |
| `hashKey` | `lib/login.ts` | да — импорт, не копия |
| `hashSessionToken` | `lib/session.ts` | **нет**: у него своя соль сессий. Хеш токена партнёра считается отдельной функцией — смешивать пространства секретов нельзя |
| `rateLimit.*` | `@proofwall/db` | да, свой scope |
| `withService` | `@proofwall/db` | да — грантов `app_authenticated` на эти таблицы нет вовсе |

## Чего НЕ делаем

**Не кладём токен в адрес.** Три утечки перечислены в спецификации; ни одна не касается
тела POST.

**Не проверяем статус кода только при входе.** Отзыв обязан действовать немедленно, иначе
он не отзыв, а «перестанет работать через тридцать дней».

**Не заводим партнёру пароль и учётную запись.** Это отдельная фича с регистрацией,
восстановлением и почтой — ничего из этого в MVP нет. Предъявительский токен назван
предъявительским и его цена записана в принимаемые риски.
