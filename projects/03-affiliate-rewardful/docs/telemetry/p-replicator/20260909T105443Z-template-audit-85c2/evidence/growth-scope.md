# N3 template-growth audit receipt

RUN_ID: `20260909T105443Z-template-audit-85c2`
WORK_UNIT_ID: `growth-scope`
Mode: read-only audit; no source/docs/runtime edits, tests, deployment, account actions, or external messages.
Requested baseline HEAD: `3b157f457229074c390622ab2ee055759b11b85b`.
Observed repository state: HEAD was `3b157f457229074c390622ab2ee055759b11b85b` at audit start, then moved concurrently to `f2d0de6ef82cd1b45e80fb4ad4600a6951f5dcea` while the owner committed the F3 plan. `git diff 3b157f4..f2d0de6` showed no changes to the audited runtime, variants, canonical PRD/Specification, or market-research sources; only the previously dirty F3 planning material was committed. Findings below are bound to `3b157f4` and the listed SHA-256 values.

## Owner-facing verdict

N3 has a substantial, coherent commission-accounting core, but it is not yet the growth MVP described by the forgotten `/replicate` template. Real F2 can create accounts and participants, publish policy, create an operator-entered YooKassa checkout, verify payment/refund events, calculate recurring-policy rewards, expose owner/participant summaries, and produce a manual payout registry. The acquisition chain that makes those capabilities useful as an affiliate product remains absent: the emitted referral URL is not a handled route, clicks and referred signups are not recorded, checkout attribution is supplied by the merchant rather than resolved from a visitor journey, and neither the dogfood program nor its weekly metric exists.

Classification summary:

| Original/growth capability | Current classification | Evidence-backed meaning |
|---|---|---|
| Partner registration | Implemented for invited real accounts; fixture-only public onboarding | Owner creates a private one-use invitation; no public application/signup into a tenant program. |
| Referral link and promo | Generated, but link is nonfunctional in real acquisition | Enrollment emits `/r/<actorId>` and a promo code; no `/r/*` resolver exists. |
| Click → signup → paid | Absent | Real state has no click/signup facts; checkout receives beneficiary/customer IDs from an authenticated merchant. |
| Confirmed/recurring commission and refunds | Implemented in code; external acceptance unavailable | Verified YooKassa events create rewards/corrections under a versioned recurring policy, but deployment has provider disabled and no real N3 credentials/sandbox payment evidence. |
| Partner metrics: clicks, signups, paying, MRR, payable | Mostly absent | The real participant UI shows reward balances and confirmed-payment count; no clicks, signups, distinct paying customers, or MRR. Payable is represented only as cash state/registry amounts. |
| Owner dashboard | Implemented for accounting/operations, not growth funnel | Owner sees reward amounts, partner balances, payments, ledger and registries, but no campaign acquisition funnel or week metric. |
| Public client program page + badge + paid removal | Fixture-only page; removal absent | C is an explicitly synthetic root application; real `/account` is authenticated. Branding flags are hard-coded true and no entitlement/removal action exists. |
| Dogfood N3 affiliate program | Absent | Each registering merchant gets an empty independent tenant; there is no N3-owned program that attributes new paying merchants to N3 partners. |
| Consultant/agency codes | Implemented as a generic code primitive | Every invited real partner gets a random promo code, which can serve a consultant or agency. No tailored implementer offer or configured acquisition surface was found. |
| Week metric: programs reaching first credited commission | Raw ledger basis implemented; milestone/report absent | A confirmed positive ledger commission can supply the future numerator, but there is no explicit first-real-commission milestone, qualification, weekly aggregation, or report. |

## Six strongest findings

### 1. P0 — the real referral URL is a dead end, so the central click→signup→paid promise cannot run

The original week scope explicitly requires partner signup/link/promo and click→registration→paid tracking (`start/REPLICATE-PROMPTS-PROJECTS.md:143-153`). Current enrollment emits `referralUrl: /r/<actorId>` (`shared/application/dispatch.mjs:15-24`) and the real account renders it as an absolute URL (`shared/ui/account/helpers.mjs:70-90`). The frontend, however, special-cases only `/account`, `/`, and `/join`; all other paths must resolve to a physical static file and `/r/<actorId>` therefore returns 404 (`apps/frontend/server.mjs:27-37`). `/join` is merely an alias for the variant root `index.html`, not a tenant/program resolver (`apps/frontend/server.mjs:29-30`).

