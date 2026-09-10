# Host implementation receipt

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: host
Worktree: /tmp/agent-payments-host-7e80
Base commit: 41db26e1548b0b7776225c49c5fa13f8afe44dff
Follow-up commit: 262bf25d1c832fda630641773d0e260392cae51a
Core dependency tested: 043d7a1eb7c9bd67d0406a5ba41b4959bf44b2c6 (core isolated package/dist; includes prior8253f41)
Completed UTC: 2026-09-10T08:34:06.722666+00:00
Profile: compact-quality-first-v2, XL approved parent plan.
Requested/actual model: inherited executor; exact serving model and effort metadata unavailable within this work unit. Coordinator delegation record is authoritative. No model fallback requested.
Measured usage/cost: null (no provider counters exposed). Work-unit elapsed/active time: null (no local start timestamp captured; coordinator delegation timestamp is authoritative). No savings claim.
Telemetry owner/path: coordinator; projects/01-testimonials-senja/docs/telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/.

## Implemented and frozen HTTP contract
POST /api/agent-payments/commands receives exactly {command,input}; success is direct core JSON, errors {error:{code,message}}.
Header x-agent-gateway-key compares AGENT_GATEWAY_SECRET (minimum32 characters) in constant time; scoped commands also require Authorization Bearer base64url43.
- buyer_link_start: {displayName,audience} -> {pairingId,pollToken,approvalUrl,expiresAt}. Expected audience AGENT_PAYMENTS_AUDIENCE or proofwall-agent-api. 10 starts per600s per trusted x-agent-client-key SHA256 bucket, conservative gateway fallback.
- buyer_link_status: {pairingId,pollToken} -> {status:pending|approved|expired}. 120 polls per60s, including invalid tokens; never returns bearer.
- offer_get: {productId} -> QuoteView; productId proofwall-paid-30-days.
- order_create: {quoteId,requestKey} -> OrderView, maps requestKey to core idempotencyKey.
- payment_execute: {orderId,mandateId?} -> OrderView.
- order_get: {orderId} -> OrderView.
Agent scope comes exclusively from core bearer. Money/core state remains @course/agent-payments owned.

Human page /agent-payments and /api/agent-payments/human require valid existing session for data/actions; mutating requests require exact Origin and session-bound HMAC x-csrf-token. Pairing one-use10min; grant24h displayed only in approval response/page, hash persisted by core. Nonreferred email proof uses dedicated session/email-bound one-use24h token; referred proof uses existing N3 functions. Pairing and financial mandate/assisted purchase consent are distinct. Mandate is fixed99000 RUB/30days, last3days, monthly99000 Moscow, max90days. Old auth routes unchanged.

## Ownership and cutover
Feature disabled unless AGENT_PAYMENTS_ENABLED=true. New provider uses only AGENT_YOOKASSA_TEST_SHOP_ID + AGENT_YOOKASSA_TEST_SECRET_KEY starting test_. Point that TEST shop webhook at /api/agent-payments/webhook. This dedicated endpoint fetches verified refund/payment metadata with agent shop credentials and passes trusted identity hints to core for complete amount/account/TEST/order/attempt validation.

New core order owns provider settlement, generic ledger/reservations/method/grant/mandate and core events. Host agent_payment_orders uniquely maps core order -> optional n3_checkout_intents invoice -> provider id -> existing checkout session. Old metadata cannot hijack a pre-existing checkout: host refuses LEGACY_PAYMENT_OWNED. Existing bridgeNotification delegates module metadata to core; direct old human native/bridge reducers retain old orders.

Physical transaction lock order is project, then legacy intent/checkout as applicable, then shared core buyer lock during legacy observed ledger; core lockResource acquires project before core buyer. Fulfillment/refund receives the exact supplied PoolClient; role temporarily app_service for local work, resets before returning to generic core. No network inside fulfillment. Tariff is applied via existing applyTariffUpgrade. Bridge outbox exclusively enqueueN3; native conversion excluded for bridge and tested with an available valid native attribution. Local cumulative refund review preserves unrelated purchased periods.

