# Сценарий функциональной проверки стенда — «Тарелка» (проект 04)

Развёрнутая, исполняемая инструкция: по шагу на каждую функцию продукта, с адресом (URI),
готовой командой, ожидаемым ответом и ссылкой на код, который этот ответ выдаёт.

**Составлено:** 16.09.2026 · **Дополнено:** 17.09.2026 (коммит `624bb6d`) ·
**Проверено на живом стенде:** да, разделы 1–4, 9–9.5, 12, 14 прогнаны фактически; шаги,
помеченные 🟡 и 🔴, не прогонялись — причина названа в каждом.

**Что изменилось 17.09.2026.** Домен `tarelka.aicoding.space` заработал — расхождение §15
закрыто, и публичным адресом стал он. Добавлены разделы под то, чего 16.09 в продукте не было:
вход по почте (§3.1), ссылка блогера и поле промокода (§9.1), заведение партнёра владельцем
(§9.2), уведомления (§9.3), выгрузка движений (§9.4), реквизиты выплаты (§9.5).

> **Зачем отдельный документ.** Зелёные юнит-тесты — утверждение о модуле, а не о системе.
> Дефект развёрнутого стенда живёт в стыке: переменная не доехала до контейнера, дверь не
> пропускает маршрут, ссылка выдана на несуществующий домен. Всё это проверяется только
> обращением по тому адресу, который система ВЫДАЛА (`.claude/rules/deployment-seams.md`).

---

## 0. Адреса стенда

| Назначение | URI | Состояние на 17.09.2026 |
|---|---|---|
| **Публичный вход (основной)** | <https://tarelka.aicoding.space> | ✅ работает, сертификат выпущен, совпадает с `APP_ORIGIN` |
| Прежний публичный вход | <https://n4.212.192.0.33.sslip.io> | ✅ продолжает работать |
| Локальный вход (только с самой машины VPS) | <http://127.0.0.1:4180> | ✅ работает, дверь проекта |

Именно совпадение первой строки со значением `APP_ORIGIN` и есть предмет проверки: `APP_ORIGIN`
определяет КАЖДУЮ выдаваемую наружу ссылку, и 16.09 он указывал на несуществующее имя (§15).
Запасной адрес — `sslip.io`: он разрешается в `212.192.0.33` без A-записи. Наружу смотрит
**только дверь проекта** (Caddy, `Caddyfile`); `web`, `api`, `db`, `storage` остаются во
внутренней сети `private` и с интернета недостижимы.

Проверка адреса одной командой:

```bash
curl -s https://tarelka.aicoding.space/health
# ожидается: {"data":{"status":"ok","db":"ok"}}
```

---

## 1. Подготовка

Всё, что ниже, работает из любой оболочки с `curl`. `jq` на машине нет — для чтения ответов
используется `python3 -m json.tool`.

```bash
# Выберите ОДИН базовый адрес:
BASE=https://tarelka.aicoding.space        # публичный — так его увидит посетитель
# BASE=https://n4.212.192.0.33.sslip.io    # запасной, тот же стенд
# BASE=http://127.0.0.1:4180               # локальный — только с самой машины VPS

JAR=$(mktemp)                              # банка cookie: сессия устройства живёт здесь
UUID() { python3 -c "import uuid;print(uuid.uuid4())"; }
# читаемый JSON, БЕЗ превращения кириллицы в \uXXXX (json.tool так не умеет)
J() { python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin),ensure_ascii=False,indent=2))" 2>/dev/null || cat; }
```

> **Про `Secure`-cookie.** Сессионная cookie `n4_session` помечена `Secure`. По HTTPS и по
> `127.0.0.1` curl её отдаёт (loopback считается защищённым контекстом); по обычному HTTP на
> чужом хосте — нет. Если сессия «теряется» — вы на HTTP не-loopback.

> **Про пределы частоты.** На двери — 30 мутаций и 120 чтений в минуту **на адрес**
> (`Caddyfile`), плюс отдельный приложенческий ограничитель в `api`. Прогон всего сценария
> подряд в эти числа укладывается; прогон в цикле — нет. Заголовки `Ratelimit-Limit` и
> `Ratelimit-Remaining` показывают остаток.

---

## 2. Здоровье и дверь

### 2.1 Проба здоровья

| | |
|---|---|
| URI | <https://tarelka.aicoding.space/health> |
| Код | `apps/api/src/routes/health.ts` |

```bash
curl -s -i "$BASE/health"
```

**Ожидается:** `200` и `{"data":{"status":"ok","db":"ok"}}`.
**Отказ:** `503` + `{"error":{"code":"database_unavailable",...}}` — база не отвечает на
`SELECT 1`. Недоступность базы здесь именно ОТКАЗ, а не «наверное, всё хорошо».

### 2.2 Заголовки безопасности и CSP с nonce

```bash
curl -s -D- -o /dev/null "$BASE/" | grep -iE "content-security-policy|x-frame|x-content|referrer"
```

**Ожидается:** `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`,
`referrer-policy: strict-origin-when-cross-origin`, и **ровно одна** строка
`content-security-policy` с `nonce-<uuid>` внутри `script-src`. Политику ставит РОВНО ОДНО
место — `apps/web/middleware.ts`; вторая такая же строка от двери сломала бы страницу молча.
Два прогона подряд обязаны дать **разные** nonce.

### 2.3 Маршрутизация двери

```bash
curl -s -o /dev/null -w "web=%{http_code}\n"    "$BASE/"
curl -s -o /dev/null -w "api=%{http_code}\n"    "$BASE/api/v1/diary"      # 401 — это верный ответ
curl -s -o /dev/null -w "health=%{http_code}\n" "$BASE/health"
```

**Ожидается:** `web=200`, `api=401`, `health=200`. `401` на `/api/v1/diary` подтверждает, что
дверь довела запрос до `api`, а `api` потребовал сессию — оба звена живы.

### 2.4 Ограничение частоты на двери 🟡

```bash
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code} " -X POST "$BASE/api/v1/auth/device"; done; echo
```

**Ожидается:** первые ~30 ответов `201/200`, дальше `429`. **Осторожно:** это выбирает
минутный лимит мутаций для вашего адреса на минуту вперёд — остальные шаги придётся подождать.
Помечено 🟡: намеренно не прогонялось при составлении, чтобы не закрыть дверь себе же.

---

## 3. Сессия устройства (анонимный вход)

Ни регистрации, ни анкеты: съёмка доступна сразу, согласие спрашивается позже — перед первой
записью в дневник.

| | |
|---|---|
| URI | `POST $BASE/api/v1/auth/device` |
| Код | `apps/api/src/routes/auth-device.ts` |

