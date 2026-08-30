# FR-015 · Псевдокод

## Ближайший образец — свой, а не донорский

Сброс пароля здесь — это `password-change.ts`, где шаг «проверить текущий пароль» заменён на
«погасить токен из письма». Всё остальное совпадает: порядок операций, парный ключ лимита,
отзыв всех сессий, сравнение-и-замена вместо блокировки строки.

Донор (`genai-pulse-discovery`) даёт **два файла на ~40 строк** — адаптер провайдера и генератор
токена. Его роуты переписываются: Express + Redis + отсутствие отзыва сессий.

## Константы

```
RESET_TOKEN_BYTES     = 32
RESET_TTL_MS          = 60 * 60 * 1000        # час; дольше — окно для кражи письма
RESET_PAIR_SCOPE      = 'reset_pair'          # ключ = (нормализованный email, ip)
RESET_PAIR_THRESHOLD  = 5
RESET_IP_SCOPE        = 'reset_ip'
RESET_IP_THRESHOLD    = 30
RESET_WINDOW          = { seconds: 3600 }
```

Имена свои, значения свои: пороги входа связывать с порогами восстановления нельзя — правка
одного молча изменит другое, и ни один тест этого не заметит (класс, разобранный в FR-010, B-8).

## Шаг 1: «забыл пароль»

```
# POST /api/auth/forgot
function POST(request):
    raw = readBodyAtMost(request, MAX_JSON_BODY)  or  413
    body = parseJson(raw)  or  400

    # ТА ЖЕ нормализация, что у входа и регистрации. Своя копия однажды разойдётся, и человек
    # не получит письма на адрес, которым зарегистрировался.
    email = normalizeEmailFromInput(body.email)
    ip = extractClientIP(request)

    # Транзакция 1 — КОРОТКАЯ: лимит, поиск аккаунта, выпуск токена. Сети здесь нет.
    issued = withService(client -> issueResetToken(client, email, ip))

    if issued is TooMany:  return 429 TOO_MANY

    # ── ВНЕ ТРАНЗАКЦИИ ───────────────────────────────────────────────────────
    # Сетевой вызов. Время ответа провайдера нам не принадлежит; внутри транзакции оно
    # удерживало бы соединение ОБЩЕГО пула — правило security-operation-order.md называет
    # этот случай дословно. До FR-015 внешних вызовов в проекте не было НИ ОДНОГО.
    if issued is not null:
        try:
            sendResetEmail(email, urls.passwordReset(issued.token))
        catch err:
            # Отказ провайдера НЕ откатывает токен и НЕ меняет ответ человеку: токен уже
            # выпущен и остаётся годным, повтор запроса выпустит новый. Пробросить ошибку
            # наружу значило бы отличить существующий адрес от несуществующего кодом ответа.
            logError('reset_email_failed', { reason: err.message })   # БЕЗ токена и адреса

    # ОДИН ответ на оба случая. Иначе маршрут — оракул перечисления учёток.
    return 200 { message: 'если такой адрес зарегистрирован, письмо отправлено' }
```

```
function issueResetToken(client, email, ip) -> { token } | null | TooMany:
    keyPair = hashKey(RESET_PAIR_SCOPE, email, ip)
    keyIp   = hashKey(RESET_IP_SCOPE, ip)

    set local lock_timeout = '250ms'

    # АТОМАРНОСТЬ ПРОВЕРКИ И ЗАПИСИ. Без неё exceeded(COUNT) и record(INSERT) — две операции
    # без блокировки: под READ COMMITTED сто параллельных запросов видят count = 0, проходят
    # все и отправляют письма все. Защищаемый здесь ресурс — ЧУЖОЙ ПОЧТОВЫЙ ЯЩИК.
    # Первая редакция этого не имела; проект чинил тот же дефект во входе (login.ts:89-106),
    # и сюда перенесли форму парного ключа, но не механизм.
    if not try_advisory_xact_lock(RESET_LOCK_NAMESPACE, hashtext(keyPair)):  return TooMany

    if rateLimit.exceeded(RESET_IP_SCOPE,   keyIp,   RESET_WINDOW, RESET_IP_THRESHOLD):   return TooMany
    if rateLimit.exceeded(RESET_PAIR_SCOPE, keyPair, RESET_WINDOW, RESET_PAIR_THRESHOLD): return TooMany
    rateLimit.record(RESET_PAIR_SCOPE, keyPair, client)
    rateLimit.record(RESET_IP_SCOPE,   keyIp,   client)
    # Записывается КАЖДАЯ попытка, а не только промах: здесь считается стоимость отправки
    # письма, и удачная попытка стоит столько же, сколько неудачная. Это отличие от входа
    # (NFR-009.4) осознанное и названо в принимаемых рисках.

    row = SELECT id FROM accounts WHERE email = $email
    if row is null:  return null            # письма не будет, ответ тот же

    token = randomBytes(RESET_TOKEN_BYTES) -> base64url

    # Предыдущие гасятся ДО выпуска нового. НО ОДНОГО ЭТОГО МАЛО: под READ COMMITTED UPDATE
    # не видит ещё не закоммиченную вставку соседа и не может заблокировать строку, которой
    # пока нет. Проверено прогоном: два параллельных выпуска давали ДВА живых токена.
    UPDATE password_reset_tokens SET used_at = now()
     WHERE account_id = $row.id AND used_at IS NULL

    # Инвариант «одна живая ссылка» держит ОГРАНИЧЕНИЕ БД — частичный уникальный индекс по
    # (account_id) WHERE used_at IS NULL. Проигравший получает 23505 и тот же общий ответ:
    # письмо для этого аккаунта уже в пути. Та же форма, что `on conflict do nothing` у
    # партнёрских кодов и `unique(payment_event_id)` у начислений.
    try:
        INSERT INTO password_reset_tokens (account_id, token_hash, expires_at)
               VALUES ($row.id, sha256Hex(token), now() + RESET_TTL)
    catch unique_violation:
        return null

    return { token }
```

