# N3 template audit: product / tracking

RUN_ID: 20260909T105443Z-template-audit-85c2
WORK_UNIT_ID: product-tracking
REPO_ROOT: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects
PROJECT_ROOT: projects/03-affiliate-rewardful
Scope: independent read-only audit of actual product routes, domain, persistence and UI against coordinator-supplied original /replicate template and explicit subsequent overrides. No source/docs/runtime changes, account creation, provider calls, test execution, deployment or external messages. Only this receipt written. Coordinator owns project telemetry and synthesis.

## Conclusion

The implemented real workspace is a persistent identity/commission-ledger/manual-registry pilot with a verified YooKassa order adapter. It is not yet the original acquisition product's end-to-end click → signup → subscription conversion loop. Real program settings, invitation-based memberships, commission/refund accounting and dashboards exist; the referral URLs and promo codes displayed to real partners are not connected to a public acquisition/checkout ingestion path. This is a scope-gap audit, not a claim that already accepted F1/F2 stages violated their narrower acceptance contracts.

## Eight findings

### PT-01 — High: issued referral link has no tracking destination or click/signup ingestion
Evidence: shared/application/dispatch.mjs:15-22 creates enrollment.referralUrl `/r/${actor.id}`; shared/ui/account/helpers.mjs:83-87 presents it as an absolute real link. apps/frontend/server.mjs:18-37 only proxies API/protocol/health routes, special-cases `/account`, maps `/` and `/join` to index.html, and otherwise requires an existing static file. There is no dynamic `/r/:id` handler. apps/api/http.mjs:60-76 exhaustively routes account/agents/YooKassa/demo/command, then returns404; shared/application/dispatch.mjs:8-84 has no click/signup operation. The real state collections in shared/identity/state.mjs:5-11 contain neither clicks nor referral signup bindings.
Impact: a partner can obtain a plausible-looking URL, but following it cannot record a referral or bring a prospect to a tracked merchant destination. No automatic click → signup → paid conversion funnel exists. Source conclusion; no live URL request was made.
Override: no override supplied authorizes removing the core referral funnel. A–D fixture acceptance explains historical demos, not a completed real acquisition loop.

### PT-02 — High: promo attribution/conflict rule exists in domain tests but cannot be used by a real buyer
Evidence: shared/domain/events.mjs:22-34 chooses explicit promo over cookie and rejects an invalid explicit code without fallback; tests/core-events.test.mjs:34-46 cover that fixture behavior. Real shared/payments/service.mjs:37-39 accepts only beneficiaryId/customerId/amountMinor/kind. It rejects any promo or attribution timestamp field; :85-87 constructs a cookie-shaped attribution from the manually assigned order beneficiary and order creation time. shared/ui/account/app.mjs:378-389 submits those owner-selected fields; shared/ui/account/helpers.mjs:85-86 nevertheless displays a promo code to the partner.
Impact: the independent promo path required to survive loss of browser cookies cannot currently affect real commissions. The tested conflict priority is unreachable from actual buyer onboarding/checkout. The current attribution clock starts at order creation, not the prospect's referral visit.
Override: YooKassa instead of Stripe is authorized; substituting manual beneficiary selection for real attribution was not supplied as a permanent replacement of the template.

### PT-03 — High: recurring commissions are repeated independent payments, without subscription lifecycle/binding
Evidence: shared/payments/yookassa.mjs:338-342 accepts only payment.succeeded and refund.succeeded; :302-317 creates a single redirect payment with order_id metadata. shared/domain/events.mjs:3-4 defines payment/refund fields with no subscription ID; :33 uses a recurring boolean to block subsequent rewarded payments for the same customer/beneficiary when disabled; :36-46 reverses commissions by originating payment. tests/core-events.test.mjs:18-29 calls a second fixture event with a different payment objectId to represent renewal. shared/payments/service.mjs:77-87 requires a locally saved checkout order to establish beneficiary/policy for every accepted payment.
Impact: no persisted subscription state, cancellation/update lifecycle, stable subscription-to-partner attribution, invoice-period relation or subscription-bound clawback is implemented. A real renewal arriving from an existing merchant billing system without an N3 order is ignored or fails order verification. Correctly handling a new independent payment is useful but does not implement the original SaaS subscription loop.
Override: missing Stripe-specific event names is not itself a defect because YooKassa was explicitly selected. The missing subscription business capability is separate from provider choice. Current payment-bound refund accounting is real and is not falsely reported as absent.