```bash
curl -s -i -c "$JAR" -X POST "$BASE/api/v1/auth/device" | head -20
```

**Ожидается:**
- `201` + `{"data":{"status":"created"}}` при первом вызове;
- заголовок `Set-Cookie: n4_session=…; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
  (604800 с = 7 суток — срок жизни анонимного дневника);
- повторный вызов **с той же банкой** → `200` + `{"data":{"status":"existing"}}`.

```bash
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/v1/auth/device" | J
```

В теле ответа **нет** ни токена, ни идентификатора сессии — это намеренно: лишнее в теле
попадает в чужой журнал.

---

## 3.1 Вход по почте и паролю (OWN-012 — PWA первый приоритет)

| | |
|---|---|
| Регистрация | `POST $BASE/api/v1/auth/register` |
| Вход | `POST $BASE/api/v1/auth/login` |
| Выход | `POST $BASE/api/v1/auth/logout` |
| Кто я | `GET $BASE/api/v1/auth/me` |
| Код | `apps/api/src/routes/auth-email.ts`, `apps/api/src/auth/password.ts` |
| Экран | `$BASE/settings` — блок «Вход по почте» |

```bash
EMAIL="proba-$(date +%s)@example.com"

curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"ДлинныйПарольНеМенее12\"}" | J   # 201

curl -s -b "$JAR" "$BASE/api/v1/auth/me" | J                                        # 200 + email

# НЕВЕРНЫЙ пароль и НЕСУЩЕСТВУЮЩАЯ почта обязаны быть НЕОТЛИЧИМЫ
curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"неверный\"}" | J                  # 401 invalid_credentials
curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"нет-такого@example.com","password":"неверный"}' | J                 # ТОТ ЖЕ 401
```

**Что здесь проверяется, кроме «работает ли вход».**

1. **Два отказа обязаны совпасть посимвольно.** Разные ответы на «пароль не тот» и «такой почты
   нет» превращают форму входа в средство узнать, кто зарегистрирован. По той же причине на
   несуществующей почте всё равно считается хэш-пустышка (`dummyHash()`): без него разное ВРЕМЯ
   ответа выдало бы то же самое, что выдал бы разный текст.
2. **Вход переносит анонимную работу на аккаунт.** До входа посетитель уже снимал еду и копил
   дневник на cookie. При входе переносятся пять вещей: привязка сессии, дневник, карточки,
   распознавания и согласие (`apps/api/src/auth/link-session-to-account.ts`). Проверка: снять
   еду ДО регистрации, затем зарегистрироваться — записи обязаны остаться на месте.
3. Пароль хранится как `scrypt` (`$scrypt$…`, N=32768, r=8, p=1) — без нативных зависимостей,
   средствами `node:crypto`.

---

## 4. Дневник и стрик

| | |
|---|---|
| URI чтения | `GET $BASE/api/v1/diary?date=YYYY-MM-DD` |
| URI правки | `PATCH $BASE/api/v1/diary/{entry_id}` |
| Код | `apps/api/src/routes/diary.ts` |

```bash
TODAY=$(TZ=Europe/Moscow date +%F)
curl -s -b "$JAR" "$BASE/api/v1/diary?date=$TODAY" | J
```

**Ожидается** (у новой сессии — пусто, но структура полная):

```json
{"data":{"date":"2026-09-16","entries":[],
 "totals":{"kcal":0,"protein":0,"fat":0,"carb":0},
 "by_meal":{"breakfast":{...},"lunch":{...},"dinner":{...},"snack":{...}},
 "streak":{"days":0,"frozen_days":[]}},
 "meta":{"request_id":"…","timezone":"Europe/Moscow"}}
```

Проверить границы:

```bash
curl -s -b "$JAR" "$BASE/api/v1/diary?date=2099-01-01" | J   # 422 invalid_date (будущее)
curl -s -b "$JAR" "$BASE/api/v1/diary?date=не-дата"    | J   # 422 invalid_date
curl -s          "$BASE/api/v1/diary"                   | J   # 401 unauthenticated (без cookie)
```

Операции правки (`PATCH /api/v1/diary/{entry_id}`), поле `op`:

| `op` | Тело | Смысл | Отказы |
|---|---|---|---|
| `confirm` | `{"op":"confirm"}` | подтвердить скан в дневник | `403 consent_required`, `404 not_found`, `409 not_done` |
| `set_portion` | `{"op":"set_portion","index":0,"mass_g":250}` | изменить массу позиции | `404`, `409 already_deleted`, `422` вне диапазона |
| `delete` | `{"op":"delete"}` | удалить запись | `404`, `409 already_deleted` |
| иное | — | — | `422 unknown_op` |

```bash
# unknown_op проверяется без готового скана — отказ обязан быть 422, а не 500
curl -s -b "$JAR" -X PATCH "$BASE/api/v1/diary/00000000-0000-0000-0000-000000000000" \
  -H 'Content-Type: application/json' -d '{"op":"нет-такой"}' | J
```

---

## 5. Согласие на обработку данных о питании

Согласие — не галочка при регистрации, а отдельная запись с версией текста и его хешем.
Хеш считает **сервер** по байтам канонического текста; присланное клиентом значение только
сверяется.

| | |
|---|---|
| URI | `POST $BASE/api/v1/consent` |
| Экран | <https://tarelka.aicoding.space/consent> |
| Код | `apps/api/src/routes/consent.ts`, `apps/api/src/consent/known-versions.ts` |
| Известная версия | `2026-09-v1` (закрытый список **в коде**, не в окружении) |

```bash
# согласие
curl -s -b "$JAR" -X POST "$BASE/api/v1/consent" -H 'Content-Type: application/json' \
  -d '{"decision":"grant","consent_version":"2026-09-v1"}' | J

# отказ
curl -s -b "$JAR" -X POST "$BASE/api/v1/consent" -H 'Content-Type: application/json' \
  -d '{"decision":"decline","consent_version":"2026-09-v1"}' | J

# неизвестная версия — обязан быть 422, а не «примем на всякий случай»
curl -s -b "$JAR" -X POST "$BASE/api/v1/consent" -H 'Content-Type: application/json' \
  -d '{"decision":"grant","consent_version":"2030-01-v9"}' | J
