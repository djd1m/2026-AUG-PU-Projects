# Final independent consequential review — resumed candidate
Reviewer family: codex
Spec revision: sha256:937b23634f89f589a7cd8e6e5c0afd6f3b1ad0bfc8c3e102363d9ca4e9a9fbc4
RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT: review-final-resumed
Profile: compact-quality-first-v2; risk: XL
Requested model/effort: gpt-6-astra / high
Actual serving model/effort, usage, cost: null (execution metadata unavailable; no estimates)
Actual resumed start: 2026-09-10T09:26:07Z
Finished: 2026-09-10T09:35:28.463826+00:00
Elapsed resumed wall: 561463 ms; active compute: null
Inputs: 01_specification.md, validation-report.md, implementation-contract.md, all five feature documents, initial review and committed correction receipts.
Validation report SHA256: 0959488b4b82136d6c7a7a39f92bb21546a18515b8007967d0c17c7fffb74ea6

Verdict: initial implementation defects are closed on the inspected candidate. Eleven criteria are met at the explicitly bounded local TEST scope; AC11 remains unverifiable for the absolute all-project unchanged-source/deployment requirement. Its specified P1→N3 human journeys passed. No observed remaining payment-module blocker was found, but this is not unconditional feature completion, a security all-clear, public release authorization or actual provider acceptance.

## Scope and source identity

Runtime candidate `b2343b00208195b3365380146cecdd417f32c6a8`, Next BUILD_ID `T72HtODyBT3GucyLfM4Wh`. Both browser suites executed MAIN P1 source at `30b909c8a54079ad13ac3cd1f94e8fa2ee975bfe`; subsequent docs/Docker-ignore edits changed no runtime. Test-only agent harness subsequently integrated as `12a4917fa6f36c3249925e1bfc53225c0390b9f7` (author commit `36e35de969b21de36d1a64df1153116cb4a1a414`). It was inspected from the author's isolated checkout and its source/evidence hashes matched the terminal receipt.

The reviewer independently matched every runtime/compiled hash in the agent browser acceptance manifest to MAIN. Human browser runner checked its complete tracked P1 source/build manifest before and after five runs. `/tmp/agent-payments-implementation-7e80/final-reviewed-sources.json` SHA256 `9d431f7a4aee7b9413493a60d8d84906b8ffef53f151b32ff43f2888e0977da4` binds 52 review-relevant files; human `candidate.json` binds the broader source/build set. Initial review.md remains unmodified with original snapshots and pre-fix findings.

