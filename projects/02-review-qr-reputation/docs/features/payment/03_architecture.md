# Оплата · Архитектурная дельта

## Размещение
- `createCheckout`, `onPaymentWebhook` — **apps/web** (роль app_owner). Вебхук
  неаутентифицирован, но контекст арендатора берётся ИЗ НАШЕЙ БД по
  `provider_session_id`, никогда из тела вебхука.
- `expireSubscriptions` — **services/notifier** (у него уже есть цикл и БД).

## Недостающие гранты — миграция 011 (урок: «каждая роль × каждая таблица её кода»)

| Роль | Таблица | Право |
|---|---|---|
| app_owner | checkout_sessions | SELECT, INSERT, UPDATE |
| app_owner | webhook_events | SELECT, INSERT |
| app_owner | partners | SELECT |
| app_owner | attributions | SELECT, UPDATE |
| app_owner | commissions | SELECT, INSERT |
| app_notify | subscriptions | SELECT, UPDATE (status) |
| app_notify | places | UPDATE (branding_required) — только для истечения |

RLS: checkout_sessions/webhook_events/commissions — БЕЗ RLS (вебхук работает до
установления контекста; изоляцию даёт то, что account_id берётся из нашей строки).
subscriptions уже под RLS — вебхук ставит SET LOCAL до записи.

## Найдено валидацией: канал инвалидации у истечения

Истечение живёт в notifier, а канал сброса кэша был только у web. Notifier получает тот же
GUEST_INTERNAL_URL и шлёт тот же POST — иначе бренд-строка после истечения возвращалась бы
с опозданием до TTL, а требование AC-6 стало бы невыполнимым НЕВИДИМО.

## Конфиг
`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` — уже в .env.example; `PRICE_POINT_RUB=990`
(гипотеза, DEC-PAY-1). БЕЗ дефолта в проде только ключи; цена с дефолтом — она не секрет.

## Сети ЮKassa
Список подсетей — В КОДЕ (константа с датой снятия из документации), не в env:
вынесенный наружу однажды приедет пустым, а пустой allowlist = «принимать отовсюду».