```

**Ожидается:** `200` + `{"data":{"decision":"grant","consent_version":"2026-09-v1","recorded_at":"…"}}`;
на неизвестную версию — `422 unknown_consent_version` («согласие на неизвестный текст не
является согласием»).

---

## 6. Скан фото — основной путь продукта 💰

> **ВНИМАНИЕ: это платный вызов.** Провайдер на стенде — `openrouter` (`N4_MODEL_PROVIDER`),
> каждый скан обращается к модели и стоит денег. Пределы: **20 сканов в сутки на пользователя**,
> 3000 в сутки на весь стенд, 600 эскалаций. Не гоняйте этот раздел в цикле.

### 6.1 Поставить скан в очередь

| | |
|---|---|
| URI | `POST $BASE/api/v1/scans` |
| Формат | `multipart/form-data`, одно файловое поле (имя поля любое) |
| Обязательный заголовок | `Idempotency-Key: <UUID>` |
| Код | `apps/api/src/routes/scans.ts` |

```bash
PHOTO=/путь/к/еде.jpg          # JPEG/PNG/WebP/HEIC, ≥320 px по короткой стороне, ≤12 МиБ
KEY=$(UUID)
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans" \
  -H "Idempotency-Key: $KEY" -F "photo=@$PHOTO" | J
```

**Ожидается:** `202` + `{"data":{"scan_id":"<uuid>","status":"queued"}}`.

Порядок проверок на приёме жёстко задан и проверяется по отказам:

| Что подать | Ожидаемый ответ |
|---|---|
| без `Idempotency-Key` или не-UUID | `422 idempotency_key_required` |
| **тот же** `Idempotency-Key` второй раз | `202` с **тем же** `scan_id` (повтор, а не второй скан) |
| не изображение (`.txt`) | `422 invalid_image` |
| файл > 12 МиБ | `413`/`422` |
| картинка меньше 320 px | `422 invalid_image` |
| без cookie | `401 unauthenticated` |
| 21-й скан за сутки | `429` c `quota_exhausted_user` |

```bash
# повтор по тому же ключу — обязан вернуть ТОТ ЖЕ scan_id
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans" -H "Idempotency-Key: $KEY" -F "photo=@$PHOTO" | J
# отсутствующий ключ
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans" -F "photo=@$PHOTO" | J
# не картинка
echo "не картинка" > /tmp/x.txt
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans" -H "Idempotency-Key: $(UUID)" -F "f=@/tmp/x.txt" | J
```

### 6.2 Дождаться результата

| | |
|---|---|
| URI | `GET $BASE/api/v1/scans/{scan_id}` |
| Экран | `$BASE/result/{scan_id}` |

```bash
SCAN=<scan_id из 6.1>
for i in $(seq 1 15); do
  curl -s -b "$JAR" "$BASE/api/v1/scans/$SCAN" | J | head -30
  sleep 3
done
```

**Три состояния, и они обязаны различаться** (общий бюджет задачи — 30 с):

| `status` | Смысл | Что в ответе |
|---|---|---|
| `queued` | в работе | `items` ещё нет |
| `done` | готово | `items[]` с БЖУ и ккал, `photo`, `model_used` (`haiku-4.5` либо `sonnet-5` при эскалации) |
| `failed` | отказ | `failure_reason` из закрытого списка: `provider_unavailable`, `provider_timeout`, `schema_violation`, `no_food_detected`, `no_food_matched`, `timeout`, `normalize`, `quota_exhausted_*` |
| `refused` | отказано | квота/политика |

Вечный `queued` дольше 30 с — дефект: уборщик застрявших заданий обязан перевести его в
`failed` с причиной `timeout`.

### 6.3 Кадр скана

| | |
|---|---|
| URI | `GET $BASE/api/v1/scans/{scan_id}/photo` |

```bash
curl -s -b "$JAR" -o /tmp/scan.jpg -w "%{http_code} %{content_type} %{size_download}\n" \
  "$BASE/api/v1/scans/$SCAN/photo"
```

**Ожидается:** `200 image/jpeg` и ненулевой размер. Байты стримит сам `api`: MinIO наружу не
опубликован, presigned-URL на `storage:9000` браузеру посетителя недостижим.

**Чужой скан и несуществующий id дают ОДИН И ТОТ ЖЕ `404`** — по ответу нельзя узнать, что
такой скан существует:

```bash
curl -s -b "$JAR" -o /dev/null -w "%{http_code}\n" \
  "$BASE/api/v1/scans/00000000-0000-0000-0000-000000000000"     # 404
```

### 6.4 Исправление распознанного

| | |
|---|---|
| URI | `POST $BASE/api/v1/scans/{scan_id}/correct` |
| Код | `apps/api/src/routes/scans-correct.ts` |

| `op` | Тело | Отказы |
|---|---|---|
| `set_portion` | `{"op":"set_portion","index":0,"mass_g":300}` | `422 portion_out_of_range`, `422 index_out_of_range` |
| `replace_item` | `{"op":"replace_item","index":0,"query":"гречка"}` | `422 invalid_query`; при поиске возвращает `candidates` |
| `delete_item` | `{"op":"delete_item","index":0}` | `422 index_out_of_range` |
| `resolve_conflict` | `{"op":"resolve_conflict","choice":"take_db"}` | `422 unknown_choice` |

```bash
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans/$SCAN/correct" \
  -H 'Content-Type: application/json' -d '{"op":"set_portion","index":0,"mass_g":300}' | J

# несуществующая операция
curl -s -b "$JAR" -X POST "$BASE/api/v1/scans/$SCAN/correct" \
  -H 'Content-Type: application/json' -d '{"op":"вздор"}' | J     # 422 unknown_op
```

**Ожидается:** `200` с пересчитанным блюдом и `user_corrected: true`. Скан не в статусе `done`
→ `409 scan_not_done`.

---

## 7. Лимиты и интерес к Pro

| | |
|---|---|
| URI | `POST $BASE/api/v1/interest` |
| Код | `apps/api/src/routes/interest.ts` |

```bash
curl -s -b "$JAR" -X POST "$BASE/api/v1/interest" -H 'Content-Type: application/json' \
  -d '{"contact":"owner@example.com","source":"user_limit"}' | J