Enabled manual initiation takes project+buyer lock, invokes core abandonUndispatched to cancel unfenced preparations and releases their mapped N3 invoices, then coalesces only remaining accepted/fenced active orders through the human approval URL. No agent grant/mandate is required. Otherwise host reserves manual operation before legacy PSP create; host offer/attribution refuses during that reservation. Existing unresolved legacy checkout blocks new autonomous admission. Verified old payment calls standalone generic observeHumanSpend whenever the generic ledger schema exists, including while issuance is disabled and without requiring agent PSP configuration, then clears manual reservation. Simulated PAYMENTS_STUB checkouts do not create monetary spend and release only their matching hold. Confirmed later human purchase remains uncapped and adds a fresh period. Unknown remote result holds reservation and does not create another automatic charge.

## Final validation evidence
- Full apps/web suite: 43 files,844 tests PASS26.03s in isolated PostgreSQL+MinIO, maxWorkers2/minWorkers1. After the final pure HTTP response helper split, clean focused17/17 PASS3.15s and Next production build PASS (compile4.8s); TypeScript PASS.
- agent-payments-host.test.ts8, agent-payments-compatibility.test.ts5, agent-payments-security.test.ts4. Compatibility regression tests cover expired and revoked-grant preparations, real native canceled webhook→manual retry, disabled-mode observation+query-verified current-bucket history import+autonomous budget refusal while manual checkout remains allowed, legacy simulated checkout, and bounded query-only reconciliation after issuance is disabled.
- Two host mutations KILLED by assertions: bypass gateway credential; apply native commission on bridge. Original source restored. Prior base receipt preserves the earlier validation chronology; no test or threshold weakened.
- Earlier follow-up integration failures: SQL UUID/text inference and schema visibility under app_service; both repaired and all17 focused then all844 suite passed. Final response-helper split removes Next imports from worker-reachable domain modules.
- git diff --check PASS; complexity XL remains approved; every new code/test file <500lines.
- Full run command inside existing isolated node:22.22.0-bookworm-slim runner: ../../node_modules/.bin/vitest run --maxWorkers=2 --minWorkers=1. Networks proofwall-agent-payments-test_database and proofwall-agent-payments-test_storage; zero published ports, test env file values never exposed.
- Focused: ../../node_modules/.bin/vitest run tests/agent-payments-host.test.ts tests/agent-payments-compatibility.test.ts tests/agent-payments-security.test.ts --maxWorkers=1 --minWorkers=1. Mutation: node tests/agent-payments-mutation.mjs. Types: ../../node_modules/.bin/tsc --noEmit -p tsconfig.json. Build: ../../node_modules/.bin/next build.
- No host DB resets; migration020 and package migration applied only to dedicated test DB. Untracked local dependency symlinks are excluded from both commits.

## Follow-up reconciliation and rollout policy
POST /api/agent-payments/reconcile accepts exactly JSON{} and x-agent-gateway-key=AGENT_GATEWAY_SECRET, no buyer scope/bearer inputs. Returns only {scanned,completed,pending,failed}. Fixed max5 concurrent query-only operations, fair last_reconciled_at ordering, candidates must have persisted dispatchedAt and be pending/unknown/action_required or paid with pending fulfillment. Engine.reconcile is the only operation; no approve/create/execute. Cancellation cleanup follows project→mapping/invoice locks. Root worker may poll30s with60s timeout.

AGENT_PAYMENTS_ENABLED gates new issuance/commands/human approvals. Reconciliation endpoint and dedicated /api/agent-payments/webhook continue settling already-owned attempts after issuance is disabled. They still require configured TEST PSP credentials; no live key accepted. Existing old webhook delegates matching module metadata, so old reducers do not take ownership after disable.

Historical shared-budget import runs before agent offer/admission. It finds current Moscow accounting-month completed legacy checkout plus server-recorded payment.succeeded event, excludes module-owned payments and already observed sources, and query-verifies each missing PSP gross/id/account/status/currency using legacy PSP credentials OUTSIDE the transaction. It then imports with generic observeHumanSpend under project+buyer locks. No amount or date is trusted from inbound notification JSON, no old price inferred from currentprice, no cap is applied to humans. More than100 missing historical facts or unverifiable history blocks agent admission for explicit reconciliation. Accounting month is the server's verified settlement receipt timestamp processed_at; historical provider capture timestamps were not persisted and are not invented. This limitation is disclosed to root for final product/release evaluation.

