# Consequential implementation review — initial pass

RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT: review
Profile: compact-quality-first-v2
Risk: XL
Requested model/effort: gpt-6-astra / high
Actual model/effort: null / null (execution metadata unavailable)
Usage/cost: null (no host/provider counters; no estimates)
Started: 2026-09-10T08:34:42Z
Ended: 2026-09-10T08:41:51Z
Elapsed wall: 429000 ms
Active wall: null (no interval accounting)

Verdict: CHANGES REQUIRED on the initial core/host snapshots. Review work completed; this is not integration acceptance, release authorization, provider acceptance or a claim that human CJM passed. Host/core owners are implementing corrections concurrently. An integrated immutable commit must receive a follow-up review and applicable test evidence.

Scope: reusable TypeScript/PostgreSQL core at main d96ce31d90c6a8d6760f3d65c662d69f81fb890d; isolated P1 host commit 41db26e1548b0b7776225c49c5fa13f8afe44dff; uncommitted root gateway/worker/compose additions. Read root/project CLAUDE, relevant routing/security/testing rules, implementation contract, all five feature documents, validation report, and brutal-honesty-review skill. Local model-routing policy explicitly supersedes the skill's invented minimum-findings requirement. No implementation writes, secrets, deployment, external network requests or real provider operations were performed.

Paths below are relative to projects/01-testimonials-senja unless qualified. Host findings refer to its initial commit; the current isolated host is changing. Gateway corrected snapshots are individually hashed below. Core amendments were read in /tmp/agent-payments-core-7e80 but are not granted final approval before their committed receipt.

## Confirmed findings

### R1 HIGH — Prepared agent orders can permanently block ordinary human checkout
Initial evidence: apps/web/src/lib/agent-payments/legacy.ts:22–33 includes prepared orders in reserveHumanCheckout and redirects the human to the agent purchase page. packages/agent-payments/src/execution.ts:63 then refuses expired quote approval. Quote TTL is five minutes in host.ts. No expiration or abandonment updates the prepared order, so every later manual checkout repeats the unusable redirect, even after grant revocation. This violates opt-in/human-CJM AC7 and AC11.
Fix: under project plus shared buyer lock, cancel only provably undispatched preparations and release their local mapping/invoice claim; retain every fenced or unknown attempt and share those accepted operations. Test expired prepared + revoked grant followed by ordinary human purchase with no mandate.
Correction status: owner accepted; new abandonUndispatched helper and host invocation read in dirty trees. Final integration and regression proof pending.

### R2 HIGH — Proven cancellation leaves a permanent billing-period claim
Initial evidence: packages/agent-payments/src/budget.ts:6–14 rejects another source for the period; execution.ts:172 and settlement.ts:138 only mark reservations released. No path deletes period_claims. After PSP-confirmed cancellation or a pre-fence revocation, a fresh explicitly authorized order for the same unchanged period fails forever despite no successful charge.
Fix: delete only the matching source's period claim in the cancellation transaction. Preserve unknown/fenced unresolved holds. New order must still need fresh authorization; never automatically retry a charge.
Correction status: releaseCanceledOrder in isolated amendment inspected; it deletes merchant/buyer/resource/period/source exact match and releases only held reservations. Final committed tests pending.

### R3 HIGH — Refund reconciliation lacks stored provider/account binding for an already-paid order
Initial evidence: packages/agent-payments/src/settlement.ts:193 skips reconcile once the order is succeeded; at :203 it compares refund.providerId/currency without comparing stored attempt.provider/accountId to current configuration. A provider/account change followed by a same-string payment ID on the new account can apply its refund to the old account's order. IDs are explicitly namespaced by provider/account in this package's database.
Fix: validate stored attempt provider/account before queryRefund and again at settlement, then check refund identity/amount/currency. Test switched provider and account on an already-settled order, asserting zero queries and zero correction.
Correction status: both checks inspected in isolated amendment; final committed test proof pending.

### R4 HIGH — Canceled native or N3 human payment leaves human admission blocked
Initial evidence: apps/web/src/lib/agent-payments/legacy.ts:35–45 refuses legacy pending/human holds; attachHumanPayment persists provider_id. Existing apps/web/src/app/api/webhooks/payment/route.ts ignores non-success events after event claim. apps/web/src/lib/n3-payment.ts cancellation branch updates the N3 intent but does not release the new human hold or associated pending checkout. Only successful observeLegacyPayment deletes the hold. Therefore canceling an ordinary hosted checkout prevents a later deliberate human purchase when module is enabled.
Fix: independently verify PSP cancellation first, then transactionally expire the matching pending checkout and delete only its matching human provider/request reservation. Never clear another attempt or unknown result. Test native and N3 cancellation followed by new manual checkout.
Correction status: owner accepted and dirty releaseCanceledHuman implementation partly inspected. Matching-provider/request predicate present; full routes, races and tests await final review.

