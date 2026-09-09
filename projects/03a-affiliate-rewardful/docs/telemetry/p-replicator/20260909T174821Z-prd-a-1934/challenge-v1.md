# N3a independent architecture validator and consequential plan challenge

- RUN_ID: `20260909T174821Z-prd-a-1934`
- WORK_UNIT_ID: `challenge`
- Reviewer: `/root/review_architecture`; independent author status: **not an author of the reviewed source documents or donor code**. This separate task inspected the documents and selected donor source directly. Provider independence is not asserted.
- Input worktree: `/tmp/n3a-review-challenge`; baseline: `cafe2c4f608ed8262dade750e800e27173517a21`. Tracked worktree was clean during inspection.
- Profile: `compact-quality-first-v2`; risk: **XL** because the plan governs money, tax gates and cutover.
- Requested model/effort: `gpt-6-astra` / `xhigh`. Actual model, actual effort, execution attestation, usage and cost: **null**; this worker has no host-authoritative counters or model attestation. No model fallback was observed; its absence is not proof of the actual model.
- Start timestamp and elapsed duration: **null**; no clock was captured at worker entry. The coordinator may supply its separately measured dispatch interval. No duration or token estimate is substituted.
- Skills applied: requirements-validator (architecture/acceptance implications only; story scoring belongs to other assigned lenses) and brutal-honesty-review. Local model policy explicitly permits zero findings and overrides its minimum-findings clause.

## Verdict

**Architecture: NEEDS WORK before accepting the concrete XL plan.** The service boundaries, provider-verification ordering, separate business/transport uniqueness, local atomic outbox, immutable allocations and explicit release gates are sound directions. Five high findings below need bounded contract corrections. These are document-level defects or missing state transitions, not claims that unimplemented runtime code failed tests.

The owner decisions remain intact: CJM A, N1 first, YooKassa, manual payments on the 5th for the preceding calendar month. The proposed platform-leads stage remains a visible owner decision; this review does not treat it as approved or completed monetary dogfooding. No application build, migration, external payment or deployment is authorized by this receipt.

## Findings by consequence

### CH-01 — HIGH: refund rounding moves money between calendar periods when delivery order changes

**Exact sections:** `Pseudocode.md`, **PostRefund**, steps 3–4 (line 149 onward), and **AssignPeriodAndFreezeRegistry**, steps 1–4 (line 163 onward); `ADR.md`, **ADR-004** and **ADR-005**; `Specification.md`, **FR-PAYOUT-001** and **NFR-RELIABILITY-001**.

The formula is cumulative by processing order, but each newly allocated rounded delta is dated by that refund's occurrence. Its final lifetime reversal is invariant; its per-period payable amount is not.

**Concrete counterexample, synthetic fixture rather than an observed provider payment:** original payment is 100 minor units with an explicitly configured 1% commission, hence initial commission 1. Two distinct refunds of 30 each occur in September and October. Both are received on October 2, while September is open. Exact half-up arithmetic gives:

| Delivery order | September reversal entry | October reversal entry | Total reversal |
|---|---:|---:|---:|
| September refund, October refund | 0 | -1 | -1 |
| October refund, September refund | -1 | 0 | -1 |

Thus the September register prepared on October 5 changes by one minor unit merely because delivery was reordered. The lock prevents an over-refund but cannot make this allocation deterministic. I reproduced this with Python `Fraction` and the stated half-up formula; no runtime application was exercised.

**Bounded correction:** specify which occurrence period owns each rounding residual. Either establish verified chronological refund order before assigning the period, or define append-only rounding corrections/reconciliation when an earlier refund arrives. Preserve the full-refund cap and immutable frozen history. Add a named gate comparing period rows, carry and payable totals for both delivery orders across a month boundary, including a frozen earlier period; checking only lifetime reversal is insufficient.

### CH-02 — HIGH: historical attribution validity cannot be reconstructed reliably after delayed delivery

**Exact sections:** `Pseudocode.md`, **Data Structures**, Partner/PartnerAsset/Attribution rows (lines 19–22); **CaptureAttribution**, steps 2–5 (line 94 onward); **PostPayment**, step 3 (line 135 onward). `Specification.md`, **FR-PROGRAM-002**, **FR-ATTRIBUTION-001**, **FR-ATTRIBUTION-002**, **NFR-RELIABILITY-001**.

Policy resolution is explicitly historical, but asset revocation and partner eligibility use mutable state without a specified historical decision source. PartnerAsset has current status and expiry, with no revocation interval/version. The registration payload carries code/asset and registration time, not a signed decision against a preserved eligibility version. Generic audit prose does not define an authoritative temporal lookup for these checks.

