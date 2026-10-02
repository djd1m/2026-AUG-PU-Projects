# Incoming webhook contract

**Входящие вебхуки:** да
**Отправитель:** YooKassa
**Проверка повторной доставкой:** НЕ ВЫПОЛНЕНА
**Причина:** not-implemented
**Ключ повторности:** object.id + event
**Источник ключа:** событие-отправителя
**Хранилище ключа:** provider_event provider_id,event_type и credit_ledger purchase reference
**Механизм исключения:** уникальный-индекс
**Порядок событий:** перестановочен

Подлинность YooKassa проверяется authenticated GET /payments/{id} и сверкой merchant/order/amount/currency/paid/status; provider не требует HMAC подписи raw-body. Штатный generic check-webhook-contract ожидает signature-only поля, поэтому неподходящий страж нельзя удовлетворять вымышленной подписью. Нужна явная applicability запись плюс настоящие provider-verification/replay/order tests. До реализации runtime check не выполнен.

## Классы отказа

| Класс | Статус | Признак | Лечение | Доказательство |
|---|---|---|---|---|
| подделка | ОТКРЫТ | недоверенный POST | provider GET verification | ожидает tests |
| повтор | ОТКРЫТ | duplicate provider event | unique transaction | ожидает tests |
| перестановка | ОТКРЫТ | late pending/canceled | terminal status monotonic | ожидает tests |
