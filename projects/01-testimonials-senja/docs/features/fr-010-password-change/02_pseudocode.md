# FR-010 · Псевдокод

> **Ревизия 3.** Против ревизии 2 три правки, все по блокерам: argon2 нового пароля
> переехал ВНУТРЬ транзакции, после проверки текущего (B-7 — снаружи он оказывался
> до лимитера и давал бесплатное жжение CPU); константы получили свои имена `PWCHANGE_*`
> (B-8 — прежние совпадали с экспортами `login.ts`); счётчик считается по каждому scope
> отдельно (B-9).
>
> **Ревизия 2** изменяла против ревизии 1: ключ лимита стал парой (B-5), `accountId`
> получает статус параметра, а не поля тела (B-1), argon2 нового пароля вынесен из
> транзакции (H-1), лок обрёл пространство имён и таймаут (H-2, H-4), неудача захвата
> лока отделена от исчерпания лимита (H-3), пороги названы числами (M-2).

## Константы — числами, а не именами

Ревизия 1 писала `THRESHOLD` и `HOUR`, из-за чего требование «прибить пороги в тесте
независимо от кода» было неисполнимо: прибивать нечего.

```
PWCHANGE_PAIR_SCOPE     = 'pwchange_pair'   # ключ = (accountId, ip)
PWCHANGE_PAIR_THRESHOLD = 5
PWCHANGE_IP_SCOPE       = 'pwchange_ip'     # ключ = (ip); 30, а не 5 — за NAT живые люди
PWCHANGE_IP_THRESHOLD   = 30
PWCHANGE_WINDOW         = { seconds: 3600 }
PWCHANGE_LOCK_NAMESPACE = 90_010            # у входа 90_009; важна несовпадаемость
```

**Имена свои, значения свои — намеренно (B-8).** `lib/login.ts` уже экспортирует
`PAIR_SCOPE`, `PAIR_THRESHOLD`, `IP_SCOPE`, `IP_THRESHOLD`, `WINDOW`, `LOCK_NAMESPACE` —
ровно эти шесть. Переиспользовать их значило бы связать две фичи: правка порога входа
молча изменила бы лимит смены пароля, и никакой тест этого не заметил бы.

Из `login.ts` импортируется **только `hashKey`** — она про форму ключа, а не про политику,
и второе её объявление разошлось бы с первым тихо (AC-010.24).

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

    # argon2 нового пароля здесь НЕ считается (B-7, NFR-010.8). Ревизия 2 ставила его
    # тут — и тем самым ДО лимитера, который живёт внутри changePassword. Запрос,
    # обречённый на 429, всё равно оплачивал полный хеш: 38 мс CPU и 19 МиБ на попытку,
    # без потолка, из одной валидной cookie. Тот же CPU считает argon2 входа, то есть
    # вход деградировал бы вместе. Хеш нужен ТОЛЬКО на пути успеха — там он и считается.
    result = await withAccount(accountId, client ->
        changePassword(client, { accountId, ip, current, next }))

    switch result:
        busy         -> 409  BUSY         # AC-010.19: конкурентная смена, не перебор
        too_many     -> 429  TOO_MANY     # тот же литерал, что у входа (M-1)
        invalid_new  -> 400
        unauthorized -> 401  UNAUTHORIZED # тот же ответ, что «нет сессии» (NFR-010.4)
        ok(token)    -> 200 + setCookie(SESSION_COOKIE, token, sessionCookieOptions())
                        # cookie ставится в ТОМ ЖЕ HTTP-ответе (NFR-010.6) — но за
                        # пределами транзакции: она уже закоммичена (tenant.ts:33).