**Concrete counterexample:** an active partner's valid code is used when N1 commits registration during an N3a outage. The owner revokes the code before the queued registration reaches N3a. CaptureAttribution step 3 can reject the now-revoked code, although the same registration delivered immediately would have produced a stable attribution that step 5 says later code revocation must not reassign. Suspension/reactivation introduces the same question for “approved partner at registered_at.”

**Bounded correction:** make registration-time eligibility the explicit policy decision and identify immutable asset/partner validity history or a verifiable versioned registration snapshot that supplies it. If revocation is intended to be retroactive, that different outcome must be explicit rather than an incidental delivery effect. Add a delayed-registration/revoke/replay scenario and a later-renewal scenario against the original decision. Preserve invalid explicit promo with no cookie fallback.

### CH-03 — HIGH: first-payment chronology has no executable reconciliation outcome once a later payment was posted

**Exact sections:** `Pseudocode.md`, **Data Structures** (chronological-first paragraph and Payment/LedgerEntry fields); **PostPayment**, steps 1, 3 and 5 (line 135 onward); **ReconcileAndRecover**, steps 1–2 (line 244 onward); **State Transitions**. `Specification.md`, **FR-PROGRAM-002** and **NFR-RELIABILITY-001**.

The contract recognizes a late earlier payment and says to create an exception until reconciliation establishes order. It does not specify either the proof that makes the first posting safe or the legal repair transition after order changes. Reprocessing through PostPayment returns existing business outcomes; Payment eligibility/commission is immutable and LedgerEntry permits only commission or provider-refund adjustment.

**Concrete counterexample:** for a first-payment-only policy, later chronological payment B arrives and is commissioned; earlier payment A arrives afterward. Merely confirming A is earlier neither transfers the entitlement from B nor permits reversing B without inventing a provider refund. For a finite recurring duration, moving first_paid_at earlier can also make an already-posted later payment fall outside the accepted window. A perpetual review exception preserves evidence but does not meet the promised delivery-order result.

**Bounded correction:** define a per-customer chronology completeness proof/frontier supplied by N1 and the exact pending-to-terminal decision, or add an approved append-only eligibility correction workflow with the required identities and permitted transitions. State how it handles a previously frozen/sent commission. Add late-earlier first-only and finite-duration gates that assert convergence and unchanged history, rather than merely that an exception exists.

### CH-04 — HIGH: NPD preparations escape the promised person/year reservation

**Exact sections:** `Pseudocode.md`, **CalculateAndPrepareTax**, steps 2, 3 and 5 (line 181 onward), TaxYTD and PayoutPreparation rows; `Architecture.md`, **Data Architecture**, tax/preparation rows and atomic boundaries; `ADR.md`, **ADR-006**, concurrency; `Specification.md`, **FR-TAX-003**.

ADR-006 promises one active prepared transfer per payer/person/year. The algorithm acquires/reserves TaxYTD only for the withholding model. NPD checks declared aggregate income plus the single row before that branch and reserves no person/year capacity. The physical uniqueness only prevents two live preparations of the same row.

**Concrete counterexample within one program:** the same partner has positive unsent rows in two frozen months. Let approved remaining declared NPD capacity be L, and each row be below L while their sum exceeds L. Concurrent preparations each see the same approved income evidence, each passes “declared income + this payment,” and different row constraints permit both. The plan can present both as ready even though it already knows their combined planned payments cross its own eligibility limit. This is a consistency finding about the proposed rule, not a new tax-law claim.

**Bounded correction:** define a common payer/person/year preparation lock/reservation for every tax model, separate from withholding-base counters where necessary. NPD checks must account for known internal paid and reserved amounts since the declared-income evidence snapshot, without pretending external income is known or double-counting payments already included in that evidence. Add independent-connection tests for two outstanding rows and for preparation cancellation/reconciliation. Keep unknown external income fail-closed.

### CH-05 — HIGH: an expired or cross-year reported transfer has no reachable replacement-preparation path

**Exact sections:** `Pseudocode.md`, **CalculateAndPrepareTax**, steps 3, 5–6 (line 181 onward); **ConfirmManualTransfer**, steps 2–4 (line 198 onward); **State Transitions**, final paragraph requiring an approved replacement preparation. `ADR.md`, **ADR-006**; `Specification.md`, **FR-TAX-004**.

After an uncertain transfer the existing reservation is intentionally retained. The required recovery uses a replacement preparation, but preparation creation rejects any active reservation, and cancellation may release it only after confirming that no transfer occurred. No atomic supersession/reassignment operation is defined. The one-live-preparation-per-row constraint reinforces this dead end.

