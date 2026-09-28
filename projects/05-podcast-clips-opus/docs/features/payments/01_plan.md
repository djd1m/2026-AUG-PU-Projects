# 01 — План: `payments` (оплата ЮKassa, фича 30)

Дата: 2026-09-28 · Основа: `4cddc607` (дерево `projects/05-podcast-clips-opus` совпадает с `1f1edb48` основной ветки —
между ними только чужие файлы) · Тир: **XL** — деньги. Реализации нет: план ждёт чекпойнта владельца.

**Маршрутизатор** (`bash ../../scripts/complexity-router.sh` из каталога проекта):

- без аргументов → код `2`, «анализировать нечего: нет изменений» (фича на этапе плана — это НЕ тир T);
- по списку файлов плана (`021_payments.sql`, `payments/yookassa.ts`, `billing-handler.ts`,
  `app/api/webhooks/yookassa/route.ts`, `app/api/checkout/route.ts`, `app/upgrade/page.tsx`) → код `1`, **ТИР XL**:
  «файл денежного тракта · миграция схемы · затронут публичный маршрут → /feature полным циклом + ОСТАНОВКА на плане».

Основание: решение владельца включить оплату (было ADR-005 — «экран интереса; ЮKassa из клона остаётся спящим кодом»;
BACKLOG §3 п.6). Постоянное правило владельца — переносить готовое из сделанных проектов.
FR: FR-TARIFF-001, FR-TARIFF-002, FR-TARIFF-003, FR-GROWTH-003, FR-LIMIT-001. SC: SC-US-012-1 (меняется), SC-US-012-2.
ADR: ADR-005 (заменяется при реализации), ADR-007 (атрибуция не меняется). Правила: `incoming-webhooks.md`,
`security-operation-order.md`, `model-call-cost.md`, `honest-configuration.md`, `fail-closed-defaults.md`,
`long-running-job.md`, `shared-resource-verification.md`, `deployment-seams.md`.

## 0. Что найдено при чтении (факты, меняющие план)

1. **«Спящего кода ЮKassa» в N5 нет.** ADR-005 и `webhook-contract.md` утверждают, что у клона есть `yookassa.ts` и
   вебхук `apps/web/app/api/webhooks/yookassa`. Поиск по `apps/`, `packages/`, миграциям 001–020 и `scripts/` — ни
   одного файла оплаты; единственные упоминания — страж ADR-005 в `tests/limits.test.ts:67-75` (маршрутов оплаты НЕТ) и
   запрет слов «оплат/checkout/payment» в экране интереса (`tests/limits.test.ts:58-66`). Значит «пробудить» нечего:
   **весь тракт переносится из N6** (он сам взят из N4 и прошёл ревью с 7 находками, исправленными 26.09).
2. **Что `paid` даёт в N5 сейчас (код):** (а) клип без метки — `watermarkRequired(plan) = plan !== 'paid'`
   (`apps/worker/src/render/watermark.ts:16`), план читается из БД в `packages/db/src/render.ts:25`, не из запроса;
   (б) клипы не истекают — `a.plan <> 'paid'` в `retention.ts:88` и `plan !== 'paid'` в расчёте `expires` в
   `clip-file.ts:40`, `screen.ts:90,105`, `clip-music.ts:28`, `video-cta.ts:47`, `guest-pack.ts:44` (шесть мест).
   **Минуты от плана НЕ зависят:** `limits.ts` берёт одни `N5_LIMIT_USER_*` для всех. Экран интереса обещает «больше
   минут», но числа нет ни в Specification, ни в каноне.
3. **Цены в N5 нет нигде.** Specification §1: «Тарифов ровно два, приёма денег в неделе нет (OWN-005): `paid`
   существует в модели, но купить его нельзя». Канон §9: «Тарифов | 2: `free`, `paid` (без приёма денег в неделе…)».
   FR-LOOK-014 требует страницу тарифов «первый платный — „снять метку“», но без суммы.
4. **Комиссий в N5 нет, и выдумывать их нельзя.** Specification FR-GROWTH-004: «личный код… делая его
   микро-партнёром без выплат»; §7: «Выплаты партнёрам | ❌ | | ✅ | Could» (v3). `attribution.status` закрыт:
   `pending | activated | rejected | partner_deleted` (канон §4), статуса `paid`/`converted` нет;
   `pending → activated` — по первой записи в `done` (FR-PARTNER-002), и Specification прямо связывает остановку
   на `activated` с отсутствием оплаты. План: **атрибуцию не трогать, комиссий не начислять** (см. §6).
