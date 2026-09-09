# Identity fixes and payment integration review

RUN_ID: 20260909T085312Z-f2-auth-payments-agents
Workunit: payment-security-review (read-only)
Observed UTC: 2026-09-09 09:12:06.
Project: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/03-affiliate-rewardful
No root/database writes. Receipt is the only created file.

## Identity follow-up

Earlier identity expiry reproduction now returns `UNAUTHENTICATED` and executes ROLLBACK. Final freshness guards are present in me/changePassword/invite/acceptInvite/mintAgent, including invitation expiry. Durable auth_attempts cleanup, expiry index, 10000-key capacity and atomic advisory-lock admission are present. HTTP rate map now rejects new keys at2048 after reclamation. Those earlier source-level blockers are resolved. SQL race/capacity regression evidence remains integration-owned.

## Payment blockers

1. **Runtime import cycle prevents startup.** `shared/payments/service.mjs:2,7` imports postgres and exports paymentMigration; postgres imports infrastructure/schema, which imports paymentMigration from the service (`shared/infrastructure/schema.mjs:1,42`). `shared/application/index.mjs:1` imports this service first. Reproduced with `node --input-type=module -e "await import('./shared/application/index.mjs')"`: ReferenceError Cannot access 'paymentMigration' before initialization at schema.mjs:42. Move migration into dependency-free payments/schema.mjs; have infrastructure/schema import it directly. Verify real module import/startup, since syntax/build checking does not execute imports.

2. **Retry can create a payment under a different shop than the persisted order.** `shared/payments/service.mjs:51-52` checks only input hash on existing order; `:67-74` calls currently configured shop and binds response while comparing only orderId/amount. Persisted shop is not checked before that outbound effect or final binding. Reproduced using actual service and adapter with controlled SQL/fetch substitutes: existing order shop123456, config shop654321, same key/input yielded `{persistedShop:"123456",activeShop:"654321",providerCalls:1,bindingSucceeded:true}`. A retry after shop rotation can create another remote payment while storing its binding under old shop; webhook filtering then rejects it. Require order.shop_id===config.shopId before all outbound create/replay paths and returned recipientAccountId===persisted shop at binding; persist/check test mode as part of immutable provider identity. Test changing provider config on an ambiguous existing order produces zero outbound calls and a reconciliation error. Existing old-shop history can remain readable through status without becoming new-shop retry authority.

3. **Payment methods omit the late-expiry protections just added to identity.** `shared/payments/service.mjs:34-41` resolves session then waits for tenant/query before returning order details; `:47-64` can create/replay order after tenant wait without fresh expiry check; `:68-75` resolves again after network but waits for order lock before returning without a final freshness check. New `identity.fresh` is private and not used here. Reuse a shared expiry assertion around these protected transactional writes/publications, especially before committing the initial order/outbound-call authorization and before returning cached/provider results. Reauthentication after provider call is already present and correctly protects logout/password rotation; preserve it. Add clock/lock expiry tests analogous to the confirmed identity regression. This finding is based on source path inspection, not a PostgreSQL timing test.

4. **Fixture event quota permanently blocks real refunds/payments after2000 records.** `shared/domain/events.mjs:61` unconditionally rejects when payments.length+refunds.length reaches2000, including real state, while checkout allows5000 durable orders (`shared/payments/service.mjs:58-59`). Once threshold is reached, additional verified refund/payment webhooks roll back429 on every retry; immutable history cannot be deleted to recover safely. Direct domain reproduction with mode real and2000 prior refund records returned `{mode:"real",eventCount:2000,code:"DEMO_LIMIT",status:429}` for a new confirmed YooKassa refund. Restrict demo quota to fixture state. Any real operational capacity policy must stop new order admission before capacity pressure and preserve ingestion of refunds for already-created payments. Add a boundary regression covering a verified refund above the fixture threshold.

## Plan challenge and inspected invariants

The order is committed before provider create; the network call runs outside transactions. Webhook authenticates/read-backs through the existing adapter before any order/event mutation. Saved order supplies tenant, recipient, amount and policy id. Webhook compares bound ID/amount/shop/test, then takes tenant lock and applies original payment plus refund in one transaction; this supports refund-before-payment and shared ledger serialization. Frozen policy id is passed to domain event evaluation. The23-hour retry guard fails closed before the documented24-hour provider idempotency window. No additional concrete flaw was found in those inspected branches. The four blockers above prevent acceptance of this source snapshot. Adapter itself was not re-reviewed; its normalized result contract was read to assess integration.

## Snapshot SHA256

```
0af995dd5d86d3d2b31e5f202ca0b64d1eb198f161f254baa8e0177c68f64bf4 shared/payments/service.mjs
222a638b7d7d1ae8149dd6dfd6060337519f3a32fd2775f1e3342934f8f4d561 shared/domain/events.mjs
ae0d6dd4b6f3a3bf4d55eba18502896a81395b4dea21bc3e65be0e0b50cfe41c shared/infrastructure/schema.mjs
d7d55823835d5af9df1abdfce85a0280c6005f76a4f0fb30e0a36c9914b9fdd6 shared/application/index.mjs
3b29714d575573c4a747e3b87c515be8be956e819905d5fba35f91597f02978d shared/identity/service.mjs
c4963bf20634184689405d0c7d866c74fd0572e37ad12e11727f85f6643f2e89 shared/identity/schema.mjs
dd958e0dd6618f909fc7c083e7f25272383a4acaadb1d2965a7570cb494a77f2 apps/api/http.mjs
```

Evidence is direct import failure plus controlled query/fetch/domain reproductions; no live provider calls or database modifications. Actual model/effort, usage/cost and elapsed time are coordinator-owned/unavailable here. No delegation/fallback.