Integrated regression was actually recorded at source `339e688`; reviewer verified the P1 diff to b2343b0 consists only of documentation/telemetry. This establishes scoped P1 runtime equivalence without rewriting execution history. Unrelated concurrent project03a work prevents a claim that the whole monorepo stayed unchanged.

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-agent-purchase-1 | met | Core has no Proofwall/N3 imports; packages/agent-payments/test/postgres.test.mjs different-product reference hosts and test/extraction-check.mjs independently installed package consumer. Core-followup receipt records actual PostgreSQL packed-consumer PASS. |
| AC-agent-purchase-2 | met | apps/web/tests/agent-payments-host.test.ts one-use concurrent pairing; security tests reject wrong origin/CSRF/scope. Actual agent browser consent/email/session, foreign-resource refusal and revocation passed; token absent from pairing poll response. |
| AC-agent-purchase-3 | met | Core postgres grant-alone/saved-method-alone tests require approval with zero create calls. Agent browser grants no payment authority, separately accepts bounded mandate, then issues exactly one saved-method renewal. |
| AC-agent-purchase-4 | met | Immutable core quote/order storage and authoritative host offer; postgres price/terms/expiry eligibility tests, host ownership/price tests and command extra-field rejection. Prepare has no PSP create; persisted N3 order binding precedes payment. |
| AC-agent-purchase-5 | met | Actual agent browser requires explicit human consent before hosted fixture payment; core/provider tests reject unverified success and redact method references. Human matrix proves browser return alone does not activate entitlement. No card/OTP inputs added. |
| AC-agent-purchase-6 | met | Host price/last-three-days/Moscow-calendar test; core account/mode/terms/currency/amount mandate checks and persisted shared budget tests. Agent renewal scenario passes with explicitly disclosed synthetic prior-month spend and final-two-day tariff setup. |
| AC-agent-purchase-7 | met | Real PostgreSQL concurrency, idempotency, revoke/fence, unknown retention and shared human-spend tests. followup.test.mjs covers both abandonment barriers and fresh authorization after proven cancellation. Host tests preserve deliberate extra manual purchases and disabled-period budget history. |
| AC-agent-purchase-8 | met | Provider fixtures reject shop/mode/metadata/amount/status mismatches. PostgreSQL rollback/replay and deferred fulfillment recovery reuse one paid event. Actual browser verified webhook/replay settles once; gateway cancel cannot cancel accepted payment. |
| AC-agent-purchase-9 | met | Host bridge test asserts one external outbox and zero native commissions; existing N3 worker retry tests preserve durable delivery. Five human browser runs verify198 RUB TEST commission then495 RUB refund and99 RUB net, duplicate-safe. Core cumulative refunds preserve budget and other-period tests. |
| AC-agent-purchase-10 | met | Actual MCP SDK Streamable HTTP and A2A run through real P1 policy in agent browser suite; same persisted order, gateway restart recovery and revocation pass. Gateway fixture tests6/6 additionally cover protocol/error behavior; compose gives gateway no DB/provider credentials. |
| AC-agent-purchase-11 | unverifiable | P1→N3 A-disabled and A/B/C/D-enabled human browser matrix5/5 PASS with no agent PSP credentials/grants/mandates; existing deployed P1/P2/N3 smoke8 pages PASS. Inventory proves zero committed changes for P2/P3/P4–P8, but records87 concurrent changed files in03a and only a completion deployment snapshot. Thus the absolute every-project unchanged-source/deployment clause is not established. No regression is inferred from that evidence gap. |
| AC-agent-purchase-12 | met | Isolated PostgreSQL without published ports, separate internal networks, no default gateway secret, opt-in issuance. New provider refuses live configuration before network. Actual agent browser/SDK/A2A11 scenarios PASS. Real YooKassa TEST saved-method purchase is explicitly a separate pending provider step, as this criterion permits; fixtures do not satisfy that step. |

## Initial finding closure

Paths are relative to P1; line references refer to the reviewed runtime source.

| Finding | Closure evidence |
|---|---|
| R1 HIGH prepared order blocks human checkout | legacy.ts:20 calls trusted abandonment under project/buyer locks; cancellation.ts:24–49 preserves every fenced/unknown attempt and cancels only provably unsent. Host compatibility test:97 covers expired and revoked preparations; ordinary browser matrix passes enabled without agent authority. |
| R2 HIGH canceled period claim retained | cancellation.ts:7–15 releases held reservation and deletes exact scope/period/source claim. followup.test.mjs:17,32 prove verified cancellation/pre-fence denial permits new authorization while the canceled order stays canceled. |
| R3 HIGH refund loses account/provider binding | settlement.ts:194 checks stored attempt provider/account before queryRefund and repeats inside settlement. followup.test.mjs:135 asserts switched provider/account causes zero refund queries and no correction. |
| R4 HIGH canceled human checkout remains blocked | legacy.ts:134–161 expires exact canceled checkout even without a module hold, deleting only bound provider/request hold. New cancellation tests cover disabled checkout, early native retry rollback, early N3 cancellation and late response unable to hijack new hold. Prior partial fix was not accepted until these cases were corrected. |
| R5 HIGH feature toggle omits human spend | legacy.ts:100–119 observes verified future spend whenever generic ledger exists, regardless issuance flag. history.ts:9–50 imports current-month missing completed PSP facts using authoritative fetched amount/account and server receipt timestamp; incomplete history fails agent admission closed. Compatibility test:176 covers disabled observations/idempotent catch-up/cap denial with manual allowance. |
| R6 MEDIUM A2A hides human handoff | services/agent-api/src/protocols.mjs derives input-required from actual human_approval/open_url nextAction, including prepared order. Direct DTO probe and real gateway tests cover it. |
| R7 MEDIUM safe lowercase error code lost | services/agent-api/src/backend.mjs:29–40 permits bounded safe domain code characters, omits exception/provider text and never auto-retries an unknown backend execute result. Reviewer backend tests pass. |
| R8 MEDIUM gateway Docker context mismatch | services/agent-api/Dockerfile uses service-relative COPY against compose context./services/agent-api. Coordinator full gateway image build passed. Reviewer inspected corrected files. |

