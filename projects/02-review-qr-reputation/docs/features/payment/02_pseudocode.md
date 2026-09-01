# Оплата · Алгоритмы

Дословная основа — Pseudocode-OWNER §5 (канон); здесь дельта реализации.

## createCheckout(accountId, plan) — кабинет

```
цена = PRICE_TABLE[plan]            # из конфига процесса; из формы НЕ принимается (AC-7)
idem = uuid()                        # Idempotence-Key ЮKassa: повтор клика — один платёж
resp = POST api.yookassa.ru/v3/payments {amount, capture:true,
        confirmation:{type:redirect, return_url: BASE_URL+"/dashboard?paid=1"},
        metadata:{account_id}}  timeout 10s   # ВНЕ транзакции
INSERT checkout_sessions(account_id, provider_session_id=resp.id, status='pending')
redirect resp.confirmation.confirmation_url
```

## onPaymentWebhook — порядок НЕСУЩИЙ (ADR-009, дефект проекта 01)

```
1. IP ∈ YOOKASSA_NETWORKS (зашиты в код; пустая маска в CIDR — ОТКАЗ, не /0)
2. remote = GET /v3/payments/{object.id}  timeout 5s, ВНЕ транзакции
   - недоступность → THROW → HTTP 500 → провайдер повторит   # НЕ значение!
   - remote.status ≠ event-статусу → HTTP 200, игнор (подделка/гонка статусов)
3. транзакция:
     event_key = event.event + ":" + object.id
     INSERT webhook_events ON CONFLICT DO NOTHING; если конфликт → COMMIT, HTTP 200 (дубль)
     если payment.succeeded:
        cs = SELECT checkout_sessions WHERE provider_session_id=object.id  → account_id
        SET LOCAL app.current_account_id = cs.account_id      # RLS-контекст вебхука
        UPDATE checkout_sessions SET status='completed'
        UPSERT subscriptions(account_id, plan, period_end=now()+30d, status='active')
        UPDATE places SET branding_required=false WHERE account_id=...  RETURNING slug[]
        комиссия: если есть attribution pending и не self → INSERT commissions
                  (uq_commissions_payment_event — вторая независимая гарантия)
4. ПОСЛЕ COMMIT: for slug → POST guest/internal/invalidate/{slug}   # вне транзакции
```

Почему «подлинность ДО заявки идемпотентности»: подделка с угаданным id иначе записывается
первой, и НАСТОЯЩЕЕ уведомление отбрасывается как дубль — оплата не применяется никогда.

## expireSubscriptions — тик нотифаера (раз в час)

```
UPDATE subscriptions SET status='expired' WHERE status='active' AND current_period_end < now()
  RETURNING account_id
UPDATE places SET branding_required=true WHERE account_id IN (...) RETURNING slug
инвалидация кэша по слагам (после COMMIT)
```