### R5 HIGH — Feature activation can omit existing human spend from shared budget
Initial evidence: apps/web/src/lib/agent-payments/legacy.ts:69 (initial commit) exits observeLegacyPayment when feature disabled. No historical catch-up exists. A manual 990 RUB purchase on September 1, feature activation September 28 during its final three days, and a new grant/mandate lets another 990 RUB agent charge through an empty September bucket. Disable/manual/reenable has the same problem.
Fix: account for verified current-calendar legacy spending before autonomous admission and keep future human observations independent of issuance feature flag when schema exists. Do not trust webhook payload amounts or infer historical price from today's configuration; incomplete verification must block agent admission without blocking humans.
Correction status: owner accepted; owner reports implementation re-fetches completed historical payments and uses server-side processed_at, then imports exact verified gross. Only partial dirty implementation read; complete review/tests pending. Historical actual capture-time versus receipt-time policy remains an explicit accounting caveat.

### R6 MEDIUM — A2A hides the real engine's human-approval handoff
Initial evidence: services/agent-api/src/protocols.mjs task mapped prepared to submitted. Actual core executePayment without mandate returns prepared with nextAction.kind=human_approval. The gateway fixture incorrectly changed this to action_required, so its passing test did not represent the real core.
Fix: derive input-required from explicit human_approval/open_url nextAction for nonterminal orders; keep payment/fulfillment independent.
Correction status: corrected source reread, and a direct no-network a2a invocation with the actual prepared/human_approval DTO returned input-required. Corrected protocols hash 7608c7df7221ddee987902b0fb5e2f0c613b547281212103d009e3aefad900b2.

### R7 MEDIUM — Gateway erases safe core error codes
Initial evidence: backend.mjs initially accepted only uppercase error.code while the host forwards core unauthorized/expired/budget_exceeded. Consequently different actionable refusals collapsed into BACKEND_REFUSED.
Fix: explicitly map or admit bounded safe lowercase domain codes while excluding exception text, provider payloads and secrets.
Correction status: safe character validation now accepts lowercase; corrected backend hash 08e174838e98d660c90a91528bab4884422252aca465048644d34cd8a81d7591. Mock backend tests 2/2 passed. Initial untracked pre-fix gateway file digests were not captured, so no invented pre-fix hashes are claimed.

### R8 MEDIUM — Gateway Dockerfile and compose build context disagree
Initial evidence: compose.agent-payments.yml declares ./services/agent-api context; Dockerfile originally COPY services/agent-api/package*.json and services/agent-api/src, which cannot exist relative to that context.
Fix: use service-relative COPY paths or P1 root context plus explicit Dockerfile.
Correction status: coordinator reports corrected service-relative Dockerfile and successful image build. Reviewer inspected initial incompatibility but did not execute Docker. Final hash/review pending for corrected artifact.

## Amendment regression checks and integration caveats

- During cancellation amendment, a further race was identified: cancellation after initial snapshot/getOffer but before reservation could resurrect a canceled order because reserved transaction only checked attemptId. Current dirty execution.ts now rechecks terminal status while locked and returns terminal result before dispatch. Author/coordinator independently confirmed the same issue and are adding a barrier test.
- New dirty fulfillment retry helper reuses one persisted paid event, preserves its identity, and refuses replay over a refund. This addresses coordinator-identified pending fulfillment recovery. It still needs committed test evidence; it is not counted here as an independently discovered initial finding.
- TEST provider validates recipient/account, test=true, exact amount/currency, all five module metadata identifiers, known status, paid=true for success and hosted URL hostname. Refund checks parent TEST account and core cumulative gross. No concrete metadata/amount bypass found in the inspected first-adapter code.
- N3 branch enqueues only external commission; native conversion is restricted to the non-invoice branch. Host transaction passes the same PoolClient into legacy tariff and outbox. The bridge test actually asserts zero native commissions. This is meaningful source/test evidence, not a live delivery demonstration.
- Human grant, email proof and money mandate remain separate authorities in inspected handlers. Human POST requires current session and CSRF; agent gateway service credential cannot supply buyer grant.
- Worker reconciliation is query-only HTTP, does not overlap requests and reports sanitized error codes. Its optional configuration does not stop existing worker responsibilities.
- An explicit core migrate helper invocation is needed in addition to public SQL db:migrate. Coordinator added scripts/migrate-agent-payments.mjs; source inspected only, not executed.
- No all-project human CJM evidence, browser E2E, N3 A–D external behavior, actual PSP acceptance or final deployed-state evidence was collected by this reviewer. Those gates remain separately necessary. No network/deployment claims are inferred from unchanged files.
- Initial core validation.json records 44 passed and three killed mutations, but those are author receipts. This reviewer inspected test bodies and does not substitute receipt claims for independent execution.