Additional amendment race closed: execution rechecks terminal order state under reservation lock and again at fence; followup.test.mjs:47,57,68 deliberately interleave abandonment. Unknown/in-network accepted outcomes retain claims. Deferred fulfillment correction reuses original persisted paid event and transaction; refund suppresses prior entitlement replay. These tests inspect side effects, PSP create counts and database claims, not merely returned labels.

## Checks actually performed and independently assessed

This reviewer executed the five full human Firefox journeys on actual P1/N3/worker/PostgreSQL, verified environment and grant/mandate counts, retained TAP/screenshots/manifests, and checked stable runtime hashes. The reviewer also executed final MAIN provider/backend no-network tests17/17 (14 provider,3 backend), following the earlier isolated provider14/14 and direct A2A DTO probe. Initial missing-main-dist run failed and remains disclosed in initial receipt; it is not a passed gate.

The coordinator's integrated1016/1016 result is a separately attributed execution:848web,35widget,9transcribe,42worker,18db,58core,6gateway. Reviewer read test implementations and recorded logs/receipts, but did not rerun that whole suite. Core and host each report3/3 killed safety mutations; reviewer inspected mutation/test intent and final source restoration hashes. Agent browser author11/11 acceptance is not claimed as reviewer execution: reviewer read its full scenario and structured evidence, checked all runtime/compiled hashes and verified that it uses actual SDK/A2A/backend with local PSP/Resend fixtures.

Gateway full Docker build and web dependency-stage build passed under coordinator execution. Next production build passed. Complete new web Docker runtime image was neither built nor deployed; no container-image readiness is inferred from Next build alone. P1 .dockerignore now excludes .secrets/.runtime recursively and keeps ignored credentials out of future contexts.

## Remaining limits and follow-up

- AC11 needs scoped treatment of independent03a work and adequate all-project source/deployment evidence before unconditional feature completion. Inventory at09:33:20 is honest about being a completion snapshot; it is not a reconstructed before/after record. Public browser smoke covers existing deployed P1/P2/N3 only. Other projects were not browser-tested.
- Real YooKassa TEST saved-method acceptance remains pending, separate from successful local payment fixtures. No live charge, provider-account configuration, production-data mutation or public deployment was performed. Native agent acceptance and human N3 acceptance are separate suites, not one end-to-end agent→N3 chain.
- Legacy historical spend uses server-verified webhook processed_at month because original capture timestamp was not stored. Authoritative historical gross is re-fetched; missing verification blocks agent offers only. This receipt-time accounting convention is explicit and should remain documented for delayed notifications/month transitions.
- Current recorded production dependency audit includes preexisting nested postcss high issues through unchanged Next15.5.24 and qs moderate through transcribe Express. Parent confirmed those versions at baseline4c3bef4; reviewer inspected audit artifact, not exploitability. Gateway standalone audit reports zero. This review does not claim all dependencies are secure or fix unrelated packages during runtime freeze.
- Human matrix does not browser-exercise testimonial collection/moderation/widget, SSO/password reset or every N3 control. Existing unit/integration regression and unchanged source are narrower evidence for those paths. Normal-profile browser reset resolved the initial referral-cookie failure without product/assertion changes, but did not independently establish its precise private-mode/profile cause.

Evidence: human-cjm-resumed.md, agent-e2e-resumed.md and final-reviewed-sources.json beside this receipt; source manifests, original failed attempt and five passing runs in human-cjm-evidence*. Coordinator telemetry: projects/01-testimonials-senja/docs/telemetry/p-replicator/20260910T071401Z-agent-payments-implementation-7e80/run.json. No runtime model identity, token counts, monetary usage or active compute are invented.

Status: completed
