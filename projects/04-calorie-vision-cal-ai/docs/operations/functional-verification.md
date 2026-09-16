# Сценарий функциональной проверки стенда — «Тарелка» (проект 04)

Развёрнутая, исполняемая инструкция: по шагу на каждую функцию продукта, с адресом (URI),
готовой командой, ожидаемым ответом и ссылкой на код, который этот ответ выдаёт.

**Составлено:** 16.09.2026 · **Коммит на момент составления:** `0f378df` ·
**Проверено на живом стенде:** да, разделы 1–4 и 12 прогнаны фактически; шаги, помеченные
🟡 и 🔴, не прогонялись — причина названа в каждом.

> **Зачем отдельный документ.** Зелёные юнит-тесты — утверждение о модуле, а не о системе.
> Дефект развёрнутого стенда живёт в стыке: переменная не доехала до контейнера, дверь не
> пропускает маршрут, ссылка выдана на несуществующий домен. Всё это проверяется только
> обращением по тому адресу, который система ВЫДАЛА (`.claude/rules/deployment-seams.md`).

---

## 0. Адреса стенда

| Назначение | URI | Состояние на 16.09.2026 |
|---|---|---|
| **Публичный вход (основной)** | <https://n4.212.192.0.33.sslip.io> | ✅ работает, отвечает 200 |
| Публичный вход по HTTP | <http://n4.212.192.0.33.sslip.io> | ✅ работает (редиректа нет, отдаёт то же) |
| Локальный вход (только с самой машины VPS) | <http://127.0.0.1:4180> | ✅ работает, дверь проекта |
| Объявленный `APP_ORIGIN` | <https://tarelka.aicoding.space> | 🔴 **DNS нет (NXDOMAIN)** — см. §15 |

Публичный адрес — `sslip.io`: он разрешается в `212.192.0.33` без A-записи. Наружу смотрит
**только дверь проекта** (Caddy, `Caddyfile`); `web`, `api`, `db`, `storage` остаются во
внутренней сети `private` и с интернета недостижимы.

Проверка адреса одной командой:

```bash
curl -s https://n4.212.192.0.33.sslip.io/health
# ожидается: {"data":{"status":"ok","db":"ok"}}
```

---

## 1. Подготовка

Всё, что ниже, работает из любой оболочки с `curl`. `jq` на машине нет — для чтения ответов
используется `python3 -m json.tool`.

```bash
# Выберите ОДИН базовый адрес:
BASE=https://n4.212.192.0.33.sslip.io      # публичный — так его увидит посетитель
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
| URI | <https://n4.212.192.0.33.sslip.io/health> |
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
| Экран | <https://n4.212.192.0.33.sslip.io/consent> |
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

> На стенде `N4_PAYMENTS_MODE=fake` — живых денег нет. Живой приём проверить нельзя: у
> владельца нет ИП и ключей ЮKassa (см. §13).

| | |
|---|---|
| Состояние | `GET $BASE/api/v1/subscription` |
| Оформление | `POST $BASE/api/v1/subscription/checkout` |
| Отмена | `POST $BASE/api/v1/subscription/cancel` |
| Экраны | <https://n4.212.192.0.33.sslip.io/pro> · `$BASE/pro/return?intent=…` |
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

**Ожидается без входа:** `401 account_required`. После входа через Telegram — `201` +
`{"data":{"intent_id":"…","redirect_url":"…"}}`.

| Ситуация | Ответ |
|---|---|
| без `idempotency_key` в теле | `422 idempotency_key_required` |
| подписка уже действует | `409 already_subscribed` |
| провайдер недоступен | `503 payment_provider_unavailable` |
| отмена без подписки | `404 not_found` |

🔴 **`redirect_url` сейчас указывает на мёртвый домен** — см. §15.

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

Открыть глазами: `https://n4.212.192.0.33.sslip.io/c/<card_id>` — должно открыться в режиме
инкогнито, без входа, с названием блюда, подписью источника и картинкой.

---

## 11. Удаление данных и отзыв согласия

| | |
|---|---|
| URI | `DELETE $BASE/api/v1/account` |
| Экран | <https://n4.212.192.0.33.sslip.io/settings> |
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
| Съёмка (главная) | <https://n4.212.192.0.33.sslip.io/> | кнопка съёмки/загрузки, без анкеты и регистрации |
| Согласие | <https://n4.212.192.0.33.sslip.io/consent> | текст версии `2026-09-v1`, две кнопки — согласиться / отказаться |
| Дневник | <https://n4.212.192.0.33.sslip.io/diary> | день, итоги БЖУ, разбивка по приёмам, стрик |
| Pro | <https://n4.212.192.0.33.sslip.io/pro> | цена 1000 ₽/30 дней, кнопка оформления |
| Возврат с оплаты | `…/pro/return?intent=<id>` | результат оплаты по идентификатору намерения |
| Настройки | <https://n4.212.192.0.33.sslip.io/settings> | вход через Telegram, отзыв согласия, удаление данных |
| Результат скана | `…/result/<scan_id>` | позиции, БЖУ, кнопки исправления и «в дневник» |
| Публичная карточка | `…/c/<card_id>` | открывается **без входа** |
| Манифест PWA | <https://n4.212.192.0.33.sslip.io/manifest.webmanifest> | корректный JSON |

