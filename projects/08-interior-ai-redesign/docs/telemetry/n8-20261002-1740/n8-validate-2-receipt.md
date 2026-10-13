**Verdict: NEEDS_WORK. The design gate should remain closed pending a bounded scenario correction.** Five original findings are closed at the documentary design level. Finding 3 remains open because several mapped scenarios still omit acceptance conditions or permit an incorrect outcome. No runtime failure or pass is established by this review.

**Identity and scope**

| Field | Value |
|---|---|
| Run | `n8-20261002-1740` |
| Work unit | `n8-validate-2` |
| Attempt | `n8-validate-2-attempt-1` |
| Stage / risk | Independent VALIDATE recheck / parent XL: payments and shared financial invariants |
| Source revision | `3776b81bc60dfa7efbc627b51b1c49901aef5786` — verified |
| Specification SHA256 | `92674e25074fcda42c930138b7ff03f6ec1671751f802b89800604176023f499` — verified |
| Launch SHA256 | `b309bc557045383ecb18d1db538516fa5fe200a201e073dc1dab88561a8c601b` — verified |
| Profile | `compact-quality-first-v2` |
| Requested model / effort | `gpt-6-astra` / `high` |
| Actual model / effort / fallback | `null`; authoritative execution metadata unavailable inside reviewer |
| Build revision | `null`; documentary review |
| Tokens / cost / full elapsed / active time | `null`; launcher/provider measurements unavailable inside reviewer |

Project root:

`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-validate-2/projects/08-interior-ai-redesign`

Receipt destination, installed by the launcher:

`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-validate-2/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-validate-2-receipt.md`

Below, paths beginning `docs/` are relative to that project root. `S`, `P`, and `T` denote `docs/Specification.md`, `docs/Pseudocode.md`, and `docs/test-scenarios.md`.

Scope was limited to the six original findings, their resolution map, and the requested current design/contracts/evidence summaries. Root instructions, routing/telemetry rules, requirements-validator rubric, and applicable companion guidance were read. Project `CLAUDE.md` and project `.claude/` are absent.

No files were changed, no delegation occurred, and no builds, browser sessions, environment/key inspection, network calls, purchases, deployments, or rentals were performed. E2E preflight is `not_applicable`: this was document validation, not E2E execution.

**Disposition of the six original findings**

| Original finding | Status | Updated evidence and assessment |
|---|---|---|
| **1. HIGH — Refund hold enforcement and ordering** | **CLOSED** | S:43 requires reservation, retry/start and “every badge-free delivery, including cached/public composite” to recheck hold under account serialization. P:27–29 establishes lock order and final delivery authorization; P:43–47 and P:79 apply the predicate to admission, execution and cached export. S:42 and P:65 bind authenticated refund verification to refund ID, payment ID, merchant, immutable order/account and amount/currency. P:63 states “Review intent remains review with no new purchase ledger.” A pre-hold authorized stream may finish within the stated 15-second bound; later authorization cannot deliver badge-free bytes. This is an explicit linearization contract, not an uncontrolled race exception. |
| **2. HIGH — Attempt capacity and terminal release** | **CLOSED** | S:20 says admission “atomically reserves1 credit, job and first attempt ticket”; P:43 implements that transaction and rolls everything back on initial exhaustion. P:45–47 and P:95 require current-day replacement/retry tickets and terminal failure with unique credit release when unavailable. Unused tickets remain counted conservatively. S:21 and `docs/long-job-contract.md:26` fix queue expiry at 60 seconds, each attempt at at most 180 seconds and the absolute job deadline at admission +360 seconds, independent of heartbeats. The design inconsistency is resolved; a remaining release-scenario weakness belongs to finding 3 below. |
| **3. HIGH — Coarse or insufficient AC-to-scenario coverage** | **OPEN** | T:104 now explicitly requires every listed matrix case; T:121–161 maps all 41 stable AC IDs to existing named scenarios. Return-URL forgery and late-worker fencing are mapped at T:110 and T:113. This resolves the identity defect and much of the substantive coverage gap. However, the remaining cases below demonstrate that complete naming still does not establish complete acceptance coverage. |
| **4. MEDIUM — Quality provenance and privileged transition** | **CLOSED** | P:12 defines immutable generation evidence; P:13 defines append-only review with actor, timestamp, decision, output/evidence/corpus hashes. P:53 specifies an “Operator-only server CLI, no public acceptance endpoint,” requires matching real successful output, rejects missing/changed evidence, and permits audited acceptance→rejection but no rejection→acceptance. S:29 explicitly excludes ordinary accounts and fixtures. Public reads bind to the active accepted review. GEOM-01–03 and PUBLIC-01/03 have named scenarios. This establishes the design contract without claiming measured geometry quality. |
| **5. MEDIUM — First conversion and tracking consent** | **CLOSED** | S:55 and P:75 make the first committed verified payment claim an immutable account marker “even when no partner”; later purchases cannot backfill/reassign, and refund never promotes a second purchase. P:83 aggregates eligible account-unique first conversions. S:53 and P:73 require separate default-unchecked tracking consent and preserve manual-code checkout without that cookie. The algorithmic ambiguity is resolved. The missing no-partner scenario remains part of finding 3. |
| **6. LOW — Gate-summary reconciliation** | **CLOSED** | `docs/validation-report.md:10` records “historical1, corrected0” and identifies both receipts. `docs/embed-contract.md:3` now declares “Встраиваемый виджет: нет”; its rationale distinguishes standalone share pages from embedding. `docs-fix-1-gates.json` records embed exit 2 for that applicability declaration. Job/webhook/model-cost and source-look unknowns remain explicitly non-passes. |