## Шаг 2: «задать новый пароль»

```
# POST /api/auth/reset
function POST(request):
    raw = readBodyAtMost(request, MAX_JSON_BODY)  or  413
    body = parseJson(raw)  or  400
    token = string(body.token)
    next  = string(body.new_password)

    # Границы — ДО транзакции и ДО argon2, ТОЙ ЖЕ функцией, что у регистрации и смены.
    if not validNewPassword(next):  return 400

    result = withService(client -> resetPassword(client, token, next))

    if result is null:  return 400 { error: 'ссылка недействительна или устарела' }

    # СЕССИЯ НЕ ВЫДАЁТСЯ. Ответ не несёт Set-Cookie вовсе — человек идёт на форму входа
    # и входит новым паролем. См. 01_specification, раздел о ссылке и сессии.
    return 200 { ok: true }
```

```
function resetPassword(client, token, next) -> ok | null:
    tokenHash = sha256Hex(token)            # хеш считается В КОДЕ, сырой токен в SQL не едет

    # Одним запросом: находим годный токен И гасим его. Проверка-перед-обновлением оставила бы
    # окно, в котором две параллельные попытки погасили бы один токен дважды.
    claimed = UPDATE password_reset_tokens SET used_at = now()
               WHERE token_hash = $tokenHash AND used_at IS NULL AND expires_at > now()
               RETURNING account_id
    if claimed is empty:  return null       # неизвестный, использованный или истёкший — один ответ

    accountId = claimed.account_id

    # argon2 считается ЗДЕСЬ, после того как токен признан годным: путь злоупотребления
    # (перебор ссылок) до него не доходит и хеша не оплачивает.
    nextHash = await hashPassword(next)

    # Сравнения-и-замены здесь не нужно: токен уже погашен атомарно выше, второй попытки
    # с тем же токеном не будет. Блокировку строки accounts НЕ берём — FOR UPDATE конфликтует
    # с FOR KEY SHARE, который берёт insert into sessions, и блокировал бы вход (FR-010, H-1).
    UPDATE accounts SET password_hash = $nextHash WHERE id = $accountId

    # ВСЕ сессии. У донора этого шага НЕТ (auth.ts:576-582 обновляет только хеш) — и это
    # означало бы, что вор, из-за которого владелец и восстанавливает доступ, остаётся внутри.
    UPDATE sessions SET revoked_at = now()
     WHERE account_id = $accountId AND revoked_at IS NULL

    return ok
```

## Отправка письма

```
function sendResetEmail(to, link):
    # Ключ без права на дефолт: его отсутствие в проде — отказ, а не отправка в никуда.
    key = requireEnv('RESEND_API_KEY')          # бросает в production
    from = requireEnv('MAIL_FROM')

    # Письмо БЕЗ пользовательского текста вовсе: только ссылка и срок. Экранировать нечего,
    # и это осознанно — любой пользовательский текст в письме открыл бы вопрос об инъекции
    # в HTML, которого сейчас просто нет.
    send(key, { from, to, subject: 'Восстановление доступа',
                text: 'Ссылка действует час: ' + link,
                html: template(link) })
```

## Что переиспользуется

| Существует | Где | Годится |
|---|---|---|
| `normalizeEmailFromInput` | `lib/validation.ts` | да — **обязательно**, копия разойдётся |
| `hashKey`, форма парного ключа | `lib/login.ts` | да, импортом |
| `validNewPassword`, `hashPassword` | `lib/password-change.ts`, `lib/password.ts` | да |
| `createSession` | `lib/session.ts` | **НЕ вызывается** — сессия не выдаётся |
| `readBodyAtMost`, `MAX_JSON_BODY` | `lib/request-body.ts` | да, единственной реализацией |
| `urls.ts` | `lib/urls.ts` | да — ссылка строится там, `BASE_URL` без дефолта |
| `rateLimit.*` | `@proofwall/db` | да, свои scope |
| адаптер Resend | донор, `resend-sender.ts:14-36` | да, ~36 строк, убрать импорт `IEmailSender` |

## Чего НЕ делаем

**Не выдаём сессию по ссылке.** Причина в спецификации, и она не про удобство.

**Не откатываем токен при отказе провайдера.** Иначе отказ почты превращался бы в «ссылка не
работает» без объяснения, а повтор упирался бы в лимит.

**Не кладём пользовательский текст в письмо.** Нечего экранировать — нет и вопроса.

**Не логируем ни токен, ни адрес.** Журнал переживает всё остальное.