5. **Готовые клипы оплата не перерисовывает.** FR-TARIFF-001: «Смена тарифа не перерисовывает уже готовые клипы: метка
   вшита в пиксели, и снятие означает повторный рендер». Существующий перерендер (смена музыки, ADR-016) читает план из
   БД — после оплаты он даст клип без метки в пределах `N5_LIMIT_USER_RERENDERS`. Это следствие, а не новая функция.
6. **Граница доверия адресу уже есть:** `clientIp(headers, N5_TRUSTED_PROXY_HOPS)` (`server/ip.ts`) — стенд за двумя
   прокси (`ai-hub-tls-proxy` → Caddy `proxy` → web, `N5_TRUSTED_PROXY_HOPS=2`). N6 брал адрес из XFF единственного
   элемента; N5 берёт по числу доверенных хопов — адаптация, а не перенос (U5).

## 1. Поток денег

```
кнопки интереса на карточке клипа, в кабинете и на гостевой странице (source_screen: clip_card · partner_dashboard · guest_page), вход обязателен
  → /upgrade?from=clip_card|partner_dashboard|guest_page
  N5_PAYMENTS_MODE=off (или не задан) → экран интереса КАК СЕЙЧАС (ProInterest, pro_interest + growth_event interest)
  N5_PAYMENTS_MODE=fake|live → «Оплатить <цена> ₽ за 30 дней» → POST /api/checkout {idempotency_key}
      → payment_intent (id ДО ухода к провайдеру) → createPayment ВНЕ транзакции → 201 {intent_id, redirect_url}
      → форма ЮKassa → /upgrade/return?intent=… (опрос GET /api/checkout/{intent}: выполняется · успех ·
        оплачено-но-не-действует · отказ · не подтверждено за 60 с)
ЮKassa → POST https://clipmkr.ru/api/webhooks/yookassa   (payment.succeeded, refund.succeeded)
  1. режим (off → 404) → 2. сырые байты ≤ 64 КиБ → 3. адрес источника clientIp(hops) ∈ сети ЮKassa ИЗ КОДА
  4. ПЕРЕЗАПРОС платежа/возврата по API ЮKassa + сверка (id, статус, сумма в копейках, магазин, test, order_id)
     — шаги 3–4 ВНЕ транзакции и ДО ключа повторности; подделка → 400 без записи;
     ЮKassa недоступна → исключение PaymentProviderUnavailable → 503 без записи (повтор пройдёт полным путём)
  5. транзакция: INSERT payment_event(provider, "<событие>:<object.id>") ON CONFLICT DO NOTHING — пусто = дубль → 200
     → advisory-lock по id платежа (оплата и возврат одного платежа сериализуются)
     → намерение → аккаунт active? → сумма = цене? → payment → account.plan='paid', plan_source='payment',
       plan_paid_until = GREATEST(срок, now()) + 30 дней → намерение succeeded
оператор → npm run ops:set-plan -- <email> paid|free --by <кто> --reason <зачем>   (журнал operator_action)
сторож (watchdog) → plan_source='payment' и срок истёк → free; клипам этого аккаунта срок хранения
     считается от конца оплаченного срока, а не от готовности (U6)
```

`paid` после оплаты даёт ровно то, что уже даёт в коде (§0 п.2): **новые клипы без метки** и **клипы не истекают**,
плюс — если владелец утвердит число — **больший дневной потолок минут** (вопрос 1). Ничего больше.

## 2. Единицы работы и доноры

Донор по умолчанию — N6 (`projects/06-rag-sales-chatbase`, коммит `c2dbabb4` + исправления ревью), первоисточник —
N4 `apps/api/src/payments/*`. Каждый перенесённый файл несёт первой строкой `// из N6: <путь> — перенесено|адаптировано
(…)`, как в N6.

