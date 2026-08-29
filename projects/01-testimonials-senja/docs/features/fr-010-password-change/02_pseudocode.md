# FR-010 · Псевдокод

> **Ревизия 2.** Изменено против ревизии 1: ключ лимита стал парой (B-5), `accountId`
> получает статус параметра, а не поля тела (B-1), argon2 нового пароля вынесен из
> транзакции (H-1), лок обрёл пространство имён и таймаут (H-2, H-4), неудача захвата
> лока отделена от исчерпания лимита (H-3), пороги названы числами (M-2).

## Константы — числами, а не именами

Ревизия 1 писала `THRESHOLD` и `HOUR`, из-за чего требование «прибить пороги в тесте
независимо от кода» было неисполнимо: прибивать нечего.

```
PAIR_SCOPE     = 'pwchange_pair'   # ключ = (accountId, ip)
PAIR_THRESHOLD = 5
IP_SCOPE       = 'pwchange_ip'     # ключ = (ip); 30, а не 5 — за NAT сидят живые люди
IP_THRESHOLD   = 30
WINDOW         = 3600 секунд
LOCK_NAMESPACE = 90_010            # у входа 90_009; важна только несовпадаемость
```

`hashKey`, `WINDOW` и форму ключа берём из `lib/login.ts` — вторым объявлением они
разойдутся, и это будет тихо (AC-010.24).

## Порядок