```

**Ожидается:** `201` + `{"data":{"recorded":true,"contact_kind":"email"}}`.

| Что подать | Ответ |
|---|---|
| `"contact":"@nickname"` | `201`, `contact_kind: "telegram"` |
| `"source":"что-то"` | `422 invalid_source` (только `user_limit` \| `global_limit`) |
| мусор в `contact` | `422 invalid_contact` |
| повтор в те же сутки | `429 already_recorded_today` |

---

## 8. Подписка и оплата

> **Изменилось 17.09.2026.** На стенде `N4_PAYMENTS_MODE=live`, провайдер `yookassa`, магазин
> в ТЕСТОВОМ режиме (`YOOKASSA_TEST_MODE=true`). Настоящих денег по-прежнему нет, но весь путь —
> намерение → форма ЮKassa → тестовая карта → вебхук → подписка → комиссия партнёру — пройден
> целиком на живом стенде (`docs/operations/partner-journey.md`).

| | |
|---|---|
| Состояние | `GET $BASE/api/v1/subscription` |
| Оформление | `POST $BASE/api/v1/subscription/checkout` |
| Отмена | `POST $BASE/api/v1/subscription/cancel` |
| Экраны | <https://tarelka.aicoding.space/pro> · `$BASE/pro/return?intent=…` |
| Код | `apps/api/src/routes/subscription.ts` |
| Цена | `100000` копеек = **1000 ₽** за 30 суток; Pro-лимит — 100 сканов в сутки |

```bash
curl -s -b "$JAR" "$BASE/api/v1/subscription" | J
```

**Ожидается у анонимной сессии:**
`{"data":{"status":"none","current_period_end":null,"price_minor":100000}}`.

```bash
# оплата требует ВХОДА — подписка принадлежит аккаунту, а не устройству.
# Ключ повторности здесь — в ТЕЛЕ (`idempotency_key`), не в заголовке, в отличие от сканов.
curl -s -b "$JAR" -X POST "$BASE/api/v1/subscription/checkout" \
  -H 'Content-Type: application/json' -d "{\"idempotency_key\":\"$(UUID)\"}" | J
```

**Ожидается без входа:** `401 account_required`. После входа — по почте (§3.1) либо через
Telegram — `201` + `{"data":{"intent_id":"…","redirect_url":"…"}}`.

| Ситуация | Ответ |
|---|---|
| без `idempotency_key` в теле | `422 idempotency_key_required` |
| подписка уже действует | `409 already_subscribed` |
| провайдер недоступен | `503 payment_provider_unavailable` |
| отмена без подписки | `404 not_found` |

✅ `redirect_url` ведёт на живой домен: `APP_ORIGIN` совпадает с адресом стенда (§15 закрыт).
Проверять это надо, ПЕРЕХОДЯ по выданной ссылке, а не сравнивая строки: 16.09 строка выглядела
правильной, а домена не существовало.

---

## 9. Партнёрские коды, кабинет, комиссия

| | |
|---|---|
| Применить код | `POST $BASE/api/v1/codes/apply` |
| Кабинет партнёра | `GET $BASE/api/v1/partner/dashboard?window=day|week|all` |
| Начисления | `GET $BASE/api/v1/partner/earnings` |
| Код | `apps/api/src/routes/codes.ts`, `partner.ts`, `earnings.ts` |
| Ставка | 5000 б.п. = **50 %** от чистой суммы; выдержка — **14 суток** |

```bash
curl -s -b "$JAR" -X POST "$BASE/api/v1/codes/apply" \
  -H 'Content-Type: application/json' -d '{"code":"НЕСУЩЕСТВУЮЩИЙ"}' | J   # 422 invalid_code

curl -s -b "$JAR" "$BASE/api/v1/partner/earnings" | J                       # 401 либо 403 not_partner
curl -s -b "$JAR" "$BASE/api/v1/partner/dashboard?window=сутки" | J         # 422 invalid_window
```

| Ситуация | Ответ |
|---|---|
| код применён | `200` + `{"outcome":"applied"}` |
| атрибуция уже определена явным кодом | `409 conflict` |
| код не найден / не проходит формат | `422 invalid_code` |
| применение отклонено (самоприглашение и т.п.) | `403 rejected` + `reason` |
| не партнёр | `403 not_partner` |

---

## 9.1 Ссылка блогера `/r/{КОД}` и поле промокода

То, ради чего партнёрская схема вообще существует: до 16.09.2026 применить код было НЕЧЕМ —
ни ссылки, ни поля. Схема БД, кабинет и начисления существовали и были мёртвым кодом.

| | |
|---|---|
| Страница ссылки | `GET $BASE/r/{КОД}` — это и есть то, что блогер публикует |
| Поле «есть промокод» | экран `$BASE/pro` |
| Маршрут | `POST $BASE/api/v1/codes/apply`, поле `source` |
| Код | `apps/web/app/r/[code]/page.tsx`, `apps/web/app/partner/apply-code-request.ts`, `apps/api/src/routes/codes.ts` |

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/r/DEMOBLOG"     # 200 — страница открывается БЕЗ входа

# слабый источник (переход по ссылке)
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/v1/codes/apply" \
  -H 'Content-Type: application/json' -d '{"code":"DEMOBLOG","source":"deeplink"}' | J   # 200 applied

# ПОВТОР по ТОЙ ЖЕ ссылке — конфликт, но со СВОИМ признаком
curl -s -b "$JAR" -X POST "$BASE/api/v1/codes/apply" \
  -H 'Content-Type: application/json' -d '{"code":"DEMOBLOG","source":"deeplink"}' | J   # 409 + same_code: true

# ДРУГАЯ ссылка поверх первой — слабый слабого не вытесняет
curl -s -b "$JAR" -X POST "$BASE/api/v1/codes/apply" \
  -H 'Content-Type: application/json' -d '{"code":"ДРУГОЙ","source":"deeplink"}' | J     # 409 + same_code: false
```

| Ситуация | Ответ | Почему именно так |
|---|---|---|
| первый переход по ссылке | `200 applied` | — |
| повтор по ТОЙ ЖЕ ссылке | `409` + `same_code: true` | без признака экран пугал бы своей же ссылкой: «за вами закреплён ДРУГОЙ код» (DEC-A-058) |
| другая ссылка поверх первой | `409` + `same_code: false` | ADR-008: слабый источник слабого не вытесняет — иначе блогеры воровали бы друг у друга приведённых людей |
| код руками на `/pro` поверх ссылки | `200 applied`, прежний источник уходит в `replaced_source` | явный код человека сильнее любой ссылки |
| чужой код наружу | **НЕ отдаётся никогда** | посетителю незачем знать, чей код за ним закреплён |

**Проверка в браузере (главное здесь — не код ответа):** открыть `$BASE/r/DEMOBLOG` в инкогнито.
Экран обязан СРАЗУ показать исход — ни формы, ни кнопки «применить». Пустого экрана не должно быть
ни при одном из четырёх исходов: «ничего не произошло» — это потерянный посетитель.

---

## 9.2 Заведение партнёра владельцем 🔴 требует входа владельцем

До 16.09.2026 партнёр заводился `psql`-запросом в базу руками.

| | |
|---|---|
| Маршрут | `POST $BASE/api/v1/admin/partners` |
| Форма | `$BASE/cabinet` → «Завести партнёра» |
| Код | `apps/api/src/routes/admin-partners.ts`, `apps/web/app/cabinet/add-partner.tsx` |

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/v1/admin/partners" \
  -H 'Content-Type: application/json' -d '{}'        # 404 — посторонний не узнаёт о существовании
