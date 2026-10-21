# N7 A4 — minimal canonical refund-discovery seam

WORK_UNIT_ID: n7-live-refund-seam-plan-a4
TRACE_PATH: /tmp/n7-live-refund-seam-plan-a4-20261007
SourceRevision: 1fb00e49189279159a95e537266cc627ca7ad1d2
SourceRoot: /tmp/n7-mailbox-error-source-20261007
LaunchSHA256: d2ac5eca1723be21726edd1908fb5c55fc083e9300df5de164560b47665d68e8
RequestedModel: gpt-6.1-sol/high; actual model/effort/usage/cost null, host evidence unavailable.
ProvenanceGap: coordinator allocated this launch AFTER followup dispatch; it is not a prelaunch manifest. No prior receipt or launch was rewritten.

Read-only exact dependency clarification. Inspected only frozen projects/07-cold-email-warmup/src/billing/{provider,live,yookassa}.ts plus caller launch metadata. No author history/reasoning, broad research, code changes, keys, network, provider requests, DB or tests. Existing approved A3 business/config/UI scope and XL gates remain unchanged. This delta is next backend integration work after A2 acceptance; it need not invalidate the independently bounded A2 adapter verdict.

## Observed mismatch

CanonicalProvider.fetchRefund(refundId,expected?,paymentId?) returns VerifiedRefund. YooKassaProvider requires expected binding and paymentId BEFORE GET, then does refundGET and internal paymentGET. LiveBillingService.reconcile first fetches payment and then fetchRefund, totaling three HTTP GETs for a known refund. A public refund.succeeded hint has only object.id=refundId, so the existing signature cannot discover its payment binding safely.

Add one narrow optional provider method, its result/lookup types, and one service notification entry. Extract existing reconciliation transaction into a private method, preserving its SQL/state ordering. No new tables, migration, event engine, public apply endpoint or metadata-derived ownership.

## Exact typed seam — provider.ts

```ts
export interface RefundBindingLookup {
  readonly provider: string;
  readonly merchant: string;
  readonly mode: 'live';
  readonly paymentId: string;
}
export type ResolveRefundBinding = (
  lookup: Readonly<RefundBindingLookup>
) => Promise<Readonly<LiveBinding> | null>;

export interface VerifiedRefundContext {
  readonly binding: Readonly<LiveBinding>;
  readonly payment: Readonly<VerifiedPayment>;
  readonly refund: Readonly<VerifiedRefund>;
}

// Add to CanonicalProvider; optional preserves existing non-Yoo test doubles.
fetchRefundContext?(
  refundId: string,
  resolveBinding: ResolveRefundBinding
): Promise<VerifiedRefundContext | null>;
```

An absent method is not a production fallback: LiveBillingService.reconcileRefundNotification fails closed with HttpError503 provider_unavailable and makes zero HTTP/ledger calls. Actual YooKassaProvider implements it. Keep VerifiedRefund semantically verified; never return a partially enriched refund under that type. Existing fetchRefund signature can stay for compatibility.

## yookassa.ts — two GETs at most, canonical context before enrichment

Implement fetchRefundContext(refundId, resolveBinding) using existing id(), request(), amount(), expected(), payment()/fetch() and timestamp validator:

1. Validate refundId with existing UUID guard; bounded GET `/refunds/${encodeURIComponent(refundId)}` under existing configured Basic Auth/fixed API/timeout/response bounds. Validate raw.id==requested ID, raw.payment_id UUID, allowed refund status, exact positive RUB amount and calendar-valid raw.created_at. No tenant/intent/merchant/live claim is derived from notification or raw metadata.
2. Call trusted resolver with `Object.freeze({provider:'yookassa',merchant:this.shopId,mode:'live',paymentId:raw.payment_id})`. These configured provider/shop values come from the adapter, never notification input. The resolver is service-owned DB lookup, not an API callback supplied by the client. If null, return null now: exactly one refundGET, zero paymentGET, zero business mutations. Reads alone do not create observations/intents/grants.
3. Validate returned binding through this.expected(binding), requiring configured shop, yookassa/live/RUB/team and valid immutable intent/amount. Require refund amount<=binding.amountMinor. Perform exactly one `this.fetch(raw.payment_id, binding)` canonical paymentGET. Existing payment parser verifies expected id, recipient.account_id, test===false, metadata.order_id and exact amount/currency BEFORE enriching payment with local tenant/plan/duration. Refunds lack merchant/test fields, so payment verification is mandatory; no “test absent means live” shortcut.
4. Only now freeze VerifiedRefund with raw refund identity/paymentId/status/money and verified configured provider/merchant/live context; return frozen `{binding,payment,refund}`. No second refundGET or paymentGET and no DB transaction/connection lock spans network.

For existing fetchRefund(refundId,expected,paymentId), a minimal compatibility wrapper may call fetchRefundContext with a trusted fixed-binding resolver that returns expected ONLY if lookup provider/merchant/mode/paymentId match expected and the supplied paymentId. Reject null as refund_mismatch/payment_mismatch, never ignore a requested bound refund. Return context.refund. This reuses one parser and preserves canonical checks.

