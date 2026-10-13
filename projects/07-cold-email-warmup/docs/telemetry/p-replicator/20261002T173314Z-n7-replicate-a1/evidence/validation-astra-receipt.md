# Independent N7 validation receipt

run_id: 20261002T173314Z-n7-replicate-a1
work_unit_id: n7-fresh-validation
attempt_id: validate-1
source_revision: 0d644c2ea6fdec3ee7f09911ffd0427cde44c3ce
spec_sha256: 89e2f692c087aed3c3c7bc35a39e5f349334a6e71c3ff473a7b835044094a3db
launch_sha256: 910571bb0a08d0d3dcce7d51f35ed2c9bfe36317058ebab3ffc2e8aa514e7c43
launched_at: 2026-10-02T18:04:19.832267+00:00
first_observed_at: 2026-10-02T18:06:42Z
profile: compact-quality-first-v2
stage: VALIDATE
risk: XL inherited; independent reports-only review of consent, security and billing
requested_model: gpt-6-astra
requested_effort: high
actual_model: null
actual_effort: null
usage: null
cost: null
model_evidence: null
measurement_gap: No host model/effort/usage metadata exposed to this reviewer; launch request is not actual-model evidence.

## Independent obligations established before author reports

Derived from Specification.md and Architecture.md (plus the AC definitions in plans/mvp-xl-plan.md). This list precedes inspection of CJM author receipts and completion claims.

1. Identity must support registration/logout as well as revoked-session rejection; every owner path uses server tenant, and AEAD binds tenant/mailbox/key version with no plaintext disclosure.
2. Saving credentials must not send. Live activation needs concrete provider capability, TLS and pinned allowlisted address, operator authority and current per-scope user consent.
3. Consent/version revocation, reply, opt-out and quarantine must serialize with final submission; test the interval after claim as well as before it.
4. Warmup and campaign claims share atomic daily quota; unknown outcomes retain quota and cannot be automatically retried. Pool recipient eligibility must remain current at dispatch.
5. Pool count excludes ineligible members, waits below two tenants, and must satisfy the stated peer identity/content secrecy during actual SMTP exchange, not just dashboard reads.
6. IMAP matching binds mailbox/tenant, sender and message ID; cursor commit is atomic with page processing, resets cannot duplicate semantic replies, stale polling fails closed with a defined threshold.
7. All message classes include body and one-click unsubscribe; repeated opt-out is idempotent; complaint intake authenticates before dedup and quarantines the sender.
8. Reputation remains unknown absent comparable dated evidence; fake engagement is excluded; seed target is not an observed result; public reports remove contact/secret data.
9. Sandbox acceptance must reconcile unavailable state with the approved billing boundary; provider truth precedes entitlement, and referral/self/replay/paid-flag cases are meaningful BDD.
10. Every AC conjunction needs named scenario coverage and algorithm meaning; NFR/resource/security timing must be objectively testable. Static CJM evidence cannot prove backend or live-provider acceptance.
11. ADR-001..005 and all four growth seeds must survive trace; appearance capture is not a full authenticated-source look pass.

E2E preflight: not_applicable (no new E2E run; docs review and inspection of existing static evidence).

## Terminal validation result

repo_root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation
project_root: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation/projects/07-cold-email-warmup
trace_path: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation/projects/07-cold-email-warmup/docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/validation-astra-receipt.md
launch_path: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation/projects/07-cold-email-warmup/docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/validation-astra-launch.json
source_revision: 0d644c2ea6fdec3ee7f09911ffd0427cde44c3ce
architecture_sha256: 524a3041daf4bba8bf38c4abe8d5ec821362472c5ed02948bc6b679d793dc7db
report_path: /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation/projects/07-cold-email-warmup/docs/validation-report.md
report_sha256: 5b5661c610c8eaee5baee9d4bacaad94f21150d8f6b1b50a24534fafc7394717
finishedAt: 2026-10-02T18:18:20.244Z
Finished-At: 2026-10-02T18:18:20.244Z
verdict: NEEDS WORK
Verdict: 🔴 NEEDS WORK
elapsed_wall_ms: 840412
observed_review_wall_ms: 698244
active_wall_ms: null
build_revision: not_applicable (specification and existing standalone HTML review; no backend)
requested_model: gpt-6-astra
requested_effort: high
actual_model: null
actual_effort: null
model_evidence: null
input_tokens_total: null
cached_input_tokens: null
output_tokens_total: null
reasoning_tokens: null
cost: null
cost_basis: unavailable
fallback: bounded CLI launch per user work order after native thread-limit refusal; no model fallback is inferred
telemetry_status: partial