The payment side does not repair that break. Only an authenticated merchant can create checkout; its request directly supplies `beneficiaryId` and `customerId` (`apps/api/account.mjs:33-40`; `shared/payments/service.mjs:37-50`). On webhook, N3 manufactures a cookie attribution whose timestamp is the merchant-created checkout order time (`shared/payments/service.mjs:71-93`), rather than resolving a prior public click or signup. This proves a real verified-payment commission core, but not referral attribution from a customer journey.

Owner impact: no partner link currently acquires or attributes a customer, so the product cannot demonstrate the template's primary business job even with YooKassa credentials enabled.

### 2. P0 — the intended primary growth loop, N3 using its own affiliate program, is absent

The forgotten prompt names incentivized-referral dogfooding as the main loop and a client public page/badge as secondary (`start/REPLICATE-PROMPTS-PROJECTS.md:180-194`). Discovery preserved the intended mechanics precisely: N3 should reward a partner for a newly paying N3 merchant, and the headline measure is paying merchants attributed to N3 partners (`docs/discovery/research/market-trends.md:149-158`).

The real implementation creates a new isolated tenant containing only its merchant for every registration (`shared/identity/service.mjs:66-80`; `shared/identity/state.mjs:3-11`). Nothing models an N3-owned merchant/program, an N3 subscription purchase, or attribution of a newly registered tenant to a referrer. F2 YooKassa is also deliberately limited to one configured merchant tenant per deployment and is currently disabled (`docs/f2-operations.md:16-20`).

Owner impact: N3 cannot dogfood itself, seed partners, or turn its strongest proof point into distribution. This is a missing product loop, not a provider-configuration gap.

### 3. P0 — the first-real-commission value moment was diluted in the canonical requirements and is not instrumented

The original requirement is specific: the owner sees the **first confirmed commission from a real payment** (`start/REPLICATE-PROMPTS-PROJECTS.md:185-186`). The canonical Specification rewrites it as one-click sharing after an unspecified "value moment of the selected product" (`docs/Specification.md:254-260`). In the real UI, a participant's share data is loaded immediately after enrollment exists (`shared/ui/account/app.mjs:144-169`); enrollment itself requires only consent and creates the link (`shared/application/dispatch.mjs:15-26`). There is no first-commission event, one-time milestone, notification, or growth action gated on a verified commission.

The underlying amount can become visible after a verified webhook: dashboard/partner projections expose ledger-derived balances (`shared/domain/projections.mjs:9-32,66-73`) and YooKassa processing writes the confirmed fact (`shared/payments/service.mjs:71-93`). Thus the accounting value exists in code, while the product moment and its trigger are absent. Because the deployed provider is disabled and no real N3 sandbox/live payment was run (`docs/f2-operations.md:16-18`), the word "REAL" is also not externally demonstrated.

Owner impact: the implementation has no observable activation milestone to optimize or use as the handoff into sharing/dogfooding.

### 4. P0 — the requested funnel metrics and weekly north-star are not implemented as product measurements

The original partner dashboard requires clicks, signups, paying, MRR, and payable, and the week metric is the number of programs reaching their first credited commission (`start/REPLICATE-PROMPTS-PROJECTS.md:150-153,194`). Here "credited commission" means a confirmed commission entry in the ledger, not bank credit of a later manual payout. Real tenant state contains payments/refunds/ledger/registries/transfers but no visits, clicks, signups, campaigns, subscriptions, or milestone records (`shared/identity/state.mjs:3-11`). Partner projection exposes cash totals and payment rows (`shared/domain/projections.mjs:9-32`); the account UI shows available/held/sent and, for partners, only a count of confirmed payments (`shared/ui/account/helpers.mjs:47-82`). It cannot derive MRR or distinguish first-time paying customers from recurring charges because no subscription identity is stored in the normalized payment object.

The positive confirmed ledger entries created from verified payments are a plausible raw numerator for the weekly activation metric. What is absent is an implemented first-**real**-commission milestone or report: there is no explicit qualification of the first commission per program, distinction in that metric between fixture and externally verified real events, weekly aggregation, or owner-facing count. The existing ledger means this is primarily a missing projection/instrumentation layer rather than proof that the numerator can never be computed.

Owner impact: the product does not currently answer whether the week succeeded or where the acquisition funnel failed, although confirmed ledger data can support the commission-activation portion of that answer.

### 5. P1 — public program/badge and consultant-agency distribution are demonstrations or generic primitives, not real growth surfaces

