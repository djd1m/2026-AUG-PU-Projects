# Canon — Proofwall native billing to N3

Approved2026-09-09; existing Proofwall shop is TEST (owner confirmation). Native checkout/webhook URL stay Proofwall; project02 untouched. No production charge or webhook reconfiguration. Existing partner actor cb8662f3-8deb-494a-a220-e27fbbebf354 identifies target N3 tenant, to be resolved server-side without logging personal data. Do not mix03a educational work.

## Wire contract

N3 origin https://n3-a.212.192.0.33.sslip.io; Proofwall https://proofwall.aicoding.space. Private API uses POST JSON and Authorization: Bearer43base64url connector key, refuses browser Origin. No user-supplied origin/tenant/beneficiary/policy/amount. Every successful response uses HTTP200 {data: result}; errors use {error:{code,message}}. Proofwall validates returned UUID/orderId, expected amount99000/currencyRUB/testModetrue before provider creation.
- Existing POST /api/integration/customers: {customerId,email,emailVerified:true,visitToken?,promoCode?}; trusted Proofwall account UUID and service-only proven email. Same customer id remains immutable. Explicit valid promo beats cookie; invalid explicit promo refuses, no fallback. Native Proofwall attribution uses different cookie/table and cannot produce duplicate local commissions for N3-managed orders.
- NEW POST /api/integration/external-orders: {customerId,amountMinor,idempotencyKey}; returns {orderId,status,testMode,amountMinor,currency:'RUB'}. Amount from server tariff99000minor. N3 reserves durable order/attribution/policy without calling provider. source remains connector, external boolean distinguishes ownership; command_key namespace external:. Retry same invoice same order; mismatch409; literal5000orders/tenant cap; existing retry allowed at cap. Test config must match target tenant/shop.
- Proofwall persists own authenticated project/account/invoice BEFORE remote IO, reuses stable invoice UUID as YooKassa idempotence key. Create remote payment retains metadata.project_id and adds metadata.order_id=N3orderId, metadata.proofwall_invoice_id=localUUID. Save returned provider id through trusted mapping. No second charge if response lost; after23h unresolved intent requires reconciliation, never blind new create. Repeated browser request uses persisted request key; explicit new paid-period purchase gets new key. Serialize or reuse an unresolved intent to prevent UI retries becoming multiple purchases.
- NEW POST /api/integration/external-events: {orderId,event:'payment.succeeded'|'refund.succeeded',objectId}. N3 authenticates connector and order BEFORE provider IO, independently GETs provider object(s), checks shop/test/RUB/amount/payment metadata/order linkage/status/timestamp; reauthenticates after IO and inside final account→tenant→order transaction. Refund must bind same payment. No claimed amounts or email metadata used. Returns {accepted:true,orderId} only after durable acceptance; transient verification failure/nonfinal status retries. Mismatched/foreign/legacy/nonexternal order refuses. Duplicate fact changes neither commission nor balance. Public provider webhook may apply valid external orders via same verifier/domain path.
- Existing POST /api/integration/order {orderId} returns authoritative status, verified,testMode,net/refundedAmountMinor. Browser return URL never proves payment. N3 tests retain separate test/live metrics and exclude test money from payout registry. UI must show test commission/reason even when payable balance0.

## Proofwall proof and delivery

Dedicated service-only verification table keyed account; tokenSHA256, account/email/session-authority binding,24hTTL, one-use, cooldown60s,5/hour/account,30/hour/IP, durable bounded issuance. Link fragment; GET no mutation; explicit POST needs current authenticated account and current session authority; send via existing Resend outside SQL and show honest delivery status. No plain token in logs/storage; pending proof binds existing sessions.token_hash plus account+exactemail, rechecks sessions.revoked_at andexpires_at after locks; password reset/change revoke sessions and invalidate pending proof. Lock account before session/proof. Proof fact persists email ownership after completion; no new accounts.version field required. No second unlinked SSO identity can inherit the account. Cumulative refund correction reuses N3domain cumulative-refund rounding/limits, never independent per-refund rounding. N3program landingUrl=https://proofwall.aicoding.space/n3/start. This dedicated GET receives n3_ref43base64url and canonical n3_ref_expiresISO; validate shape/expiry, preserve an existing unexpired first receipt, set tenant-namespaced host-only HttpOnly Secure SameSite=Lax cookie n3_ref_<tenantId>=token.expiryMs (no arbitrary tenant from request), redirect to fixed registration page on same origin removing query. GET does not bind/signup or mark email verified. N3 revalidates receipt authoritatively. Malformed/expired query cannot overwrite valid receipt or acquire rights. API registration reads this cookie server-side (never trusts body receipt), and saves receipt/promo in service-only signup context atomically with account creation. Optional N3promo is a distinct input from Proofwall native partner_code; explicit invalid N3promo never falls back to cookie.

