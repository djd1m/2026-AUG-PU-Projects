# F07 — Completion, test contract and later pilot

PLAN output only; implementation, independent validation/review and real provider gates pending. Source e2dded9898d8b00f2fa5613e5f5d3fb63281715b. No test results below are claimed executed by this planner except the separately captured document gate.

## Planned criterion coverage

Populate exact `## Criterion coverage` vendor table with existing test files/titles after implementation; do not run completion gate against nonexistent planned tests and call it pass.

| AC id | Planned test file | Exact planned test title |
|---|---|---|
| AC-f07-replicate-1 | tests/replicate.integration.test.js | hosted success binds one ticket and private evidence |
| AC-f07-replicate-2 | tests/replicate.test.js | missing hosted authorization makes zero creates |
| AC-f07-replicate-3 | tests/replicate.integration.test.js | lost create response never creates twice |
| AC-f07-replicate-4 | tests/replicate.integration.test.js | two reclaimers resume one identity under original deadline |
| AC-f07-replicate-5 | tests/replicate.integration.test.js | queued and remote deadlines survive healthy heartbeat |
| AC-f07-replicate-6 | tests/replicate.integration.test.js | hold and deletion fence remote work without double release |
| AC-f07-replicate-7 | tests/replicate-media.test.js | hostile delivery URLs and image bombs never publish |
| AC-f07-replicate-8 | tests/replicate-quality.test.js | mixed or synthetic hosted corpus cannot authorize publication |
| AC-f07-replicate-9 | tests/replicate.integration.test.js | hosted recovery and midnight preserve conservative tickets |
| AC-f07-replicate-10 | tests/replicate.test.js | provider bodies and unknown metrics cannot leak or become measurements |
| AC-f07-replicate-11 | tests/replicate.test.js plus source-bound completion receipts | hosted mode remains disabled without activation evidence |

Each named test contains all subcases in01/04, not one representative. Assert literal thresholds180000/360000/60000/30000/10000/10485760/20000000, not expectations imported from production constants. Real PG tests kill processes at submitting/ID/commit boundaries, count actual POSTs in injected transport and exact ledger/ticket/evidence rows.

## Required checks after implementation

Use configured Node22 (current planning shell node20 is not runtime acceptance). Preserve every existing test unmodified. `npm run lint`, `npm run build`, `npm test` are only a subset. Run all existing `tests/*.test.js` through their established harness: boundaries/media/jobs/generation/quality/composite/sharing/payments/attribution/partners, all HTTP and real PostgreSQL integration suites, mutation and UI state/auth/order/upload/app-race/payment-fixture suites. `python3 -m unittest discover -s worker -p 'test_*.py'` retains local engine checks. Capture commands/exit/source and distinguish missing dependencies from failures; max2 test workers, CPU2. Use existing isolated PG harness/runtime configuration without printing secrets. No blanket skip or altering passing assertions to fit adapter.

New unit commands: `node tests/replicate.test.js`, `node tests/replicate-media.test.js`, `node tests/replicate-quality.test.js`; PG: `node tests/replicate.integration.test.js` with isolated migrated database. Apply007 on representative existing records and prove old fixture/controlnet evidence remains valid, new constraints reject unbound IDs, budget/credit concurrency remains correct. Restore backup in disposable DB for rollback compatibility; no destructive down migration.

Mandatory meaningful mutation: in disposable source copy remove the hosted submitting/ambiguous no-replay branch at expired-lease recovery so it re-enters create. Inject first remote acceptance + response loss + expired lease + two reclaimers. Assert POST count exactly1, release≤1 and unchanged ticket; mutant must fail duplicate-create assertion (not syntax/startup), restore digest. Retain existing owner/payment/budget/fixture guard mutations. Additional stale-completion/URL-allowlist mutation if independent review requires it.

