# Acquisition analytics: требования

Основа: [пакет независимого планировщика](analytics-plan.md) и
[уточнение владельца о Cloud.ru](deployment-context.md). ROUTE: L, новая внешняя
аналитика без изменения денежных операций. PLAN → VALIDATE → IMPLEMENT → REVIEW.

## Product brief

До трафика N5 должен различать визит, регистрацию, увиденный результат и
подтверждённую оплату. Маркетинговые гипотезы описаны в
[исследовании](../../research/acquisition-20261026/acquisition.md) и
[экономике](../../research/acquisition-20261026/economics.md). Код готовится здесь;
настоящий счётчик и проверка отчётов включаются на будущем сервере Cloud.ru в РФ.

US-001: владелец подключает собственный счётчик при запуске без новой сборки.
US-002: пользователь управляет аналитическим согласием; отказ не ломает продукт.
US-003: оператор видит события фактических наблюдений, не выдавая клики за оплату.

### FR-acquisition-analytics-1

Опциональный N5_METRIKA_COUNTER_ID читается на сервере runtime. Только безопасное
положительное целое; отсутствие/невалидность выключает передачу. Без счётчика
N5 работает. В браузер передаётся только публичный ID, не объект окружения.

### FR-acquisition-analytics-2

До согласия нет provider-запросов, аналитической очереди и attribution storage.
Отказ/отзыв останавливает SDK и очищает состояние. Только закрытый pilot UTM
из deployment-context. Ни raw URL/query/hash/referrer, ни PII/медиа/ID сущностей
не передаются. Вебвизор, автособытия и автосбор ссылок выключены; hits ручные,
со статическими категориями путей. Исключённые страницы не обслуживаются SDK.

### FR-acquisition-analytics-3

n5_signup_success только после register и успешного защищённого code.apply,
включая discard-referral продолжение. Login, dummy register200, ошибочный
protected request и повторная отправка не создают ложную регистрацию.

### FR-acquisition-analytics-4

n5_first_clip_ready — первое наблюдение доступного done-клипа в браузерном
scope. Учитываются SSR/первый список и polling; failed/expired/unavailable нет.
Это не гарантия первого результата на аккаунте или доставки файла.

### FR-acquisition-analytics-5

n5_payment_confirmed только по подтверждённому authenticated status response
для того же intent_id со status=succeeded. URL, return mount, paid-план,
pending/canceled/ошибка не являются подтверждением. Intent ID остаётся локально.
Наблюдение браузером неполно; реальные оплаты/возвраты сверяются с ledger БД.

### NFR-acquisition-analytics-1

SDK/network/storage/adblock ошибки не блокируют продукт. Очереди и dedupe конечны,
не обещают exactly-once. Auth/provider/billing/DB и runtime-тарифы не изменяются.

## Критерии и границы

Полные AC1–9 и negative cases заданы в analytics-plan. Сейчас обязательны код,
регрессии, проверка приватности и контейнерные браузерные тесты. Настоящие
события в owner reports — planned для Cloud.ru, не локальный pass.
Нельзя выдавать перехваченный запрос или callback за подтверждённую ingestion.
