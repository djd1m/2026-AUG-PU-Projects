# Incoming webhook contract

**Входящие вебхуки:** да
**Отправитель:** YooKassa
**Проверка повторной доставкой:** НЕ ВЫПОЛНЕНА
**Причина:** not-implemented
**Ключ повторности:** object kind + object.id + event
**Источник ключа:** событие-отправителя
**Хранилище ключа:** provider_event object_kind,provider_object_id,event_type и credit_ledger purchase reference
**Механизм исключения:** уникальный-индекс
**Порядок событий:** перестановочен

Подлинность payment события проверяется authenticated GET /payments/{id} и сверкой merchant/order/amount/currency/paid/status; refund.succeeded требует GET /refunds/{id} и связанного GET payment, проверяя refundID/paymentID/status/positive amount/RUB/merchant/order/account; provider не требует HMAC подписи raw-body. Штатный generic check-webhook-contract ожидает signature-only поля, поэтому неподходящий страж нельзя удовлетворять вымышленной подписью. Нужна явная applicability запись плюс настоящие provider-verification/replay/order tests. До реализации runtime check не выполнен.

## Классы отказа

| Класс | Статус | Признак | Лечение | Доказательство |
|---|---|---|---|---|
| подделка | ОТКРЫТ | недоверенный POST | provider GET verification | ожидает tests |
| повтор | ОТКРЫТ | duplicate provider event | unique transaction | ожидает tests |
| перестановка | ОТКРЫТ | late pending/canceled | terminal status monotonic | ожидает tests |

## Financial ordering and retries
Only verified objects can claim dedupe records. Provider timeout/parse failure returns retryable503 with no event marker. Account→intent lock order and unique purchase reference serialize settlement. Verified partial/full refund sets monotonic review/billing_hold; late success does not clear hold or credit an already reviewed intent. Different legitimate purchases on held account remain unspendable, never create effective entitlement/conversion. No refund execution or guessed balance reversal. Hold check covers admission, starts/retries and final cached export authorization; first conversion is account-unique. PAY-01–05/ATTR-03 scenarios are planned, not executed.