```

Тело: `{"account_email":"<почта>","code":"<КОД>","rate_bp":5000}`. Партнёр и его код создаются
ОДНОЙ транзакцией — партнёр без кода и код без партнёра это половина сущности. Код приводится к
верхнему регистру на сервере: ссылку набирают руками с экрана телефона, и регистр там случайность.
Ставка по умолчанию 5000 б.п. = 50 %.

---

## 9.3 Уведомления партнёру

| | |
|---|---|
| Список | `GET $BASE/api/v1/notifications` |
| Отметить прочитанными | `POST $BASE/api/v1/notifications/read` |
| Код | `apps/api/src/notifications/notify.ts`, `apps/api/src/routes/notifications.ts` |
| Миграция | `packages/db/migrations/012_notifications.sql` |

```bash
curl -s "$BASE/api/v1/notifications" | J      # 200 {"unread":0,"items":[]} — пусто, а не чужое
```

**Устройство — два слоя, и это важнее любой команды выше.** Строка в таблице `notification` —
ИСТОЧНИК ИСТИНЫ, она пишется в ОДНОЙ транзакции с деньгами. Доставка в Telegram — надстройка
ПОСЛЕ коммита. Сеть никогда не вызывается внутри транзакции: иначе соединение пула удерживается
на время чужого ответа, а отказ Telegram откатил бы НАЧИСЛЕНИЕ (DEC-A-059).

| Состояние | Что в базе | Что это значит |
|---|---|---|
| доставлено | `delivered_at` заполнено | сообщение ушло |
| не пытались | `delivered_at` и `delivery_error` пусты | ещё в очереди |
| пытались и не смогли | `delivery_error` = текст причины | видно в кабинете, деньги не тронуты |
| Telegram не связан | `delivery_error = 'telegram_not_linked'` | НЕ сбой: PWA первый приоритет, Telegram есть не у всех |

🔴 **Живой доставки не было.** Bot API не доставит сообщение человеку, который не написал боту
первым. Чтобы проверить: связать Telegram тестовому партнёру и написать `@calorytarelka_bot`.

---

## 9.4 Выгрузка движений (CSV под русский Excel)

| | |
|---|---|
| Партнёру | `GET $BASE/api/v1/partner/earnings/export` |
| Владельцу | `GET $BASE/api/v1/admin/export/commissions` |
| Код | `apps/api/src/export/csv.ts`, `apps/api/src/routes/exports.ts` |

```bash
curl -s -b "$JAR" "$BASE/api/v1/partner/earnings/export" -o /tmp/earnings.csv
file /tmp/earnings.csv && head -c 200 /tmp/earnings.csv | xxd | head -3
# первые байты обязаны быть EF BB BF (BOM), разделитель ';', в суммах ЗАПЯТАЯ
```

Четыре свойства формата — не вкусовщина, каждое отвечает за конкретный отказ (DEC-A-061):

| Свойство | Что будет без него |
|---|---|
| разделитель `;` | русский Excel откроет файл ОДНОЙ колонкой |
| BOM в начале | кириллица превратится в «Ð¡Ð» |
| запятая в дробной части | Excel сочтёт сумму текстом и не сложит колонку |
| перевод строки CRLF | часть версий склеит строки |

То есть без них выгрузка бесполезна ровно там, ради чего делалась.

---

## 9.5 Реквизиты выплаты партнёра

| | |
|---|---|
| Сохранить | `PUT $BASE/api/v1/partner/payout-details` |
| Прочитать | `GET $BASE/api/v1/partner/payout-details` |
| Реестр к выплате (владельцу) | `GET $BASE/api/v1/admin/export/payout-register` |
| Код | `apps/api/src/payouts/payout-details.ts` |
| Миграция | `packages/db/migrations/013_payout_details.sql` |

```bash
curl -s "$BASE/api/v1/partner/payout-details" | J          # 401 — реквизиты принадлежат аккаунту

# номер карты обязан быть отвергнут В ЛЮБОМ поле, включая «примечание»
curl -s -b "$JAR" -X PUT "$BASE/api/v1/partner/payout-details" \
  -H 'Content-Type: application/json' \
  -d '{"method":"other","note":"4111 1111 1111 1111"}' | J   # 422 card_number_refused
```

| Правило | Почему |
|---|---|
| номера карт НЕ принимаются и НЕ хранятся | PAN тянет за собой PCI DSS — режим, которого у проекта нет и не будет ради партнёрской программы |
| проверка Луна применяется к ЛЮБОМУ полю, включая свободное «примечание» | иначе номер впишут именно туда: поле свободное, а человек хочет получить деньги |
| поддержаны СБП (телефон + банк) и свободное описание | этого достаточно, чтобы заплатить вручную |
| телефон наружу — МАСКОЙ, в реестр владельца — полностью | маска в реестре сделала бы файл бесполезным, полный номер в чужом ответе — утечкой |

🔴 **Отправки денег НЕТ и не планируется без решения владельца.** Нужен отдельный договор на
выплаты (ЮKassa Выплаты либо банковский API), ИП и определение налогового статуса партнёров
(DEC-A-062). Пока его нет, владелец платит вручную по реестру.

---

## 10. Карточка «поделиться» (публичная страница)

| | |
|---|---|
| Создать | `POST $BASE/api/v1/share-cards` |
| Страница | `GET $BASE/c/{card_id}` |
| Картинка | `GET $BASE/c/{card_id}/image` |
| Код | `apps/api/src/routes/share-cards.ts`, `apps/web/app/c/[cardId]/route.ts` |

```bash
curl -s -b "$JAR" -X POST "$BASE/api/v1/share-cards" \
  -H 'Content-Type: application/json' -d "{\"recognition_id\":\"$SCAN\"}" | J