| # | Единица | Файлы N5 | Донор | Ответ |
|---|---|---|---|---|
| U1 | Миграция 021 | `packages/db/migrations/021_payments.sql` | N6 `006_tariffs_payments.sql` | **адаптировать:** `account.plan_paid_until`, `plan_source ∈ {none, payment, operator}` + CHECK «payment ⇒ срок»; `payment_intent` (без колонки `plan` — платный план один; `price_minor`, `UNIQUE(account_id, idempotency_key)`, `provider_payment_id`, `status created/succeeded/canceled`); `payment_event UNIQUE(provider, provider_event_id)`; `payment UNIQUE(provider, provider_payment_id)`, `review_reason ∈ {amount_mismatch, refund, unknown_intent, account_erasing}`; `operator_action`. Только добавляющая; `pro_interest` не трогается |
| U2 | Провайдер | `apps/web/src/server/payments/{provider,yookassa,fake,origin,cidr-match,config}.ts` | N6 те же файлы | **перенести** `provider`, `yookassa`, `fake`, `origin`, `cidr-match` без изменений логики; **адаптировать** `config.ts`: имя `N5_PAYMENTS_MODE`, импорт путей. В web, а не в новом пакете — как A-N6-041 п.1 (новый workspace = перегенерация lockfile) |
| U3 | Деньги в БД | `packages/db/src/payments.ts` | N6 `packages/db/src/payments.ts` | **адаптировать:** `createPaymentIntent`, `setIntentProviderPayment`, `markIntentCanceled`, `readPaymentIntent`, `applyVerifiedPayment`, `recordVerifiedRefund`, `expirePaidPlans`, `readAccountBilling` — УБРАТЬ `accrueCommissionTx`/`clawbackCommissionTx` и `UPDATE attribution … converted` (в N5 нет ни комиссий, ни статуса); `grantPaidPlan` упростить до одного платного плана (ранги `nobadge/studio` не нужны); транзакция — `transaction` из `@clipmaker/db` |
| U4 | Цена и пределы | `packages/shared/src/tariff.ts` (новый), `apps/web/src/server/limits.ts`, `upload`-списание минут | — | **заново:** `PAID_PRICE_MINOR`, `PAID_PLAN_DAYS = 30` константами кода (цена — решение владельца, вопрос 1); `effectivePlan(plan, source, paidUntil, now)`; при утверждённом числе — `N5_LIMIT_PAID_USER_MINUTES` (обязателен при `fake|live`, не больше `N5_LIMIT_GLOBAL_MINUTES`, иначе отказ старта — model-call-cost п.1). Причина «заново»: числа N5-специфичны, у доноров минут нет |
| U5 | Маршруты web | `apps/web/src/server/{billing-handler,billing-deps,billing-runtime}.ts`, `app/api/checkout/route.ts`, `app/api/checkout/[intentId]/route.ts`, `app/api/webhooks/yookassa/route.ts` | N6 те же | **адаптировать:** тело оформления `{idempotency_key}` (план один); вход — обвязка N5 (`rate-limit.allowMutation`, Origin, `readSessionCookie` из N5 `auth-handler`); адрес источника — `clientIp(headers, trustedProxyHops)` N5 вместо «ровно один XFF»; описание платежа «КлипМейкер: тариф Pro на 30 дней»; `interest` в web-обработчик НЕ переносится — в N5 он остаётся tRPC `interest.create` |
| U6 | Эффективный план в чтениях | `packages/db/src/render.ts`, `retention.ts`, `clip-file.ts`, `screen.ts`, `clip-music.ts`, `video-cta.ts`, `guest-pack.ts` | — | **заново (N5-специфично):** одно SQL-выражение «план действует» (`plan='paid' AND (plan_source<>'payment' OR plan_paid_until>now())`) в ОДНОМ месте (функция в `packages/db`), шесть мест §0 п.2 переводятся на него; срок хранения после истечения — `GREATEST(finished_at, plan_paid_until) + 72 ч`, иначе при понижении клипы старше 3 суток стираются первым же проходом. Метку рендер решает по тому же выражению (FR-GROWTH-003: «по плану аккаунта из базы») |
| U7 | Экраны | `app/upgrade/{page,UpgradeScreen}.tsx`, `app/upgrade/return/{page,ReturnScreen}.tsx`, `lib/payment-return.ts`, `dashboard/ProInterest.tsx` → ссылка, `clips/ClipCard.tsx`, `server/guest-page.ts`, `AuthForm.tsx` (возврат на `/upgrade`) | N6 `upgrade/*`, `lib/payment-return.ts` | **адаптировать:** шесть состояний возврата N6 после ревью (выполняется · успех · `paid_inactive` · отказ · не подтверждено за 60 с · ошибка входа), таймаут запроса 5 с и предел по времени 60 с; разметка — классы и тёмная тема N5; при `off` — нынешний `ProInterest` без изменений (страж `limits.test.ts:58` остаётся для режима `off`); `?next=` принимает ТОЛЬКО `/upgrade?from=<закрытый набор>` |
| U8 | Оператор и сторож | `packages/db/src/ops-set-plan.ts`, `package.json` (`ops:set-plan`), `apps/web/src/server/watchdog.ts` | N6 `tariffs.ts` (`setPlanByOperator`), `expirePaidPlans` | **адаптировать:** `free|paid` вместо `nobadge|studio`; снятие плана стирает `plan_paid_until` (находка 3 ревью N6); истечение — шаг существующего `watchdogTick` N5 |
| U9 | Конфигурация и стенд | `docker-compose.yml` (web), `.env.example`, `scripts/check-env-complete.sh`, `scripts/stand-set-yookassa.sh` | N6 `config.ts`, `stand-set-yookassa.sh` | **адаптировать:** compose `${N5_PAYMENTS_MODE-off}` (дефис без двоеточия — явно пустое значение валит старт, находка 4 ревью N6); ключи `YOOKASSA_*` только при `live`; скрипт — env стенда N5 (сейчас `/tmp/n5-demo.env`, BACKLOG §1), контейнер web N5, адрес уведомлений `${N5_PUBLIC_ORIGIN}/api/webhooks/yookassa`, проверка префикса `test_`/`live_`, откат env из копии |
| U10 | Контракт и стражи | `docs/webhook-contract.md`, `tests/limits.test.ts`, `tests/billing.{unit,integration}.test.ts`, `tests/fixtures/fake-yookassa-server.ts`, `scripts/test-payments-mutations.mjs` | N6 `webhook-contract.md`, те же тесты | **адаптировать:** контракт — три класса (§5); страж ADR-005 «маршрутов оплаты нет» заменяется стражем «в дереве ровно один вебхук и два маршрута оформления; план меняют ровно три пути: вебхук, оператор, сторож»; мутационный прогон — по образцу `test-money-mutations.mjs` N5 (изолированная копия дерева) |

