# 01 — План: `tariffs-and-interest` (фича 14)

Дата: 2026-09-26 · Основа: `de4c778a` · Тир: **XL** — деньги: живая оплата ЮKassa (решение владельца 26.09 «оплату через
ЮKassa можешь взять из предыдущих проектов», A-N6-040). `scripts/complexity-router.sh` по списку файлов до реализации дал
L (миграция, публичный маршрут) — это нижняя граница: денежный тракт он замечает только по идентификаторам в коде, которых
ещё не было. Тир поднят осознанно. Остановка на плане снята владельцем («владелец уже дал направление»): план коммитится,
реализация продолжается; решения, которые владелец может захотеть поменять, перечислены в конце.

FR: FR-TARIFF-002, FR-TARIFF-003. SC: SC-US-011-1, SC-US-011-2. ADR: ADR-017 (дополняется: оплата больше не спящая),
ADR-014 (строки reuse «провайдер ЮKassa», «вебхук оплаты» — теперь ПЕРЕНОСЯТСЯ), ADR-004 (бейдж решает сервер).
Правила: `incoming-webhooks.md`, `security-operation-order.md`, `fail-closed-defaults.md`, `honest-configuration.md`,
`long-running-job.md`, `shared-resource-verification.md`.

## Поток денег

```
тарифы → /upgrade?plan=nobadge|studio (вход обязателен)
  оплата не настроена (N6_PAYMENTS_MODE=off или не задан) → экран интереса «Оплата скоро — сообщим» → POST /api/interest
  оплата настроена → «Оплатить 990 ₽» → POST /api/checkout {plan, idempotency_key}
      → payment_intent (id ДО ухода к провайдеру) → createPayment вне транзакции → 201 {intent_id, redirect_url}
      → форма ЮKassa → /upgrade/return?intent=… (опрос GET /api/checkout/{intent}: выполняется / успех / отказ / не подтверждено)
ЮKassa → POST /api/webhooks/yookassa
  1. сырые байты (≤ 64 КиБ) → 2. подлинность ВНЕ транзакции: адрес источника (XFF, записанный дверью) ∈ сети ЮKassa из кода
     + ПЕРЕЗАПРОС платежа + сверка заявленного с перезапрошенным (магазин, режим test, сумма, статус, order)
     недоступность ЮKassa → 503 без единой записи; подделка → 400
  3. транзакция: INSERT payment_event (provider, event:object.id) ON CONFLICT DO NOTHING — пусто = дубль → 200
     → payment_intent succeeded → план = старший из (текущий оплаченный, оплаченный событием), срок = GREATEST(срок, now()) + 30 дней
     → payment (UNIQUE provider_payment_id) → pending-атрибуция → converted
оператор → npm run ops:set-plan -- <email> <plan> --by <кто> --reason <зачем>   (журнал operator_action)
сторож → оплаченный план с истёкшим сроком → free (бейдж возвращается)
```

## Единицы работы

