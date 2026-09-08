# Аудит кандидатов переиспользования Proofwall

Read-only source audit, 2026-09-08. Это не запуск sandbox/production и не полное security review соседнего проекта. Исходники project01 не менялись.

| Компонент | Наблюдение | Решение N3 |
|---|---|---|
| resolveAttribution | explicit promo перед cookie, невалидный непустой promo не откатывается к cookie | Переиспользовать проверенную семантику; N3 дополнительно отвергает пустой явно переданный promo по контракту |
| convertAttributionOnPayment | выбирает только pending attribution и переводит в converted | Не переносить как recurring engine: N3 каждый новый payment id обрабатывает независимо |
| Размер комиссии | decimal Number / toFixed(2) | В N3 integer minor units и cumulative refund rounding; не копировать float |
| Payment webhook | event type + object id как business identity; provider fetch внутри withService transaction, исключение на unavailable откатывает claim | N3 verified provider check вне transaction; не переносить router целиком |
| Beneficiary metadata | accountId читается из webhook body metadata, remote result используется для paid/status/amount | F2 должен связывать remote canonical metadata/account с локальной payment identity; входящее тело не authority |
| Outgoing payouts / split | Прочитанные функции принимают оплату и начисляют комиссию | Наличие этого кода не доказывает исходящие выплаты или marketplace split. Отдельные adapters по документации |

Нужные N3 дополнительные contracts: renewal, partial/refund-before-payment, refund-after-sent, cash vs credit, source-version registry approval, competing allocations, tenant/subject grants. Общие инварианты проверяются F1 на fixtures; реальная YooKassa интеграция оценивается по отдельной capability matrix.

## Проверенные исходники / SHA256

- `projects/01-testimonials-senja/apps/web/src/lib/referral.ts`: `86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664`
- `projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts`: `3c63377a6277040a72df7cd62edc107288bd22da1114cf3d2c49417551d190e3`
