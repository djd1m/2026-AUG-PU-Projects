# @course/agent-payments

Private, portable TypeScript ESM library for Node 22+ and PostgreSQL. A product injects
identity, current offers, local fulfillment and optional attribution. The package has
no product/framework imports. First provider adapter accepts YooKassa TEST credentials
only. Publication and real provider acceptance require separate review.

Install this directory independently with `npm ci --workspaces=false`, then `npm run build`.
The compiled package exports the engine, `PostgresStore`, `migrate`, `lockBuyer`, public
contracts and `PaymentError`. Provider and HTTP command adapters have separate exports.
No secret is read at import. `test/reference-host.mjs` is an executable host example;
its PostgreSQL suite exercises two products at different prices without attribution.

```ts
import { Pool } from 'pg';
import { createPaymentsEngine, migrate, PostgresStore } from '@course/agent-payments';
import { YooKassaTestProvider } from '@course/agent-payments/provider-yookassa';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(pool); // migration owner credentials, before serving requests
const engine = createPaymentsEngine({
  store: new PostgresStore(pool),
  provider: new YooKassaTestProvider({ shopId, secretKey }),
  host, // implements HostPort; see src/contracts.ts and test/reference-host.mjs
});
```

The host must construct `HumanContext` only after session, ownership, CSRF and explicit
consent verification. Do not expose `issueGrant`, `createMandate`, `approveOrder`,
revocation or reconciliation as agent tools. Pairing, its one-use token, email delivery,
audience, rate limiting and feature flags belong to the host. `AgentContext` is always
verified against a scoped, expiring hash-only grant inside the engine. Service gateway
credentials do not replace buyer grants.

Offer calculation is authoritative host policy: product, minor-unit amount, immutable
terms, billing-period identity, budget-period identity/calendar, renewal window and expiry.
No default price, grant, financial limit or recurring mandate exists. Trusted human mandate
issuance must bound its validity and limits to the host's allowed policy. Shared buyer
headroom survives new grants and mandates; issuing a mandate can lower but cannot raise
an existing shared cap. Changing calendar requires an explicit future migration, not a
new mandate. Automatic worker schedules are not provided by this library.

`getOffer` persists an immutable quote, `createOrder` prepares attribution without charging,
and `executePayment` requires an active grant, mandate, saved method, unchanged quote,
eligibility, remaining shared budget and a unique resource billing period. Otherwise
an unmandated purchase returns a human approval URL. `approveOrder` permits authenticated
human hosted checkout without an agent mandate, even after the originating grant is revoked.
Only explicit human approval can request saving a method. Raw method references stay in
backend persistence/provider requests and never appear in public order views or events.

Transactions acquire the host's project lock first through `HostPort.lockResource`, then
`lockBuyer`. Financial state, reservations, event insertion and `host.fulfill`/`host.refund`
use the exact same `PoolClient`. Host callbacks must not open another transaction or make
network calls. Write external effects to a host outbox on that client. Role changes must be
restored before returning. The base pool role needs privileges on `agent_payments` schema.
Verified provider identity is durable before fulfillment, so callback rollback can recover
by polling while financial/entitlement effects remain atomic.

All grants/resources for a merchant/buyer share a transaction advisory lock. A period claim
and budget reservation are persisted before a separate dispatch fence. Revocation before
that fence prevents the provider call; revocation after it cannot recall an already accepted
request. One attempt has one permanent fence and one stable provider idempotency key.
The engine never repeats provider create after a fenced attempt, including crash, unknown
outcome or expired PSP idempotency window. A fenced process crash before network delivery
can therefore require manual investigation. Budget remains reserved until verified resolution.
A definitive provider cancellation or pre-fence denial atomically releases only that order's
held budget and owned period claim. A new quote and explicit authorization may then retry
the same period; a canceled order is never resurrected. Ambiguous/fenced unknown outcomes
retain their claims and cannot be replaced.

A provider notification is an untrusted hint. `reconcile(scope, orderId, providerIdHint)`
performs server-side provider retrieval and checks scoped module metadata, account, TEST,
amount, currency and attempt before settlement. A lost creation response without a provider
ID remains unknown until a verified notification/operational lookup supplies one. The
YooKassa adapter does not invent lookup-by-idempotency or blindly repeat create. Host
`metadataFor(request)` can add its own integration metadata; `module_*` keys are reserved.
Refunds are retrieved from the provider, their parent TEST account is verified, and cumulative
refunds are bounded by paid gross. Refund-before-paid triggers verified payment reconciliation.
Late paid notifications never undo refunds. Refunds do not replenish autonomous headroom.

The trusted host may call `abandonUndispatched(client, scope)` inside its existing project-first
transaction. It takes the buyer lock, cancels unfinished orders only when no attempt has a
dispatch fence, releases their own claims/holds, and returns the canceled order IDs for atomic
host bookkeeping. It never cancels unknown or already fenced payments.

Legacy checkout integration must claim or exclude a pending human operation **before** its
PSP call under project-first/buyer lock order. `observeHumanSpend(client, scope, input)`
records verified legacy gross spend and deduplicates source identity; it acquires the buyer
lock but assumes the host already began a transaction and acquired its project lock. It is
not a pre-payment authorization. A separately confirmed extra human purchase needs a new
host-owned entitlement period; agent caps never cap explicit human spending. Do not record
module-owned payments again through this legacy observation API.

`pendingEvents` and `acknowledgeEvent` provide a scoped durable outbox. Consumers should retry
without changing event IDs, deduplicate business effects, handle aggregate versions and
acknowledge only after their own durable acceptance. Public payment, fulfillment and
attribution statuses are independent. A host worker must select paid orders whose fulfillment is pending and call `reconcile`.
The engine retries the original durable paid event on the same transaction client, preserving
its event ID, spend, and version even after outbox acknowledgement. Already-paid reconciliation
does not depend on PSP availability. Callback failure leaves paid/pending durable for another
retry; refunds prevent replay of the earlier entitlement grant. There is no separate
remote-fulfillment receipt command.

Validation:

- `npm test` builds and runs provider fixtures. PostgreSQL tests explicitly skip if no test URL.
- Supply `AGENT_PAYMENTS_TEST_DATABASE_URL` (or `TEST_DATABASE_URL`) to run all PostgreSQL tests.
- `node test/mutation-check.mjs` requires PostgreSQL and fails if a budget, merchant or settlement
  deduplication mutation survives. It changes compiled files temporarily and restores them.
- `node test/extraction-check.mjs` builds a packed isolated consumer and exercises two host
  products against PostgreSQL. It never imports the enclosing repository.

The integration owner supplies an isolated database network and secret environment file;
no test container publishes a database port. Fake-provider tests prove software behavior,
not actual YooKassa TEST saved-method acceptance. No live payment or deployment is performed.
