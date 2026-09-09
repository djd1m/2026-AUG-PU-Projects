# Requirements Testability Analysis — n3-affiliate-bridge
Spec revision: sha256:f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11

RUN_ID: 20260909T170258Z-proofwall-n3
WORK_UNIT_ID: bridge-validation-1
Verdict: CAVEATS

## Summary

One US-001, exactly six acceptance criteria. Requirements are testable and preserve approved scope. Initial H-01/H-02 were corrected by the parent and revalidated against current source bytes; no PLAN blockers remain. Numeric worker bounds and concrete authority epoch are implementation caveats to enforce before acceptance. No renewed product approval is required. This is not feature or release acceptance.

INVEST: Independent 0 (paired N3 contract), Negotiable 8, Valuable 10, Estimable 8 (handoff sequence concrete), Small 4 (cross-service XL), Testable 8 =38/50. SMART: Specific 6, Measurable 8 (rate limits, exact money/duration, one-use), Achievable 6, Relevant 5, Time-bound 5 (24h token TTL/60s cooldown/23h ambiguity in canonical 02) =30/30. Quality: Traceability 10, Completeness 10 =20/20. Base 88/100; security +5; growth +0 (no product-discovery-brief.md found in P1) =93/100.

Blocking floor: Testable, Completeness and Traceability are nonzero with AC quotations below and exactly-six Criterion scenarios table. No score-floor block applies; CAVEATS records specific implementation obligations; no score-floor block applies. Initial plan concerns are resolved in the current revision.

## Acceptance criteria assessed

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-1`:

> Given referred new Proofwall account, when same current account proves email with valid one-use fragment token, then atomically store service-only proof and durable idempotent signup delivery of original receipt toN3; checkout waits for acknowledged customer binding; GET/replay/foreign/expired/version-changed proof cannot verify; requests bounded5/hour/account and30/hour/IP with60s cooldown.

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-2`:

> Given existing/SSO account or concurrent signup, when establishing referral proof, then no unverified equal-email SSO auto-link can inherit verified account; N3 and native cookie namespaces remain separate; no duplicate native commission on bridge-managed order.

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-3`:

> Given owned project and verified bridge customer, when buying990RUB/30days, then persist stable local intent andN3external order before native YooKassa creation; metadata binds both IDs, retries/earlywebhook/crash recover one purchase; amount/project/customer cannot be browser-forged.

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-4`:

