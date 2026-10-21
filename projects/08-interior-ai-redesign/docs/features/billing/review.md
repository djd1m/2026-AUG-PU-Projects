# BILLING independent review
Reviewer family: codex
Spec revision: sha256:9d4bbe11281e2d831b9412044fe47dd761bad62739e5feefe4fa8d4eb13a39bc
RUN_ID: 20261013T220722Z-billing-e2fa
WORK_UNIT_ID: billing-review-1
Launch-SHA256: 175048e4f76c2d6030ad9d83ddbe5db9abeb5168f511550e7b9e9cc800336bd6
Finished-At: 2026-10-13T23:45:34.452617+00:00
Verdict: pass for BILLING review scope — six criteria met after one high integration defect was fixed and independently closed. Whole-project integration gates remain pending.

Independent reviewer did not author or modify product code. Profile compact-quality-first-v2; XL money/refund boundary. Requested gpt-6-astra/high; actual model/effort, tokens and cost null because host metadata is unavailable. One review attempt; no delegation or fallback observed. Elapsed from coordinator launch 272.613s; active time null (not instrumented). No external payment/inference or publication occurred. Read-only companion E2E preflight: not_applicable, service/HTTP integration review; coordinator owns deployed E2E.

Baseline HEAD 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4 plus dirty source hashes. All 15 author-owned source/test hashes match tests/billing/artifact-manifest.json; aggregate ownedSourceDigest 70d64e470c8f1c393b59cc19f479db0336295aa037d426504076d6f46572a087. Canon SHA256 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d. Only manifest dependency drift is Pseudocode, current SHA256 407824005319b4ba4fe6d4a83fcdfdb33d7d1005a1b138c916088891a9ea1d1d; current Checkout/ApplyVerifiedPayment and feature algorithms were read. Exact reviewed hashes: telemetry billing-review-1-start.json, billing-review-1-finish.json and billing-review-1-closure.json. Original review snapshot remains preserved; closure records coordinator fix/new SQL005 separately. Review is source-bound, not a whole-project acceptance.

## Confirmed findings

**BILLING-R1 — high, closed after coordinator fix — existing unwatermarked derivative remained downloadable after refund.** `packages/db/src/space.ts:16` selects every ready asset for the owner, including `share_image`, without billing eligibility. `apps/web/src/server/space.ts:27–32` then serves original or normalized bytes. `packages/db/src/billing.ts:56–60` correctly commits account hold, removes paid entitlement and revokes share links, but cannot prevent this second private file route. This contradicts feature 02_pseudocode ApplyVerifiedPayment step 3 and canon's revocation of unwatermarked derivative access.

Independent reproduction uses a fresh actual PostgreSQL schema, real BillingService/PgBilling success and refund, authenticated actual createSpaceHandlers asset handler, and a seeded private unwatermarked share_image row/file. Before refund:200. After refund:200 with identical bytes, billing_hold=true and paid_export=false. Probe assertion expected404 and exited1; no production mutation. Evidence: `docs/telemetry/p-replicator/20261013T220722Z-billing-e2fa/billing-review-1-refund-probe.ts` and `.txt`. Fixture bytes are local synthetic data; this establishes authorization bypass independently of image rendering.

Recommended code decision: reject share_image through the generic source-asset route and serve derivatives only through entitlement-aware sharing access, or enforce current entitlement/provenance/ownership directly in this route. Test both original and normalized URLs after refund, plus permitted watermarked access and foreign-owner denial. A future dedicated sharing endpoint alone does not close this existing route. Alternative specification decision would explicitly retain previously generated private derivatives after entitlement loss; that changes accepted revocation intent and is not recommended. Coordinator implemented the first option at apps/web/src/server/space.ts:29–30: every share_image is denied before choosing original/normalized storage key. Reviewer made no product edits.

Targeted closure: `billing-review-1-refund-closure.ts` and `.txt` preserve the original red probe and independently retest actual PostgreSQL/refund/authenticated file handling. The generic route returns404 both before and after refund for this asset class; both original and normalized requests after refund return404, no private bytes returned. Exit0. Closure source SHA256 d0cb58bc33921266a379481cb18e30d63a09881b05e27ad317400e032fe7f1e3. This closes the existing bypass; dedicated sharing export access and watermarked export availability remain F6 integration obligations, not claimed by this probe.

## Spec conformance