### PT-04 — Medium: dashboards expose ledger balances, not the promised acquisition and recurring-revenue metrics
Evidence: shared/domain/projections.mjs:9-22 computes accrued/held/available/allocated/sent/adjustment money; :24-32 returns partner payment rows, policies, transfers and exceptions; :66-73 builds owner ledger/registry dashboard. shared/ui/account/helpers.mjs:50-66 shows balances and payout date; :80-81 labels personal.payments.length as confirmed payments. There are no click/signup/MRR fields in these exhaustive projections or real state collections.
Impact: partner and owner cannot evaluate clicks, signups, unique paying customers, or MRR. Repeated payments increase the displayed payment count and do not establish the template's distinct paying-customer count. Payable-like balances are implemented.
Override: no supplied instruction drops these original dashboard metrics.

### PT-05 — High: generic SaaS self-service launch is reduced to one deployment-admin-configured shop/tenant
Evidence: apps/api/server.mjs:9 loads a single configuration file; shared/payments/service.mjs:8-14 constructs one provider and :31/:43 allows only config.tenantId. docs/f2-operations.md:18-33 states integration is currently unconfigured and explicitly supports one shop plus one real organization per deployment, configured in an ignored file by the VPS owner. :37 describes owner-created orders. Real checkout code :37-54 requires the owner to provide beneficiary/customer/amount; the webhook :77-79 ignores orders not present for that configured tenant.
Impact: another SaaS can register an organization, but cannot self-connect its billing and launch an operating affiliate channel in15minutes. Existing merchant payments are not automatically imported/attributed. Missing credentials are an external acceptance limit; single-shop architecture and absent self-service integration are separate implementation limits.
Override: YooKassa/manual payouts are authorized. Shared core/Docker is authorized. Neither requires a permanent single-merchant deployment. Timing was not measured; do not report a measured setup duration failure.

### PT-06 — Medium: public partner registration/terms journey is replaced by invitation-plus-account organization creation
Evidence: shared/domain/projections.mjs:50-57 advertises enrollmentUrl `/join`, but apps/frontend/server.mjs:29 maps it to a fixture variant index. shared/identity/service.mjs:66-80 always creates an account and new owner organization during registration. Real partner membership only arises via merchant-issued one-use invitation (:123-148), accepted by an already authenticated account (:137). shared/ui/account/app.mjs:294-302 says account and organization created; :353-374 issues and accepts private `/account#invite=...` links. Anonymous public program terms/onboarding are not routed by apps/api/http.mjs/account.mjs.
Impact: a prospective partner cannot inspect and join a specific real published program from a public enrollment URL; the owner must generate a private invitation, and a new partner first receives an unrelated owner organization before accepting it. Registration exists; it is the public role-specific acquisition journey that is missing.
Override: invitation-based F2 was explicitly delivered and documented. Treat as remaining template product work, not proof of a missing identity implementation. F3 email verification/reset/Yandex ID is pending, not implemented and not counted here as done.

### PT-07 — Medium: default hold differs materially from the template
Evidence: shared/identity/state.mjs:8-9 initializes real policies with windowDays30/holdDays7/recurringtrue; shared/ui/account/index.html:1 pre-fills hold7 and window30. shared/domain/common.mjs:42-46 permits explicit hold0–90/window1–365; shared/payments/service.mjs:49 requires publishing the relevant policy before checkout. shared/domain/events.mjs:77 computes availableAt using the chosen hold.
Impact: hold is genuinely configurable and enforced, but an owner accepting the real UI defaults gets7days rather than original30–45days, making commission available earlier. The30day attribution default is within the original baseline;60–90day SaaS guidance was not implemented as a preset, and there is no actual browser attribution cookie to which it would apply yet.
Override: shared/docs/PRD.md:99,111 explicitly leaves production attribution/recurring/hold/cutoff and carry-over after5th for owner approval; hold7 is therefore an implemented pilot default divergence, not a proven breach of an approved production policy. Original hold30–45 and manual payout by5th require a decision such as paying only matured obligations at cutoff. Current shared/domain/registry.mjs:19-20 filters both original payment month and maturity; :34-41 permits preparing a past month with no current-month restriction. Therefore held August obligations can be paid by preparing/recomputing August after they mature; they do not automatically appear in the September-period register. Do not claim funds are lost: old-period preparation is possible. The missing piece is an agreed and surfaced rollover/late-payment policy; no fix is proposed here.