**Concrete counterexample:** a valid preparation is made for September 5, the operator transfers that day, and records it on September 6 after expiry. Confirmation becomes reconciliation_required and retains the reservation. The operator cannot truthfully cancel as “no transfer”; a replacement is rejected by the active reservation, and a replacement for the actual September 5 date would already be expired under the proposed expiry rule. A December preparation followed by an actual January transfer additionally needs safe ownership transfer between tax-year reservations.

**Bounded correction:** distinguish readiness validity at the actual transfer instant from later recording time. Define an authorized, evidence-backed, atomic supersession operation that preserves the old preparation/observation, transfers or consumes its reservation, creates an approved replacement tax receipt and records the same external transfer once. For a year change, specify lock order and updates for both years. The correction must never release uncertain funds to an ordinary new-transfer path. Add late confirmation, stale evidence, cross-year recovery and retry/concurrency gates.

## Boundaries checked without an additional finding

- N1 is explicitly trusted as the only provider-verification authority; N3a does not copy its merchant credentials. Internal HMAC and provider authenticity are correctly distinguished. Existing donor metadata and early-claim problems are not carried forward as safe runtime behavior.
- ADR-002 plus Completion make the cutover manifest, local legacy-writer bypass, old pending-checkout disposition, outstanding old debt ownership and non-reactivating rollback prerequisites. These still need the named implementation/regression gates; an unfinished adapter is honestly labeled a dependency, not a reason to fabricate a runtime test failure at this stage.
- Parent payment locks, independent business uniqueness, cumulative full-refund caps, program close locks and unique allocations/carry consumption address duplicate effects and race serialization. CH-01 concerns their calendar composition, not missing locks.
- Restore explicitly blocks financial admission and requires independently retained transfer/frozen evidence, including transfers after backup. Completion requires an actual restore drill and source reconciliation before release. This review makes no assertion that the drill already passed.
- Pool/admission/timeout limits and concurrent honest-user/NAT checks are named. Tenant/object authorization and actual-role regression remain mandatory implementation evidence. Existing security scenario obligations include SC-US-001-3, SC-US-002-3, SC-US-008-3 and SC-US-013-3/4; they are not scored or executed here.
- The platform-leads-only scope proposal is visibly deferred for owner review in PRD, Specification and ADR-008. It cannot be counted as completion of the original paid platform dogfooding loop.

## Validation evidence and limits

Read the stored `evidence/planning-gates.json`; did not rerun those gates. Completeness and external-dependency declaration checks have exit 0, as do stored growth/handoff/name-trace checks. They do not establish semantic correctness. The stored look-origin check is 2 for a seed-column parse problem, look-trace is 2 for `no-browser-mcp`, and webhook-contract is 2 for `not-implemented`; none is reclassified as passed.

Performed direct contract/state traces for CH-02–CH-05 and an independent exact-rational arithmetic probe for CH-01. Inspected relevant N1 webhook, payment and referral source, plus the N2 verification-before-claim donor. Their hashes below match the quoted donor snapshots. No repository tests/builds, browser tests, provider requests, tax-law revalidation, commits, pushes, source-document changes or subagents were performed. The only authored deliverable is this receipt. Missing runtime tests are future gates, not invented evidence.

## Exact input hashes

Paths are relative to `/tmp/n3a-review-challenge`; hashes identify inspected bytes, not a claim that every referenced external page was reopened.