Fresh Astra independent validation receives exact five role docs and research/source digests, checks INVEST/SMART/BDD and provider assumptions. Later fresh Astra review receives accepted spec, validation-report revision, implementation/tests/evidence; no self-claim of independent validation. Run installed vendor report-revision/criterion-scenarios and completion/review-contract gates at their proper stages, preserve0/1/2.

## Mandatory actual browser followup

After implementation only: companion read-only source/build/environment preflight; obtain `/tmp/codex-heavy-build.lock` for build and `/tmp/codex-ui-e2e.lock` for shared `codex-ui-playwright` browser, CPU2, owned containers only; root port-conflict check before compose start. Actual app1440/390: upload→style→hosted-mock job→poll/resume→private comparison/gallery, two-account denial, deletion while remote running, held account behavior, unverified/fixture publication refusal, disabled hosted config. Extend existing scripts/ui browser harness, retain existing cases and disabled-payment followup. Bind image/source/build identity and screenshots to receipt. Historical UI6 receipts are not a new adapter pass. No Docker/browser in PLAN.

## Later real pilot: proposed ceiling, currently unauthorized

Exactly12 distinct permissioned room photos ×3 styles (warm/minimal/afrohemian)=36 planned creates, one concurrent prediction, no automatic retries/replacements; enough to measure≥30 real completed jobs only if they actually complete. Stop on first ambiguous creation, privacy/safety failure or budget concern. Failures remain in report; fewer30 completions means performance pending, not drop failures. Existing per-account20/day means split36 over at least2UTC days for one test account, or distinct authorized accounts, without raising200/20 maxima.

Proposed authorization fields, ALL pending: owner_approval_reference=null; approved_at=null; operator_identity=null; provider_account_access=null; corpus_rights_manifest_sha=null; privacy_transfer_acceptance_sha=null; model_license_acceptance_sha=null; safety_policy_acceptance_sha=null; version/schema_contract_sha=null; billing_control_method=null; rate_verified_at=null; actual_cost_evidence=null. Requested total ceiling **12USD**, per-create modeled ceiling **0.30USD**, max36 invocations, conservative reserved maximum10.80USD; effective authorized ceiling **0USD now**. At observed$0.0014/s×180s modeled upper active cost is$0.252 before billing exceptions;0.30 is an admission estimate, not a provider guarantee. Without verified prepaid/hard provider controls or explicit approved residual-billing risk, no paid start. A nonzero env variable alone is not owner authorization.

Before each create reserve0.30 against approved12 envelope atomically, retain reservation even for ambiguous/canceled/failed calls until operator reconciliation; never spend unreserved remainder via blind retries. Actual invoices/usage are recorded separately, null if unavailable. No token or raw photo/providerURL in reports.

Per job retain provider/model/version/ID, source/build, exact configuration/seed/transform, original/transmitted/depth/output hashes, admission/create/start/completion/import timestamps, queue/provider/end-to-end latency, errors/cancel status, measured bill or null, warm/hardware provenance or null. Independently annotate every opening and anchors normalized to original image; all36 geometry pairs must pass0 added/removed openings and displacement≤0.02. Report all latency samples and nearest-rank p95;≥30 actual samples cannot claim warm≤25s unless warm/hardware actually established. No waiver of existing performance gate in this plan.

## Activation, rollback and handoff

Implementation can be accepted as disabled software after mandatory local gates; full MVP cannot pass without real quality/performance/safety/provider readiness. Default hosted disabled. To roll back: stop new hosted admission, preserve DB/private artifacts/receipts and remote identities, drain or locally terminal/cancel known active work, reconcile ambiguous costs. Old binary may not understand replicate mode/rows: do not blindly roll it back against007; use compatibility build or isolated restored snapshot after explicit review. Never erase customer ledger or remote submission records.

Canonical update files are listed in03 and occur only after plan acceptance. Coordinator integrates, assigns validator then I1 bounded writer; no commit/push required from planner. All unknown usage/cost remains null. PLAN machine traceability is naming evidence only, not semantic validation or product acceptance.