Не переносится: `interest-handler` N6 (у N5 свой tRPC-интерес), `commission.ts` N6 (комиссий нет), ранги планов N6.

## 3. Критерии приёмки

| AC | Утверждение | Основание | Доказательство |
|---|---|---|---|
| AC-1 | `N5_PAYMENTS_MODE` не задан или `off`: всё как сейчас — «снять метку» ведёт на экран интереса, `interest.create` пишет `pro_interest` + `interest`, платёжных полей нет; `/api/webhooks/yookassa` и `/api/checkout` → 404 | ADR-005 для режима off, SC-US-012-1 | integration + браузер (Playwright-контейнер) |
| AC-2 | Режим `fake`: «Оплатить» создаёт `payment_intent` ДО провайдера, 201 с `redirect_url`; повтор с тем же ключом — то же намерение и ОДИН платёж у провайдера; у намерения уже есть платёж — перезапрос, а не второй `createPayment` (находка 2 N6) | long-running-job | integration |
| AC-3 | Уведомление об успехе (подменный HTTP-сервер ЮKassa + НАСТОЯЩИЙ адаптер): `plan='paid'`, `plan_source='payment'`, срок `now()+30 сут`; следующий рендер — без метки; клипы аккаунта перестают получать `expires` | FR-TARIFF-001, FR-GROWTH-003 | integration + рендер-тест |
| AC-4 | **Повтор:** одно событие дважды → одно применение (срок +30, не +60); **20 одновременных** доставок одного события → ровно одна строка `payment` и +30 сут | incoming-webhooks, shared-resource-verification | integration, конкурентно |
| AC-5 | **Подделка:** адрес вне сетей ЮKassa → 400, ноль строк; адрес из сети, но перезапрос вернул другой статус / сумму / магазин / `test` / `order_id` → 400, ноль строк; подделка с угаданным `object.id` НЕ занимает ключ — настоящее уведомление после неё применяется | incoming-webhooks, security-operation-order | unit + integration |
| AC-6 | **Недоступность:** ЮKassa отвечает 500 / таймаут на перезапросе → 503, ноль строк `payment_event`; повтор после восстановления применяет оплату полным путём | security-operation-order (урок N1) | integration |
| AC-7 | **Перестановка:** две оплаты в любом порядке → срок +60 от старта; возврат раньше оплаты → платёж `refunded`+`needs_review`, план не выдаётся; 10+10 одновременных оплата/возврат — итог как у последовательного | incoming-webhooks (находка 1 N6) | integration |
| AC-8 | Сумма ≠ цене намерения → `payment.needs_review=amount_mismatch`, план не меняется, экран возврата — «не подтверждено», не «успех» | fail-closed; вопрос 4 | integration |
| AC-9 | Оплата от аккаунта в статусе `erasing` → `needs_review=account_erasing`, план не выдаётся; стирание аккаунта оставляет строку `payment` (`account_id` → NULL) | FR-AUTH-003, N6 A-N6-054 | integration |
| AC-10 | Экран возврата: шесть различимых состояний; «не подтверждено за 60 с» наступает по ВРЕМЕНИ даже при зависшем запросе; старое успешное намерение при действующем `free` — `paid_inactive`, не «включено» | long-running-job (находки 5–6 N6) | unit `decideReturnState` + браузер всех состояний |
| AC-11 | Эффективный план: `paid` с истёкшим `plan_paid_until` и `plan_source='payment'` в любом из шести чтений §0 п.2 и в рендере читается как `free` ДО прохода сторожа; неизвестное значение плана — `free` (сохранён тест `"PAID"`) | FR-TARIFF-001, fail-closed | unit + integration |
| AC-12 | Сторож: истёкший оплаченный план → `free`; план оператора не истекает; клипы, готовые во время оплаты, хранятся ещё 3 суток от конца срока, а не стираются первым проходом | FR-TARIFF-003 | integration |
| AC-13 | Оператор: `ops:set-plan` пишет план и `operator_action` (кто, зачем, было→стало); снятие (`free`) стирает остаток срока — новая оплата даёт ровно 30 сут; без `--by`/`--reason`, неизвестная почта или план — отказ без изменений | находка 3 N6 | integration |
| AC-14 | Конфигурация: не задан → `off`; пусто / неизвестно → отказ старта; `fake` при `NODE_ENV=production` → отказ; `live` без `YOOKASSA_SHOP_ID`/`SECRET_KEY`/явного `YOOKASSA_TEST_MODE` → отказ старта с именем переменной; compose пропускает явно пустое значение до проверки | honest-configuration | unit + страж по `docker-compose.yml` |
| AC-15 | Минуты (только если владелец утвердит число): `paid` получает `N5_LIMIT_PAID_USER_MINUTES`, персональный ≤ суточного `N5_LIMIT_GLOBAL_MINUTES`, иначе отказ старта; суточный потолок продукта не меняется | model-call-cost п.1, FR-LIMIT-001 | unit + integration (две загрузки на границе) |
| AC-16 | Маршруты, меняющие `account.plan`, — ровно три пути (вебхук, оператор, сторож-понижение); в дереве `app/` ровно один вебхук; страж испытан мутацией (добавить четвёртый путь → красный) | guard-must-be-able-to-fail | страж по исходнику + `test-payments-mutations.mjs` |
| AC-17 | Мутации пойманы все: убрать перезапрос; записывать ключ до подлинности; вернуть недоступность значением; убрать advisory-lock; `+30` от `now()` вместо `GREATEST`; фейк в production; `${…:-off}`; убрать дедлайн опроса | guard-must-be-able-to-fail | `scripts/test-payments-mutations.mjs`: N/N пойманы, восстановление зелёное |
| AC-18 | Полный набор N5 (975 тестов + новые) зелёный на Postgres 16 / Redis 7 / MinIO; браузерные — в контейнере Playwright `v1.60.0-noble` (`scripts/check-responsive.sh`) | complexity-router M-набор п.4 | дословный вывод в `05_completion.md` |

