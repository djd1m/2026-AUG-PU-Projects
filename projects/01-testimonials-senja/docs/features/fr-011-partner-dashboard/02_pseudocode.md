# FR-011 · Псевдокод

> **Ревизия 2.** Три правки по блокерам: выдача токена показана как **diff** к существующей
> функции, а не как новая (B-3 — прежний вид ломал 10 вызовов и терял self-referral);
> лок берётся по **паре**, а не по IP (B-2); дальше по стеку едет `partner_code_id`, а не
> публичный `code` (H-1).

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

## Выдача токена — DIFF к существующей `issuePartnerCode`

Функция уже существует (`partner.ts:31-62`) и несёт пять свойств, каждое из которых сломала бы
переписанная версия: сигнатуру `(client, partnerName, options)` — её используют 10 вызовов;
возврат `{ id, code }` — восемь вызовов деструктурируют `id`; цикл подбора кода с
`on conflict (code) do nothing` на 10 попыток; запись `partner_code_issued` в `audit_log`;
поля `commission_rate` и `owner_account_id`, без которых перестаёт ловиться self-referral
(`referral.ts:117`).

Поэтому — **только добавление**, тремя строками:

```diff
 export async function issuePartnerCode(client, partnerName, options) {
+  // Токен выдаётся здесь же: отдельная функция потребовала бы второй транзакции
+  // и оставила бы окно, где код есть, а кабинета к нему нет.
+  const token = randomBytes(PARTNER_TOKEN_BYTES).toString('base64url');
   let attempt = 0;
   while (true) {                       // ← НАСТОЯЩИЙ код: while, а не for.
     const code = generateCode(partnerName);
     const inserted = await client.query(
-      `insert into partner_codes (code, partner_name, commission_rate, owner_account_id)
-       values ($1, $2, $3, $4) on conflict (code) do nothing returning id`,
+      `insert into partner_codes (code, partner_name, commission_rate, owner_account_id,
+                                  dashboard_token_hash)
+       values ($1, $2, $3, $4, $5) on conflict (code) do nothing returning id`,
       ...
     );
     ...
-    return { id, code };
+    return { id, code, dashboard_token: token };
     attempt += 1;
     if (attempt > 10) throw new Error('не удалось подобрать уникальный код партнёра за 10 попыток');
   }
 }
```

**Контекстные строки выше — настоящий код, а не пересказ.** В ревизии 2 они были записаны как
`for (let attempt = 0; attempt < 10; …)`, чего в `partner.ts` нет. Реализованный буквально, тот
diff превращал явный отказ в **тихий**: после десяти коллизий цикл `for` просто заканчивался,
функция доходила до конца и возвращала `undefined`, а вызывающий получал `undefined.id`. Это
`fail-closed-defaults.md` наизнанку — исчерпание попыток переставало быть отказом.

**И ставка по умолчанию (H-6, AC-011.25).** `issuePartnerCode` передаёт `commissionRate ?? null`,
а явный `NULL` **отменяет** `default 0.3000` колонки (проверено прогоном: `insert … values (…,
null, …)` даёт пусто, `insert` без колонки даёт `0.3000`). Дальше `convertAttributionOnPayment`
при `commission_rate = null` не создаёт строку `commissions` вовсе — и кабинет показал бы
**ноль каждому партнёру навсегда**. Это дефект не FR-011, но FR-011 — ровно та фича, которая
предъявляет его партнёру, поэтому починка входит в объём: колонка опускается из INSERT, когда
ставка не задана явно.

Возвращаемое значение **дополняется**, а не заменяется: `{ id, code }` остаются на месте, и
восемь тестов, деструктурирующих `id`, продолжают работать. Это и стережёт AC-011.19.

### Ротация утраченного токена — в ТОЙ ЖЕ строке

```
function rotateDashboardToken(client, code):
    token = randomBytes(PARTNER_TOKEN_BYTES) -> base64url
    UPDATE partner_codes SET dashboard_token_hash = sha256($token) WHERE code = $code
    return token
```

