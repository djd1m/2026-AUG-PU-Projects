# FR-009 · Псевдокод

> Ревизия 2. **[v2]** — правки после 🔴 валидации.

## Порядок шагов — несущий

**[v2] Точная формулировка** (прежняя была неверна). Проверка лимита стоит первой не
потому, что «иначе перебор невалидными телами бесплатен» — при любом порядке мусорное
тело до записи в счётчик не доходит. Настоящий эффект другой и тоже нужный:
**уже сработавший лимит нельзя обойти мусорным телом** — исчерпав попытки, атакующий не
может продолжать нагружать argon2, подсовывая тела, которые падают раньше проверки.

**[v3] «Первым» — среди шагов алгоритма, а не относительно чтения сокета.** В ревизии 2
требование «лимит до разбора тела» затащило `parseJson` внутрь транзакции и создало отказ
в обслуживании всему приложению. Разбор тела к алгоритму аутентификации не относится: он
происходит вне транзакции, а лимит остаётся первым шагом внутри неё.

```
function login(request):
    # ── ВНЕ ТРАНЗАКЦИИ: чтение сокета и разбор тела ────────────────────────
    # [v3] Соединение пула НЕ удерживается, пока клиент дописывает тело.
    # Десять медленных POST иначе вычерпывают пул из 10 и кладут всё приложение.
    if contentLength(request) > MAX_LOGIN_BODY:  return PayloadTooLarge   # 413
    body = parseJson(request)  or  return BadRequest                      # 400

    ip       = extractClientIP(request)
    # [v3] Нестроковые значения не роняют маршрут и не доходят до normalizeEmail.
    email    = (typeof body.email    === "string") ? normalizeEmail(body.email) : ""
    password = (typeof body.password === "string") ? body.password            : ""

    keyIp   = hashKey("login_ip",    ip)
    keyPair = hashKey("login_pair",  email + "|" + ip)   # [v3] ПАРА, не email

    result = withService(client -> {

        # ── ШАГ 1: сериализация по ключам — иначе лимита нет ───────────────
        # [v3] exceeded(COUNT) и record(INSERT) не атомарны: под READ COMMITTED
        # параллельные запросы все видят count = 0 и все проходят. Блокировка
        # держится до конца транзакции и снимается сама.
        client.query("select pg_advisory_xact_lock(hashtext($1))", [keyPair])
        client.query("select pg_advisory_xact_lock(hashtext($1))", [keyIp])

        # ── ШАГ 2: оба лимита ─────────────────────────────────────────────
        if rateLimit.exceeded("login_ip",   keyIp,   HOUR, 30, client):  return TooMany
        if rateLimit.exceeded("login_pair", keyPair, HOUR,  5, client):  return TooMany

        # ── ШАГ 3: поиск аккаунта ─────────────────────────────────────────
        account = selectAccountByEmail(client, email)

        # ── ШАГ 4: argon2 считается ВСЕГДА ────────────────────────────────
        # NFR-009.2. Ранний возврат при account = null сделал бы ответ заметно
        # быстрее и превратил бы вход в оракул существования учётки.
        storedHash = account ? account.password_hash : dummyHash()
        ok = verifyPassword(storedHash, password)          # константное по времени

        if account is null or not ok:
            # NFR-009.4: запись — отдельная операция. Без неё лимит не срабатывает
            # никогда, а критерий «429 при превышении» зеленеет на засеянной таблице.
            rateLimit.record("login_ip",   keyIp,   client)
            rateLimit.record("login_pair", keyPair, client)
            return Unauthorized                            # ОДИН И ТОТ ЖЕ ответ

        # [v3] При УСПЕХЕ не пишем ничего: иначе активный владелец запирает себя сам.

        # ── ШАГ 5: сессия — ЕДИНСТВЕННОЙ общей функцией ───────────────────
        token    = createSession(client, account.id)
        projects = listProjectsForAccount(client, account.id)
        return Ok(account.id, token, projects)
    })

    # Ответ строится СНАРУЖИ транзакции; тело и код для всех отказных веток одинаковы.
    ...
```

## [v3] Почему блокировка, а не «просто посчитать»

Порядок «сначала проверить, потом записать» верен логически и бесполезен под нагрузкой:
между `COUNT` и `INSERT` лежит выборка аккаунта и argon2, то есть окно гонки около 20 мс.
`pg_advisory_xact_lock` сериализует запросы **по ключу**: разные учётки друг друга не
задерживают, а параллельный перебор одной превращается в последовательный — что и требуется.

Побочный эффект осознан: argon2 считается под блокировкой, то есть попытки по одному ключу
идут строго друг за другом. Для контроля перебора это не издержка, а ровно нужное поведение.

## [v2] `createSession` — общая точка выдачи

Сегодня единственный `insert into sessions` вкомпилирован в тело регистрационной
транзакции (`lib/register.ts:119`). Вход не имеет права его скопировать: два независимых
`INSERT` с одинаковыми константами — это два класса сессий, которые разъедутся молча.

```
# lib/session.ts — рядом с примитивами, которые уже там
function createSession(client, accountId) -> token:
    token = generateSessionToken()
    client.query("insert into sessions (account_id, token_hash, expires_at) values ($1,$2,$3)",
                 [accountId, hashSessionToken(token), now() + SESSION_TTL_MS])
    return token
```

`register.ts` переводится на неё в этой же фиче. Инвариант закрепляется стражем по
исходнику: `insert into sessions` встречается **ровно в одном файле**.

## [v2] `dummyHash()` — вычисляется, а не замораживается

Замороженная константа-хеш требует, чтобы её параметры совпадали с боевыми. Боевые —
это дефолты установленной версии `@node-rs/argon2` (сейчас `m=19456,t=2,p=1`). При
обновлении библиотеки константа отстанет **молча**, `verify` по ней отработает быстрее,
и таймингов оракул вернётся.

Поэтому хеш считается один раз при загрузке модуля тем же `hashPassword`:

```
const DUMMY = hashPassword(randomBytes(32).toString("hex"))   # ленивый промис, один раз
```

Параметры совпадают **по построению**, а не по дисциплине сопровождения. Стоимость —
один argon2 при старте процесса, не на запрос.

## Что переиспользуется — сверено с кодом

| Существует | Путь | Годится как есть? |
|---|---|---|
| `verifyPassword` | `lib/password.ts:22` | да |
| `generateSessionToken`, `hashSessionToken`, `SESSION_TTL_MS`, `sessionCookieOptions` | `lib/session.ts` | да, это примитивы |
| **выдача сессии целиком** | — | **[v2] НЕТ: не существует**, вкомпилирована в `register.ts:119`. Выносится этой фичей |
| `extractClientIP` | `lib/client-ip.ts` | да |
| `rateLimit.exceeded` / `.record` | стор общий, колонка `scope` | да — вход берёт свои scope, стор тот же |
| `rateLimitKey(ip, projectId)` | `lib/testimonial.ts:49` | **[v2] НЕТ: привязан к проекту.** У входа проекта нет — нужен свой ключ от одного значения |
| `buildProjectUrls(slug)` | `lib/urls.ts:80` | да, но принимает ОДИН слаг |
| **список проектов аккаунта** | — | **[v2] НЕТ: не существует.** `lib/project.ts` содержит только `findProjectBySlug`. Добавляется `listProjectsForAccount` |