Проверено фактически 16.09.2026: `/`, `/consent`, `/diary`, `/pro`, `/settings` отдают `200`
по публичному адресу.

**Вход через Telegram** (`/settings`) требует, чтобы домен стенда был прописан в настройках
бота у @BotFather. С текущим расхождением доменов (§15) он работать не будет.

---

## 13. Вебхук оплаты 🔴

| | |
|---|---|
| URI | `POST $BASE/api/v1/webhooks/payments/{provider}` |
| Провайдер на стенде | `fake` (боевой — `yookassa`) |
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

🔴 **Живой приём денег не проверен и проверен быть не может** до появления ИП и ключей ЮKassa.
Не проверено на живом трафике: подлинность по сетям ЮKassa, её задержки, частичный возврат,
фискальный чек (54-ФЗ — состав чека в запрос **не передаётся**, это отдельная работа).

---

## 14. Кабинет владельца 🔴

| | |
|---|---|
| Сводка | `GET $BASE/api/v1/admin/overview` |
| Выплата | `POST $BASE/api/v1/admin/payouts` |
| Код | `apps/api/src/routes/admin.ts` |

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/admin/overview"   # 404 — так и задумано
```

**Ожидается `404`, а не `403`:** посторонний не должен узнать, что маршрут существует.

🔴 **Сейчас кабинет закрыт ВСЕМ, включая владельца.** Список владельцев
`OWNER_TELEGRAM_USER_IDS` в `apps/api/src/routes/admin.ts` **пуст**, и это намеренный
fail-closed: пустой список означает «никому», а не «можно всем». Чтобы кабинет открылся,
владелец обязан вписать туда свой `telegram_user_id`.

Тело выплаты: `{"partner_id":"<uuid>","amount_minor":<копейки>,"payout_key":"<строка>"}`.
Отказы: `422 invalid_payout`, `422 invalid_amount`, `404 not_found`, `422 over_available`,
повтор по тому же `payout_key` → `200` + `{"recorded":false,"reason":"duplicate_payout_key"}`.

---

## 15. 🔴 Найденное расхождение: объявленный домен не существует

**Наблюдение (16.09.2026).** В запущенных контейнерах `api`, `web` и `proxy`
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

**Два honest-решения, оба за владельцем:**
1. создать A-запись `tarelka.aicoding.space → 212.192.0.33` и прописать домен в блоке
   вышестоящего прокси; либо
2. вернуть `APP_ORIGIN=https://n4.212.192.0.33.sslip.io` в `.env` и перезапустить стек.

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
| Живой приём денег | `/api/v1/webhooks/payments/yookassa` | 🔴 нет ИП и ключей ЮKassa |
| Кабинет владельца | `/api/v1/admin/*` | 🔴 список владельцев пуст — закрыт всем |
| Вход через Telegram | `/settings` | 🔴 блокирован расхождением доменов (§15) |
| `APP_ORIGIN` | — | 🔴 домен не существует (§15) |

---

## Приложение: прогон одним куском

Копируется целиком; не трогает платные вызовы и не выбирает лимит частоты.

```bash
#!/usr/bin/env bash
set -u
BASE=${BASE:-https://n4.212.192.0.33.sslip.io}
JAR=$(mktemp); TODAY=$(TZ=Europe/Moscow date +%F)
J() { python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin),ensure_ascii=False,indent=2))" 2>/dev/null || cat; }
say() { printf '\n=== %s\n' "$1"; }

say "1. здоровье";            curl -s "$BASE/health" | J
say "2. заголовки";           curl -s -D- -o /dev/null "$BASE/" | grep -iE "content-security-policy|x-frame|x-content"
say "3. маршрутизация";       for p in / /api/v1/diary /health /consent /diary /pro /settings; do
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
say "17. APP_ORIGIN совпадает с адресом входа?"
     docker compose exec -T api printenv APP_ORIGIN 2>/dev/null || echo "(запускать с самой машины)"
rm -f "$JAR"
```

---

**Родственные документы:** `docs/canon.md` (числа канона) · `docs/Specification.md` (FR/AC) ·
`docs/features/<slug>/05_completion.md` (квитанция каждой фичи) ·
`docs/feature-runbook.md` (порядок работы) · `.claude/rules/deployment-seams.md` (почему
проверка обязана идти по выданному адресу).