```

**Ожидается:** `201`/`200` + `{"data":{"card_id":"…","url":"/c/…"}}`.

| Ситуация | Ответ |
|---|---|
| нет `recognition_id` | `422 invalid_request` |
| скан не найден | `404 not_found` |
| скан не `done` | `409 scan_not_done` |
| нет согласия | `403 consent_required` |

Публичная страница — **без cookie**, и это главная её проверка:

```bash
CARD=<card_id>
curl -s -D- -o /dev/null "$BASE/c/$CARD" | grep -iE "^HTTP|cache-control"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/c/00000000-0000-0000-0000-000000000000"
```

**Ожидается:** `200` и **`Cache-Control: no-store` на обеих ветках** — и на `200`, и на `404`.
Это не придирка: отзыв согласия обязан закрыть уже опубликованный адрес за 60 секунд, а кэш
сделал бы этот срок недостижимым. Несуществующая карточка → `404`, тоже `no-store` (проверено:
`/c/00000000-…` отдаёт 404).

> **Наблюдение при прогоне 16.09.2026.** На ветке `404` заголовок `Cache-Control: no-store`
> приходит **дважды**: его ставит и Route Handler (`apps/web/app/c/[cardId]/route.ts`), и дверь
> (`header @card Cache-Control "no-store"` в `Caddyfile`). Значения совпадают, поведение браузера
> от этого не меняется — в отличие от двойного CORS-заголовка, который ломает страницу молча.
> Но правило проекта «заголовок ставит РОВНО одно место» здесь формально нарушено: стоит убрать
> строку из `Caddyfile` либо из обработчика, оставив одно место. Это замечание, не блокер.

Открыть глазами: `https://tarelka.aicoding.space/c/<card_id>` — должно открыться в режиме
инкогнито, без входа, с названием блюда, подписью источника и картинкой.

---

## 11. Удаление данных и отзыв согласия

| | |
|---|---|
| URI | `DELETE $BASE/api/v1/account` |
| Экран | <https://tarelka.aicoding.space/settings> |
| Код | `apps/api/src/routes/account-delete.ts` |

```bash
# без подтверждения — обязан отказать
curl -s -b "$JAR" -X DELETE "$BASE/api/v1/account" \
  -H 'Content-Type: application/json' -d '{}' | J          # 422 confirmation_required
```

| Тело | Смысл | Ответ |
|---|---|---|
| `{"confirm":true,"scope":"withdraw_consent"}` | отозвать согласие, закрыть карточки | `200` + `cards_revoked_at` |
| `{"confirm":true,"scope":"erase_all"}` | удалить аккаунт (срок — 72 часа) | `200` + `erase_deadline` |
| без `confirm` или с чужим `scope` | — | `422 confirmation_required` |
| удаление уже идёт | — | `409 erasure_already_running` |
| без входа | — | `401 unauthorized` |

**Контрольная проверка после отзыва:** ранее открытая карточка `$BASE/c/{card_id}` обязана
стать `404` в течение 60 секунд. Пока аккаунт в статусе `erasing`, новые сканы не принимаются
(`409 account_erasing`) — иначе непрерывный поток сканов откладывал бы удаление бесконечно.

---

## 12. Экраны (проверка в браузере)

Открывать **в режиме инкогнито** — иначе проверяется ваша старая сессия, а не путь нового
посетителя.

| Экран | URI | Что должно быть видно |
|---|---|---|
| Съёмка (главная) | <https://tarelka.aicoding.space/> | кнопка съёмки/загрузки, без анкеты и регистрации |
| Согласие | <https://tarelka.aicoding.space/consent> | текст версии `2026-09-v1`, две кнопки — согласиться / отказаться |
| Дневник | <https://tarelka.aicoding.space/diary> | день, итоги БЖУ, разбивка по приёмам, стрик |
| Pro | <https://tarelka.aicoding.space/pro> | цена 1000 ₽/30 дней, кнопка оформления |
| Возврат с оплаты | `…/pro/return?intent=<id>` | результат оплаты по идентификатору намерения |
| Настройки | <https://tarelka.aicoding.space/settings> | вход по ПОЧТЕ (основной), вход через Telegram, кнопка «Кабинет партнёра и владельца», отзыв согласия, удаление данных |
| Ссылка блогера | <https://tarelka.aicoding.space/r/DEMOBLOG> | исход применения кода СРАЗУ, без формы и кнопки |
| Кабинеты | <https://tarelka.aicoding.space/cabinet> | партнёру — его начисления, уведомления, реквизиты, выгрузка; владельцу — сводка, заведение партнёра, реестр |
| Результат скана | `…/result/<scan_id>` | позиции, БЖУ, кнопки исправления и «в дневник» |
| Публичная карточка | `…/c/<card_id>` | открывается **без входа** |
| Манифест PWA | <https://tarelka.aicoding.space/manifest.webmanifest> | корректный JSON |

Проверено фактически 17.09.2026 по адресу `https://tarelka.aicoding.space`: `/`, `/consent`,
`/diary`, `/pro`, `/settings`, `/cabinet`, `/r/DEMOBLOG` отдают `200`.

**Вход через Telegram** (`/settings`) требует, чтобы домен стенда был прописан в настройках бота
у @BotFather. Имя бота больше не зашито в разметку, а приходит переменной `TELEGRAM_BOT_USERNAME`:
зашитое `tarelka_bot` вело кнопку на ЧУЖОГО бота, пока владелец не сверил токен с BotFather
16.09.2026. Настоящий бот проекта — `@calorytarelka_bot`. Живьём вход через Telegram НЕ проверялся:
нужен аккаунт владельца.

---

## 13. Вебхук оплаты

| | |
|---|---|
| URI | `POST $BASE/api/v1/webhooks/payments/{provider}` |
| Провайдер на стенде | `yookassa`, магазин в ТЕСТОВОМ режиме |
| Код | `apps/api/src/routes/payments-webhook.ts` |

```bash
# чужой провайдер в пути — маршрут обязан быть невидим
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/v1/webhooks/payments/stripe" \
  -H 'Content-Type: application/json' -d '{}'        # 404

# пустое тело
curl -s -X POST "$BASE/api/v1/webhooks/payments/fake" \
  -H 'Content-Type: application/json' -d '{}' | J    # 400 empty_body / verification_failed
```

| Свойство | Ожидаемое поведение |
|---|---|
| подлинность | уведомление **перезапрашивается** у провайдера; расхождение → `400 verification_failed` |
| провайдер недоступен | `503 provider_unavailable` — **исключение**, транзакция откатывается, повтор проходит по полному пути |
| повторная доставка | одно и то же событие применяется **один раз**: уникальный ключ `(provider, provider_event_id)` в `payment_event` |
| чужое событие | `200` + `{"applied":false,"reason":"ignored_event"}` |

✅ **Настоящее уведомление ЮKassa принято и применено** 17.09.2026: тестовая карта → вебхук →
подписка активна → 478,65 ₽ начислено партнёру. По дороге вскрылись ДВА дефекта стыка, и оба
отвергали КАЖДОЕ уведомление с причиной `foreign_ip`:

1. вышестоящий прокси дописывал в `X-Forwarded-For` адрес СВОЕГО апстрима — лечится
   `header_up X-Forwarded-For {client_ip}` во всех трёх блоках `reverse_proxy` (`Caddyfile`);
