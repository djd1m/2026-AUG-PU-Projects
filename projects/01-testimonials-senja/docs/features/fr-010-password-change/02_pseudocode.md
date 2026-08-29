# FR-010 · Псевдокод

## Порядок

```
function changePassword(request):
    # Тело — снаружи транзакции, предел общий с входом (NFR-010.5).
    raw = readBodyAtMost(request, MAX_JSON_BODY)  or  413
    body = parseJson(raw)  or  400

    accountId = currentAccountId()          # сессия обязательна
    if accountId is null:  return 401

    current = string(body.current_password)
    next    = string(body.new_password)

    # Границы нового пароля — ДО обращения к БД и ДО argon2: мусор не должен
    # ни занимать соединение, ни жечь CPU.
    if not validNewPassword(next):  return 400
    if next === current:            return 400      # FR-010.5

    result = withAccount(accountId, client -> {

        # ── ШАГ 1: лимит попыток подбора текущего пароля (NFR-010.3) ─────────
        # Ключ по аккаунту: кто это, мы уже знаем — перечислять некого.
        # Лок TRY по тому же ключу: проверка и запись счётчика иначе не атомарны.
        if not try_advisory_xact_lock(key):                 return TooMany
        if rateLimit.exceeded(SCOPE, key, HOUR, THRESHOLD): return TooMany

        # ── ШАГ 2: текущий пароль ───────────────────────────────────────────
        # ФИЛЬТР ПО account_id ОБЯЗАТЕЛЕН. RLS к accounts НЕ применяется
        # (007_rls.sql:31), хотя update этой роли выдан. Забыть фильтр здесь —
        # значит сменить пароль ЧУЖОМУ аккаунту (NFR-010.2).
        row = SELECT password_hash FROM accounts WHERE id = $accountId
        if row is null:  return Unauthorized
        if not verifyPassword(row.password_hash, current):
            rateLimit.record(SCOPE, key, client)
            return Unauthorized

        # ── ШАГ 3: пароль и сессии — ОДНОЙ транзакцией (NFR-010.1) ──────────
        UPDATE accounts SET password_hash = hash(next) WHERE id = $accountId

        # ВСЕ сессии, включая текущую. «Прочие» оставили бы вора внутри: кража
        # cookie не создаёт новой строки, вор сидит в ТОЙ ЖЕ сессии.
        UPDATE sessions SET revoked_at = now()
         WHERE account_id = $accountId AND revoked_at IS NULL

        # И сразу новая — иначе владелец окажется без сессии (NFR-010.6).
        token = createSession(client, accountId)
        return Ok(token)
    })

    response = 200
    response.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
```

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `readBodyAtMost`, `MAX_JSON_BODY` | `lib/request-body.ts` | да |
| `verifyPassword`, `hashPassword`, границы длины | `lib/password.ts` | да |
| `createSession` | `lib/session.ts` | да — единственная точка выдачи |
| `currentAccountId` | `lib/current-session.ts` | да |
| `rateLimit.exceeded` / `.record` | общий стор, колонка `scope` | да, свой scope |
| `withAccount` | `@proofwall/db` | да, но **RLS здесь не работает** — см. NFR-010.2 |

## Чего НЕ делаем

**Не считаем argon2 при отсутствии аккаунта.** На входе это было нужно против оракула
перечисления; здесь аккаунт известен из проверенной сессии, перечислять некого. Лишний
argon2 держал бы соединение пула без пользы.

**Не отзываем сессии до проверки пароля.** Иначе неверная попытка выбрасывала бы владельца.