```
# ── МАРШРУТ: app/api/auth/password/route.ts ────────────────────────────────────
function POST(request):
    # Тело — СНАРУЖИ транзакции, предел общий с входом (NFR-010.5, NFR-010.8).
    raw = readBodyAtMost(request, MAX_JSON_BODY)  or  413
    body = parseJson(raw)  or  400

    # ЕДИНСТВЕННЫЙ источник accountId (NFR-010.7). Поле account_id в теле, если оно
    # там есть, не читается никем и ни на что не влияет — это и проверяет AC-010.18.
    accountId = await currentAccountId()
    if accountId is null:  return 401 UNAUTHORIZED

    ip = extractClientIP(request)

    current = string(body.current_password)
    next    = string(body.new_password)

    # Границы нового пароля — ДО argon2 и ДО БД: мусор не должен ни жечь CPU,
    # ни занимать соединение.
    if not validNewPassword(next):  return 400
    if next === current:            return 400      # FR-010.5

    # argon2 нового пароля — СНАРУЖИ транзакции (NFR-010.8, H-1). Соединение пула
    # ещё не взято, держать нечего.
    #
    # ЦЕНА, названная вслух: хеш считается и тогда, когда текущий пароль окажется
    # неверным, — то есть неудачная попытка стоит двух argon2 вместо одного. Это
    # осознанный размен: процессорное время дешевле соединения пула, а число попыток
    # ограничено парным счётчиком (5/час). Обратный порядок — «сначала проверить,
    # потом хешировать» — вернул бы argon2 внутрь транзакции.
    nextHash = await hashPassword(next)

    result = await withAccount(accountId, client ->
        changePassword(client, { accountId, ip, current, nextHash }))

    switch result:
        busy         -> 409  BUSY         # AC-010.19: конкурентная смена, не перебор
        too_many     -> 429  TOO_MANY     # тот же литерал, что у входа (M-1)
        invalid_new  -> 400
        unauthorized -> 401  UNAUTHORIZED # тот же ответ, что «нет сессии» (NFR-010.4)
        ok(token)    -> 200 + setCookie(SESSION_COOKIE, token, sessionCookieOptions())
                        # cookie ставится в ТОМ ЖЕ HTTP-ответе (NFR-010.6) — но за
                        # пределами транзакции: она уже закоммичена (tenant.ts:33).

# ── ЛОГИКА: lib/password-change.ts — про HTTP не знает ─────────────────────────
function changePassword(client, { accountId, ip, current, nextHash }):

    # ── ШАГ 0: пояс на случай, если лок всё же удержится (NFR-010.9) ───────────
    client.query("set local lock_timeout = '250ms'")

    # ── ШАГ 1: лимит попыток подбора текущего пароля (NFR-010.3) ───────────────
    # Ключ — ПАРА (аккаунт, IP), а не аккаунт. Ключ по одному аккаунту дал бы вору
    # с украденной cookie возможность запереть владельца пятью неверными попытками:
    # владелец не сменит пароль, а других путей отзыва в системе нет. То же решение
    # и по той же причине принято на входе (lib/login.ts:36-37).
    keyPair = hashKey(PAIR_SCOPE, accountId, ip)
    keyIp   = hashKey(IP_SCOPE, ip)

    # Лок TRY по паре: проверка и запись счётчика иначе не атомарны — под READ COMMITTED
    # сто параллельных запросов увидят count = 0 и пройдут все.
    # Двухаргументная форма: одноаргументная даёт 32 бита и столкнулась бы с локами
    # входа в той же БД (NFR-010.9).
    if not pg_try_advisory_xact_lock(LOCK_NAMESPACE, hashtext(keyPair)):
        return busy          # НЕ too_many: это конкуренция, а не перебор (H-3, AC-010.19)

    if rateLimit.exceeded(IP_SCOPE,   keyIp,   WINDOW, IP_THRESHOLD,   client): return too_many
    if rateLimit.exceeded(PAIR_SCOPE, keyPair, WINDOW, PAIR_THRESHOLD, client): return too_many

    # ── ШАГ 2: текущий пароль ─────────────────────────────────────────────────
    # ФИЛЬТР ПО ВЛАДЕЛЬЦУ ОБЯЗАТЕЛЕН, и у accounts он называется id, а не account_id
    # (003_core.sql:9). RLS к accounts НЕ применяется (007_rls.sql:31), хотя update
    # этой роли выдан: забыть фильтр — значит сменить пароль ЧУЖОМУ аккаунту (NFR-010.2).
    row = SELECT password_hash FROM accounts WHERE id = $accountId
    if row is null:  return unauthorized

    # Единственный argon2 внутри транзакции: ему нужен хеш из БД. Вынести наружу
    # означало бы читать хеш отдельной транзакцией и получить TOCTOU (NFR-010.8).
    if not verifyPassword(row.password_hash, current):
        rateLimit.record(PAIR_SCOPE, keyPair, client)   # AC-010.15 проверяет, что это здесь
        rateLimit.record(IP_SCOPE,   keyIp,   client)
        return unauthorized                             # тот же ответ, что «нет аккаунта»

    # ── ШАГ 3: пароль и сессии — ОДНОЙ транзакцией (NFR-010.1) ────────────────
    # Записываем ГОТОВЫЙ хеш: argon2 посчитан снаружи.
    UPDATE accounts SET password_hash = $nextHash WHERE id = $accountId

    # ВСЕ сессии, включая текущую. «Прочие» оставили бы вора внутри: кража cookie
    # не создаёт новой строки, вор сидит в ТОЙ ЖЕ сессии (AC-010.3).
    UPDATE sessions SET revoked_at = now()
     WHERE account_id = $accountId AND revoked_at IS NULL

    # И сразу новая — иначе владелец окажется без сессии (NFR-010.6).
    # Порядок «отзыв → выдача» несущий: наоборот новая сессия попала бы под
    # собственный отзыв (AC-010.4).
    token = createSession(client, accountId)
    return ok(token)
```

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `readBodyAtMost`, `MAX_JSON_BODY` | `lib/request-body.ts` | да — единственная реализация, AC-010.21 |
| `verifyPassword`, `hashPassword`, границы длины | `lib/password.ts` | да |
| `createSession` | `lib/session.ts` | да — единственная точка выдачи, страж уже есть |
| `currentAccountId` | `lib/current-session.ts` | да — **единственный** источник `accountId` |
| `extractClientIP` | `lib/client-ip.ts` | да |
| `hashKey`, `WINDOW` | `lib/login.ts` | да — переиспользовать, не копировать (AC-010.24) |
| `rateLimit.exceeded` / `.record` | `packages/db/src/rate-limit.ts` | да, свои `scope` |
| `withAccount` | `@proofwall/db` | да, но **RLS здесь не работает** — см. NFR-010.2 |

## Чего НЕ делаем

**Не считаем argon2 при отсутствии аккаунта.** На входе заглушечный хеш нужен против оракула
перечисления учёток; здесь аккаунт известен из проверенной сессии, перечислять некого.
Остающаяся разница по времени между «нет сессии» и «неверный пароль» вором и так наблюдаема
без всякого argon2 — любым запросом к дашборду той же cookie. Зафиксировано принимаемым
риском 5, а не закрыто мерой, которая ничего не закрывает.

**Не отзываем сессии до проверки пароля.** Иначе неверная попытка выбрасывала бы владельца —
и это была бы вторая кнопка «запереть владельца», рядом с той, что убрана в B-5.

**Не собираем HTTP-ответ внутри транзакции.** `withAccount` возвращает данные, ответ строит
маршрут (NFR-010.6, NFR-010.8).
