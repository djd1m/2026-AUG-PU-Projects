# Independent pseudocode validator — N3a CJM A

Status: completed
Verdict: NEEDS WORK
RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: pseudocode
Profile: compact-quality-first-v2
Risk: XL (financial algorithms, tax, isolation, restore)
Baseline: cafe2c4f608ed8262dade750e800e27173517a21
Requested model / effort: gpt-6-astra / high
Actual model / effort: null / null
Model evidence: null; execution attestation is not exposed to this reviewer. Requested routing is not proof of actual execution.
Fallback: null (no model switch performed or evidenced).
Usage / cost / active duration: null (host counters and complete timing boundaries unavailable).
Review started_at / full elapsed_wall_ms: null (first tool boundary was not timestamped; no retrospective estimate).

Owned file: this receipt only. No input edits, implementation, commit, push, delegation, external messages, or real financial actions. Status completed means the bounded review finished; it does not mean the package passed or implementation was authorized.

## Scope and evidence

Read root/project CLAUDE, model-routing and telemetry policies, complexity-router, shared-resource-verification, incoming-webhooks, security-operation-order, fail-closed-defaults, and the sparc-prd-mini algorithm/naming/reconciliation contract. Reviewed Pseudocode against Specification, Architecture, ADR and Refinement. External legal/provider source verification belongs to the separate evidence task; this receipt makes no independent current-law/provider-capability finding.

Accepted owner boundaries preserved: CJM A, N1 first, YooKassa authority in N1, manual transfers on the 5th for the preceding calendar month. Implementation has not started. The separate platform_leads dogfooding proposal is explicitly awaiting owner review and is not represented as completed monetary dogfooding. Its staged scope is not counted as a defect merely because it is deferred.

Deterministic naming check (Python regex over exact standalone declarations, exit 0): Specification has 36 unique FR/NFR declarations; Pseudocode has 36 unique exact REQUIREMENT claims; sets match. There are 40 unique scenarios, 37 unique algorithm claims, no dangling claims; SC-US-012-1/2/3 are the three explicit ui-only exclusions. This proves linkage only.

Semantic strengths confirmed: HMAC precedes freshness/JSON/receipt; canonical lookup precedes financial claim; transport and business uniqueness are separate; receipt/effect commit together; refund-before-parent remains retryable; cumulative refund formula reaches exactly original commission on full refund; allocation and negative carry have explicit single-use rules; positive unsent rows are not silently copied; program locks serialize close/posting; unknown tax remains unknown; uncertain manual transfer never automatically releases its reservation; network/body/KDF work is kept outside DB transactions. Planned shared-pool load testing includes honest parallel users.

Six highest-impact findings follow. Each is an implementability or planned-test issue at document stage, not a demand to run nonexistent application tests now.

## PSEUDO-01 — HIGH — Tax reservation does not implement the promised payer/person/year scope

Sources: Pseudocode Data Structures (TaxYTD, PayoutPreparation), CalculateAndPrepareTax steps 2–5, ConfirmManualTransfer steps 2–4; Specification FR-TAX-002/003; ADR-006 concurrency; Architecture Data Architecture and lock order.

Counterexample: the same payer/person/year has rows in two programs using different base categories. Each transaction locks a different TaxYTD row and sees active_preparation_id=null, so both can remain prepared. A temporary advisory lock alone would not fix this: after transaction A commits, transaction B still sees its different base reservation empty. The promised single active preparation per payer/person/year has no persistent guard at that scope. The NPD/no-withholding branch has no explicit BEGIN, shared reservation, or equivalent identity guard at all. With declared aggregate income 2.38 million RUB, two separate 20,000 RUB NPD preparations can each pass the written individual limit check while their total exceeds the proposal's declared limit.

Fix: define a persistent payer/person/year preparation guard independent of base category and apply it to all preparation models, with a unique active reservation and a clear payer-authorized cross-program access boundary. Keep per-base YTD calculations separately keyed. Give no-withholding/NPD branches explicit transactions, row checks, confirmation rules and verified-internal-income update semantics; do not execute the withholding-only formula on absent YTD inputs.

Missing planned test: simultaneous and sequential preparations for the same person across different programs/base categories/tax models, including NPD aggregate-limit reservations, must allow at most one live preparation; an unrelated person must progress concurrently. Current Refinement mentions general tax transitions and duplicate confirmations, not this scoped reservation invariant.

## PSEUDO-02 — HIGH — Recovery/exception guards have no complete path to record and reconcile an external transfer

Sources: ConfirmManualTransfer steps 1–3; CalculateAndPrepareTax steps 3/6; ReconcileAndRecover steps 3–4; PostRefund step 1; State Transitions final paragraph; ADR-007.

