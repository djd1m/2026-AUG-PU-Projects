# billing — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-012-1: Given off/неполный live config; When checkout/start; Then отключён checkout/отказ startup, денег и entitlement нет.
- SC-US-012-2: Given тестовый provider и одинаковый ключ; When два checkout; Then один order/remote id; клиент не меняет цену/credits.
- SC-US-013-1: Given verified succeeded; When webhook replay/concurrent delivery; Then одно начисление и один ledger outcome.
- SC-US-013-2: Given чужой merchant/amount/test mode/payment linkage; When webhook; Then 400, credits/ledger неизменны.
- SC-US-013-4: Given verification timeout; When та же delivery повторена с подтверждённым provider response; Then первый503 не занимает event key, повтор начисляет пакет ровно один раз.
- SC-US-013-3: Given refund.succeeded; When verified event; Then новые live jobs запрещены и export entitlement отозван, audit/history доступны.