| # | Единица | Файлы | Что делает | Донор |
|---|---|---|---|---|
| U1 | Миграция 006 | `packages/db/migrations/006_tariffs_payments.sql` | `payment_intent`, `payment_event` (UNIQUE provider+event_id), `payment` (UNIQUE provider+payment_id), `operator_action`, `account.plan_paid_until`, закрытый набор `pro_interest.origin_screen` | N4 `010_subscription_and_commission.sql` — адаптировать (без подписки, комиссий и продлений) |
| U2 | Провайдер | `packages/payments/src/{provider,yookassa,fake,origin,cidr-match,select-provider}.ts` (новый пакет, его зовут web и тесты) | интерфейс, адаптер ЮKassa, фейк, сети ЮKassa в коде, выбор режима `off | fake | live` | N4 `apps/api/src/payments/*` — перенести; select-provider адаптировать (режим `off`, фейк запрещён в production) |
| U3 | Цены и пределы плана | `packages/rag/src/constants.ts`, `packages/rag/src/plans.ts`, `apps/worker/src/crawl/limits.ts` | цена плана в копейках (канон §7), `PAGES_BY_PLAN` в общие константы, `planLimits(plan, ceilings)` для страницы тарифов | — (написано заново: N6-специфичные числа) |
| U4 | Деньги в БД | `packages/db/src/payments.ts`, `packages/db/src/tariffs.ts` | `createIntent`, `readIntent`, `failIntent`, `applyVerifiedPayment` (ключ повторности → намерение → план → платёж → атрибуция, одна транзакция), `recordProInterest`, `setPlanByOperator`, `expirePaidPlans` | N4 `routes/payments-webhook.ts` (applyPayment) — адаптировать: план вместо подписки, без комиссий; N4 `record-pro-interest.ts` — адаптировать (сутки от `now()` транзакции, блокировка) |
| U5 | Маршруты web | `apps/web/src/server/{checkout,payment-webhook,interest}-handler.ts` + deps, `app/api/checkout/route.ts`, `app/api/checkout/[intentId]/route.ts`, `app/api/webhooks/yookassa/route.ts`, `app/api/interest/route.ts` | порядок входа как у кабинета; вебхук: подлинность → ключ → применение | N4 `routes/subscription.ts` (checkout) — адаптировать; N4 `payments-webhook.ts` → route handler Next по форме N1 `api/webhooks/payment/route.ts` — написано заново на их шагах |
| U6 | Экраны | `app/pricing/*`, `app/upgrade/*` (экран оплаты/интереса и возврат), `login/*` (возврат на `/upgrade`), экран установки «Убрать бейдж» | тарифы: числа из U3, «цены предварительные» у каждой цены; все состояния — отдельные компоненты вида | N4 `web/app/pro/{screen,return/screen}.tsx` — адаптировать (состояния, `decideFromSnapshot`), разметка — примитивы N6 |
| U7 | Оператор и сторож | `packages/db/src/ops-set-plan.ts`, корневой `package.json` (`ops:set-plan`), `apps/worker/src/watchdog.ts` | назначение плана с журналом; истечение оплаченного плана | — (написано заново: у N4 план не назначался вручную) |
| U8 | Конфигурация | `packages/rag/src/config.ts` или web runtime, `docker-compose.yml`, `.env.example`, `docs/secrets`/rules | `N6_PAYMENTS_MODE` (не задан = `off`, пусто = отказ старта), `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_TEST_MODE` — обязательны только при `live`; `fake` в production — отказ старта | N4 `select-provider.ts` — адаптировать |
| U9 | Контракт и стражи | `docs/webhook-contract.md`, `docs/model-cost-contract.md` не трогается, `tests/*` | контракт вебхука (три класса); страж: вебхук — единственный путь, меняющий план за деньги; дерево маршрутов — ровно один вебхук | — |

## Критерии приёмки

