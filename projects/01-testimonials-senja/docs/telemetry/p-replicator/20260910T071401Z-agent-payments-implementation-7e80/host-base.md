# Host implementation receipt

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT_ID: host
Worktree: /tmp/agent-payments-host-7e80
Commit: 41db26e1548b0b7776225c49c5fa13f8afe44dff
Core dependency tested: 8253f4155f7b536f793a625b7295e6983d2a98df (core isolated package/dist)
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

Enabled manual initiation takes project+buyer lock and checks existing active core orders: returns same human approval URL, no agent grant/mandate required. Otherwise host reserves manual operation before legacy PSP create; host offer/attribution refuses during that reservation. Existing unresolved legacy checkout blocks new autonomous admission. Verified old payment calls standalone generic observeHumanSpend without requiring agent PSP configuration, then clears manual reservation. Confirmed later human purchase remains uncapped and adds a fresh period. Unknown remote result holds reservation and does not create another automatic charge.

## Validation evidence
- Final Next15.5.24 production build PASS; TypeScript+Next page generation PASS; final compile4.4s (whole build wall not separately measured).
- Full apps/web suite: 42 files,836 tests PASS,23.13s, isolated PostgreSQL+MinIO; maxWorkers2/minWorkers1. Final strengthening of bridge native-attribution fixture followed by clean focused12/12 PASS1.31s; production sources unchanged from full pass except no later changes.
- New focused files: agent-payments-host.test.ts8 real-PostgreSQL tests, agent-payments-security.test.ts4 boundary tests.
- tests/agent-payments-mutation.mjs: 2/2 KILLED by assertion (gateway authorization bypass; adding native commission to bridge). Original bytes restored automatically; clean focused12/12 rerun passed afterward.
- git diff --check PASS; complexity router XL expected (approved parent plan); all new source/test files under500 lines.
- Failed earlier attempts retained as caveats: first full test run5 environment failures (MinIO DNS omitted storage network;3 CPU-heavy existing tests timeout with many workers); next run one new fixture envelope failure and then focused fixture column typo fixed. Final full+focused passes above. Initial build Google Fonts DNS failed in sandbox, approved network retry and final build passed. A stalled prettier download was canceled; existing isolated cache formatter used.
- Test runner image node:22.22.0-bookworm-slim, networks proofwall-agent-payments-test_database and proofwall-agent-payments-test_storage. No published ports. Existing test env file used without exposing its values. Port checker reported preexisting proxy ports80/443; no compose stack started and zero new ports requested.
- Local untracked dependency symlinks point only to existing main node_modules and core isolated package; not committed.

Commands (within apps/web): ../../node_modules/.bin/vitest run --maxWorkers=2 --minWorkers=1; ../../node_modules/.bin/vitest run tests/agent-payments-host.test.ts tests/agent-payments-security.test.ts --maxWorkers=2 --minWorkers=1; node tests/agent-payments-mutation.mjs; ../../node_modules/.bin/tsc --noEmit -p tsconfig.json; ../../node_modules/.bin/next build. Integration commands executed inside the isolated runner described above.

## Integration limits
Root must add workspace dependencies, migrate generic package before enabling host and integrate worker/gateway/compose. Host receipt is not browser E2E, independent security review, MCP client conformance, live-provider acceptance or deployment evidence. No real payments, production DB/secrets/deployment or other-project source changes. Root owns remaining release gates. Human unknown legacy payment may require operator reconciliation; no automatic retry after uncertain dispatch. Pairing issuance crash can require fresh pairing; bearer is never recoverable through polling.

## Source hashes
- `projects/01-testimonials-senja/apps/web/src/app/agent-payments/page.tsx` sha256 `21c99f25bc9df2d99970eb1e990eb3939b5e7311f76c9f7731863a5210f89d62`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/commands/route.ts` sha256 `18d63d5b9b184e4344d50c6526973cf2d3c3bc5da3d3b126297c739bc9725f6a`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/human/route.ts` sha256 `edccf7695178b4929a3f34448b8cdba284a6f804b5353347065ab3a81870b8eb`
- `projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/webhook/route.ts` sha256 `9af0b571b2debae47f8f754be448e85664daac3da558676edfe949adfcc6a883`
- `projects/01-testimonials-senja/apps/web/src/app/api/checkout/route.ts` sha256 `3617ae9cfecd533e50b38390c1c1c3660090559437fd0a97b5dd3fd02aea503d`
- `projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts` sha256 `cde2f76b18a692627825eb5009ddb8b1d4fb342ef88ac95c50d721500d0299b8`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/commands.ts` sha256 `b3b5b11bc63177fc0b6aab8da21cbc873cceca94897e5b1a724a342236ae4dec`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/host.ts` sha256 `e68b45d240d2a028685df2d4fee19ecec049b0a78e387ee86a683ce30fa665f5`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/identity.ts` sha256 `aa78c5eda001f7316ff8f5f623a2cc51cb4aca228506f60cf4df540a801e9201`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/legacy.ts` sha256 `fa783e4f35719e0540b77b4f8c0f7e72961fedb4f750c94bab138ddb232dfd74`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/notification.ts` sha256 `cc434cec67815dab6e71a94af5a3ac39ef1a104a8ef932badef4c127b5260698`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/runtime.ts` sha256 `fad00c7c0fc0e58776436a7cc71438afca51ab77e2c26adb94284209f95eba6f`
- `projects/01-testimonials-senja/apps/web/src/lib/agent-payments/security.ts` sha256 `8dba82b58f04142c232c65399bf3132677b75a1020cb8391ffa313730e0d882b`
- `projects/01-testimonials-senja/apps/web/src/lib/n3-payment.ts` sha256 `689ac8d74c615e54f0b9f0565f753e251ca7b55f3aa3b8233205f9abd83a4447`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-host.test.ts` sha256 `d646e2c376b33bfaa0eae9d7a8bf495c0a57d4322439211567cbca16cae1de47`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-mutation.mjs` sha256 `8af1d705502c9fe7211fb894ed7e1acf8d66744c4486917852d665f6c865167d`
- `projects/01-testimonials-senja/apps/web/tests/agent-payments-security.test.ts` sha256 `4a906c13b864e930bc2f476773c0f016793d4d8b57e5552b20830d7ca71f1912`
- `projects/01-testimonials-senja/apps/web/vitest.config.ts` sha256 `068cdc3045abc1bd282528dc48b2b5550c174a6e42402f5f58979b24f1a11a14`
- `projects/01-testimonials-senja/packages/db/migrations/020_agent_payments_host.sql` sha256 `8d2f140c5958034007a0a3ae86300b7df49d0b0d0ce9a9f564379c5a587a5229`

Status: completed