2. сам обработчик читал адрес сокета вместо заголовка — лечится `clientAddressFrom(...)`.

Каждая часть была корректна сама по себе; дефект жил в допущении одной части о другой
(`deployment-seams.md`). Страж источника испытан мутацией.

🔴 **Что НЕ проверено и почему.** Настоящих денег не было: магазин в тестовом режиме. Значит,
непроверенными остаются поведение при частичном возврате и чарджбэке на живых деньгах, формат
`income_amount` от боевого магазина (от него зависит база комиссии, ADR-011) и фискальный чек
(54-ФЗ — состав чека в запрос **не передаётся**, это отдельная работа).

---

## 14. Кабинет владельца

| | |
|---|---|
| Сводка | `GET $BASE/api/v1/admin/overview` |
| Выплата | `POST $BASE/api/v1/admin/payouts` |
| Код | `apps/api/src/routes/admin.ts` |

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/admin/overview"   # 404 — так и задумано
```

**Ожидается `404`, а не `403`:** посторонний не должен узнать, что маршрут существует.

**Кто владелец.** Списка ДВА, оба в коде (`apps/api/src/routes/admin.ts`), а не в окружении:
`OWNER_EMAILS` (заполнен почтой владельца) и `OWNER_TELEGRAM_USER_IDS` (пуст). Пустой список
означает «никому», а не «можно всем» — это намеренный fail-closed. Список в КОДЕ, а не в
переменной окружения, потому что переменная однажды приедет пустой и тихо откроет кабинет
всем либо никому (`fail-closed-defaults.md`).

Заведение партнёра и его кода — §9.2; выгрузки владельца — §9.4 и §9.5.

Тело выплаты: `{"partner_id":"<uuid>","amount_minor":<копейки>,"payout_key":"<строка>"}`.
Отказы: `422 invalid_payout`, `422 invalid_amount`, `404 not_found`, `422 over_available`,
повтор по тому же `payout_key` → `200` + `{"recorded":false,"reason":"duplicate_payout_key"}`.

---

## 15. ✅ ЗАКРЫТО 17.09.2026: объявленный домен не существовал

> **Исход.** Владелец завёл A-запись `tarelka.aicoding.space → 212.192.0.33`; домен добавлен в
> общий `Caddyfile` вышестоящего прокси `ai-hub-tls-proxy`, сертификат выпущен. Проверено:
> `curl https://tarelka.aicoding.space/health` → `{"data":{"status":"ok","db":"ok"}}`, и это
> совпадает со значением `APP_ORIGIN` внутри контейнеров. Ниже — описание дефекта как он был,
> ради урока: **стенд выглядел полностью здоровым всё время, пока каждая выданная им ссылка
> вела в никуда.**

### Как это выглядело (16.09.2026)

В запущенных контейнерах `api`, `web` и `proxy`
`APP_ORIGIN=https://tarelka.aicoding.space`. У этого имени **нет DNS-записи**:

```bash
nslookup tarelka.aicoding.space 8.8.8.8      # ** server can't find …: NXDOMAIN
curl -s -o /dev/null -w "%{http_code}\n" https://tarelka.aicoding.space/health   # 000
```

Стенд при этом **живой** — по другому адресу: `https://n4.212.192.0.33.sslip.io`
(он же прописан в блоке вышестоящего прокси, `ops/ai-hub-caddy-block.txt`).

**Чем это грозит.** `APP_ORIGIN` — «он определяет КАЖДУЮ выдаваемую наружу ссылку»
(`apps/api/src/env.ts`). Сейчас на него собирается адрес возврата с оплаты:

```
${appOrigin}/pro/return?intent=<id>     — apps/api/src/routes/subscription.ts:85
                                        — apps/api/src/renewals/renew.ts:96
```

То есть посетитель, оплативший подписку, будет отправлен провайдером на несуществующий домен.
Стенд при этом выглядит полностью здоровым: шесть контейнеров `Up`, `/health` отдаёт `ok`, все
страницы открываются. Это ровно тот класс дефекта, который описан в правилах проекта: модуль
корректен, дефект живёт в конфигурации стыка и виден только тогда, когда проверка **пользуется**
выданной ссылкой, а не известным ей самой адресом.

### Как чинилось (17.09.2026)

Владелец выбрал первый из двух путей — завести DNS, а не откатывать `APP_ORIGIN`. Шаги:

1. A-запись `tarelka.aicoding.space → 212.192.0.33` (сделал владелец);
2. домен добавлен в `Caddyfile` ОБЩЕГО прокси машины `ai-hub-tls-proxy` — он единственная дверь
   и для соседних проектов, поэтому правка чужого файла, а не своего;
3. сертификат выпущен Let's Encrypt автоматически после перезагрузки конфигурации.

> **Грабли при перезагрузке конфигурации.** После `sed -i` контейнер продолжал держать СТАРЫЙ
> inode файла: `sed -i` создаёт новый файл, а не правит существующий, и смонтированный путь
> внутри контейнера указывал на прежний. Лечится загрузкой конфигурации из временной копии
> (`caddy reload --config <копия>`), а не повторным `reload` того же пути.

Проверка после починки:

```bash
curl -s "$BASE/health" && \
docker compose exec -T api printenv APP_ORIGIN   # обязан совпасть с адресом, по которому вы зашли
```

---

## 16. Автоматические проверки (не заменяют разделы выше)

Из каталога `projects/04-calorie-vision-cal-ai`:

```bash
npm run typecheck          # типы
npm run lint               # стиль
npm test                   # модульные проверки
npm run test:integration   # против настоящего PostgreSQL
npm run check:env-wiring   # все ли process.env.X доехали до сервиса в compose

node .claude/hooks/check-ports.cjs .              # хранилище не смотрит наружу
bash scripts/check-port-conflicts.sh .            # занятость портов на этой машине
node .claude/hooks/check-webhook-contract.cjs .   # подпись, повтор, перестановка
node .claude/hooks/check-job-contract.cjs .       # три состояния долгой задачи
node .claude/hooks/check-model-cost.cjs .         # у каждого платного вызова назван потолок
```

Зелёный прогон здесь — утверждение о **модулях**. Утверждение о **системе** даёт только
раздел 2–12, прогнанный по публичному адресу.

---

## 17. Сводная таблица состояния