### PT-08 — Medium: real owner UI stops before completion of manual payout bookkeeping
Evidence: shared/ui/account/app.mjs:187-220 only offers approve and CSV export, explicitly stating sent/reconciliation are not entered here. shared/application/dispatch.mjs:35-36 implements registry.sent/registry.reconcile, and shared/application/access.mjs:8-11 permits the merchant to call them directly. docs/f2-operations.md:11 acknowledges API-only sent/reconciliation. shared/ui/account/helpers.mjs:64 nevertheless shows sent totals.
Impact: the user can prepare a real monthly register but cannot record their manual bank transfer or resolve its exception through the real workspace UI; completing bookkeeping requires an API call. Thus manual payouts are not absent in the domain, but the real end-user monthly journey is incomplete.
Override: automatic/bulk payouts were excluded and manual payouts expressly chosen, so absence of auto-payout is not a finding. This is a gap in the accepted manual workflow, not a request for bank automation. Other audit workers may cover reconciliation; deduplicate in synthesis.

## Positive evidence and distinctions that must survive synthesis

- Real account identity/membership/session service is implemented in shared/identity/service.mjs:31-80,94-148, separate from fixture bootstrap. The common `/account` screen is real; do not call the whole application an HTML mockup.
- Provider verification is an authenticated GET through the dedicated YooKassa adapter, with normalized shop/mode/amount/status checks (shared/payments/yookassa.mjs:326-370; shared/payments/service.mjs:71-90). No runtime secret was read. Actual merchant sandbox/live acceptance remains unperformed per docs/f2-operations.md:18.
- Durable atomic deduplication is present: event identity is provider/account/objectId (shared/domain/events.mjs:5,57-60), immutable_facts has composite primary key (shared/infrastructure/schema.mjs:17-20), journal writes new facts (:24-29), and real webhook locks the tenant row within the transaction (shared/payments/service.mjs:75-84). YooKassa business-object IDs are an appropriate provider-specific adaptation; literal Stripe event.id absence alone is not an audit failure.
- Partial and out-of-order refunds preserve original payment and append adjustment entries, with post-transfer exceptions (shared/domain/events.mjs:36-51,62-68,85-91). tests/payment-integration.test.mjs:36-49 covers duplicate and refund-before-payment with an injected provider, not live YooKassa.
- Real policy publication/versions, minor-unit RUB accounting, hold availability, own-partner projections and merchant dashboard exist. Claims that there is no dashboard, no registration, no commissions, no refund support or no database would be false.
- Shared/client/api.mjs:14-32 and47 uses `/api/demo` and `/api/command`; these are the original A–D root experiences. docs/f2-operations.md:3,65 correctly states specialized root screens are fixtures and `/account` is a shared real workspace. Four variants, shared core/distributed monolith, internal database Docker topology, MCP/A2A and manual payouts are explicit later user choices, not unsolicited overengineering.

## Complexity versus the original minimal template

Additional complexity is material in the role/credit/registry-version/grant/task model and four fixture frontends plus a fifth shared real workspace. However, evidence available to this worker ties these to later requested A–D/MCP/A2A and manual payout safety. Do not label the authorized architecture or money invariants as unjustified excess merely because original template excluded an API. The observable imbalance is completion depth: rich ledger/registry/agent machinery exists while referral acquisition and subscription lifecycle remain unwired. The fixed branded share copy and terms (shared/domain/projections.mjs:55-64) also mean a merchant-specific public marketing/onboarding layer has not been implemented; other audit workers own growth synthesis.

## Validation and telemetry limits

Method: source-to-route-to-domain-to-schema cross-reading, static inspection of tests and docs, git HEAD/status, SHA256 of relevant files. No test/build/browser suite was executed because this work unit was expressly read-only and tests create persistent state. Existing tests were inspected only; this receipt does not claim they passed anew. No legal/financial advice or provider protocol research was performed. Severity is product impact judgment against supplied template, not a measured incident frequency.

Profile: compact-quality-first-v2; read-only REVIEW evidence work, no implementation tier execution. Requested/actual model and effort: inherit coordinator dispatch; actual model/effort null in this receipt because independently attributable host execution metadata was not supplied to this worker. Usage/cost/weekly quota: null, unavailable to this worker; not inferred from output size. Worker elapsed/active: null, start timestamp not separately sampled; coordinator owns measured dispatch interval. No model switch, retry or fallback performed by worker. No subdelegation.

Coordinator telemetry path: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T105443Z-template-audit-85c2/ . Economic savings not established.

