# Requirements Testability Analysis — f4-proofwall-integration
Spec revision: sha256:c78a8ff1abe9efab187b8906d95224d1852820235d6d698da291b1f775f0a424

RUN_ID: 20260909T170258Z-proofwall-n3
WORK_UNIT_ID: bridge-validation-1
Verdict: CAVEATS

## Summary

One US-001, exactly six acceptance criteria. Requirements are testable and preserve approved scope. Initial H-01/H-02 were corrected by the parent and revalidated against current source bytes; no PLAN blockers remain. Numeric worker bounds and concrete authority epoch are implementation caveats to enforce before acceptance. No renewed product approval is required. This is not feature or release acceptance.

INVEST: Independent 0 (explicit paired P1 integration), Negotiable 8 (technical details can be refined), Valuable 10, Estimable 8 (handoff sequence concrete), Small 4 (two-service XL), Testable 8 =38/50. SMART: Specific 6 (concrete wire/capture contract), Measurable 8 (exactly once, integer money/cap), Achievable 6, Relevant 5, Time-bound 0 (no delivery timing bound) =25/30. Quality: Traceability 10, Completeness 10 =20/20. Base 83/100; security +5; growth +5 =93/100. Growth seed FR-GROWTH-001…006 is traced in project docs/Specification.md headings; speculative scope is not expanded here.

Blocking floor: Testable, Completeness and Traceability are nonzero with AC quotations below and exactly-six Criterion scenarios table. No score-floor block applies; CAVEATS records specific implementation obligations; no score-floor block applies. Initial plan concerns are resolved in the current revision.

## Acceptance criteria assessed

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-1`:

> Given a verified bound customer and valid connector, when reserving an external invoice, then persist one attributed order without provider creation; replay same invoice reuses it, changed amount conflicts, unknown customer/foreign key refuses.

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-2`:

> Given that external order, when Proofwall submits payment id, then independently fetch and verify provider shop/test/RUB/amount/metadata/paid status before exactly one commission; forged or legacy-order events fail and cannot consume dedup.

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-3`:

> Given paid external order, when refund arrives before or after payment relay and is replayed, then validate original payment and apply payment/refund once, preserve policy and proportional correction; test money never enters payable registry.

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-4`:

> Given key rotation/revocation or contention during provider IO, when result returns, then current authority/order binding is checked under consistent locks; foreign order refuses before network; no SQL held across network.

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-5`:

> Given real HTTPS frontend→Proofwall→N3 path, when signup proof and99000minor purchase complete, then existing partner sees referral registration/test payment/commission; reload preserves evidence; payout balance truthfully remains separate.

From `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`, heading `AC-f4-proofwall-integration-6`:

> Given current deployedN3 and pending access checkpoint, when bridge rolls out, then baseline auth remains usable or prerequisite access gates pass; old payments/refunds, A–D and MCP/A2A regressions pass; databases stay unpublished and scoped; sources/builds/limitations recorded.

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-f4-proofwall-integration-1 | Reservation without provider create |
| AC-f4-proofwall-integration-2 | Verified provider settlement only |
| AC-f4-proofwall-integration-3 | Refund-first cumulative correction |
| AC-f4-proofwall-integration-4 | Authority rechecked after provider wait |
| AC-f4-proofwall-integration-5 | Real referral evidence survives reload |
| AC-f4-proofwall-integration-6 | Pinned compatible deployment |

## Named BDD scenarios

### Reservation without provider create

Given a verified N3 customer and valid connector, when reserving invoice UUID X twice concurrently, then one external order with identical immutable policy/attribution exists and provider POST count is zero; changed amount for X conflicts and retry succeeds at the 5000-order cap.

### Verified provider settlement only

Given external order O, when forged, unknown, legacy or mismatched shop/test/currency/amount/order payment is relayed, then no commission or terminal dedup is written; a later correct independently fetched succeeded payment produces one commission.

### Refund-first cumulative correction

Given reserved external O with a paid provider object and refund, when refund relay arrives first and both events replay, then one payment fact and one refund fact survive; cumulative minor-unit correction uses original policy and test money remains excluded from payable registry.

### Authority rechecked after provider wait

Given authorized connector and provider GET paused, when owner resets authority/revokes key or changes order binding before response, then final ordered account→tenant→order transaction rejects stale authority; no connection is retained during wait and foreign order is rejected before GET.

### Real referral evidence survives reload

Given existing partner referral link, when browser reaches Proofwall, signs up, proves email and pays 99000 minor units through the existing shop, then N3 shows registration, TEST payment and TEST commission after reload with payable balance separate; failed binding stays visible and retryable.

### Pinned compatible deployment

Given selected source baseline and bridge migration, when full auth/legacy payment/refund/A–D/MCP/A2A checks plus build/browser evidence pass, then release receipt names exact source/build identity, access policy remains intended and isolated databases expose no host port.

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

- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/01_specification.md`: `c78a8ff1abe9efab187b8906d95224d1852820235d6d698da291b1f775f0a424`
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/02_pseudocode.md`: `4cafa4af41309ba73e1b9a490a1b7b18c55b33606e33c4cc89b050ae98ae761e`
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/03_architecture.md`: `6b8efedf2345bfca2a8c41a79255f859d0eec616f93ce92ba6d343f79568c18e`
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/04_refinement.md`: `eb0c4c3a773634c6e47b5dcbdc58efd813389d825045130bed7cca5513f2840c`
- `projects/03-affiliate-rewardful/docs/features/f4-proofwall-integration/05_completion.md`: `1540a9509bdc7bf1edd09c488fd91ea8832b28a61f3034dcc4b6bdf01e277d91`
- Shared canonical N3 02 SHA256: `4cafa4af41309ba73e1b9a490a1b7b18c55b33606e33c4cc89b050ae98ae761e`

Actual model/effort/usage: null (no host execution metadata/counters available). This report does not estimate tokens or cost.
Status: completed