## Tests actually executed versus inspected

Executed without network:
1. Main command node --test packages/agent-payments/test/provider.test.mjs services/agent-api/tests/backend.test.mjs: provider test could not load missing main dist/provider-yookassa.js; backend tests passed 2/2. Combined exit 1 is an environment/build-artifact limitation, not a silently passed gate.
2. Isolated built core node --test test/provider.test.mjs: 14/14 passed, 0 skipped. Source provider SHA 52c9e43cf71cd4bd363f846d16e5dabf6d604181ad04b166517a118a099f14a7; executed dist provider SHA 7a0056f9543578c9ddafc10f4bf27e8465c346924ab93e1a8c892194c7d51766; test SHA af3eb49d88d2950c27b4424ecef793ba29de67bd72af0f4af5d99303517e2178. These use fixture fetch, not YooKassa.
3. Direct corrected A2A DTO probe: exit 0, input-required for prepared + human_approval.

Inspected but not run here: core PostgreSQL concurrency/revocation/refund/rollback tests; host PostgreSQL pairing/settlement/N3/no-native-commission and human-spend tests; gateway real MCP SDK/socket framing tests; worker fake-clock tests. Initial host manual coalescing test asserted the defective prepared redirect and lacked expired/canceled paths. Initial gateway fixture concealed actual prepared handoff. Core cancellation/new-account refund regression tests were absent initially. No false completion claims made for these gaps.

## Source identity manifest

