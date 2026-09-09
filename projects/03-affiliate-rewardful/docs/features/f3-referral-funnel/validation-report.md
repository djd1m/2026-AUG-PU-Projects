# Requirements Testability Analysis
Spec revision: sha256:e642cb5fc5b5775863ac60ed7a33c0bc3bd8e025cd91affc92ec4ab9308e3c1a

## Summary

- Verdict: READY. No blocking findings remain in the current five-document contract.
- Stories analyzed: 1; acceptance criteria analyzed: 10; average base score:96/100. Security:+5 and growth trace:+5 are reported separately from the100point base (adjusted106 including bonuses).
- Blocked:0 by score, artifact floor or unresolved consequential design finding.
- RUN_ID:20260909T111622Z-f3-referral-3b19; WORK_UNIT_ID:funnel-validation-2; bounded AUTO validation retry1.
- PROJECT_ROOT:projects/03-affiliate-rewardful. References below are relative to this root. Read-only review; no project changes, tests, runtime/provider calls or subdelegation.

## Results

| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | Connect actual merchant signup and billing to an affiliate result | 96/100 base; +10 bonuses | 5/6 complete, Small partial;46/50 | 5/5;30/30 | READY |

The accepted scope is a merchant integration: visit→verified merchant signup qualifies attribution, the customer binding remains fixed, each new order freezes current policy, and the authenticated merchant backend authorizes invoice amount. Exact-email self-referral coverage, subsequent N3 email verification and the one-shop limitation are explicit. This review does not reopen those decisions or grant code/deployment acceptance.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-f3-referral-funnel-11 | S11 — Merchant key lifecycle retains tenant authority through rotation, expiry and waits |
| AC-f3-referral-funnel-12 | S12 — Referral redirect preserves first touch and the visit's frozen expiry |
| AC-f3-referral-funnel-13 | S13 — Verified merchant signup binds once with explicit promo precedence |
| AC-f3-referral-funnel-14 | S14 — Invalid evidence refuses while expired or absent evidence permits an organic purchase |
| AC-f3-referral-funnel-21 | S21 — Authenticated invoice creates one immutable order and verified fulfillment status |
| AC-f3-referral-funnel-22 | S22 — Bound customer earns policy-governed repeat commissions with immutable refund corrections |
| AC-f3-referral-funnel-31 | S31 — Isolated funnel metrics distinguish test history and first live commission |
| AC-f3-referral-funnel-32 | S32 — Owner and partner complete the actual merchant integration journey without stale secrets |
| AC-f3-referral-funnel-41 | S41 — Contending referral and payment operations preserve bounded resources and lock order |
| AC-f3-referral-funnel-42 | S42 — Migration and rollback cannot reinterpret any connector notification as a legacy payment |

## Acceptance evidence and scoring

These exact excerpts from `01_specification.md` under the corresponding AC headings establish nonzero Testable and Completeness. This report's `## Criterion scenarios` establishes Traceability for every AC.

| AC suffix | Quoted acceptance evidence |
|-----------|----------------------------|
| 11 | “account version, expiry and revocation are checked on every use and after waits.” |
| 12 | “persist a random opaque visit before redirecting only to the configured HTTPS landing” |
| 13 | “explicit valid promo wins, explicit invalid promo refuses without cookie fallback, and repeat binding cannot change email or recipient.” |
| 14 | “expired receipt yields an explained organic binding, and absent evidence yields an organic binding with null beneficiary.” |
| 21 | “Same request/key reuses the order, changed input conflicts.” |
| 22 | “Invalid provider evidence does not consume dedup identity; late create response cannot downgrade verified success.” |
| 31 | “Test-provider amounts and activation are labeled test and excluded from live first-commission qualification.” |
| 32 | “browser never receives connector secret.” |
| 41 | “there is no network/KDF while holding SQL, bounded admission and DB timeouts apply” |
| 42 | “legacy orders retain their historical attribution behavior while new connector orders use explicit snapshots” |