## 4. Порядок операций (это и есть защита)

- `POST /api/checkout`: лимит частоты (30/мин на IP) → Origin → сессия → тело (закрытое: `idempotency_key`) → режим
  оплаты (off → 409 `payments_off`) → намерение атомарно (`ON CONFLICT DO NOTHING`, затем чтение) → у намерения уже есть
  платёж? перезапрос : `createPayment` **ВНЕ транзакции** (ключ идемпотентности ЮKassa = id намерения).
- `POST /api/webhooks/yookassa`: режим (off → 404) → лимит приложения на мутации НЕ применяется (ЮKassa повторяет сама;
  лимит двери Caddy действует) → сырые байты ≤ 64 КиБ → адрес источника ∈ сетей ЮKassa (список в коде, не в env) →
  **перезапрос и сверка ВНЕ транзакции** → транзакция: **ключ повторности** → advisory-lock платежа → применение.
  Подлинность строго ДО записи ключа: иначе подделка с угаданным `object.id` занимает ключ настоящего события.
- Недоступность ЮKassa — **исключение** `PaymentProviderUnavailable`: до транзакции → 503 без записей; внутри
  транзакции (неожиданная ошибка) — откат, ключ освобождается, повтор идёт полным путём. Возврат значением запрещён
  (урок N1: коммит вместе с занятым ключом = оплата не применяется никогда).