## Integration limits
Root must add workspace dependencies, migrate generic package before enabling host and integrate worker/gateway/compose. Host receipt is not browser E2E, independent security review, MCP client conformance, live-provider acceptance or deployment evidence. No real payments, production DB/secrets/deployment or other-project source changes. Root owns remaining release gates. Human unknown legacy payment may require operator reconciliation; no automatic retry after uncertain dispatch. Pairing issuance crash can require fresh pairing; bearer is never recoverable through polling.


Final amendment UTC: 2026-09-10T08:50:09.209277+00:00

## Source hashes
- `projects/01-testimonials-senja/apps/web/src/app/agent-payments/page.tsx` sha256 `21c99f25bc9df2d99970eb1e990eb3939b5e7311f76c9f7731863a5210f89d62`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/commands/route.ts` sha256 `e5d156d7df25f5b8c807daf2433dd43bf80dfdd976efd3df6b661ae7bea11a65`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/human/route.ts` sha256 `ad427b6792029955efeede645d712a235b1b13194a1adad40a3b8e9c04339b67`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/reconcile/route.ts` sha256 `8b30045841ccf34c4c29ff7c5d14d2335d6e95deb87ea605de3b2176a65d5452`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/webhook/route.ts` sha256 `acfb68f3940746b078fe91892da3301657cb9e9f1a134a855e9c4ca71c67f9ba`
- `projects/01-testimonials-senja/apps/web/src/app/api/checkout/route.ts` sha256 `c69ee75f4804780012d8133398420562ff2051cc200af3e7f2ac453d261414ea`
- `projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts` sha256 `b9fdfc777eb8337eccff19d7a747a4ba5005dffb29dc3a3766dd7bba131ec9f4`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/commands.ts` sha256 `b3b5b11bc63177fc0b6aab8da21cbc873cceca94897e5b1a724a342236ae4dec`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/history.ts` sha256 `18c88d2f7f986522c58e352e365a511117c4c8592296d4848cf771c7803c0442`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/host.ts` sha256 `a604e038a1519b83e3ae9e9c054e9a2c24506daac3656818d5756114b4b73c21`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/http.ts` sha256 `7c7a514cd1563a0c5261a0add6a841ddba886c55e33e70e11e4d93989746c551`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/identity.ts` sha256 `aa78c5eda001f7316ff8f5f623a2cc51cb4aca228506f60cf4df540a801e9201`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/legacy.ts` sha256 `0af5d461e0fcbfc06d2623d89a25f5443086f7fc96218badcfd88af066c36e41`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/notification.ts` sha256 `c001cd80cd9c1f3f3830ef9899486cc81cdb57a3b27eb0e28adda7277c4372ca`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/reconcile.ts` sha256 `4e9e54dc30984448c070c8bc0ec8b0c8f0c2ab95555cefc2fa651b8468895089`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/runtime.ts` sha256 `14ba7acf351a9fe1b92555787468f27602b3b3fe368bba27c65f6ad56b6e6fe0`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/security.ts` sha256 `f85fa6d4b472ef638cd6c209888f66a67a981650fcf83c71ba48eace079cf69f`
- `projects/01-testimonials-senja/apps/web/src/lib/n3-payment.ts` sha256 `218e4e7298576658e1ec88a6f345b64b53e7df8cf31270ce7259f859677c8959`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-compatibility.test.ts` sha256 `4d529a24464a2143cb74086e99a6b6269cce705316feaac6782469d0f7a2fa59`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-host.test.ts` sha256 `7d76e8193837582c3569857c5bfb5ea018bb68fabfd8c630af674fe1d68c68c0`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-mutation.mjs` sha256 `8af1d705502c9fe7211fb894ed7e1acf8d66744c4486917852d665f6c865167d`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-security.test.ts` sha256 `4a906c13b864e930bc2f476773c0f016793d4d8b57e5552b20830d7ca71f1912`
- `projects/01-testimonials-senja/apps/web/vitest.config.ts` sha256 `068cdc3045abc1bd282528dc48b2b5550c174a6e42402f5f58979b24f1a11a14`
- `projects/01-testimonials-senja/packages/db/migrations/020_agent_payments_host.sql` sha256 `eec47ee5682580ca619922a17c27c64bc7c059f6f6e157b3bfe537dfd9fe2008`

Status: completed