**Не перевыпуск кода.** Перевыпуск создаёт новую строку, а все начисления привязаны к
`partner_code_id` старой — партнёр увидел бы нули вместо своей истории, а его прежние
реферальные ссылки перестали бы быть его ссылками (AC-011.22).

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
# ДВЕ транзакции, и это несущее решение (B-1).
#
# Транзакция 1 — только счётчик. Лок ЖДУЩИЙ и по адресу: он восстанавливает атомарность
# «проверил → записал», которую ревизия 2 потеряла, разведя ключ лока и ключ счётчика
# (измерено: 40 одновременных попыток при пороге 30 проходили все сорок).
# Ждущий лок здесь допустим, хотя FR-009 его запретил: там ожидание длилось argon2 (~50 мс)
# и держало соединение пула, здесь оно длится один COUNT плюс один INSERT — микросекунды.
# Добросовестный партнёр за тем же NAT получает очередь, а не отказ.
#
# Четыре вопроса shared-resource-verification.md, отвеченные прямо здесь:
#   что удерживается — соединение пула и лок по адресу, на время двух дешёвых запросов;
#   сколько единиц всего — пул 30, порог счётчика 30 на адрес в час;
#   кто ещё в очереди — весь продукт делит тот же пул, поэтому секция и сделана короткой;
#   кого наказывает насыщение — только тех, кто с ЭТОГО адреса, и очередью, а не отказом.

function checkAndRecordAttempt(ip) -> allowed:          # транзакция 1, короткая
    withService(client -> {
        keyIp = hashKey(PARTNER_IP_SCOPE, ip)
        advisory_xact_lock(PARTNER_LOCK_NAMESPACE, hashtext(keyIp))    # ЖДУЩИЙ
        if rateLimit.exceeded(PARTNER_IP_SCOPE, keyIp, PARTNER_WINDOW, PARTNER_IP_THRESHOLD, client):
            return false
        rateLimit.record(PARTNER_IP_SCOPE, keyIp, client)
        return true
    })
    # Запись ВСЕГДА, а не только при неудаче: здесь считаются ПОПЫТКИ предъявления,
    # а не промахи. Иначе верный токен, предъявляемый в цикле, не считался бы ничем.

function resolvePartnerByToken(client, token):          # транзакция 2
    # Хеш считается В КОДЕ. Сырой токен в SQL не уезжает вовсе: он попал бы в
    # pg_stat_statements, в log_statement при отладке и в текст ошибки при сбое —
    # то есть ровно в журнал, названный третьей из трёх утечек (NFR-011.5, AC-011.21).
    tokenHash = sha256(token)

    # status = 'active' ЗДЕСЬ, а не отдельной проверкой с другим ответом: «код отозван»
    # отдельным текстом было бы оракулом (NFR-011.3). И проверяется он на КАЖДОМ показе,
    # иначе отзыв не имел бы силы до истечения cookie (AC-011.6), а ротация не отбирала бы
    # доступ у прежнего держателя токена (AC-011.24).
    row = SELECT id FROM partner_codes
           WHERE dashboard_token_hash = $tokenHash AND status = 'active'
    return row ? { partnerCodeId: row.id } : null
    # ВОЗВРАЩАЕТСЯ id, а не code: публичное значение дальше по стеку не едет (H-1 прохода 1).

function authenticatePartner(token, ip):
    if not checkAndRecordAttempt(ip):  return TooMany
    return withService(c -> resolvePartnerByToken(c, token))
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

    # По ID, а не по коду: getPartnerCohortDashboard в нынешнем виде принимает code
    # (partner.ts:132), то есть ПУБЛИЧНОЕ значение — и утверждение «ошибка невозможна по
    # сигнатуре» на ней ломалось. Функция получает вариант по id; прежняя остаётся для
    # совместимости, но на этом пути не используется.
    data = withService(c -> getPartnerCohortDashboardById(c, partner.partnerCodeId))
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

**Не логируем токен нигде.** Ни `console.*`, ни `audit_log` на пути аутентификации не
принимают переменную токена. Журнал назван третьей из трёх утечек и переживает остальные две
(AC-011.21).

**Не заводим партнёру пароль и учётную запись.** Это отдельная фича с регистрацией,
восстановлением и почтой — ничего из этого в MVP нет. Предъявительский токен назван
предъявительским и его цена записана в принимаемые риски.