The C PRD owns public terms and partner onboarding (`variants/c-partner/docs/PRD.md:31-55`), and its fixture UI provides terms, enrollment, a share kit, ledger and a visible Kруг brand (`variants/c-partner/app/views.mjs:24-54,91-93`). But the root C page declares itself a synthetic partner cabinet and links separately to the shared real account (`variants/c-partner/app/index.html:6-19`). F2 operations are explicit that all root A–D pages remain fixture and the specialized CJMs were not moved to real mode (`docs/f2-operations.md:1-3,63-65`). The real surface is authenticated `/account`; no public tenant program page exists.

Branding data is hard-coded `true` in enrollment, program, share and tariff projections, while the tariff says `realBillingAvailable:false` (`shared/application/dispatch.mjs:19-22`; `shared/domain/projections.mjs:50-73`). No paid entitlement or branding-removal action exists. This matches the explicit decision to defer badge removal beyond F1 (`docs/PRD.md:19-24`), so it is intentionally missing rather than falsely completed.

The agency-code primitive itself is implemented: a real private invite can create role `partner`, and accepted invitees receive a random promo code (`shared/identity/service.mjs:123-148`). That code can be issued to a consultant or agency and therefore satisfies the narrow technical reading of FR-GROWTH-004. What is not present is a configured consultant/agency implementer offer or public acquisition surface; discovery names these only as unconfirmed seed segments with zero confirmed members (`docs/discovery/research/market-trends.md:162-171`). A dedicated `partnerType` or cohort report could help later measurement, but neither is stated as a requirement in the original FR and their absence is not counted as a defect here.

Owner impact: FR-GROWTH-003's public badge surface cannot recruit the channel today. FR-GROWTH-004 has a usable generic code primitive, but no current product surface or seeded program applies it to the intended implementer channel.

### 6. P1 — the "all analogs use third-party platforms" positioning claim is not supported at its stated confidence

The original prompt asserts that Senja, OpusClip and Lemlist all use FirstPromoter/PartnerStack, treating this as direct proof of demand (`start/REPLICATE-PROMPTS-PROJECTS.md:190-192`). The repository's supporting research repeats the universal claim at HIGH confidence, but cites only `[S-38][S-41]` (`research/sources/03-influencer-partnerships.md:118-127`). Its source list describes S-38 as Senja's official affiliate landing page, S-39 as OpusClip's official affiliate landing page, and S-41 as a secondary Way2Earning article about Lemlist (`research/sources/03-influencer-partnerships.md:227-230`). Within the stored evidence, only the Lemlist paragraph explicitly names PartnerStack and it is marked MEDIUM/secondary (`research/sources/03-influencer-partnerships.md:81-87`). The OpusClip paragraph establishes commission/payout terms, not its dashboard vendor; the HIGH universal claim even omits S-39 from its citations.

Owner impact: the safer position is that multiple comparable SaaS companies publicly run affiliate programs and at least the stored secondary Lemlist evidence names PartnerStack. The repository does not currently prove the universal vendor statement for all three, and it should not be used as a factual sales claim without stronger primary/vendor-linked evidence.

## What is overbuilt, and what is not

There is no evidence of accidental bulk payouts, multicurrency, per-partner tariff grids, or a general external product API; the original exclusions remain respected. The real payment path is YooKassa and payouts remain manual to the 5th, matching later owner decisions. The distributed monolith, backend-only/internal PostgreSQL, four A–D subfolders, shared code, B customer credits, and MCP/A2A are substantial expansions beyond the one-week template, but the PRD/ADR record them as explicit owner-authorized overrides (`docs/PRD.md:1-17`; `shared/docs/PRD.md:7-20`; `docs/ADR.md:1-11`; `docs/features/f2-commercial/01_specification.md:1-45`). They should be treated as deliberate exploration expense, not unauthorized overbuild.

The owner-facing opportunity-cost issue is sequencing: the project completed four fixture experiences plus real identity/payment/agent infrastructure while the single public acquisition seam shared by all growth paths is still absent. F2 also intentionally serves one generic shared real `/account` on A–D while the specialized A–D roots remain fixtures (`docs/f2-operations.md:1-14,63-65`). This means the authorized breadth has not yet converted into four real growth funnels. The new F3 Resend verification/reset/Yandex work is a pending plan, explicitly awaiting approval and not implemented; it is neither a current feature nor accidental overbuild (`docs/plans/f3-access-and-provider-setup.md:72-78,131-157` at observed concurrent HEAD `f2d0de6`).

