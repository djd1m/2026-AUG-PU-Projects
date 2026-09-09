# Webhook contract — N3a ↔ N1, план до реализации

**Входящие вебхуки:** да
**Отправитель:** N1 Proofwall, внутренний подписанный outbox
**Проверка повторной доставкой:** НЕ ВЫПОЛНЕНА
**Причина:** not-implemented
**Ключ повторности:** event_id
**Источник ключа:** событие-отправителя
**Хранилище ключа:** таблица event_receipts, колонки connection_id и event_id
**Механизм исключения:** уникальный-индекс
**Что подписано:** сырое-тело
**Когда проверяется подпись:** до-разбора
**Сравнение подписи:** постоянное-время
**Окно свежести (секунды):** 300
**Порядок событий:** перестановочен

Контракт описывает проектное решение [ADR-002..004](ADR.md) и алгоритмы [Pseudocode](Pseudocode.md), не исполняемые тесты. `node .claude/hooks/check-webhook-contract.cjs projects/03a-affiliate-rewardful` должен вернуть **2 — НЕ ВЫПОЛНЕНА**, пока handler/tests не написаны. Ниже нет вымышленных существующих test paths.

## Границы доверия

**YooKassa→N1:** N1 принимает payment/refund notifications, проверяет trusted-proxy source IP по актуальным published CIDR, затем canonical object через scoped merchant API **вне транзакции**, сравнивает terminal status, ID, amount/RUB, merchant/mode и local checkout. Никакая HMAC-подпись YooKassa не предполагается. Документация рекомендует проверку статуса/IP и повторяет non200 в течение24h: [официальная инструкция](https://yookassa.ru/developers/using-api/webhooks), checked2026-09-09, «ЮKassa продолжит доставлять уведомление в течение 24 часов.»

**N1→N3a:** N1 — billing authority и единственное место provider credentials/GET. Он подписывает неизменный business event с sanitized ProviderVerification attestation; N3a отдельно проверяет подпись соединения, scope/environment/merchant, immutable identity/amount и согласованность фактов. Недостающий checkout/attribution сверяется через authenticated N1 feed; N3a не читает N1 DB и не копирует YooKassa secrets. Компрометация N1/key — компрометация этой trust boundary: ключ scoped/rotatable, отзыв ставит connection на pause и вызывает сверку.

## Byte contract v1

`POST /internal/v1/n1/{connection_id}/events` принимает `application/json`, raw body≤65536 bytes, read deadline5s. Заголовки `X-N3a-Key-Id`, `X-N3a-Timestamp` (base10 Unix seconds без пробелов/знака), `X-N3a-Signature` (64 lower-case hex). SHA256 HMAC input:

```text
UTF8("n3a-v1\n" + key_id + "\nPOST\n" + exact_path + "\n" + connection_id + "\n" + timestamp + "\n") || raw_body_bytes
```

Ключи запрещают CR/LF и имеют bounded length. `exact_path` фиксирован, без query/trailing slash/redirect normalization. Connection берётся из route, затем проверяется против signed JSON. После bounded header parsing длина подписи проверяется, HMAC сравнивается constant-time; затем freshness±300s; только затем JSON parse/schema. Auth failures одинакового класса возвращают401; durable claim не создаётся. Rate/body/deadline guards стоят раньше дорогих операций, никакого DB connection во время socket read/HMAC/network lookup.

Каждый retry подписывается **новым timestamp**, но сохраняет `event_id`, исходные bytes и occurred_at. Это позволяет доставить очередь после долгого outage; transport freshness не подменяет event time. Ротация key_id имеет ограниченное overlap-окно и scoped connection/environment; секреты не логируются. RegistrationEvent использует тот же HMAC prefix с собственным exact attribution route и свою immutable registration uniqueness.

## Identity, atomicity, time and order

| Identity | Storage / atomic guarantee |
|---|---|
| Transport event | EventReceipt unique(connection_id,event_id); same hash returns existing outcome, changed hash→409 exception |
| Business payment | Payment unique(connection_id,provider_payment_id) + LedgerEntry unique(payment commission); different event UUID cannot mint another commission |
| Business refund | Refund unique(connection_id,provider_refund_id), linked parent payment; unique refund ledger entry |
| Registration | Attribution unique(connection_id,customer_id,project_id) plus immutable registration_payload_hash |

N1 provider verification precedes claim. Billing update and outbox write share **one local commit**; dispatch only after commit, outside it. N3a terminal receipt and ledger posting share one local commit; unavailable N1 reconciliation, auth mismatch or missing parent does not consume a successful receipt. Separate ReconcileException keeps unresolved evidence and permits retry. YooKassa200 waits for N1 local commit only, never for N3a delivery.

Payment occurred_at comes from canonical `payment.captured_at`; refund occurred_at uses canonical `refund.created_at`, explicitly meaning creation time of the subsequently verified succeeded refund. `event_time_basis` names this distinction; missing/invalid/future timestamp is an exception, not replaced by arrival. N1 delivery sequence/cursor orders recovery, not monetary truth. Cancel/nonterminal/older events never roll back a succeeded payment or paid_until. Refund without parent waits/reconciles; partial refunds lock parent, sum amount and reverse the cumulative proportional original commission minus prior reversals, with exact integer rounding and original cap. Event permutations preserve final totals.

Timestamp mapping is a proposed accounting policy, separately reviewed from field availability. [Provider-authored Payment model](https://github.com/yoomoney/yookassa-sdk-php/blob/master/docs/classes/YooKassa-Model-Payment.md), checked2026-09-09, names captured_at «Время подтверждения платежа магазином» and permits null; the repository is archived, so current adapter acceptance must recheck actual API samples. [Current refunds guide](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds), checked2026-09-09, contains the succeeded refund response example. Missing canonical timestamp blocks accounting pending reconciliation; no local arrival timestamp is represented as provider occurrence.

## HTTP and recovery

200 means committed applied/duplicate result with event_id; 401 auth/freshness; 409 identity conflict/dependency_missing; 413 body limit; 422 incompatible verified facts/schema; 429 bounded overload; 503 temporary DB/source failure. No raw payload/secret in error response. Sender retains durable retry with backoff, max attempts per cycle and visible exception, no discard at provider24h limit. Lost ACK or worker crash replays stable identity. A cursor advances verified watermark only when missing ranges are resolved, not just counted.

N1 outbox preserves RegistrationEvent and BusinessEvent separately typed; N3a payments with unsynced attribution wait instead of minting commission to a guessed partner. Before activation cutover manifest prevents N1 legacy writer creating a second debt. After restore financial paths remain gated until receipts/outbox/frozen registry and manual transfer evidence are reconciled; no automatic transfer replay exists.

## Классы отказа

| Класс | Статус | Признак | Лечение | Доказательство |
|---|---|---|---|---|
| подделка | НЕ ВЫПОЛНЕНА | Чужой raw payload/merchant может создать комиссию | Raw HMAC→freshness→parse→attestation/scope→claim; YooKassa отдельно проверяет N1 | Planned: tampered bytes/time/key/scope then valid same-ID delivery; assert0 then1 commission; fixture path not created |
| повтор | НЕ ВЫПОЛНЕНА | Retry/ACK loss или разные event IDs дают двойной долг | Atomic receipt plus independent unique business IDs and linked ledger, restart-safe store | Planned: two concurrent PG sessions, same event and new event IDs, restart/ACKloss; assert one commission; fixture path not created |
| перестановка | НЕ ВЫПОЛНЕНА | Refund-before-payment, canceled-after-success, partial refund order меняют итог | Parent wait/reconcile, immutable succeeded facts, cumulative refund lock/formula | Planned: all permutations + full refund+close race; final reversal equals original once, no rollback activation; fixture path not created |

Реализация должна добавить реальные tests и mutation checks, проверяющие ровно эти эффекты, затем заменить planned evidence и выполнить gate. Для concurrency нужны независимые DB connections/barrier и честный параллельный dashboard/login при насыщении; последовательный replay не доказывает разделяемый ресурс. Наличие этого Markdown не закрывает классы отказов и не доказывает external sandbox acceptance.