> Given confirmed provider payment, when native webhook commits tariff, then atomically persist unique bridge event; N3 outage/restart cannot lose it or duplicate tariff; bounded leased worker sends outsideSQL and retries with visible status.

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-5`:

> Given original purchase and another independent extension, when repeated or partial/full verified refund arrives, then relay once toN3 and expose manual entitlement review without silently removing unrelated paid periods; distinct successful purchases serialize extension and repeated event never extends twice.

From `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`, heading `AC-n3-affiliate-bridge-6`:

> Given existing Proofwall and project02, when bridge is enabled only for configured test program, then native nonbridge behavior stays available, user sees email/payment/bridge status, real browser route works desktop/mobile, no DB host ports/new default passwords; project02 unchanged.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-n3-affiliate-bridge-1 | Email proof transaction survives N3 outage |
| AC-n3-affiliate-bridge-2 | Identity and attribution cannot be inherited |
| AC-n3-affiliate-bridge-3 | Native purchase survives all create gaps |
| AC-n3-affiliate-bridge-4 | Atomic tariff and event delivery |
| AC-n3-affiliate-bridge-5 | Refund review preserves another renewal |
| AC-n3-affiliate-bridge-6 | Desktop/mobile rollout preserves native path |

## Named BDD scenarios

### Email proof transaction survives N3 outage

Given referred account/current session and one valid 24h token, when explicit POST consumes it while N3 is down, then exactly one proof and signup outbox job commit, GET never mutates, retries do not reconsume token, and restored N3 receives the original immutable receipt once.

### Identity and attribution cannot be inherited

Given passwordless account and unlinked Yandex external id with equal unverified email, when callback arrives, then existing account is not linked; original tenant-specific N3 receipt cannot be replaced by pw_ref or later promo input, and bridge order never enters native commission path.

### Native purchase survives all create gaps

Given owned project and verified acknowledged N3 binding, when purchase begins, then local invoice and N3 order persist before native POST; lost response and early webhook correlate metadata IDs and stable request key to one purchase; after 23h ambiguous create requires reconciliation.

### Atomic tariff and event delivery

Given independently confirmed native payment, when transaction commits, then one exact tariff credit and unique outbox event commit together; crash before/after N3 acknowledgement and lease expiry recover with stable event identity, outside SQL, and late pending callback cannot regress completed state.

### Refund review preserves another renewal

Given two distinct paid invoices, when concurrent settlements complete, then expiry gets two 30-day extensions; same payment replay adds none; verified partial/full refund relays once, creates visible manual entitlement review and does not erase the other invoice period.

### Desktop/mobile rollout preserves native path

Given bridge enabled for configured TEST program and unrelated existing Proofwall account/project02, when desktop 1440px/mobile 390px browsers use signup and payment flow, then proof/payment/binding/retry status is visible, native nonbridge checkout stays usable and project02/source/deployment remain unchanged.

## Cross-catalog findings

**H-01 resolved — durable verified signup.** Revised canonical 02 and P1 AC1 explicitly make proof consumption, service-only proof and immutable customer-bind job one transaction; use account/proof business key, retry existing N3 bind idempotently after crash/outage, and gate checkout on acknowledged binding. This closes the one-use-token export gap. Test lost bind response and crash immediately after proof commit; do not treat proof success as remote binding acknowledgement.

**H-02 resolved — receipt capture.** Revised canonical 02 names `/n3/start`, fixed configured tenant, canonical N3 token/expiry validation, first unexpired receipt, tenant-specific host-only HttpOnly Secure SameSite=Lax cookie, fixed same-origin registration redirect, server-cookie capture atomically with account creation and distinct N3 promo field. N3 remains authoritative for token validity. Include actual N3 referral redirect through this endpoint in browser E2E; preserve server receipt across Yandex login redirects if offered.

**M-01 resolved — wire envelope and typed order acknowledgement.** Revised canonical 02 specifies HTTP200 `{data: result}` consistent with existing referral handler/client, safe error envelope, UUID plus exact expected amount/currency/TEST-mode validation before native provider creation. Both new adapters must obey this; no direct bare-object shortcut.

**M-02 — Numeric worker bounds remain implementation caveat.** “Bounded batches”, lease expiry, retry/backoff and visible recovery are correct testable properties but numeric defaults/maxima are not fixed. Implementation must select explicit HTTP timeout, batch size, concurrency, lease duration, retry schedule and authorized replay path; require timeout shorter than lease or lease renewal with fenced acknowledgement, no long SQL across HTTP, and no silent discard at ceiling. Test same-event concurrent workers and crash after remote acceptance. This is routine authorized implementation choice, not a request for another product approval.

**M-03 — Define P1 authority revision concretely.** Canon requires account/email/session-authority binding and invalidation after authority change, but P1 has no accounts.version today. Implementation must select persisted epoch or exact session/password authority fingerprint and enumerate reset/change/logout/SSO-link/email-change effects. Dedicated service-only proof table avoids broad authenticated accounts grants. Test proof issued under old authority, then a fresh session attempts consumption; require current epoch and correct account/email match, no new session minted by proof. Worker must not publish a still-queued stale proof without checking the chosen invalidation rule.

**M-04 — Preserve cumulative refund rounding explicitly.** “Proportional correction” should use existing N3 docs/runtime-contract.md formula: floor(P*bps/10000)-floor((P-R)*bps/10000), incremental delta from already reversed total, cumulative refund<=gross, original policy snapshot, and existing post-sent exception behavior. Add tiny successive partial refunds whose independent rounding would differ. P1 manual entitlement review is explicit and adequate; there is no requirement here for automatic subscription proration or immediate badge revocation.

**M-05 resolved at PLAN — isolated release baseline.** Canon now pins deployed F3 baseline f8055e3 and dedicated release worktree/branch, bridge-only cherry-picks, full baseline regression and no unaccepted main access checkpoint. Release remains contingent on exact source/build receipts and A–D/protocol/browser checks on that release candidate, not only main. Source selection is now concrete, not an open planning blocker.

**L-01 — Clean duplicate prose during normal implementation.** Canon now generalizes outbox keys to unique(kind,businessKey), but subsequent paragraph still says unique(event,providerObjectId). State latter only for payment/refund specialization so signup cannot accidentally inherit a provider-only required column. Local P1 02 AC1 algorithm repeats old shorter wording; canonical rule and revised P1 specification are explicit and control implementation, but synchronize copied wording to avoid another drift. These are consistency caveats, not absent ACs.

No unresolved blocker remains in the reviewed PLAN. CAVEATS means proceed within approved scope while enforcing these implementation/test obligations; it does not accept code, tests, deployment or live payment evidence.

## Mandatory security scenarios

- **Authentication bypass denied:** Given missing/malformed/revoked connector bearer or browser Origin, when private integration POST arrives, then reject before provider IO and financial/dedup writes. For P1 proof endpoints, absent current session cannot consume a valid token.
- **Injection does not reach authority:** Given extra tenant/beneficiary/amount fields, prototype keys or SQL/XSS strings in referral and identifier inputs, when parsed, then reject schema or safely render the string; no dynamic SQL or execution and no authority changes.
- **Cross-tenant/project denial:** Given account A or connector A and B's project/order/customer/cookie, when submitted, then refuse before provider IO; no B data, proof or payment state leaks.
- **Proof brute-force bound:** Given simultaneous attempts from one account or IP, when issuance exceeds stated 5/hour/account, 30/hour/IP or 60s cooldown, then only permitted work runs; include many accounts sharing one IP so IP limit cannot race through per-account locking. Invalid bodies and oversized bodies follow a specified cheap rejection/rate policy.
- **Same token parallel consumption:** Given one current valid proof token, when two transactions submit concurrently, then one token consume, one proof and one signup outbox event exist; losing request cannot publish a second signup or session.

## Scope and honest evidence

Validation is read-only source/document analysis; no tests, migrations, provider calls, secret reads, deployment or live UI checks ran. These scenarios are required future evidence, not claims of passing tests. Completion files correctly say planned; absence of Phase 3 Criterion coverage at this stage is not a requirements blocker. Before completion, all six ACs need exact existing Test file/Test title rows, and review needs current spec hash plus per-AC verdict/evidence.

Architecture preserves separate backend PostgreSQL services and native Proofwall ownership. No project02 changes or automatic bank payouts. Native legacy purchases and bridge-managed orders need an explicit server-side branch to preserve checkout availability without accidentally duplicating commission. Existing comments describing permanent paid/no-op/HMAC are stale; current tariff and provider-specific verified fetch behavior governs implementation.

## Input revision manifest

- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/01_specification.md`: `f8cfa4a2836ce91ac6170e875d1284434b9a49f8db46bdccb731dc8f61617d11`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/02_pseudocode.md`: `1180ecd97511e82606c54a03f63d54a3062744a2ee775a3163e32908cc45c588`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/03_architecture.md`: `6b8efedf2345bfca2a8c41a79255f859d0eec616f93ce92ba6d343f79568c18e`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/04_refinement.md`: `eb0c4c3a773634c6e47b5dcbdc58efd813389d825045130bed7cca5513f2840c`
- `projects/01-testimonials-senja/docs/features/n3-affiliate-bridge/05_completion.md`: `1540a9509bdc7bf1edd09c488fd91ea8832b28a61f3034dcc4b6bdf01e277d91`
- Shared canonical N3 02 SHA256: `4cafa4af41309ba73e1b9a490a1b7b18c55b33606e33c4cc89b050ae98ae761e`

Actual model/effort/usage: null (no host execution metadata/counters available). This report does not estimate tokens or cost.
Status: completed