Counterexample: a manual transfer happened after the backup, then the service is restored with RecoveryGate=reconciliation_required. The operator calls confirm to report that external fact. Step 1 checks the gate before step 3 can persist TransferObservation, so the claimed reporting path is unavailable precisely during restore. An unprepared transfer also cannot satisfy the required preparation/snapshot locking inputs before reaching the exception path. For an expired existing preparation, the active reservation is deliberately retained, but the required replacement preparation is rejected by CalculateAndPrepareTax's 'active preparation exists' check; no atomic replacement/reconciliation procedure is defined. Separately, PostRefund lacks the RecoveryGate recheck present in PostPayment, despite restore promising to block financial writes.

Fix: define a narrowly authorized observation-only transaction that remains available under recovery lock and accepts absent preparation IDs; it must not confirm or initiate money. Define an evidenced reconciliation transaction that atomically consumes/replaces the old reservation and links a corrected tax snapshot/preparation without a gap permitting a second transfer. Specify which identity/year locks it acquires when the actual transfer year differs. Check RecoveryGate inside every financial posting/close/prepare/confirm commit, including refunds; keep observation and recovery reconciliation explicitly exempt and audited.

Missing planned test: backup → manual transfer → restore → observation under gate → evidenced reservation replacement → exactly one confirmation, including no preparation and December-to-January cases. Also prove payment and refund posting are both denied while recovery is unresolved. This is a planned state-machine test; no restore drill is claimed here.

## PSEUDO-03 — HIGH — Refund rounding is order-independent only in total, not in monthly entitlement

Sources: PostRefund steps 3–5; AssignPeriodAndFreezeRegistry steps 1/3/4; ADR-004/005; Specification FR-PAYOUT-001/002; Refinement 'Перестановка'.

Exact counterexample: payment 3 kopecks, original commission 1 kopeck; two verified refunds of 1 kopeck each occurred September 30 and October 1. Both arrive October 2 before September freezes on October 5. If September arrives first, cumulative half-up rounding produces reversal September=0, October=1. If October arrives first, it produces October=0, September=1. Both obey the written cumulative formula and have total reversal 1, but the September frozen payable amount differs by a kopeck solely due to transport order. Neither refund was late relative to freeze. A small independent integer arithmetic calculation reproduced both outcomes during this review (exit 0).

Fix: specify a deterministic reconciliation/allocation rule for cumulative rounding across occurred-at periods before freeze, with a canonical tie-breaker and immutable correction entries when earlier facts arrive; or explicitly select and obtain owner approval for a delivery-dependent rounding-residue policy. Merely sorting one dispatcher batch does not cover different batches/out-of-order delivery. Never rewrite a frozen row to hide the discrepancy.

Missing planned test: permute refunds spanning two still-open months and compare each month's ledger adjustment and frozen RegistryRow/hash, not only final cumulative reversal. Add late-arrival-after-freeze coverage for the chosen correction policy. Current permutation oracle explicitly checks the total and would miss this example.

## PSEUDO-04 — HIGH — The partner acceptance path has no coherent Membership transition

Sources: Data Structures (EnrollmentGrant, Membership, Partner, Invitation); AuthenticateSession steps 1/3/4; AcceptPartnerAndAssets steps 1–3; Specification FR-AUTH-001/FR-PARTNER-001 and SC-US-013-1.

Counterexample: a new invited partner signs up but has not accepted terms. Signup creates 'allowed Membership'; Membership permits only active/revoked, while step 1 explicitly forbids active partner membership before acceptance. Creating active violates that requirement. Creating revoked makes the global request check in step 4 deny the subsequent acceptance request. Creating no membership would require an explicit session-only acceptance exception, but it is not stated, and AcceptPartnerAndAssets never inserts/activates Membership or sets its server-owned scopes at all. A successful partner acceptance can therefore leave the user without the access the algorithm promises. Likewise, owner issuance/operator delegation is a required capability with no defined grant-issuance transition; EnrollmentGrant cannot represent operator authority.

Fix: define separate authentication-only enrollment context and authorized invitation acceptance, plus an explicit atomic creation/activation of Membership with a fixed minimal scope set after consent. Define trusted owner bootstrap/grant issuance and owner-authorized scoped delegation, including how preexisting User accounts join another program and how program/partner rows are provisioned without client-selected roles. These can remain minimal internal operations; a new admin product is unnecessary.

Missing planned test: signup before consent cannot read program data; the same session can accept its bound invitation and then obtain only its own partner membership; concurrent acceptance yields one membership/assets; existing-account enrollment and operator scope grants work without allowing a client role override. Broad login/auth-bypass cases do not establish this transition.