These closures concern the corrected design. They do not certify implementation, concurrency behavior, provider verification, or GPU results.

**Remaining bounded correction: finding 3**

The following are substantive omissions in the revised scenarios, not requests for new tooling.

| Priority / AC | Source and remaining defect | Specific bounded fix |
|---|---|---|
| **HIGH — JOB-04** | S:22 requires release “exactly once.” T:220–223, **Retry limit and release races**, asserts “unique release +1 at most.” Zero releases satisfies that assertion. Other scenarios explicitly cover budget exhaustion, queue expiry, deletion and quality rejection, but do not establish credit restoration for every ordinary final-failure/deadline race. | In the existing release-race matrix, explicitly include final worker failure and attempt/job deadline exhaustion with an existing reserve. Assert exactly one `release(job_id)` entry, restored balance and no additional release after replay/late completion. Preserve zero release only for cases with no reservation. |
| **MEDIUM — ATTR-03** | S:55 expressly includes a first successful payment without a partner. T:328–331 starts with “two differently attributed valid intents,” so it cannot exercise the absent-partner branch. “No … backfilled” in the outcome does not provide that missing precondition. | Add a matrix case: first committed payment has no eligible partner; later payment has one. Assert the first-paid marker stays bound to the first payment and conversion count remains zero, including after refund of the first payment. |
| **MEDIUM — PERF-03** | S:83 requires “p95≤25s.” T:406–409 checks cohort eligibility, sample count, provenance and separate queue reporting, but never asserts the latency threshold. A complete 30-job cohort with p95 of 100 seconds satisfies its written outcome. | Add `p95≤25s` as the acceptance assertion. State that a valid cohort above the threshold fails performance acceptance, while an unavailable/ineligible cohort remains unknown. No GPU run is required to correct this scenario. |
| **MEDIUM — PUBLIC-01** | S:69 limits source context to 1–160 characters and description to 40–2000. T:359–361 includes missing context and 39/40-character descriptions, then accepts “40+”; it does not exercise either upper bound. | Extend the existing matrix with context lengths 160/161 and description lengths 2000/2001, explicitly accepting the boundary and rejecting the excess. Retain per-result consent and real accepted-output cases. |
| **LOW — AUTH-02** | S:8 specifies a 32-byte token, seven-day expiry and dummy hashing for unknown accounts. T:173–175 checks abstract expired sessions and generic failure bodies, leaving those particular conditions untested. | Extend the existing session scenario with token construction/length, the seven-day expiry boundary and a controlled assertion that the unknown-account branch performs dummy hashing. No timing benchmark or new framework is needed. |
| **LOW — GALLERY-01/02** | S:33–34 specifies a 50-item page limit, separate before/after alt text, visible focus and aria-live status. T:251–259 verifies states/privacy, readable labels, keyboard value changes, body size and overflow, but does not assert those additional properties. | Add a gallery with more than 50 entries and explicit page-size assertions; add separate alt-text, visible-focus and live-status assertions to the existing accessibility scenario. |

No additional architecture redesign is requested. The high-priority release assertion alone prevents declaring the original coverage finding closed. Correct these identified cases in the existing scenario document, then revalidate the affected delta.

**Rescoring of all 13 requirements**

Scores apply to requirements testability, not implementation success. Component order:

- **INVEST:** Independent / Negotiable / Valuable / Estimable / Small / Testable; maxima `8/8/10/8/8/8`.
- **SMART:** Specific / Measurable / Achievable / Relevant / Time-bound; maxima `6/8/6/5/5`.
- **Quality:** Traceability / Completeness; maxima `10/10`.

| Requirement | INVEST | SMART | Quality | Base total |
|---|---|---|---|---:|
| FR-auth-1 | 8/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | **95** |
| FR-upload-1 | 8/8/10/8/8/8 | 6/8/6/5/5 | 10/10 | **100** |
| FR-redesign-1 | 0/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | **87** |
| FR-geometry-1 | 8/8/10/4/4/8 | 6/8/3/5/5 | 10/10 | **89** |
| FR-gallery-1 | 8/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | **95** |
| FR-payment-1 | 0/8/10/8/8/8 | 6/8/6/5/5 | 10/10 | **92** |
| FR-GROWTH-001 | 8/8/10/8/8/8 | 6/8/6/5/0 | 10/10 | **95** |
| FR-GROWTH-002 | 8/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | **95** |
| FR-GROWTH-003 | 8/8/10/8/8/8 | 6/8/6/5/0 | 10/10 | **95** |
| FR-GROWTH-004 | 8/8/10/8/8/8 | 6/8/6/5/0 | 10/10 | **95** |
| FR-GROWTH-005 | 8/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | **95** |
| NFR-security-1 | 8/8/10/8/4/8 | 6/8/6/5/5 | 10/10 | **96** |
| NFR-performance-1 | 8/8/10/4/8/8 | 6/8/3/5/5 | 5/10 | **88** |

**Average: 93.62/100. Minimum: 87/100. Missing-artifact floor: 0 BLOCKED requirements.**

Traceability deductions identify semantically incomplete mapped ACs explicitly above; they are not missing-ID deductions. Completeness scores the acceptance text, which contains happy paths, errors and boundaries, rather than claiming all those conditions have sufficient scenarios.

Job admission and payment settlement lose independence because their correctness depends on atomic cross-domain transactions. Geometry and measured performance retain estimation/achievability deductions because real measurements remain unavailable. Geometry and security span broader work than a small isolated story. Action counts alone do not earn time-bound points.

Specific security criteria remain present, supporting the rubric’s supplementary security bonus where applicable. The recorded growth-trace check preserves all five growth identifiers; its documentary bonus does not establish semantic coverage. Neither supplementary bonus is added to the base totals above or used to override the open finding.

**Acceptance-text and mapping evidence for the artifact floor**

The quotations below are actual acceptance text under the stated `Specification.md` requirement headings. The complete AC groups at those locations supply the remaining happy/error/boundary clauses. Their mappings are in `docs/test-scenarios.md`, **Criterion scenarios**, lines 121–161; definitions are under **Detailed acceptance scenarios**.