# ── ЛОГИКА: lib/password-change.ts — про HTTP не знает ─────────────────────────
function changePassword(client, { accountId, ip, current, next }):

    # ── ШАГ 0: пояс на случай, если лок всё же удержится (NFR-010.9) ───────────
    client.query("set local lock_timeout = '250ms'")

    # ── ШАГ 1: лимит попыток подбора текущего пароля (NFR-010.3) ───────────────
    # Ключ — ПАРА (аккаунт, IP), а не аккаунт. Ключ по одному аккаунту дал бы вору
    # с украденной cookie возможность запереть владельца пятью неверными попытками:
    # владелец не сменит пароль, а других путей отзыва в системе нет. То же решение
    # и по той же причине принято на входе (lib/login.ts:36-37).
    keyPair = hashKey(PWCHANGE_PAIR_SCOPE, accountId, ip)
    keyIp   = hashKey(PWCHANGE_IP_SCOPE, ip)

    # Лок TRY по паре: проверка и запись счётчика иначе не атомарны — под READ COMMITTED
    # сто параллельных запросов увидят count = 0 и пройдут все.
    # Двухаргументная форма: одноаргументная даёт 32 бита и столкнулась бы с локами
    # входа в той же БД (NFR-010.9).
    if not pg_try_advisory_xact_lock(PWCHANGE_LOCK_NAMESPACE, hashtext(keyPair)):
        return busy          # НЕ too_many: это конкуренция, а не перебор (H-3, AC-010.19)

    # До этой черты argon2 не считается НИ РАЗУ (AC-010.25).
    if rateLimit.exceeded(PWCHANGE_IP_SCOPE,   keyIp,   PWCHANGE_WINDOW, PWCHANGE_IP_THRESHOLD,   client): return too_many
    if rateLimit.exceeded(PWCHANGE_PAIR_SCOPE, keyPair, PWCHANGE_WINDOW, PWCHANGE_PAIR_THRESHOLD, client): return too_many

    # ── ШАГ 2: текущий пароль ─────────────────────────────────────────────────
    # ФИЛЬТР ПО ВЛАДЕЛЬЦУ ОБЯЗАТЕЛЕН, и у accounts он называется id, а не account_id
    # (003_core.sql:9). RLS к accounts НЕ применяется (007_rls.sql:31), хотя update
    # этой роли выдан: забыть фильтр — значит сменить пароль ЧУЖОМУ аккаунту (NFR-010.2).
    row = SELECT password_hash FROM accounts WHERE id = $accountId
    if row is null:  return unauthorized

    # Единственный argon2 внутри транзакции: ему нужен хеш из БД. Вынести наружу
    # означало бы читать хеш отдельной транзакцией и получить TOCTOU (NFR-010.8).
    if not verifyPassword(row.password_hash, current):
        # ДВЕ строки на одну попытку — по одной на ключ. AC-010.15 считает их
        # ПО SCOPE, а не суммарно: суммарный счёт «ровно +1» был бы красным здесь
        # и зелёным на мутации «убрать запись только по IP» (B-9).
        rateLimit.record(PWCHANGE_PAIR_SCOPE, keyPair, client)
        rateLimit.record(PWCHANGE_IP_SCOPE,   keyIp,   client)
        return unauthorized                             # тот же ответ, что «нет аккаунта»

    # ── ШАГ 3: пароль и сессии — ОДНОЙ транзакцией (NFR-010.1) ────────────────
    # ЗДЕСЬ и только здесь считается argon2 нового пароля. Мы уже знаем, что текущий
    # пароль верен, лимит не исчерпан и лок наш, — то есть путь злоупотребления сюда
    # не доходит и хеша не оплачивает (B-7).
    #
    # Цена: на пути УСПЕХА транзакция удерживает соединение ещё ~38 мс. Это принято:
    # смена пароля — операция редкая, аутентифицированная и самоограничивающаяся
    # (после успеха сессия сменилась). Вынести хеш наружу нельзя, не разорвав
    # атомарность с проверкой: между verify и UPDATE появился бы TOCTOU.
    nextHash = await hashPassword(next)

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

**Не считаем argon2 нового пароля до проверки текущего.** Он нужен ровно один раз и
ровно на пути успеха. Любое более раннее место — до лимитера, до лока или до `verify` —
даёт неаутентифицированной по сути попытке право сжечь 38 мс CPU и 19 МиБ, а число таких
попыток ограничивает уже не лимитер, а только пропускная способность машины.

**Не собираем HTTP-ответ внутри транзакции.** `withAccount` возвращает данные, ответ строит
маршрут (NFR-010.6, NFR-010.8).
