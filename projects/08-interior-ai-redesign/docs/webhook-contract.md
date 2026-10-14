# Контракт входящей оплаты N8 — ЮKassa

**Входящие вебхуки:** да
**Отправитель:** ЮKassa
**Проверка повторной доставкой:** ВЫПОЛНЕНА
**Ключ повторности:** provider + kind + object.id
**Источник ключа:** событие-отправителя
**Хранилище ключа:** PaymentEvent(provider,remote_event_key) PostgreSQL
**Механизм исключения:** уникальный-индекс
**Порядок событий:** перестановочен

Повтор проверен offline against actual PostgreSQL transaction/domain handler: 12 concurrent deliveries produce one credit grant/event and 11 duplicates. HTTP ingress source checks tested with actual loopback listener; production provider calls and public delivery have not been performed. Payments default off.

ЮKassa не предоставляет HMAC raw-body signature. Generic checker требует именно подписанный raw body; его exit2 — несовместимость инструмента, не PASS. Provider-specific substitute: source IP из socket.remoteAddress единственного custom ingress до чтения тела, затем authenticated remote API re-fetch фиксированного payment/refund object и immutable order/shop/test/currency/amount/paid/status/metadata proof. Ledger записывается только после проверки; отказ провайдера не занимает ключ. Refund.id отличается от Payment.id, связь проверяется по payment_id.

## Классы отказа

| Класс | Статус | Признак | Лечение | Доказательство |
|---|---|---|---|---|
| подделка | ЗАКРЫТ | чужой source/shop/order/amount/test | socket source + remote object verification before grant | tests/billing/http.test.ts; tests/billing/repository.test.ts |
| повтор | ЗАКРЫТ | 12 одновременных уведомлений | unique event + account→order locks + atomic grant | tests/billing/repository.test.ts |
| перестановка | ЗАКРЫТ | refund до позднего success | monotonic refund hold, no regrant, paid exports revoked | tests/billing/refund.test.ts |

Full regression evidence: docs/telemetry/p-replicator/20261013T202009Z-expanded-cjm-9f69/evidence/final-regression-1.txt (228/228). Independent billing review: docs/features/billing/review.md. Mutation proofs: tests/billing/mutation-evidence/. Закрытие относится к проверенным offline сценариям; не является заявлением о live end-to-end платеже.

Test provider only constructor injection under NODE_ENV=test, forbidden in production. Fake body/returnURL never confirms payment. XFF/Forwarded/user source headers overwritten from socket; loopback/private gateway never provider whitelist. Public deployment requires separately validated TLS/proxy ingress; no live deployment or payment is authorized in this run.