| Requirement / AC location | Quoted acceptance evidence | Named mapping evidence |
|---|---|---|
| FR-auth-1, S:7–10 | “Unique email and trial ledger grant exactly1 trial credit even under concurrent registration.” | AUTH-01 → **Registration and trial race**, T:121; AUTH-02–04 → session lifecycle, abuse/origin and isolation scenarios |
| FR-upload-1, S:14–15 | “file≤10485760bytes and decoded pixels≤20000000” and “Temp files are removed after failed DB write” | UPLOAD-01/02 → **Image decode boundary matrix** / **Upload ownership and orphan cleanup**, T:125–126 |
| FR-redesign-1, S:19–23 | “Same owner/key/body returns original job without new effects, changed body409.” / “releases reserved credit exactly once” | JOB-01–05 → admission, last-slot, timeout, release-race and status-recovery scenarios, T:127–131 |
| FR-geometry-1, S:27–29 | “zero added/removed openings and anchors displaced≤2% image diagonal” / “Ordinary account, fixture, missing evidence or changed output cannot be accepted/published.” | GEOM-01–03 → **Generation provenance boundary**, **Real geometry corpus**, **Operator quality transition**, T:132–134 |
| FR-gallery-1, S:33–35 | “Owner-only paginated gallery max50” / “No tombstoned media is served meanwhile.” | GALLERY-01–03 → states/privacy, accessibility and delete/cleanup scenarios, T:135–137 |
| FR-payment-1, S:39–43 | “Each mismatch rejects; network/parse/5s timeout leaves retryable503 and no processed-event claim.” | PAY-01–05 → checkout, verification, replay, refund binding and refund ordering scenarios, T:138–142 |
| FR-GROWTH-001, S:47–49 | “Abort/failure records no completion; unavailable native API offers download, which never claims external publication.” | SHARE-01–03 → action-count, outcome-event and **Growth 001 security**, T:143–145 |
| FR-GROWTH-002, S:53–55 | “Manual code at checkout works without tracking-cookie consent.” / “all later purchases cannot backfill/reassign it” | ATTR-01–03 → consent/expiry, override/freeze and concurrent-first-conversion scenarios, T:146–148 |
| FR-GROWTH-003, S:59–60 | “RoomKind pixel badge omitted only when confirmed paid entitlement AND billing_hold=false at delivery.” | BADGE-01/02 → **Composite entitlement and cached hold** / **Public token original exclusion**, T:149–150 |
| FR-GROWTH-004, S:64–65 | “public signup cannot mint or alter owner binding” / “excluding held/refunded/review payments and self” | PARTNER-01/02 → operator/binding and aggregate/replay/refund scenarios, T:151–152 |
| FR-GROWTH-005, S:69–71 | “Consent on one job grants none to another.” / “Deleted/rejected output is immediately unavailable.” | PUBLIC-01–03 → consent/content, accepted-public XSS/privacy and revoke/cache scenarios, T:153–155 |
| NFR-security-1, S:75–77 | “Startup fails before serving on missing/invalid DB/session secret/storage/runtime/provider-mode configuration” / “Mandatory negative controls must fail” | SEC-01–03 → configuration, limits/injection/leak and mutation-control scenarios, T:156–158 |
| NFR-performance-1, S:81–83 | “both counters change atomically” / “Current-day exhaustion fails job/releases credit.” / “Warm GPU inference p95≤25s on≥30 actual jobs” | PERF-01–03 → ticket counters, UTC rollover/expiry and GPU cohort scenarios, T:159–161 |

This evidence satisfies the rubric’s artifact floor. It does not erase the specifically identified gaps within those mappings.

**Commands, results and evidence limits**

Executed read-only checks:

| Command/check | Result |
|---|---|
| `git rev-parse HEAD` | Exit 0; expected source revision |
| `git status --short`, initial/final | Only untracked `n8-validate-2-launch.json`; no tracked modifications |
| `sha256sum` on Specification and reviewer launch JSON | Exit 0; both match the brief |
| Read-only Python extraction of ACs, mapping rows and scenario definitions | Exit 0; **13 requirements, 41 unique AC IDs, 57 unique scenario names, zero unmapped IDs, zero undefined mapped names** |
| Read-only Python score arithmetic | Exit 0; mean **93.61538461538461**, minimum **87** |
| `git diff --stat` against original reviewed source | Correction scope inspected; no shared-toolkit changes shown |
| `git log` and byte comparison for original receipt | Receipt first appears in current commit and matches those tracked bytes; this does not independently prove its pre-commit custody |

An initial receipt comparison against the original reviewed source returned difference status because the receipt did not exist in that older revision; it was not evidence of receipt alteration. The subsequent history check resolved that interpretation.

Read commands used `cat`, `nl -ba`, `sed`, and `rg`. The combined project-instruction read reported missing project `CLAUDE.md`; project-rule discovery similarly reported absent project `.claude/`. These are absent gated artifacts, not failed product tests.

Existing gate receipts were inspected, **not rerun**:

- Docs completeness, external dependencies, growth trace and handoff manifest: recorded exit **0**, documentary checks only.
- Look origin: historical **1**, corrected **0**.
- Look trace: **2**, authenticated source appearance remains unmeasured.
- Embed: **2**, explicit no-widget applicability.
- Job and webhook: **2**, runtime verification pending.
- Model cost: **2**, no external model API; self-hosted capacity enforcement remains untested.

No source-bound runtime acceptance follows from these results. The required **12 rooms × 3 styles** actual GPU corpus and **30 warm GPU jobs** remain pending. Their absence does not itself block independent software implementation after a sound design gate; it does block claims of measured GPU geometry, latency or public-quality readiness. Fixture tests cannot supply those claims.

Clock observations were **2026-10-02 19:05:41 UTC** and **19:08:42 UTC**, a measured partial interval of **181 seconds**. Initial reading preceded the first sample, and final-response generation follows the last. Full attempt duration belongs to the launcher’s post-response measurement. Provider usage, billed cost, active time and actual model metadata remain `null`; no savings claim is made.

The substantive review is delivered. Close the finite scenario gaps above, preserve the five design closures and historical receipts, and revalidate the affected scenarios. No additional owner approval or new validation framework is required for that authorized document correction.

Status: completed