# billing — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### FR-billing-1
Платёжная способность: серверный пакет `{sku,priceMinor,currency:RUB,credits,unwatermarkedExport}`; стоимость/credits только из доверенного config, без цены клиента. PaymentProvider адаптирован из N6/N4. default mode=off: checkout 503 PAYMENTS_DISABLED, UI говорит «оплата не настроена». live требует merchant key/shopId/testMode, HTTPS origin и явного SKU config; missing config блокирует старт. Fake доступен только unit/integration через injection при NODE_ENV=test, никогда как normal app payment mode. Создание intent идемпотентно; returnURL не выдаёт credits.
US-012: Как владелец, хочу понимать доступность и состав платного пакета.
- [SC-US-012-1] Given off/неполный live config; When checkout/start; Then отключён checkout/отказ startup, денег и entitlement нет.
- [SC-US-012-2] Given тестовый provider и одинаковый ключ; When два checkout; Then один order/remote id; клиент не меняет цену/credits.


### FR-billing-2
Decision: ADR-007 — границы этой способности и обязательные guards.
Webhook — сигнал для повторного запроса к ЮKassa, а не доказательство платежа. Проверять IP через доверенную proxy-chain, provider status, paid, merchant, test mode, currency, amount и metadata.orderId. Один succeeded intent даёт credits и export entitlement однократно в транзакции с event ledger; ошибки провайдера не занимают event key. Частичный/полный refund сигнал не игнорируется: фиксируется, аккаунт блокируется для новых live jobs, paid export отзывается до ручной сверки; автоматический refund API вне scope. Платёжную историю владелец видит в кабинете.
US-013: Как владелец, хочу корректный учёт оплаченного пакета.
- [SC-US-013-1] Given verified succeeded; When webhook replay/concurrent delivery; Then одно начисление и один ledger outcome.
- [SC-US-013-2] Given чужой merchant/amount/test mode/payment linkage; When webhook; Then 400, credits/ledger неизменны.
- [SC-US-013-4] Given verification timeout; When та же delivery повторена с подтверждённым provider response; Then первый503 не занимает event key, повтор начисляет пакет ровно один раз.
- [SC-US-013-3] Given refund.succeeded; When verified event; Then новые live jobs запрещены и export entitlement отозван, audit/history доступны.


### AC-billing-1
Source criterion SC-US-012-1: Given off/неполный live config; When checkout/start; Then отключён checkout/отказ startup, денег и entitlement нет.

### AC-billing-2
Source criterion SC-US-012-2: Given тестовый provider и одинаковый ключ; When два checkout; Then один order/remote id; клиент не меняет цену/credits.

### AC-billing-3
Source criterion SC-US-013-1: Given verified succeeded; When webhook replay/concurrent delivery; Then одно начисление и один ledger outcome.

### AC-billing-4
Source criterion SC-US-013-2: Given чужой merchant/amount/test mode/payment linkage; When webhook; Then 400, credits/ledger неизменны.

### AC-billing-5
Source criterion SC-US-013-4: Given verification timeout; When та же delivery повторена с подтверждённым provider response; Then первый503 не занимает event key, повтор начисляет пакет ровно один раз.

### AC-billing-6
Source criterion SC-US-013-3: Given refund.succeeded; When verified event; Then новые live jobs запрещены и export entitlement отозван, audit/history доступны.