Findings: N7-V01 high pool privacy/SMTP contradiction; N7-V02 high missing atomic cancellation/submitting boundary; N7-V03 medium UIDVALIDITY reset dedup identity; N7-V04 medium undefined freshness/resource thresholds; N7-V05 medium missing AC/security BDD conjuncts; N7-V06 medium sandbox acceptance ambiguity. Six documentation/design findings, not executed backend vulnerabilities. The report includes exact quoted AC/source lines, counterexamples, corrective acceptance examples, all 12 AC mappings, 13 INVEST/SMART story judgments, ADR-001..005 and growth/capability disposition.

Independent obligations were recorded before author reports; comparison then covered the full handoff document catalog, algorithm and BDD meaning, existing prototype test script, corrected receipt/JSON and two A screenshots. No child, model switch, product mutation, commit, deploy, live SMTP/IMAP, payment or secret access. Public documentation reads only: Nodemailer, ImapFlow, RFC 5322 and RFC 9051.

## Read-only gates at bound source

| Command/check | Exit | Result |
|---|---:|---|
| node .claude/hooks/check-docs-complete.cjs projects/07-cold-email-warmup | 0 | 10 required documents present |
| node .claude/hooks/check-growth-trace.cjs projects/07-cold-email-warmup | 0 | 4 growth requirements traced |
| node .claude/hooks/check-external-deps.cjs projects/07-cold-email-warmup | 0 | 2 confirmed library rows, 3 unconfirmed live rows; semantic sandbox ambiguity retained |
| node .claude/hooks/check-metric-source.cjs projects/07-cold-email-warmup | 0 | 6 named metric sources; values unmeasured |
| node .claude/hooks/check-look-origin.cjs projects/07-cold-email-warmup | 0 | No unpromoted source rows |
| node .claude/hooks/check-look-trace.cjs projects/07-cold-email-warmup | 2 | Source path not measured, out_of_scope; appearance only; NOT success |
| bash scripts/check-pipeline-gaps.sh projects/07-cold-email-warmup | 0 | Structural gate only; semantic defects remain |
| Python SC-set / corrected HTML hash comparison | 0 | spec=algorithm=BDD=32; growth=12; 3/3 HTML source hashes match |
| bash scripts/complexity-router.sh <report> <receipt> | 0 | T report-file lower bound; review risk remains XL |
| Python report/source/launch/path allowlist assertions | 0 | Verdict/SHA/12 AC rows/6 findings present; source unchanged; only authorized new outputs beyond existing launch |

CJM browser/static/mutation suite was inspected, not rerun. Existing corrected Chromium 1440/390 receipts remain prototype-only; sample screenshots inspected. No full product tests or new E2E performed: no backend exists. No new E2E preflight needed (not_applicable). Source appearance captured, authenticated path out_of_scope, not a full look pass.

## Limitations and disposition

- Host has not exposed actual-model/effort/token/cost metadata. Requested model in launch JSON is not runtime confirmation. Savings unestablished.
- Start is serialized launch time; first direct clock observation is 18:06:42Z. Elapsed includes launch-to-observation delay; that delay's internal cause is not inferred. Active time unknown.
- Author prototype receipt lacks a serialized launch digest; this pre-existing limitation is preserved. This receipt is independently bound to the supplied matching launch digest and regular fresh path.
- No backend, full product build/tests, provider account compatibility, live permissions, actual complaint feed or payment acceptance exists to validate. Real SMTP/IMAP activation, provider complaint feed and live capture remain named deferred capabilities. Local sandbox success disposition requires V06 correction.
- Only documentation/schema/algorithm counterexamples are established; no exploitable runtime defect or measured delivery effect is claimed. Rubric scores are judgments, not empirical quality.
- No own required review work remains. Product corrections and revalidation belong to the coordinator; this completed attempt does not accept the product or the requirements package.

Delivery-URI: file:///home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-validation/projects/07-cold-email-warmup/docs/validation-report.md
Status: completed