| AC | Утверждение | SC / FR / правило | Доказательство |
|---|---|---|---|
| AC-1 | Оплата не настроена: «Убрать бейдж» / «Оплатить» ведут на экран интереса; «Сообщите мне» пишет `pro_interest` + `interest`; платёжных полей нет ни в одном состоянии | SC-US-011-1 | integration + браузер |
| AC-2 | Оплата настроена (фейк): «Оплатить» → `payment_intent` ДО провайдера → 201 с `redirect_url` = `confirmation_url`; повтор с тем же ключом — то же намерение, один платёж у провайдера | long-running-job, N4 | integration + браузер |
| AC-3 | Уведомление об успехе (подменный HTTP-сервер ЮKassa + настоящий адаптер): план стал `nobadge`, срок +30 дней, следующий `/w/v1/config` → `badge_required=false` | SC-US-011-2 | integration |
| AC-4 | **Повтор:** одно событие дважды → одно применение (срок +30, не +60); 20 одновременных доставок → одно применение | incoming-webhooks | integration (конкурентно) |
| AC-5 | **Подделка:** чужой IP → 400 без записи; адрес из сети ЮKassa, но перезапрос вернул другой статус/сумму/магазин → 400 без записи; адрес берётся из XFF, записанного дверью, цепочка — отказ | incoming-webhooks, deployment-seams | unit + integration |
| AC-6 | **Недоступность:** ЮKassa отвечает 500/таймаут → 503, ни одной строки `payment_event`; повтор после восстановления проходит полным путём и применяет | security-operation-order (урок N1) | integration |
| AC-7 | **Перестановка:** две оплаты (nobadge, studio) в любом порядке дают один и тот же итог: план studio, срок +60 от старта | incoming-webhooks | integration |
| AC-8 | Сумма платежа ≠ цене намерения → платёж записан `needs_review`, план НЕ меняется | N4, fail-closed | integration |
| AC-9 | Возврат с формы: четыре различимых состояния — выполняется, успех, отказ (платёж отменён у провайдера), не подтверждено за отведённое время | long-running-job | unit решения + браузер всех состояний |
| AC-10 | Оператор: план + строка журнала (кто, зачем, было→стало), pending-атрибуция → converted; без причины/оператора, неизвестный план/почта — отказ без изменений | SetPlanByOperator | integration |
| AC-11 | Истёкший оплаченный план → `free` сторожем; план оператора не истекает | fail-closed | integration |
| AC-12 | Конфигурация: не задан `N6_PAYMENTS_MODE` → `off`; пусто/неизвестно → отказ старта; `live` без ключей магазина → отказ старта с именем переменной; `fake` при `NODE_ENV=production` → отказ старта | honest-configuration | unit |
| AC-13 | Числа тарифов — из констант и потолков, «цены предварительные» рядом с каждой ценой | FR-TARIFF-003, carry_over design-shell | unit + страж по исходнику + браузер |
| AC-14 | Вход с `/upgrade` возвращает на `/upgrade?plan=…`; любой другой `next` игнорируется | open redirect | unit |
| AC-15 | Маршрутов, меняющих план, ровно три пути: вебхук, команда оператора, сторож (понижение); в дереве маршрутов ровно один вебхук | ADR-017 дополненный | страж по исходнику, испытан мутацией |

## Порядок операций

`POST /api/checkout`: лимит → Origin → сессия → тело (закрытое: `plan`, `idempotency_key`) → режим оплаты → намерение
(атомарно) → провайдер ВНЕ транзакции. `POST /api/webhooks/yookassa`: без лимита приложения на мутации (ЮKassa ретраит сама;
лимит двери действует) → режим оплаты → сырые байты → подлинность ВНЕ транзакции → транзакция (ключ → применение).
Недоступность ЮKassa — исключение `PaymentProviderUnavailable` до транзакции (503), а внутри транзакции — откат.

## Ответ по строкам reuse (ADR-014)

| Строка | Ответ |
|---|---|
| провайдер ЮKassa — N4 `payments/yookassa.ts` | **перенести** (U2) |
| вебхук оплаты — N4 `payments-webhook.ts` + форма N1 | **адаптировать** (U5): route handler Next, план вместо подписки, без комиссий (комиссии — фича 15) |

## Решения, которые владелец может захотеть поменять

1. **Разовая оплата на 30 дней, без автопродления** (у N4 было продление сохранённой картой). Продлить — оплатить ещё раз.
2. **Цены — гипотезы канона:** 990 ₽ и 4 900 ₽ в месяц (A-N6-004), в копейках в коде.
3. **Возврат денег** обрабатывается вручную: событие `refund.succeeded` принимается и игнорируется, план снимает оператор.
4. **Студия поверх «Без бейджа»** — план студии, срок продлевается от большего; пересчёта остатка нет.
5. **Оплата по умолчанию выключена** (`off`): стенд и продукт стартуют с экраном интереса, пока нет магазина.
6. **Сумма не совпала с ценой** — платёж принят, план не выдан, разбирает оператор.
7. Адрес уведомлений — `https://<N6_PUBLIC_ORIGIN>/api/webhooks/yookassa`.
