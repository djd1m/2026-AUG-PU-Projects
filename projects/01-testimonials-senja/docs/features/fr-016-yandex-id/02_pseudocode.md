# FR-016 · Псевдокод

## Константы

```
YANDEX_AUTHORIZE = 'https://oauth.yandex.ru/authorize'
YANDEX_TOKEN     = 'https://oauth.yandex.ru/token'
YANDEX_INFO      = 'https://login.yandex.ru/info'
SSO_SCOPE        = 'login:email login:info'      # телефон НЕ просим — отдельный scope
SSO_TIMEOUT_MS   = 8_000                          # как у почты: время ответа не наше
STATE_COOKIE     = 'pw_sso_state'
STATE_TTL_MS     = 10 * 60 * 1000                 # десять минут на экран согласия
SSO_IP_SCOPE     = 'sso_callback_ip'
SSO_IP_THRESHOLD = 30
```

## Старт

```
# GET /api/auth/yandex/start
function GET(request):
    clientId = requireEnv('YANDEX_CLIENT_ID')      # бросает в production

    verifier  = randomBytes(32) -> base64url        # PKCE
    challenge = base64url(sha256(verifier))
    state     = randomBytes(32) -> base64url

    # Состояние между ДВУМЯ запросами — новый класс для проекта. Кладём в httpOnly-cookie
    # с коротким сроком: сервер его не хранит, значит нечего чистить и нечего утекать из БД.
    response = redirect(YANDEX_AUTHORIZE + '?' + params({
        response_type: 'code', client_id: clientId, scope: SSO_SCOPE,
        redirect_uri: urls.yandexCallback(), state, 
        code_challenge: challenge, code_challenge_method: 'S256',
    }))
    response.setCookie(STATE_COOKIE, sign(state + '|' + verifier), {
        httpOnly: true, secure: true, sameSite: 'lax',   # lax обязателен: возврат идёт GET-редиректом
        path: '/api/auth/yandex', maxAge: STATE_TTL_MS / 1000,
    })
```

## Коллбэк

```
# GET /api/auth/yandex/callback?code=…&state=…
function GET(request):
    ip = extractClientIP(request)

    # Лимит ДО внешних вызовов: маршрут неаутентифицирован и ходит в сеть дважды.
    # Ключ по IP — учётки на этом пути ещё нет, запирать некого.
    if not withService(c -> checkAndRecord(c, SSO_IP_SCOPE, ip)):  return 429

    stateCookie = cookies().get(STATE_COOKIE)
    if stateCookie is null:  return 400 'ссылка входа устарела'
    { state: expected, verifier } = unsign(stateCookie)  or  400

    if request.query.state !== expected:  return 400 'ссылка входа устарела'
    # Cookie гасится СРАЗУ, до сетевых вызовов: один state — одна попытка.
    response.clearCookie(STATE_COOKIE)

    # ── ВНЕ ТРАНЗАКЦИИ, оба вызова, оба с таймаутом ─────────────────────────
    # Четвёртый и пятый внешние вызовы проекта. Соединение пула ещё не взято.
    try:
        token   = POST YANDEX_TOKEN { grant_type: 'authorization_code', code, 
                                      code_verifier: verifier, client_id, client_secret }
        profile = GET  YANDEX_INFO  with Authorization: OAuth <token.access_token>
    catch:
        return 400 'не удалось подтвердить вход через Яндекс, попробуйте ещё раз'

    externalId = profile.id            # КЛЮЧ УЧЁТНОЙ ЗАПИСИ. Не email.
    email      = normalizeEmailFromInput(profile.default_email)

    # ── Транзакция, последней ──────────────────────────────────────────────
    result = withService(client -> resolveSsoAccount(client, externalId, email))

    switch result:
        linked(accountId)     -> выдать сессию через createSession, редирект в кабинет
        needs_password_login  -> редирект на /login?sso=exists — «войдите паролем и привяжите»
        error                 -> 400
```

```
function resolveSsoAccount(client, externalId, email) -> linked | needs_password_login:
    # 1. Идентификатор известен — это привязанная учётка. Email не смотрим вовсе.
    row = SELECT account_id FROM sso_identities
           WHERE provider = 'yandex' AND external_id = $externalId
    if row:  return linked(row.account_id)

    # 2. Идентификатор новый. Смотрим, есть ли учётка с таким адресом.
    acc = SELECT id, password_hash FROM accounts WHERE email = $email

    if acc is null:
        # Новый человек: учётка без пароля.
        accountId = INSERT INTO accounts (email, password_hash) VALUES ($email, NULL) RETURNING id
        # on conflict do nothing по (provider, external_id): два одновременных коллбэка с одним
        # кодом дадут одну привязку, а не две. Ограничение БД, а не проверка перед вставкой.
        INSERT INTO sso_identities (account_id, provider, external_id)
               VALUES ($accountId, 'yandex', $externalId)
               ON CONFLICT (provider, external_id) DO NOTHING
        return linked(accountId)

    if acc.password_hash IS NOT NULL:
        # ВСЯ ЗАЩИТА ЗДЕСЬ. Совпадение адреса ничего не доказывает: провайдер не сообщает,
        # подтверждён ли адрес, а наша регистрация его тоже не подтверждает. Привязка —
        # только из аутентифицированной сессии, где владение обеими сторонами доказано.
        return needs_password_login

    # Учётка без пароля с тем же адресом — она и создана этим же путём. Подмены нет:
    # других способов войти в неё не существует.
    INSERT INTO sso_identities (account_id, provider, external_id)
           VALUES ($acc.id, 'yandex', $externalId)
           ON CONFLICT (provider, external_id) DO NOTHING
    return linked(acc.id)
```

## Привязка из кабинета

```
# GET /api/auth/yandex/start?link=1  — тот же старт, но при активной сессии
# В коллбэке: если сессия активна И идентификатор новый — привязываем к ЭТОЙ учётке,
# не глядя на email вовсе. Владение обеими сторонами доказано: сессия + OAuth.
```

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `createSession` | `lib/session.ts` | да — **единственная** точка выдачи, страж уже есть |
| `normalizeEmailFromInput` | `lib/validation.ts` | да, единственным объявлением |
| `extractClientIP` | `lib/client-ip.ts` | да |
| `hashKey`, форма лимитера | `lib/login.ts` | да |
| `AbortSignal.timeout` | образец в `lib/email.ts`, `lib/payment.ts` | да — теперь у проекта есть образец |
| `login.ts` | — | **не меняется**: строка 127 уже коалесцирует `NULL` в заглушечный хеш |

## Чего НЕ делаем

**Не связываем по email автоматически.** Причина в спецификации, и она не про удобство.

**Не берём NextAuth ради одного провайдера.** Три HTTP-вызова и PKCE — ~150–250 строк; NextAuth
принёс бы свою модель сессий рядом с нашей, а единственная точка выдачи сессии закреплена стражем.

**Не просим scope телефона.** Он отдельный и не нужен; лишнее согласие снижает конверсию входа.

**Не храним `access_token`.** Он нужен один раз, чтобы прочитать профиль. Хранить его — значит
завести ещё один секрет с истечением и ротацией без единого потребителя.