## live.ts — trusted lookup and reuse unchanged transaction

Add `async reconcileRefundNotification(refundId:string)`:

- Require provider.fetchRefundContext support; call it with a service-private resolver issuing exactly parameterized `SELECT * FROM live_billing_intent WHERE provider=$1 AND merchant=$2 AND mode=$3 AND payment_id=$4` using the adapter-provided configured lookup. Return null when unbound; otherwise return frozen existing `binding(row)`. Verify lookup provider/merchant/mode also equal this.price provider/merchant/live before DB lookup, so the configured service and adapter cannot cross merchants. No metadata tenant, no intent creation, no held client or transaction during GET/resolver.
- Null context returns `{ignored:true}` for server200, with no ledger apply. Bound context supplies tenant/intent only from that trusted DB binding. Call the private apply helper with those identities and its already verified payment/refund; no provider calls after discovery.
- Return `{ignored:false,...applyResult}` after durable transaction; provider/DB failures propagate typed retryable failure to server503. Misbinding fails closed with zero business changes. Server is responsible for already-approved exact route/rate/body/concurrency policy; this service method does not parse notification bodies or loosen browser guards.

Extract the PRESENT reconcile transaction without redesign into:

```ts
private applyCanonical(
  tenant: string,
  intentId: string,
  payment: Readonly<VerifiedPayment>,
  refund: Readonly<VerifiedRefund> | null,
  expectedRefundId?: string
): Promise<{state: string; label: string}>;
```

Keep all current behavior inside it: billingTransaction; tenant+intent FOR UPDATE; rederive immutable DB binding; matchesLivePayment against CURRENT payment_id; DB-clock future/paidAt check; refund id==expectedRefundId and matchesLiveRefund; observation writes only after checks; provider+merchant+refund identity dedup; sticky terminal state; permanent revoke; first paid_at/expires_at INSERT ON CONFLICT DO NOTHING including expired first window; UPDATE state. Network never belongs in this helper. It is private: no server/client accepts VerifiedPayment/VerifiedRefund objects from a webhook body. Both notification entry and existing reconcile call this single apply body.

Existing reconcile(tenant,id) keeps one canonical paymentGET→applyCanonical(p,null). For refundId when fetchRefundContext exists, avoid the current first paymentGET: obtain outside tenant-owned intent first, then call context method with a resolver fixed to its trusted binding/payment_id (reject wrong IDs or context instead of ignored), and apply its two snapshots. This gives exactly two GETs for YooKassa known-bound refund reconciliation too. For legacy test CanonicalProvider doubles lacking the optional method, retain their existing fetch/fetchRefund branch before apply; production YooKassa always uses context method. Existing tests therefore need no mass interface rewrite. Public notification path NEVER uses that compatibility branch.

### Typed call graph

```text
server exact admitted refund.succeeded hint(refundId)
  → live.reconcileRefundNotification(refundId)
    → Yoo.fetchRefundContext(refundId, trusted DB resolver)
      → GET refund (raw hint identity/money/time validated)
      → resolver(configured provider/shop/live, canonical paymentId)
        → null: ignored, oneGET, no apply
        → immutable LiveBinding
      → GET payment(binding): merchant/test/id/order/money verified
      → VerifiedRefundContext(binding,payment,refund)
    → private applyCanonical(trusted tenant/intent, snapshots, refundId)
      → existing locked single-grant/sticky-revoke transaction
  →200 only after apply (or honest unbound ignore); failure→503
```

## Ownership delta and acceptance

After A2 acceptance, coordinator transfers explicit ownership of only src/billing/{provider,live,yookassa}.ts to the A3-backend writer for this seam in its isolated accepted-source checkout. Also allow focused additions to tests/yookassa-unit.test.ts and tests/live-billing-integration.test.ts (A2-owned until transfer). Server call belongs to existing A3 src/server.ts scope. No db/017 or src/db.ts changes needed. A2 deadline/fetch review runs independently on its frozen slice; integrate this delta AFTER its acceptance, bind new source hashes and rerun relevant adapter/ledger tests plus type/lint/build/full mandatory gates. Keep original A3 plan/receipt and both immutable launches unchanged. Requested next implementation model/effort stays existing econom Sol6.1/medium20min; independent review Sol6.1/high8min, actual host evidence required.

Required focused witnesses (fake HTTP/isolated PG only): unbound canonical refund performs one refundGET and zero mutation/paymentGET; bound partial/full refund call sequence refundGET→trusted configured-binding resolver→paymentGET, exactly two HTTP calls; trusted resolver never called with notification tenant/merchant; foreign shop/test payment/order/money rejects before VerifiedRefund/observation/grant/revoke; wrong refundId/paymentId/money/status/time reject; response outage/malformed/oversize/redirect preserves zero business effects and releases server gate; existing known-bound reconcile uses two calls too; duplicate notifications/refund-vs-late-success race revoke once and never resurrect, unchanged grant/expiry; original payment-only reconcile/checkout tests remain green. Assert order and call count, not just result; a mutation adding the former prefetch or removing merchant/test check must fail its witness. Preserve optional-method legacy fake tests without weakening actual YooKassa checks.

Status: completed
