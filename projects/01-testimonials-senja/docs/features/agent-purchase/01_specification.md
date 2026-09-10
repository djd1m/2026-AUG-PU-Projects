# Specification — agent-purchase

User approved plan and modular architecture; explicit nonregression requirement added 2026-09-10.
Source: [plan](plan.md), [module architecture](modular-architecture.md).
Scope: first YooKassa TEST adapter, assisted purchase and bounded renewal. CloudPayments/ACP/UCP and central service are later extensions.

US-001: As a buyer using an agent, I want controlled purchases without surrendering unrestricted payment authority.
US-002: As a product developer, I want an extractable module and unchanged human checkout.

### AC-agent-purchase-1 — Переносимость

SC-US-001-1: Given independently installed module and two reference hosts with different products, when running contracts/build/tests, then no Proofwall/N3 imports or merchant secrets are required and product amounts remain host-owned.

### AC-agent-purchase-2 — Полномочия

SC-US-001-2: Given buyer linking in authenticated human UI, when explicit consent is submitted, then scoped expiring agent grant is issued; missing, expired, revoked, foreign or wrong-audience credentials cannot read or mutate another buyer order. Pairing is one-use, CSRF protected and rate-limited.

### AC-agent-purchase-3 — Поручение

SC-US-001-3: Given a valid agent grant alone or a saved payment method alone, when autonomous execute is requested, then no provider call occurs. Explicit human mandate binds merchant, buyer, resource, product, currency, terms, validity and amount/period limits; agent input cannot widen it.

### AC-agent-purchase-4 — Подготовка

SC-US-001-4: Given authorized verified buyer and owned resource, when preparing purchase, then server snapshots current price and expiry, resolves required attribution before checkout and creates no charge. Modified, expired or foreign quote refuses execution.

### AC-agent-purchase-5 — Первая покупка

SC-US-001-5: Given no autonomous mandate, when agent requests payment, then response requires authenticated human confirmation and provider-hosted payment; browser return or agent claim never marks paid. No PAN/CVV/OTP or raw saved method appears in tools or logs.

### AC-agent-purchase-6 — Повтор

SC-US-001-6: Given saved method plus valid mandate and grant, when renewal falls within authorized window, then provider receives one scoped request; changed price, terms, currency, resource, mode or account blocks it. P1 policy is 99000 minor RUB, 30 days, last 3 days, at most 99000 per calendar month Europe/Moscow, max 90 days consent.

### AC-agent-purchase-7 — Конкуренция

SC-US-001-7: Given concurrent agents or UI attempting same resource billing period using distinct keys, when dispatched, then no duplicate renewal occurs; all grants/mandates share persisted budget. Same key/different payload conflicts, revoke before fence prevents dispatch, restart or lost response holds reservation for reconciliation.

### AC-agent-purchase-8 — Расчёт

SC-US-001-8: Given verified matching PSP success, when webhook/poll/replay arrives, then payment/financial ledger/outbox and local entitlement commit once. Forged shop/mode/amount/status cannot settle. Unknown result cannot create fresh charge, cancellation of MCP/A2A task cannot cancel accepted payment.

### AC-agent-purchase-9 — Рефералы и возвраты

SC-US-001-9: Given successful order and optional attribution adapter, when N3 unavailable or partial refund repeated/out of order, then paid status persists, durable delivery retries, one cumulative correction is sent, another paid period is preserved and refund does not refill budget.

### AC-agent-purchase-10 — Транспорты

SC-US-001-10: Given target configured MCP SDK client and A2A client, when offer/order/execute/status commands are called, then both use same backend policy and persisted state; restart/replay returns same order. Gateway has no database or provider credential and never grants buyer authority itself.

### AC-agent-purchase-11 — Человеческий CJM

SC-US-001-11: Given existing human users with agent feature disabled or enabled, when signup/login/email proof/manual checkout/refund/partner dashboard run, then no agent linking or mandate is required and existing outputs remain compatible. Browser E2E covers P1→N3 A–D; P2 sources/deployment unchanged and smoke remains available.

### AC-agent-purchase-12 — Изоляция и выпуск

SC-US-001-12: Given TEST deployment, when compose/security checks and agent UI E2E execute, then no public database port or default secret exists, project networks remain separate and live charging is refused by new adapter. Real TEST saved-method purchase is a separately recorded provider acceptance step; mock tests cannot claim it.