INVEST: Independent8, Negotiable8, Valuable10, Estimable8, Small4 (one story spans several bounded implementation units), Testable8 =46. SMART: Specific6, Measurable8, Achievable6, Relevant5, Time-bound5 =30. Quality: Traceability10 + Completeness10 =20. Base96/100. Security+5: exact auth/tenant/input/provider boundaries. Growth+5: all FR-GROWTH-001…006 in `docs/product-discovery-brief.md` Growth Requirements Seed appear verbatim in `docs/Specification.md`, `Сохранённые требования discovery`; this proves carry-forward, not delivery or new approval of speculative work. No artifact floor applies.

## Resolution of previous findings

| Finding | Current evidence and conclusion | Required implementation proof |
|---------|---------------------------------|-------------------------------|
| B1 — Unsafe F2 backend rollback after connector traffic | `05_completion.md`, Deployment Plan, now forbids F2 backend/webhook restoration after ANY connector order, even reconciled. Frontend rollback retains F3 API; backend incidents use compatible image or stopped ingress + forward fix. RESOLVED. | S42: late connector duplicate/refund after supported frontend rollback preserves connector semantics; operations receipt records the no-F2-backend boundary. |
| C1 — Frozen receipt expiry absent from tracker transport | `02_pseudocode.md`, Visit and capture/API Contracts, supplies `n3_ref_expires`, bounds new client expiry to future≤365days, keeps existing expiry through policy changes and strips both query fields. DB row remains authoritative. RESOLVED. | S12/S14: policy change, delayed capture, forged expiry, expired cookie followed by new referral; no server-window extension. |
| C2 — Test reward consuming live non-recurring allowance | `02_pseudocode.md`, Checkout and webhook, scopes recurring history to SAME provider mode and persists order-derived testMode provenance. RESOLVED. | S22/S31: test payment → first live payment → second live payment under recurring=false; only first live reward consumes live allowance. |
| C3 — Credential lock inversion and unbounded admission/history | Configure and authorize explicitly orders account/membership SHARE → tenant UPDATE → credential SHARE/revalidation; rotation follows the same order and retains at most1credential row/tenant. Bounded validation specifies public300/min/socket, private600/min/socket, separate account/public/private buckets, max2048entries/60s and no caller-derived bucket names. Architecture states shared proxy/NAT limitation. RESOLVED. | S11/S41: rotate/revoke/version change during tenant/provider waits, final authority checks, credential row count≤1 after repeated rotation, literal threshold tests, ordinary account operation usable during public flood. |

No residual blocker or additional research is requested. Reserved referral query fields, guide wording for server binding time and stale UI suppression are ordinary implementation details already covered by the specified boundaries and scenarios. Resource tests must use the documented bucket separation; they must not assert impossible per-customer fairness within a shared proxy/NAT bucket.

## Named BDD scenarios