- Внутри транзакции нет сетевых вызовов (shared-resource-verification п.1): соединение пула не держится на время ответа
  ЮKassa. Пул N5 и Redis-ограничитель общие с загрузкой и экраном клипов — 20 одновременных доставок проверяются
  конкурентным тестом (AC-4), а не последовательным.

## 5. `webhook-contract.md` — что будет написано при реализации

Шапка по образцу N6: `Входящие вебхуки: да` · `Отправитель: ЮKassa` · `Ключ повторности: event + object.id`
(`payment_succeeded:<id платежа>`, `refund_succeeded:<id возврата>`) · `Источник ключа: событие-отправителя` ·
`Хранилище ключа: таблица payment_event, колонки provider/provider_event_id` · `Механизм исключения: уникальный-индекс` ·
`Порядок событий: перестановочен` · маршрут `POST https://clipmkr.ru/api/webhooks/yookassa`.

**Подписи у ЮKassa нет.** `check-webhook-contract.cjs` описывает подписанные вебхуки, поэтому честный итог — код `2`
«Проверка повторной доставкой: НЕ ВЫПОЛНЕНА · Причина: no-provider», пока нет повторной доставки настоящим тестовым
магазином N5. Поля подписи не заполняются имитацией; подлинность — связка «сеть ЮKassa из кода + перезапрос + сверка
объекта», и ни одна не заменяет другие. Код `2` не выдаётся за зелёный.

| Класс | Лечение | Доказательство |
|---|---|---|
| подделка | сеть ЮKassa + перезапрос + сверка до ключа; 400 без записи | `tests/billing.integration.test.ts` (AC-5) |
| повтор | ключ `<событие>:<object.id>`, `UNIQUE(provider, provider_event_id)`; 20 одновременных → одно применение | то же (AC-4) |
| перестановка | срок `GREATEST(срок, now()) + 30`; возврат раньше оплаты → план не выдаётся; advisory-lock по платежу | то же (AC-7) |

## 6. Партнёрская атрибуция

В N5 оплата **не меняет** `attribution`: статусов `paid`/`converted` в закрытом наборе нет, `pending → activated`
остаётся по первой готовой записи (FR-PARTNER-002), комиссий и выплат нет (FR-GROWTH-004 «без выплат», §7 — v3).
Кабинет партнёра не получает счётчика «оплатили» — спецификация его не требует. Связь оплаты с кодом партнёра при
необходимости восстанавливается запросом `payment → account → attribution` без новой схемы. Если владелец захочет
комиссии — это отдельная фича с донором N6 `partner-and-studio` (A-N6-043), не часть этой.

## 7. Стенд `https://clipmkr.ru`

