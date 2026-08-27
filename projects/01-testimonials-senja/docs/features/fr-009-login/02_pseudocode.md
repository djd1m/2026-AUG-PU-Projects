# FR-009 · Псевдокод

> Ревизия 2. **[v2]** — правки после 🔴 валидации.

## Порядок шагов — несущий

**[v2] Точная формулировка** (прежняя была неверна). Проверка лимита стоит первой не
потому, что «иначе перебор невалидными телами бесплатен» — при любом порядке мусорное
тело до записи в счётчик не доходит. Настоящий эффект другой и тоже нужный:
**уже сработавший лимит нельзя обойти мусорным телом** — исчерпав попытки, атакующий не
может продолжать нагружать argon2, подсовывая тела, которые падают раньше проверки.

```
function login(request):
    ip = extractClientIP(request)

    result = withService(client -> {

        # ── ШАГ 1: оба лимита ДО всего остального ──────────────────────────
        # Ключ по IP известен сразу. Ключ по email — только после разбора тела,
        # поэтому проверка разбита на две: грубая по IP здесь, точная по email ниже.
        if rateLimit.exceeded("login_ip", hashKey(ip), HOUR, 30, client):
            return TooMany

        body = parseJson(request)  or  return BadRequest      # 400 — ошибка формата
        email    = normalizeEmail(body.email)                 # trim + toLowerCase
        password = (typeof body.password === "string") ? body.password : ""

        if rateLimit.exceeded("login_email", hashKey(email), HOUR, 5, client):
            return TooMany

        # ── ШАГ 2: поиск аккаунта ──────────────────────────────────────────
        account = selectAccountByEmail(client, email)

        # ── ШАГ 3: argon2 считается ВСЕГДА ─────────────────────────────────
        # Это и есть NFR-009.2. Ранний возврат при account = null сделал бы ответ
        # заметно быстрее и превратил бы вход в оракул существования учётки.
        storedHash = account ? account.password_hash : dummyHash()
        ok = verifyPassword(storedHash, password)             # константное по времени

        if account is null or not ok:
            # [v2] NFR-009.4: ЗАПИСЬ в оба счётчика — отдельная операция, без неё
            # лимит никогда не срабатывает, а критерий «429 при превышении» зеленеет.
            rateLimit.record("login_ip",    hashKey(ip),    client)
            rateLimit.record("login_email", hashKey(email), client)
            return Unauthorized                               # ОДИН И ТОТ ЖЕ ответ

        # ── ШАГ 4: сессия — ЕДИНСТВЕННОЙ общей функцией ────────────────────
        token    = createSession(client, account.id)          # [v2] см. ниже
        projects = listProjectsForAccount(client, account.id) # [v2] FR-009.4
        return Ok(account.id, token, projects)
    })

    # Ответ строится СНАРУЖИ транзакции — тело и код для всех отказных веток одинаковы.
    ...
```

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