| Criterion | Verdict | Actual evidence |
|---|---|---|
| AC-billing-1 | met | http.test.ts “default off checkout503 webhook404 before body; offers honest empty and no external calls” and “live startup requires explicit merchant/test/SKU and HTTPS origin”; off creates no order, malformed live config rejects, fake injection forbidden in production. Browser off-state UI remains integration verification. |
| AC-billing-2 | met | repository.test.ts parallel 16 same-key checkouts return one order/remote ID; strict input rejects client price/credits; changed config conflicts. Blocked remote call proves transaction already released; timeout retries same UUID; stale unknown intent stops before another call. provider.test.ts checks real local HTTP serialization/Basic/idempotence key. |
| AC-billing-3 | met | repository.test.ts 12 barrier-released verified notifications yield one applied/11 duplicate and exactly10 credits/one event. Event key is provider+kind+object ID with SQL unique indexes; account then order locks. Early webhook before create-response binding preserves succeeded state. Return/history GET adds no credits. |
| AC-billing-4 | met | repository.test.ts merchant/test/amount/currency/paid/status/metadata/bound-ID negative matrix leaves ledger empty; provider.test.ts fixed API and schemas independently verify remote ID/merchant/test/RUB/decimal. Spoofed body financial fields ignored. http.test.ts actual socket ingress overwrites XFF/reserved headers and rejects before body. |
| AC-billing-5 | met | repository.test.ts verification outage gives503 and zero event keys, retry grants once; account grant trigger failure rolls back event/order/credit changes, later retry succeeds. Provider headers/body deadlines and bounded malformed response checks pass. |
| AC-billing-6 | met | refund.test.ts validates distinct partial refund linkage, concurrent replay, refund-before-success monotonic hold, atomic link revocation/rollback, and actual PgJobs before/after dispatch behavior. BILLING-R1 initially exposed private derivative access; coordinator fixed the generic route and independent closure now proves original/normalized404 after refund. Existing sharing view/create/image rechecks remain explicitly pending F6 integration; this criterion’s billing hold and entitlement revocation are verified. |

## Review observations

Amount/currency/merchant/test/order/remote proof is checked before ledger mutation and repeated inside the account→order transaction against immutable intent. Provider I/O occurs outside transactions. SQL004 preserves price/credits/SKU/account/request hash/createdAt, bound remote identity and refund_hold. No inverted spending mutex: jobs lock spend mutex→Account→Project→budget→Job; billing locks Account→Order and never acquires spend mutex. Existing success event or late success on another held order cannot restore entitlement. Refund intentionally retains credit arithmetic for manual reconciliation.

Canonical dz recall from original root with Russian/bilingual billing query returned one lesson about replay-before-mutable-eligibility. Applied during checkout replay review; successful/terminal replay remains read-only and new held-account purchases fail. No hypothesis was taught as measured success.

Official provider documentation checked independently: [webhook authenticity/IP networks](https://yookassa.ru/developers/using-api/webhooks), [24-hour idempotency](https://yookassa.ru/developers/using-api/interaction-format), [partial refunds and payment_id](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds). Code matches remote refetch plus source allowlist, not fabricated HMAC. Local23h unknown-ID cutoff is conservative relative to documented24h. No live merchant proof claimed.

## Checks and pending delivery gates

- Independent `npm exec vitest run tests/billing -- --reporter=verbose`, private test env sourced without printing: exit0,4 files/35 tests,10.66s, no skips. Full verbose output: telemetry `billing-review-1-tests.txt`.
- Independent refund/private-file probe: initial exit1 on expected404 versus actual200; after coordinator fix, separate closure probe exit0 with original and normalized404. Initial failure evidence retained.
- Shared immutable SQL004 and real PgJobs eligibility covered by passing tests; all reviewed source hashes persisted.
- Original author evidence was initially absent, then retained by coordinator during review: `tests/billing/mutation-evidence/results.json` and red/restored logs inspected. Merchant-proof and refund-account-hold mutations each fail the intended assertion (exit1), restored variants pass (exit0), original/restored source hashes match currently integrated BILLING bytes. Original build/lint and22-files/152-tests full-suite outputs also inspected; these are author measurements from earlier source, not a new integrated run. Reviewer did not mutate shared product source.
- `docs/webhook-contract.md` still declares not-implemented/unverified. Coordinator must reconcile it with actual provider-specific tests. Generic root HMAC checker is incompatible with YooKassa's proof mechanism; exit2 cannot be called pass and HMAC must not be invented.
- Pending: integrated sharing entitlement/read tests and browser payment availability/history UI; fresh mandatory full integrated suite/build/lint/source-bound anti-drift and E2E/companion readiness owned by coordinator. No overall release claim.

Telemetry: `docs/telemetry/p-replicator/20261013T220722Z-billing-e2fa/`. Measurements unavailable: actual model/effort, usage, cost and active time; economic saving not established.

Status: completed