Initial audited root HEAD: `3b157f457229074c390622ab2ee055759b11b85b`
Final observed root HEAD: `f2d0de6ef82cd1b45e80fb4ad4600a6951f5dcea`
Concurrent change: commit f2d0de6 adds only docs/plans/f3-access-and-provider-setup.md and its F3 planning telemetry. `git diff --name-only 3b157f457229074c390622ab2ee055759b11b85b HEAD` confirms no audited implementation source changed. This worker did not create that commit. F3 remains a proposal, not implemented behavior.
Receipt assembled UTC: 2026-09-09T10:59:09.773700+00:00

Relevant tracked implementation source files were clean in `git status --short`; at final inspection only F3 telemetry run.json was tracked-dirty and the audit telemetry directory was untracked. Earlier observed untracked planning paths were concurrently committed by another writer. Untracked files were not used as proof of implemented behavior.

## File identity evidence

Paths below are relative to PROJECT_ROOT. Line references above refer to these bytes.

| File | SHA256 |
|---|---|
| apps/api/http.mjs | 74345e8125d213a1e6476769d8b6db008efc4ed6188fb1b8be6d116123f0f0c1 |
| apps/api/account.mjs | 08b4b62110cc044320f692d7b0de9f3dc2e0780186f094611754482afa53b7fa |
| apps/frontend/server.mjs | f2c81db00bb17e75a94101a0148761aae5c28cd0f969a373199f18ba770222f7 |
| shared/application/dispatch.mjs | e4ae8f906aaea6f6b3b7bc84157b3cabab5ddcb03192b79159f14af8908a7fbe |
| shared/application/access.mjs | c24ccde9f331524d758c8039425f4a79695a8cfb9e35006b9105f517d93d6b31 |
| shared/domain/events.mjs | 970ec2df8bcce4472b496bccf9d4d3a700f82cc4d0aa3abd0f21a54d5c23f0b4 |
| shared/domain/projections.mjs | 22aa95b13a15856c3ca25c20b4422f75edd4247f6af853bd22253eba848f7671 |
| shared/domain/common.mjs | 1036cd6d0eb9ee41445a167b093971af6cdad00eb83972d77d6f6b124a696d6a |
| shared/payments/service.mjs | 8d129b72eba13b4afafb4dd7cc6b7f872ceb2437d467e2b39ec11cdde1f30afc |
| shared/payments/yookassa.mjs | 4bf17f1be41dbb7d9ad235a94a36ca96aa9bd128492b14fccf0af2dd2cc21ccd |
| shared/identity/service.mjs | c5c37d29c6a06572b9e8fd60e018a79f371ff403c7cccaadf8c9083ee1f00a57 |
| shared/identity/state.mjs | da95f98baf85ce55701464ba0ebf9c6dc6f7a55b92b40b511cd8b20648006c8d |
| shared/infrastructure/schema.mjs | 4932dead2ec06da6b08e07f1393bd561b8841d1ab6fbc96525b207090c1f0c6d |
| shared/infrastructure/journal.mjs | 7869566f7551e156c00db2b261e3d17c149b8fe318afc3f23d53a7fd1be0ded4 |
| shared/ui/account/app.mjs | 967f363957f78febe14eb80e3ce756e209938746299526ffc189edb9f05b66b3 |
| shared/ui/account/helpers.mjs | f1fb1c4c6cad644a991709fd7704bc1bff4e6e2b279599caf7ee712f2391c3f0 |
| shared/ui/account/index.html | fccfe8d27c8bdccc3c6d3fda385c8e4d3492a8e6bd51ea5eeec26d0a5bdee65a |
| shared/client/api.mjs | 81b17aaf9ecff37f82b6f416b1e46b233d7a818dd7ab90936b2b9bf016e6eb1a |
| docs/f2-operations.md | e11bdadc5d0e74883e3b0facb735903cdf0985a0664d8daf073a463c78509a26 |
| tests/core-events.test.mjs | b7b2f73b1ce9a2e156a0781e281755dd5c43b39ee1cfacc7fb283388dfa490ad |
| tests/payment-integration.test.mjs | 98aa2bdc2484add617bf6c809db88b11675e5a7d851d8d9a8f7cf5c2180156ae |

| shared/domain/registry.mjs | df0450fb0fd7ca651a0ffca06e29ad8b4a34b6a585b126c853abcac11f294d39 |
| shared/docs/PRD.md | 71377bf049d6e0f5a4fe57527f7a197b9467db808f5ada6e6539542fcbd6e96b |

Status: completed