- S11: Given a real merchant and active90day key, when rotation/revocation/account-version change occurs during delayed connector work, then current authority is revalidated and stale publication refuses. Expiry at the exact boundary fails; repeated rotation leaves one credential row and no order dependency on the deleted old key.
- S12: Given a configured HTTPS merchant origin and enrolled cash partner, when a browser follows `/r/:actorId`, then a durable visit precedes302, issued expiry accompanies the token, first eligible touch survives a later click and policy change, and query data is removed. Delayed/expired receipt handling never extends the server window.
- S13: Given a merchant-attested verified email and stable customer ID, when parallel matching binds arrive with valid promo and conflicting visit, then one mapping names the promo recipient. Invalid explicit promo commits no mapping and allows a corrected retry. Repeat calls cannot change email/recipient; extra authority fields refuse.
- S14: Given missing or expired evidence, when an organic customer binds and pays, then beneficiary stays null and commission zero. Forged/cross-tenant evidence and exact partner/owner email under a different external ID refuse. Test30/60/90day signup boundaries; an already valid binding survives later cookie expiry.
- S21: Given an authenticated merchant invoice derived from its own catalog, when matching duplicate checkout requests use one key, then one order freezes amount/binding/policy/shop/mode/return URL; changed input conflicts. Redirect/create response does not grant verified-success. Foreign orders or browser-supplied authority cannot be read or substituted.
- S22: Given a bound customer and order-frozen policy, when payments arrive after cookie expiry or promo changes, then recipient remains fixed and current per-order rate/hold/recurring applies. Same-mode non-recurring history suppresses only later same-mode rewards. Duplicate/partial/reordered refunds append exact reversals; provider failure preserves safe retry and late create response cannot downgrade succeeded.
- S31: Given fixture/manual/test/live histories across tenants and partners, when metrics are read across UTC week boundaries, then only authorized connector facts count, unique paid customers remain distinct from payment count, test amounts remain separate, and earliest positive live commission creates one tenant-week qualification. Refunds preserve historical activation; test payments never consume live one-time eligibility or live activation.
- S32: Given a separate merchant frontend/backend and real account screens at390/1440, when a user completes signup, checkout and progress review, then server helper handles verified signup/authoritative amount, fulfillment reads verified order status and keyboard controls work. Logout/member switch before delayed key/status responses prevents stale secret/data rendering. Provider-not-configured remains explicit503.
- S41: Given concurrent click/bind/order/webhook/rotation with injected provider/SQL delays, when numeric admission/cap/time limits are reached, then429/timeout follows the contract, no network/KDF holds SQL, lock order completes without inversion, and one effective binding/order/reward survives. Public flood does not exhaust the separate ordinary-account request bucket. Same NAT/proxy callers share their stated bucket; no per-person fairness claim is tested.
- S42: Given additive migration and connector orders, when frontend rollback retains the F3-compatible API and delayed duplicate/refund notifications arrive, then connector interpretation and immutable accounting remain intact. Legacy rows remain readable. Backend recovery uses compatible API or stopped ingress + forward fix; old F2 processing is never resumed after connector traffic. Stub evidence remains labeled and live acceptance stays unperformed without credentials.

## Mandatory security BDD scenarios

- SEC-AUTH: Given absent/forged/revoked bearer, account session masquerading as connector key, or Origin-bearing browser request, when a private endpoint is called, then deny before customer/order read or mutation; a public locator or tenant ID never grants authority.
- SEC-INJECTION: Given SQL metacharacters in customerId, prototype keys, malformed token/promo and HTML/script in a rendered field, when boundaries are exercised, then exact schemas, parameterized queries and rendering escape prevent execution or extra authority. No unrequested broad scanner requirement is added.
- SEC-TENANT: Given tenant A's key and tenant B's visit/order, when bind or order-read is attempted, then no B data or commission escapes, including cached/idempotent retries after revocation.
- SEC-RATE: Given more than300 public or600 integration requests within60seconds from one socket peer, when calls continue, then the proper route-class bucket denies, stored limiter entries remain≤2048, and ordinary account traffic remains separately admitted during a public flood.

## Revision and validation limits

This bounded retry re-read current `02_pseudocode.md`, `05_completion.md` and changed Scalability Considerations in `03_architecture.md`, against the previously fully read five docs/skill/scoring/report contract and original findings. Specification bytes remained unchanged. Current hashes: pseudocode53e90ae6f51d79d50c88cefbe68aece9323f3935d50d9cea484784be1dc0d4e9; architecture9e215df8ae52b7ef51779ed02a35439d81730cd9a2af878415c126c2b50517ee; refinement8f612ce947595d2610bf1eaeeece7a2ac69b411b657aabd975ef6750359a393a; completion84719b9970ca58730b8ade5f77a3337ba078b7b00bffefde1503768d94d23361.

No automated gate/test/browser/provider/deployment was executed. Named BDD scenarios are requirements evidence, not passing test claims. No repeated provider/product research. Profile:compact-quality-first-v2. Requested/actual model, effort, usage, cost, elapsed/active and weekly quota are null in this worker receipt without attributable host metadata; coordinator owns measured dispatch accounting. One bounded validation retry; no model fallback or subdelegation; economic savings not established.

Trace: /tmp/n3-funnel-validation-2.md
Status: completed