| Input | SHA-256 |
|---|---|
| `CLAUDE.md` | `3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241` |
| `projects/03a-affiliate-rewardful/CLAUDE.md` | `464f44d8227f8d703e9c8f09a55afd66015482162d7c928983ed043fcabf29e2` |
| `docs/development/model-routing.md` | `cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9` |
| `docs/development/model-routing-telemetry.md` | `22ba852701d2c78b372cb07ed9b53f4227799ff6f8dc9c57849c09d0c35829cd` |
| `.claude/rules/complexity-router.md` | `422a1d1952f7755c1ea772b33e9e41e1bd78a239af8a0a490f03bc48eb4e0c70` |
| `.claude/rules/security-operation-order.md` | `02c4ec35e724db1c2001c7070037b565802087af76d2349a447fda1d454f03bd` |
| `.claude/rules/incoming-webhooks.md` | `92f3de02814ed0610df644acf554f4b41b2bae2f9d281695e2e217a1d6558e84` |
| `.claude/rules/model-routing-local.md` | `11ce29df7bdb96f00ecd3c3204ac91cc3fa045865652563c617e61186085521d` |
| `.claude/rules/swarm-file-evidence.md` | `c71a216dbc3fd633c30949823ceac354f8439b96279a1a8dd606afb1b3ef5c45` |
| `.claude/rules/shared-resource-verification.md` | `f8c2d0b4151dcfbe244babc110300b64eb4a449d5531800af169f296a908f4ac` |
| `.claude/rules/fail-closed-defaults.md` | `dde3be22d932418dacb52364b744979a95fc98ca14e1b6917a6d952b261827b3` |
| `.claude/skills/requirements-validator/SKILL.md` | `b4b394adf08feee552f39c83331398f119e0d4abf21e683fe4706da438b4a426` |
| `.claude/skills/brutal-honesty-review/SKILL.md` | `f49957f8bac6b55ab49bb953867b1aa3d6d658f4a1d24eddec5b05a71a07da54` |
| `projects/03a-affiliate-rewardful/docs/PRD.md` | `13800427fed04e78d12414c93ff30e8d1a5d61579d1ec7d66d21499537d82384` |
| `projects/03a-affiliate-rewardful/docs/Specification.md` | `36cfb78e1ac7e15e3cd5ce386ee54aa24d380af7022a0ecfeefd5c20bfd10732` |
| `projects/03a-affiliate-rewardful/docs/Pseudocode.md` | `f2c922ce51096c1ec95eaa1d5a89dd653ae1da2d2a5411c6ad7baf5ecd7b3d6c` |
| `projects/03a-affiliate-rewardful/docs/Architecture.md` | `4ca5fb6b354031ad283996ce3c392a999244f401b7d28c3e2e1dea139a41d9e1` |
| `projects/03a-affiliate-rewardful/docs/ADR.md` | `282f8bcc5a946edf0a3d05ba863f7c08b11e0b19ae6202a792bef3773414256a` |
| `projects/03a-affiliate-rewardful/docs/Completion.md` | `b4dc3683129fe10d99096a4d8372223f36e0a7e6b87236fd6ca674c1260068e0` |
| `projects/03a-affiliate-rewardful/docs/Refinement.md` | `a5ec83fda577972236addf09def2f57a49ebe668f5f9779bbf5176560c342f8a` |
| `projects/03a-affiliate-rewardful/docs/implementation-plan.md` | `698d64cebff07f590ec5741ce33bf0419f4d588d184a792d7170ec64f02f8ef3` |
| `projects/03a-affiliate-rewardful/docs/discovery/reuse-inventory.md` | `79a26ce2df755ca5f52dd655abe3bfccdd7fb4e679e0c0abbaa42126428b2688` |
| `projects/03a-affiliate-rewardful/docs/discovery/prd-source-evidence.md` | `779a955accbb2d88b2a6ca825965f720924bc0f2408cb778f21af2f33adef167` |
| `projects/03a-affiliate-rewardful/docs/discovery/tax-boundary-evidence.md` | `6ad12d82e6fb28cf088933dcc59d00432a5d1f2952d4a217d503d1e31a195353` |
| `projects/03a-affiliate-rewardful/docs/webhook-contract.md` | `315334f4ffcfa86a499845b56cfcf7fac7349faeeefb705e0e271c61bd159cc9` |
| `projects/03a-affiliate-rewardful/docs/test-scenarios.md` | `a03af82ba8f12e80177d9911f2c3bcf173304ea018f55d8da2dc385cd8aa2769` |
| `projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/evidence/planning-gates.json` | `89388803da58aaee56cbf4703ad45012d38e7d2178b7247a575315cd93b46ab4` |
| `projects/01-testimonials-senja/apps/web/src/app/api/webhooks/payment/route.ts` | `3c63377a6277040a72df7cd62edc107288bd22da1114cf3d2c49417551d190e3` |
| `projects/01-testimonials-senja/apps/web/src/lib/referral.ts` | `86f816ecee7e17acb6bb81e6bff45cad81077a9823ce388fdf526cb7853f5664` |
| `projects/01-testimonials-senja/apps/web/src/lib/payment.ts` | `be525af7d1b8a82c4cf3fb5911670a466611b2ecfa44e2da4f26b783b7ca78b7` |
| `projects/02-review-qr-reputation/apps/web/src/payment.ts` | `b1da88936f32174c57b78bedf586fe104c57533927ecbb864e1944e578ff6987` |

Receipt finalized at: 2026-09-09T18:24:13.821193+00:00
Findings: blocker 0; high 5; medium 0. Review completed; plan acceptance remains NEEDS WORK.

Status: completed