## PSEUDO-05 — HIGH — Historical payment eligibility reads a fact the logical model does not preserve

Sources: CaptureAttribution steps 3–5; PostPayment steps 1/3/5; Data Structures (Partner, PartnerAsset, Attribution); Specification FR-PROGRAM-002/FR-COMMISSION-001; Architecture reconciliation declaration.

Counterexample: Partner is active at a customer's registration, then suspended and later reactivated before the delayed registration/payment is processed. PostPayment must determine 'approved partner at registered_at'. Partner has only current status and accepted_at, with no status-validity history or immutable eligibility-at-registration proof; Attribution also lacks that snapshot. A currently suspended partner who was eligible at registration and a currently active partner who was suspended then cannot be distinguished reliably from these declared fields. Delayed first registration delivery also validates current revoked/expired assets without specifying event-time validity, although payment eligibility is defined at registration. The claimed pending→eligible Attribution transition is present in the state diagram but absent from the successful posting steps.

Fix: define durable temporal status/asset validity facts or a verifiable immutable registration eligibility snapshot with exact policy/consent/approval evidence. Specify which checks are evaluated at registration versus payment versus delivery, and return review/retry for genuinely missing historical authority. Explicitly update Attribution.status and first_paid_at consistently in the successful transaction and define the zero-commission/ineligible branches. Do not silently substitute current status for historical approval.

Missing planned test: deliver registration/payment after suspension, reactivation, asset revocation and policy change; evaluate the same event-time authority and preserve the original decision on identical retry. Assert the written Attribution state as well as ledger amount. Refinement's existing policy-change test only preserves an earlier posted ledger entry.

## PSEUDO-06 — MEDIUM — Calendar inputs are mutable outside the frozen policy

Sources: Data Structures (Program.timezone, PolicyVersion, AccountingPeriod.timezone); AuthorizeAndConfigure steps 2–3; duration definition above Core Algorithms; AssignPeriodAndFreezeRegistry step 1; Specification FR-PROGRAM-001/002 and FR-PAYOUT-001.

Counterexample: a payment captured September 30 at 22:30 UTC belongs to October in Europe/Moscow and September in UTC. Program timezone is an editable configuration input, PolicyVersion contains no timezone, and posting uses 'configured' timezone. If the owner changes timezone before a delayed event arrives, that same provider event can acquire a different month. Existing attribution durations also use the current program timezone rather than an immutable policy calendar. AccountingPeriod has a timezone, but posting is not specified to use that stored value or reject a conflicting change.

Fix: for the pilot, make timezone immutable once the program activates/has attribution or ledger data and reject later changes explicitly; alternatively define an effective-dated calendar policy and select its immutable value for posting and duration calculations. Specify period creation and due-date derivation from that canonical calendar. Update Architecture's 'no discrepancies' statement after the actual logical resolution.

Missing planned test: configuration change attempts plus delayed boundary payments and end-of-month duration checks must preserve the selected calendar, including already-created open/frozen periods. Current fixed-clock boundary tests do not exercise configuration mutation.

## Review result and next action

NEEDS WORK before implementation: six specific algorithm/data/state decisions require correction and a focused independent reread. Runtime tests/build/benchmark/restore were not run because no implementation exists; their absence is not used as a failure finding. The existing planned checks remain required at implementation. No approval to start money implementation or real payouts is inferred.

## Immutable input hashes (SHA-256)

- Pseudocode.md: `f2c922ce51096c1ec95eaa1d5a89dd653ae1da2d2a5411c6ad7baf5ecd7b3d6c`
- Specification.md: `36cfb78e1ac7e15e3cd5ce386ee54aa24d380af7022a0ecfeefd5c20bfd10732`
- Architecture.md: `4ca5fb6b354031ad283996ce3c392a999244f401b7d28c3e2e1dea139a41d9e1`
- ADR.md: `282f8bcc5a946edf0a3d05ba863f7c08b11e0b19ae6202a792bef3773414256a`
- Refinement.md: `a5ec83fda577972236addf09def2f57a49ebe668f5f9779bbf5176560c342f8a`

## Measurement closure

Receipt initialized at: 2026-09-09T18:19:13.855726+00:00
Completed at: 2026-09-09T18:21:36.558961+00:00
Measured receipt-finalization interval_ms: 142703 (not full review duration).
Review start/full elapsed, host model attestation, tokens, cost and excluded waiting intervals remain unavailable. No savings claim or estimated usage is made.

Final checks: all five input hashes reverified unchanged; git diff --check exit 0; git status shows only this untracked owned receipt. Receipt has six PSEUDO finding sections and a completed terminal status. These are document/ownership checks, not application test results.

Status: completed