| Блок | URI | Состояние |
|---|---|---|
| Здоровье | `/health` | ✅ проверено, `200` |
| Дверь, CSP, заголовки | `/` | ✅ проверено |
| Сессия устройства | `/api/v1/auth/device` | ✅ проверено, `201` + cookie |
| Дневник | `/api/v1/diary` | ✅ проверено, структура полная |
| Подписка (чтение) | `/api/v1/subscription` | ✅ проверено, `price_minor: 100000` |
| Экраны | `/`, `/consent`, `/diary`, `/pro`, `/settings` | ✅ проверено, `200` |
| Публичная карточка (404-ветка) | `/c/{id}` | ✅ проверено, `404` |
| Согласие, интерес, коды | `/api/v1/consent`, `/interest`, `/codes/apply` | 🟡 команды готовы, не прогонялись |
| Скан, исправление, карточка | `/api/v1/scans…`, `/share-cards` | 🟡 **платный вызов**, прогон за владельцем |
| Ограничение частоты | вся дверь | 🟡 прогон закрывает дверь себе на минуту |
| Вход по почте | `/api/v1/auth/register`, `/login`, `/me` | ✅ проверено, два отказа неотличимы |
| Ссылка блогера | `/r/{КОД}` | ✅ проверено, `200`; повтор по своей ссылке отличим от чужого кода |
| Кабинеты | `/cabinet` | ✅ проверено, `200` |
| Уведомления (запись) | `/api/v1/notifications` | ✅ проверено, `200`, пусто для постороннего |
| Реквизиты выплаты | `/api/v1/partner/payout-details` | ✅ проверено, `401` без входа; номер карты отвергается |
| `APP_ORIGIN` и домен | <https://tarelka.aicoding.space> | ✅ **закрыто 17.09** — DNS, сертификат, совпадение (§15) |
| Оплата картой через ЮKassa | `/api/v1/webhooks/payments/yookassa` | ✅ пройдено целиком на ТЕСТОВОМ магазине: платёж → вебхук → подписка → 478,65 ₽ партнёру |
| Заведение партнёра | `POST /api/v1/admin/partners` | 🟡 `404` постороннему проверен; создание — из кабинета владельца |
| Выгрузки CSV | `/partner/earnings/export`, `/admin/export/*` | 🟡 байты формата проверены тестом, в настоящем Excel файл не открывали |
| Приём НАСТОЯЩИХ денег | — | 🔴 магазин в тестовом режиме (`YOOKASSA_TEST_MODE=true`) |
| Отправка выплат партнёрам | — | 🔴 нужен договор на выплаты, ИП и налоговый статус партнёров (DEC-A-062) |
| Доставка уведомлений в Telegram | — | 🔴 ни один партнёр не связал Telegram и не написал боту |
| Вход через Telegram | `/settings` | 🔴 живьём не проверялся — нужен аккаунт владельца |

---

## Приложение: прогон одним куском

Копируется целиком; не трогает платные вызовы и не выбирает лимит частоты.

```bash
#!/usr/bin/env bash
set -u
BASE=${BASE:-https://tarelka.aicoding.space}
JAR=$(mktemp); TODAY=$(TZ=Europe/Moscow date +%F)
J() { python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin),ensure_ascii=False,indent=2))" 2>/dev/null || cat; }
say() { printf '\n=== %s\n' "$1"; }

say "1. здоровье";            curl -s "$BASE/health" | J
say "2. заголовки";           curl -s -D- -o /dev/null "$BASE/" | grep -iE "content-security-policy|x-frame|x-content"
say "3. маршрутизация";       for p in / /api/v1/diary /health /consent /diary /pro /settings /cabinet /r/DEMOBLOG; do
                                printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"; done
say "4. сессия (создание)";   curl -s -c "$JAR" -X POST "$BASE/api/v1/auth/device" | J
say "5. сессия (повтор)";     curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/v1/auth/device" | J
say "6. дневник";             curl -s -b "$JAR" "$BASE/api/v1/diary?date=$TODAY" | J
say "7. дневник: дата из будущего"; curl -s -b "$JAR" "$BASE/api/v1/diary?date=2099-01-01" | J
say "8. дневник без cookie";  curl -s "$BASE/api/v1/diary" | J
say "9. подписка";            curl -s -b "$JAR" "$BASE/api/v1/subscription" | J
say "10. checkout без входа"; curl -s -b "$JAR" -X POST "$BASE/api/v1/subscription/checkout" \
                                -H 'Content-Type: application/json' \
                                -d "{\"idempotency_key\":\"$(python3 -c 'import uuid;print(uuid.uuid4())')\"}" | J
say "11. неизвестное согласие"; curl -s -b "$JAR" -X POST "$BASE/api/v1/consent" \
                                -H 'Content-Type: application/json' \
                                -d '{"decision":"grant","consent_version":"2030-01-v9"}' | J
say "12. несуществующий код"; curl -s -b "$JAR" -X POST "$BASE/api/v1/codes/apply" \
                                -H 'Content-Type: application/json' -d '{"code":"НЕТ"}' | J
say "13. чужой скан = 404";   curl -s -o /dev/null -w "%{http_code}\n" -b "$JAR" \
                                "$BASE/api/v1/scans/00000000-0000-0000-0000-000000000000"
say "14. карточки нет = 404"; curl -s -D- -o /dev/null "$BASE/c/00000000-0000-0000-0000-000000000000" \
                                | grep -iE "^HTTP|cache-control"
say "15. кабинет невидим";    curl -s -o /dev/null -w "%{http_code} (ожидается 404)\n" "$BASE/api/v1/admin/overview"
say "16. чужой провайдер";    curl -s -o /dev/null -w "%{http_code} (ожидается 404)\n" \
                                -X POST "$BASE/api/v1/webhooks/payments/stripe" \
                                -H 'Content-Type: application/json' -d '{}'
say "17. вход по почте: два отказа обязаны СОВПАСТЬ"
     curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
       -d '{"email":"нет-такого@example.com","password":"неверный"}' | J
say "18. уведомления постороннему — пусто, а не чужое"
     curl -s "$BASE/api/v1/notifications" | J
say "19. реквизиты выплаты без входа"; curl -s "$BASE/api/v1/partner/payout-details" | J
say "20. заведение партнёра посторонним"
     curl -s -o /dev/null -w "%{http_code} (ожидается 404)\n" -X POST "$BASE/api/v1/admin/partners" \
       -H 'Content-Type: application/json' -d '{}'
say "21. APP_ORIGIN совпадает с адресом входа?"
     docker compose exec -T api printenv APP_ORIGIN 2>/dev/null || echo "(запускать с самой машины)"
rm -f "$JAR"
```

---

**Родственные документы:** `docs/canon.md` (числа канона) · `docs/Specification.md` (FR/AC) ·
`docs/features/<slug>/05_completion.md` (квитанция каждой фичи) ·
`docs/feature-runbook.md` (порядок работы) · `.claude/rules/deployment-seams.md` (почему
проверка обязана идти по выданному адресу).