## Source binding (SHA-256 at requested baseline `3b157f4`)

- `start/REPLICATE-PROMPTS-PROJECTS.md` — `65690eafed52d722d67530d171fa9a1f67a436737617e4811120901a1f6a9b9c`; controlling template lines 138-194.
- `projects/03-affiliate-rewardful/docs/PRD.md` — `7dbfefd02e462d450ee4f9b7952757609fa4056dd336453f561343fe5cb27592`; lines 1-30.
- `projects/03-affiliate-rewardful/docs/Specification.md` — `e8d084d85aaf800626f201b5c417990b981945c81c78819688eb827d9b2f22da`; lines 254-272.
- `projects/03-affiliate-rewardful/docs/product-discovery-brief.md` — `4819596fe0aad821a15028332277804670bcb8e3356e7144274d96f6772910af`; lines 54-77.
- `projects/03-affiliate-rewardful/docs/discovery/research/market-trends.md` — `89ecd33058d055cd87888854206563b77f52bcf0290836a4345c6026d3450bf9`; lines 149-175.
- `projects/03-affiliate-rewardful/docs/f2-operations.md` — `e11bdadc5d0e74883e3b0facb735903cdf0985a0664d8daf073a463c78509a26`; lines 1-20, 35-41, 63-67.
- `projects/03-affiliate-rewardful/apps/frontend/server.mjs` — `f2c81db00bb17e75a94101a0148761aae5c28cd0f969a373199f18ba770222f7`; lines 18-37.
- `projects/03-affiliate-rewardful/apps/api/account.mjs` — `08b4b62110cc044320f692d7b0de9f3dc2e0780186f094611754482afa53b7fa`; lines 11-43.
- `projects/03-affiliate-rewardful/shared/application/dispatch.mjs` — `e4ae8f906aaea6f6b3b7bc84157b3cabab5ddcb03192b79159f14af8908a7fbe`; lines 8-84.
- `projects/03-affiliate-rewardful/shared/domain/projections.mjs` — `22aa95b13a15856c3ca25c20b4422f75edd4247f6af853bd22253eba848f7671`; lines 9-73.
- `projects/03-affiliate-rewardful/shared/domain/registry.mjs` — `df0450fb0fd7ca651a0ffca06e29ad8b4a34b6a585b126c853abcac11f294d39`; lines 92-132.
- `projects/03-affiliate-rewardful/shared/identity/state.mjs` — `da95f98baf85ce55701464ba0ebf9c6dc6f7a55b92b40b511cd8b20648006c8d`; lines 3-17.
- `projects/03-affiliate-rewardful/shared/identity/service.mjs` — `c5c37d29c6a06572b9e8fd60e018a79f371ff403c7cccaadf8c9083ee1f00a57`; lines 66-80, 123-148.
- `projects/03-affiliate-rewardful/shared/payments/service.mjs` — `8d129b72eba13b4afafb4dd7cc6b7f872ceb2437d467e2b39ec11cdde1f30afc`; lines 27-93.
- `projects/03-affiliate-rewardful/shared/ui/account/app.mjs` — `967f363957f78febe14eb80e3ce756e209938746299526ffc189edb9f05b66b3`; lines 144-180, 225-238, 327-351.
- `projects/03-affiliate-rewardful/shared/ui/account/helpers.mjs` — `f1fb1c4c6cad644a991709fd7704bc1bff4e6e2b279599caf7ee712f2391c3f0`; lines 47-92.
- `projects/03-affiliate-rewardful/shared/ui/account/index.html` — `fccfe8d27c8bdccc3c6d3fda385c8e4d3492a8e6bd51ea5eeec26d0a5bdee65a`; line 1 (minified complete document).
- `research/sources/03-influencer-partnerships.md` — `004bcbbd8a2c5fcb4a8fcc1cf02b2b8ecbf0e21e22fbe96ac6367ee5a8e2db31`; lines 81-87, 118-127, 227-230.

Verification: targeted `rg`, `nl`, `git show`, `git diff`, `git status`, `git rev-parse`, and SHA-256 reads only. No test suite was run because the work unit forbids tests that may write. No source or documentation file was modified by this worker. Model/usage/duration counters are `null`: no execution metadata or account usage meter was exposed to this worker, and no estimate is presented as measurement.

Status: completed