```json
{
  "core_initial": {
    "commit": "d96ce31d90c6a8d6760f3d65c662d69f81fb890d",
    "files": {
      "projects/01-testimonials-senja/packages/agent-payments/src/contracts.ts": "f9caa79bf2e82fb3cf8ad39f35a888e999a6f5abbd367d6f628c48812aa48a8f",
      "projects/01-testimonials-senja/packages/agent-payments/src/execution.ts": "2af74c976a660d6096f53b41cae020163510bc7ad59b9089d2cdaf49dac9322b",
      "projects/01-testimonials-senja/packages/agent-payments/src/settlement.ts": "15f93fb5de36bfb9a1e07587e4dc411f37fa51bf275109dd38b74918202b3d69",
      "projects/01-testimonials-senja/packages/agent-payments/src/budget.ts": "5cff1af67704f6a13855bdc3903d7d93453b75fa21279fd2819c95d19568390c",
      "projects/01-testimonials-senja/packages/agent-payments/src/orders.ts": "350ae7232b70ffe7ef1561709c322a202a88228a0af172f25300610d167387dd",
      "projects/01-testimonials-senja/packages/agent-payments/src/authority.ts": "c3bba9c38915db1f96f53bd15319bf0a966166dafa81c45e44f36ee5b0fdd3d1",
      "projects/01-testimonials-senja/packages/agent-payments/src/internal.ts": "c9a258abd1347d3594351803becf90a272d232b5666f8013e2e571642ae080c8",
      "projects/01-testimonials-senja/packages/agent-payments/src/store.ts": "c09491709be1879a2c12dfa89b843885dfb261fb0a2340ebeb86636c139c8642",
      "projects/01-testimonials-senja/packages/agent-payments/src/provider-yookassa.ts": "52c9e43cf71cd4bd363f846d16e5dabf6d604181ad04b166517a118a099f14a7"
    }
  },
  "host_initial": {
    "commit": "41db26e1548b0b7776225c49c5fa13f8afe44dff",
    "files": {
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/host.ts": "e68b45d240d2a028685df2d4fee19ecec049b0a78e387ee86a683ce30fa665f5",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/legacy.ts": "fa783e4f35719e0540b77b4f8c0f7e72961fedb4f750c94bab138ddb232dfd74",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/identity.ts": "aa78c5eda001f7316ff8f5f623a2cc51cb4aca228506f60cf4df540a801e9201",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/notification.ts": "cc434cec67815dab6e71a94af5a3ac39ef1a104a8ef932badef4c127b5260698",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/runtime.ts": "fad00c7c0fc0e58776436a7cc71438afca51ab77e2c26adb94284209f95eba6f",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/security.ts": "8dba82b58f04142c232c65399bf3132677b75a1020cb8391ffa313730e0d882b",
      "projects/01-testimonials-senja/apps/web/src/lib/agent-payments/commands.ts": "b3b5b11bc63177fc0b6aab8da21cbc873cceca94897e5b1a724a342236ae4dec",
      "projects/01-testimonials-senja/apps/web/src/app/api/checkout/route.ts": "3617ae9cfecd533e50b38390c1c1c3660090559437fd0a97b5dd3fd02aea503d",
      "projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts": "cde2f76b18a692627825eb5009ddb8b1d4fb342ef88ac95c50d721500d0299b8",
      "projects/01-testimonials-senja/apps/web/src/lib/n3-payment.ts": "689ac8d74c615e54f0b9f0565f753e251ca7b55f3aa3b8233205f9abd83a4447",
      "projects/01-testimonials-senja/apps/web/src/app/agent-payments/page.tsx": "21c99f25bc9df2d99970eb1e990eb3939b5e7311f76c9f7731863a5210f89d62"
    }
  },
  "current_additions": {
    "projects/01-testimonials-senja/services/agent-api/src/backend.mjs": "08e174838e98d660c90a91528bab4884422252aca465048644d34cd8a81d7591",
    "projects/01-testimonials-senja/services/agent-api/src/protocols.mjs": "7608c7df7221ddee987902b0fb5e2f0c613b547281212103d009e3aefad900b2",
    "projects/01-testimonials-senja/services/agent-api/src/contracts.mjs": "8359a8e0be63ea587f8e7674a8e6972d59e2c9c52310e8c4d90953da55d5f158",
    "projects/01-testimonials-senja/services/agent-api/src/server.mjs": "6cc90522862d0e1768e347bf74ab5948b6f0546f8513d2c82ffbfb84d27af966",
    "projects/01-testimonials-senja/services/worker/src/agent-payments-poll.ts": "5d3a4adf4aed46d28e881961bf360975ba4a3843e8b593f30f890c0d6ad26e57",
    "projects/01-testimonials-senja/compose.agent-payments.yml": "2899e3a7b190e88a5a9db9a27c9700b0f5e77f11d81f6e9b5b98b932dd605e94",
    "projects/01-testimonials-senja/services/agent-api/Dockerfile": "1891312524e17d6000d81a4df39523ea6a92235f30a811e12b72ff0d9be58ba1"
  },
  "canon": {
    "projects/01-testimonials-senja/docs/features/agent-purchase/implementation-contract.md": "251b171f20b6903bbbb57a25488116316e63de9f0ac6b7662f4765088a01abf5",
    "projects/01-testimonials-senja/docs/features/agent-purchase/03_architecture.md": "b5dc5ae633aa1be0a5b2ff6ae05532a6f40e11b7a368f61b1ffef2db49f470e0",
    "projects/01-testimonials-senja/docs/features/agent-purchase/02_pseudocode.md": "e6665c504bbef93a1381c085d2dc428b68ba3212d080b202b0cd4315e141d272",
    "projects/01-testimonials-senja/docs/features/agent-purchase/plan.md": "b2db7a9ccf395ee213ced02e2e819e44dad2bd6ded1977df057308d2c9cc0e88",
    "projects/01-testimonials-senja/docs/features/agent-purchase/modular-architecture.md": "f1dd59c138dd060cecdf619fafc1174b94f652d14c78bccadd287b0be09b6837",
    "projects/01-testimonials-senja/docs/features/agent-purchase/04_refinement.md": "d2a0a5b4265018792b2de601b653f163356258b860d83e51528ad06e23d5f943",
    "projects/01-testimonials-senja/docs/features/agent-purchase/validation-report.md": "0959488b4b82136d6c7a7a39f92bb21546a18515b8007967d0c17c7fffb74ea6",
    "projects/01-testimonials-senja/docs/features/agent-purchase/01_specification.md": "937b23634f89f589a7cd8e6e5c0afd6f3b1ad0bfc8c3e102363d9ca4e9a9fbc4",
    "projects/01-testimonials-senja/docs/features/agent-purchase/05_completion.md": "f68d4edb1739a68a7f521b945c93e7648f7217a37a914b4566e1b275cb116479"
  }
}
```

Manifest current_additions reflects collection at the end of the initial pass; initial root untracked gateway pre-fix digests unavailable. All future receipt claims must bind to the integrated immutable commit and refreshed changed-file hashes.

Status: completed