Proof consumption atomically stores service-only verified fact AND durable customer-bind job keyed account+proof version with immutable signup attribution snapshot. Worker sends existing N3customers endpoint idempotently; outage/crash after proof cannot lose signup, reused token still refuses. Checkout waits for acknowledged customer binding (can trigger retry of same durable job), shows pending delivery when unavailable and does not create a payment until binding and external intent are acknowledged. Account/email/receipt are never reconstructed from a later browser request. New job kinds use unique(kind,businessKey), including signup account/proof and payment/refund object IDs. No general account rewrite or automatic email linking; second unknown Yandex id cannot inherit an existing account by equal unverified email. Existing passwordless unsafe collision path must fail closed.

Native intent/outbox tables service-only unless explicitly owner-RLS scoped. Preserve role boundary: app_service cannot acquire general checkout_sessions INSERT grant. Existing owner-role insertion/recovery uses trusted persisted account mapping. Commit entitlement application and outbox insertion atomically; remote N3 IO outside SQL. Outbox: unique(kind,businessKey),60second leases with random lease token fenced ack, batch10, one nonoverlapping poll every5seconds, max4outbound operations,8second shared deadline/body limit1MiB, exponential retry60seconds capped3600seconds; retain failed jobs visibly, no silent discard/attempt ceiling. Bound pending jobs10000 with explicit admission failure before business mutation; existing retries remain possible. Payment can activate native tariff while N3 is offline; delivery retries later. Early webhook can match persisted intent and must not be permanently acknowledged as unknown before correlation/retry. Delayed callback cannot downgrade completed to pending.

Refunds: provider independently verifies refund and original payment. N3 proportional commission correction idempotent. Proofwall records refund and exposes explicit manual entitlement review for partial/full refund, preserving historical paid period and avoiding silent unrelated-period revocation. Until operator resolves review, refunded purchase is NOT presented as an unqualified successful unrefunded purchase. No automatic refund initiation or bank transfer added. This is explicit refund behavior, not claimed automated subscription proration.

## Deployment and boundaries

ExistingN3access checkpoint is NOT accepted/deployed. Isolate bridge release on deployed authenticated F3referral baseline f8055e3 in a dedicated release worktree/branch; cherry-pick only bridge source/test commits and prove source/build identity with full baseline regression. Current main-branch f3access code remains unaccepted/unreleased; do not cherry-pick it or inadvertently disable current registration. Bridge also tests on main-branch candidate for future compatibility. Do not mark existing owner verified by provisioning. N3verification policy remainsoff unless separately approved after operational readiness. Proofwall verification gates N3customer-bind, not unrelated existing Proofwall functionality.

Both DBs remain separate and backend-only; no shared database credentials or networks joining one DB to other frontend. Only HTTPS bridge calls. Test DBs have no host ports and random credentials. Existing P1host-port test compose is not used for this run; provision separate closed fixture. Credentials in ignored0600secrets, connector key bound to existing owner account version; reset/key rotation requires operator reconfiguration and visible retries. User authorized reusing existing test shop for server verification, never expose keys.

## Algorithms and scenarios

### Algorithm: External intent

REQUIREMENT: `AC-f4-proofwall-integration-1`

Given a verified bound customer and valid connector, when reserving an external invoice, then persist one attributed order without provider creation; replay same invoice reuses it, changed amount conflicts, unknown customer/foreign key refuses.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Verified settlement

REQUIREMENT: `AC-f4-proofwall-integration-2`

Given that external order, when Proofwall submits payment id, then independently fetch and verify provider shop/test/RUB/amount/metadata/paid status before exactly one commission; forged or legacy-order events fail and cannot consume dedup.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Durable corrections

REQUIREMENT: `AC-f4-proofwall-integration-3`

Given paid external order, when refund arrives before or after payment relay and is replayed, then validate original payment and apply payment/refund once, preserve policy and proportional correction; test money never enters payable registry.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Authority across waits

REQUIREMENT: `AC-f4-proofwall-integration-4`

Given key rotation/revocation or contention during provider IO, when result returns, then current authority/order binding is checked under consistent locks; foreign order refuses before network; no SQL held across network.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Merchant contract

REQUIREMENT: `AC-f4-proofwall-integration-5`

Given real HTTPS frontend→Proofwall→N3 path, when signup proof and99000minor purchase complete, then existing partner sees referral registration/test payment/commission; reload preserves evidence; payout balance truthfully remains separate.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Compatible release

REQUIREMENT: `AC-f4-proofwall-integration-6`

Given current deployedN3 and pending access checkpoint, when bridge rolls out, then baseline auth remains usable or prerequisite access gates pass; old payments/refunds, A–D and MCP/A2A regressions pass; databases stay unpublished and scoped; sources/builds/limitations recorded.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

