# Public TEST pilot — independent deployment seam review

RUN_ID: 20260910-agent-payments-public-pilot
WORK_UNIT: pilot-review
Reviewer family: codex
Requested model/effort: gpt-6-astra / high (existing reviewer)
Actual serving model/effort, usage, cost: null (not exposed)
Profile: compact-quality-first-v2; consequential payment/deployment review
Actual start: 2026-09-10T10:00:02Z
Finished: 2026-09-10T10:04:39.036146+00:00
Elapsed wall: 277036 ms; active compute unknown
Source 5c1cf6898f028a41949b3630186ba2badcf745df observed: 5c1cf6898f028a41949b3630186ba2badcf745df
Scope: read-only source and official documentation; no credentials read/output, provider API requests, payment/refund creation, repository mutations, deployment or production database access by reviewer.

Verdict: an isolated native TEST pilot sharing the existing TEST shop is workable with unchanged existing shop webhook, known-payment-ID polling, and explicit operational recovery limits. Full unattended payment/refund recovery and an N3 pilot sharing existing production referral configuration are not established. This is a source/proposal review, not public UI E2E or actual provider acceptance.

## Shared TEST shop and existing webhook

1. Keep the existing shop notification URL unchanged. operations.md step6 describes an agent-specific shop webhook and must not be applied literally to this shared-shop pilot. Basic-auth notification settings are managed in the shop dashboard; the webhook API described for OAuth does not establish a second Basic-auth destination. Non200 notifications retry for up to24h. [Official incoming notifications](https://yookassa.ru/developers/using-api/webhooks).
2. For native pilot orders, host.ts providerMetadata adds project_id but no N3 order_id/proofwall_invoice_id; the provider adds all five module identifiers. The pre-agent baseline4c3bef4 legacy bridgeNotification ignores payments without N3 invoice/order metadata. The old native webhook then resolves entitlement by locally persisted provider_session_id, not project metadata: a pilot-only PSP ID yields unknown_session, no production tariff/commission. It still claims webhook_events (and may audit/re-fetch PSP); therefore shared shop is not literally zero production DB writes. This conclusion is conditional on the deployed old image corresponding to that source lineage; reviewer did not inspect its compiled handler in this subtask.
3. Current MAIN differs: notification.ts:13–31 sees module_order_id even with issuance disabled and throws ORDER_MAPPING for an order absent from its DB. The legacy route converts this to503. Thus upgrading production to the new handler while the pilot shares its shop can generate foreign-order retries. Existing old runtime must remain unchanged for the reviewed assumption; future upgrades need explicit cross-deployment event ownership treatment.
4. Native payment reconciliation is viable: worker POSTs authenticated empty body to /api/agent-payments/reconcile, batching5 nonterminal dispatched or succeeded/pending-fulfillment orders, without new charge creation. New issuance can be disabled while recovery continues. A known PSP ID is required for provider query; all original account/mode/metadata/amount/status validation remains active.

## Concrete recovery gaps

HIGH if the pilot is presented as unattended: reconcile.ts excludes succeeded/active orders and never enumerates refunds. A refund created in the shop later is delivered to the old production URL, not pilot, and batch polling will not discover it. Record verified operator refund reconciliation for a specified existing refund ID or supply a separately reviewed durable notification relay. Calling the normal protected core reconcileRefund with independently re-fetched refund/payment facts is workable; manually adjusting tariff/budget or spoofing provider IP is not.

HIGH for lost-create recovery: provider-yookassa.ts query returns null without providerId. If a PSP create succeeded but its response was lost before local providerId persistence, batch polling cannot recover it by idempotency key. It safely stays unknown/held. An operator must locate the existing PSP object and supply its verified ID to the normal reconciliation path, which validates all module metadata. Do not execute a fresh create to resolve uncertainty. The existing HTTP batch endpoint accepts no arbitrary ID fields, so an explicit restricted operator command is needed for this path.

The old scripts/reconcile-n3-payment.ts is not a ready native-agent recovery command: it calls bridgeNotification and insists the result be upgraded, whereas module reconciliation returns succeeded. Adapt a pilot-only operator entry point with narrow IDs and sanitized output if needed, keeping normal reducers/verification.

## N3 origin and tenant blockers

- N3 shared/referrals/service.mjs:44–54 maintains one landing/return pair per tenant and requires matching HTTPS origin. Existing production referral links redirect to that program landing URL. Reconfiguring the existing tenant for proofwall-agent.212.192.0.33.sslip.io changes production referrals; it is not an isolated pilot operation.
- service.mjs:57–66 rotate deletes the tenant's existing referral credentials. Do not rotate the active production connector to obtain a pilot key.
- scripts/provision-proofwall-bridge.mjs hardcodes the production tenant/origin and refuses conflicting program/credential state. Reusing it cannot safely provision a different pilot origin.
- A new referral tenant alone is insufficient: shared/payments/service.mjs:83 requires state.runId===config.tenantId. Current shared payment runtime supports its configured tenant. An independently configured N3 runtime/tenant or separately reviewed expansion is needed for a distinct full chain.
- Even with valid N3 pilot attribution, provider metadata includes pilot invoice/order IDs. Old production bridgeNotification will treat them as bridge-owned and fail N3_INTENT_UNAVAILABLE against its separate DB, returning503/retries. Do not claim a full N3 pilot works merely because native polling settles P1.

Workable present scope: native pilot with N3 bridge disabled and no production connector rotation/program edits. An N3 chain requires its own explicit configuration and event ownership plan; it remains pending and was communicated to coordinator immediately.

## Proposed isolated deployment seam

Reviewed compose.agent-pilot.yml has a dedicated compose project, persistent pilot-only PostgreSQL/MinIO volumes, separate internal database/storage/gateway/ingress networks and explicit egress for web/worker. No host ports are published. Gateway joins gateway+ingress only and has no database/storage attachment. Existing Caddy may join only pilot ingress; it must not acquire pilot DB access. No new P1↔N3 database/network link is necessary.

Set human BASE_URL to https://proofwall-agent.212.192.0.33.sslip.io and gateway AGENT_PUBLIC_ORIGIN to https://proofwall-mcp.212.192.0.33.sslip.io; gateway backend/reconcile URLs point to pilot web internally. Use independent session/gateway secrets and independent accounts/database, both ordinary and core migrations, HTTPS ingress and pilot-only persistent data. Actual secret/environment values were intentionally not inspected here. No production grant/method/history import is implied.

Proxy must overwrite/establish trustworthy forwarded IP headers and web must remain inaccessible directly: client-ip.ts uses the final forwarded IP for rate limits/webhook origin validation. Pin actual image digests and Next BUILD_ID in new pilot UI evidence rather than treating image tag strings or prior local build as proof of deployment. Source compose's proposed image tags are not build/deployment evidence. Existing human website remains on its original runtime.

## Official actual TEST acceptance guidance

Official testing docs provide no-3DS Mastercard test number5555555555554444 for saved-method scenarios, future expiry and arbitrary CVC. Enter synthetic card details only on YooKassa's hosted TEST page; never use real buyer card data for this pilot. [YooKassa testing](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing).

Recurring payments are available by default for TEST shops; this generic documentation is not an observation of the configured account. Save during the explicitly consented first hosted payment using save_payment_method=true and verify payment_method.saved=true in the authoritative payment object. [Recurring basics](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics), [save during payment](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/save-payment-method/save-during-payment).

GET https://api.yookassa.ru/v3/me is the documented shop-information endpoint. The official partner example uses OAuth and shows account_id,test,status,payment_methods and older fiscalization_enabled. Treat coordinator's actual Basic-auth read-only response as the evidence of whether that authentication works; it was not issued by this reviewer. Log only safe booleans/status/capability names, not credentials/full merchant identity. This read proves account settings, not successful saved-method execution. [Official shop-information example](https://yookassa.ru/developers/solutions-for-platforms/partners-api/quick-start). Current changelog deprecates fiscalization_enabled in favor of fiscalization. [Official changelog](https://yookassa.ru/developers/using-api/changelog).

Actual provider acceptance needs a separately recorded first TEST hosted payment, verified test/account/amount/metadata/status, saved=true, then a permitted saved-method TEST payment with human mandate and policy eligibility. Initial purchase plus immediate renewal is intentionally blocked by the current30-day/final3-day/monthly990RUB policy. A synthetic pilot-only eligibility/history fixture must be disclosed if used, or wait for a genuine window; do not widen production policy. Record exact create counts, replay/restart behavior, sanitized outcomes and actual public build. Prior11-scenario local PSP fixture E2E is not this provider acceptance.

## Review evidence and limits

Read current P1 operations/runtime/provider/host/webhooks/reconcile/poller/client-IP and proposed pilot compose, baseline4c3bef4 legacy handlers, N3 referral/payment/provisioning source and the cited official documentation. No tests were executed in this bounded review; previous local1016 regression and browser5+11 acceptance belong to separate receipts. No public domain/certificate/provider/account/UI behavior was established here. No unrelated03a work was inspected.

Source file SHA256 manifest at review completion:

```json
{
  "projects/01-testimonials-senja/compose.agent-pilot.yml": "dd278be4b22fd5ea8837bccb4548371493d5a1cba438fec91f3a4a1e8371660f",
  "projects/01-testimonials-senja/docs/features/agent-purchase/operations.md": "476cba64d31e0a688c0b0782d2b72f1fadad6281c16f34c270dbc315433b0ed3",
  "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/runtime.ts": "14ba7acf351a9fe1b92555787468f27602b3b3fe368bba27c65f6ad56b6e6fe0",
  "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/notification.ts": "c001cd80cd9c1f3f3830ef9899486cc81cdb57a3b27eb0e28adda7277c4372ca",
  "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/reconcile.ts": "4e9e54dc30984448c070c8bc0ec8b0c8f0c2ab95555cefc2fa651b8468895089",
  "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/host.ts": "a604e038a1519b83e3ae9e9c054e9a2c24506daac3656818d5756114b4b73c21",
  "projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/reconcile/route.ts": "8b30045841ccf34c4c29ff7c5d14d2335d6e95deb87ea605de3b2176a65d5452",
  "projects/01-testimonials-senja/apps/web/src/app/api/agent-payments/webhook/route.ts": "acfb68f3940746b078fe91892da3301657cb9e9f1a134a855e9c4ca71c67f9ba",
  "projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts": "bd48ba8be9c7450695816235126f4940818ce79713418bd7658dacf6404ecd9a",
  "projects/01-testimonials-senja/apps/web/src/lib/n3-payment.ts": "136761f1e7263c40170b8c9a6f0b20ff84ccc35cb000001fb5363b53fbfa4f0d",
  "projects/01-testimonials-senja/apps/web/src/lib/client-ip.ts": "5eec0e0fe942f56b85c6fcca11022aed44609abb5f1c850a441332f6bfdcf6b8",
  "projects/01-testimonials-senja/packages/agent-payments/src/provider-yookassa.ts": "52c9e43cf71cd4bd363f846d16e5dabf6d604181ad04b166517a118a099f14a7",
  "projects/01-testimonials-senja/services/worker/src/agent-payments-poll.ts": "34763285298db648c90b6672cc91def47a095c336e066baf5b8e37cc69781ad7",
  "projects/03-affiliate-rewardful/shared/referrals/service.mjs": "43f281b5d612a22d4ee73944679995ba592990edd57781f590b9ac9536dea5ce",
  "projects/03-affiliate-rewardful/shared/payments/service.mjs": "f4d132a73ca01a7068ed9df2cd12848018fb0ab2461d1942351a6645bab1e38a",
  "projects/03-affiliate-rewardful/scripts/provision-proofwall-bridge.mjs": "d16070b8214eedcdba3080b618cea9ccfb3fdf57446b7403bf9f16a2fee5a87f"
}
```

Status: completed