Порядок включения — только после одобрения и магазина: `N5_PAYMENTS_MODE` не задан (стенд продолжает с экраном
интереса) → выкладка кода → `bash scripts/stand-set-yookassa.sh` (спрашивает shopId, секрет без эха, тестовый ли
магазин; пишет env вне git; перезапускает web; при нездоровом web возвращает env из копии) → в кабинете ЮKassa адрес
уведомлений `https://clipmkr.ru/api/webhooks/yookassa`, события `payment.succeeded`, `refund.succeeded` → тестовая
оплата картой ЮKassa → повторная доставка из кабинета → строка контракта переходит из `НЕ ВЫПОЛНЕНА` в проверенную.
Живая проверка: адрес источника, вычисленный `clientIp` при `N5_TRUSTED_PROXY_HOPS=2`, — действительно адрес ЮKassa
(журнал web), а не общего прокси (deployment-seams: стык двух прокси проверяется на стенде, не в тесте).
Никаких новых портов и контейнеров: маршрут живёт в существующем web за существующим Caddy.

## 8. Вопросы владельцу

1. **Цена, период и что входит в `paid`.** В N5 цены нет нигде: Specification §1 — «`paid` существует в модели, но
   купить его нельзя»; канон §9 — «Тарифов | 2: `free`, `paid` (без приёма денег в неделе…)»; экран интереса обещает
   «больше минут или клипы без метки» без чисел. **Рекомендация:** 990 ₽ за 30 дней (цена N6 «Без бейджа», одна
   ступень — у N5 один платный план); входит: новые клипы без метки + клипы не истекают + дневной потолок минут 270
   (три записи по 90 мин), не выше суточного потолка продукта. **Альтернатива:** 1 490 ₽ / 30 дней и минуты как у free
   (платят только за метку и хранение) — проще, без изменения лимитов и без роста расхода на Whisper/LLM.
2. **Разовая оплата или автопродление.** **Рекомендация:** разовая на 30 дней, продлить — оплатить ещё раз (как N6,
   A-N6-040 п.1; срок складывается от большего). **Альтернатива:** автопродление сохранённой картой (было у N4) —
   требует хранения `payment_method_id`, сторожа списаний, отказа от продления и экрана отмены: +1 миграция, +1 фоновая
   задача, +3 состояния, иной договор-оферта.
3. **Что при возврате.** **Рекомендация:** `refund.succeeded` принимается, платёж помечается `needs_review=refund`, план
   снимает оператор (`ops:set-plan … free` — остаток срока стирается), уже отрендеренные без метки клипы остаются
   (метка вшита в пиксели). **Альтернатива:** автоматическое снятие плана при полном возврате — быстрее, но частичный
   возврат и возврат после продления требуют правил пересчёта срока, которых у доноров нет.
4. **Что при несовпадении суммы.** **Рекомендация:** платёж записывается `needs_review=amount_mismatch`, план НЕ
   выдаётся, пользователь видит «не подтверждено — напишите нам», разбирает оператор (как N6). **Альтернатива:** выдать
   план при сумме ≥ цены — удобнее при ручных доплатах, но делает цену необязательной проверкой.
5. **Тестовый магазин ЮKassa для N5.** У магазина ОДИН адрес уведомлений, магазины N1–N4 (и N6, если заведён) заняты
   своими адресами — N5 нужен **свой** магазин с адресом `https://clipmkr.ru/api/webhooks/yookassa`. **Есть ли он?**
   **Рекомендация:** завести тестовый магазин N5, реализовать и проверить всё на `fake` + подменном сервере ЮKassa,
   включить `live` скриптом, когда будут shopId и секрет. **Альтернатива:** без магазина — код выкладывается с
   `N5_PAYMENTS_MODE` незаданным (стенд работает как сейчас), контракт честно остаётся с кодом `2`.

## 9. Что обновится при реализации (на этапе плана не правится)

`docs/ADR.md` (ADR-005 → заменён новым ADR «оплата включена», Confirmation — страж AC-16), `docs/Specification.md`
(§1, FR-TARIFF-001/002, SC-US-012-1 — оплата при настроенном режиме), `docs/canon.md` §4/§9 (`plan_source`, цена),
`docs/decisions-owner.md` (ответы на §8), `docs/BACKLOG.md` §3 п.6, `.claude/feature-roadmap.json`, `docs/webhook-contract.md`
(§5), `docs/reuse-map.md` (строки U1–U10), `docs/model-cost-contract.md` (если утверждён потолок минут `paid`),
проектные правила `.claude/rules/security.md` (раздел «Чего в неделе НЕТ») и `.claude/rules/testing.md` (строка стража
ADR-005) — оба сейчас утверждают, что маршрута оплаты нет.
