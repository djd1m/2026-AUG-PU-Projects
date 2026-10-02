**Verdict:** 🔴 NEEDS WORK
# Independent N7 requirements validation
Spec revision: sha256:89e2f692c087aed3c3c7bc35a39e5f349334a6e71c3ff473a7b835044094a3db
Source revision: 0d644c2ea6fdec3ee7f09911ffd0427cde44c3ce
Specification: `Specification.md`, N7 v1; architecture: `Architecture.md`, N7 v1.
Reviewer family: codex
Run: `20261002T173314Z-n7-replicate-a1`; work unit: `n7-fresh-validation`; attempt: `validate-1`.

This is a fresh independent specification/CJM review, separate from the planner and HTML author. Six confirmed documentation/design findings: **2 high, 4 medium**. These are contradictions or missing testable contracts, not observed backend vulnerabilities. There is no backend to execute. Resolve the findings and revalidate the affected contracts before treating this package as ready for generated implementation guidance. No MVP, runtime, provider, billing or deployment acceptance is granted.

## Scope and independent oracle

Read handoff first, root CLAUDE/AGENTS and applicable rules, requirements-validator and its INVEST/SMART/BDD/scoring/report references, companion handoff rules, then spec and architecture. The initial obligation list was recorded in the receipt before inspecting author receipts/completion claims. It covered tenant/credential boundaries; consent and final submission races; quota and pool eligibility; actual message privacy; IMAP matching/cursor/reset/freshness; suppression/complaints; evidence honesty; sandbox disposition; full AC conjunctions; ADR/growth trace.

All role-map documents and the additional handoff catalog were inspected. `docs/CLAUDE.md` applies; no project-root CLAUDE exists. The user-specified validation worktree and source supersede the handoff's older integration-worktree/source locator. HEAD and specification hash match the user. README AI replies are explicitly excluded by prompt priority, not an unresolved requirement. No children, product edits, commits, deployment, mail, charges or secrets access.

## Findings

### N7-V01 — High: pool secrecy promises more than the SMTP architecture provides

**Source/quoted AC:** `plans/mvp-xl-plan.md:96`, AC-N7-007: “Пул из разных tenants не раскрывает адреса/контент участникам; seed waiting и withdrawal проверены”. `Specification.md:39–46` promises automated inter-tenant correspondence and no foreign addresses. `Architecture.md:44–46` narrows this to “no peer email to dashboard”; `Pseudocode.md:49–55` selects two tenants and sends test templates in both directions.

**Reproducible contradiction:** choose opted-in mailboxes A and B belonging to different tenants; follow the documented direct SMTP exchange A→B. B's owner can inspect the received message's sender information and test body in their own mail client. Hiding the pool list in the dashboard does not satisfy the unqualified AC promise. No anonymizing address/relay design or explicit message-level disclosure exception is described. Originator address fields are part of Internet message format; this is a design inference grounded in [RFC 5322 §3.6.2](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.2), not a live send observation.

**Required correction:** reconcile the approved privacy promise with actual mail semantics. Specify which peer metadata/test content participants necessarily receive, distinguish it from private campaigns/credentials/pool enumeration, and bind the disclosure to consent; alternatively specify and validate a feasible privacy-preserving architecture. Do not silently narrow the AC to dashboard-only. Add a two-tenant message-header/body fixture test plus a foreign-dashboard/API denial test. Existing SC-US-004-2 only exercises the no-pair waiting branch; it cannot establish privacy during a successful exchange.

### N7-V02 — High: cancellation check and durable submission have no shared atomic contract

**Source/quoted AC:** `plans/mvp-xl-plan.md:95`, AC-N7-006: “Reply/complaint/opt-out до dispatch отменяет его”; `Specification.md:31–32` cancels queued work on revocation. `Pseudocode.md:66–73` commits claim/quota, then “Recheck cancellation immediately at the submission boundary”, then separately “Mark submitting durably”. Revocation locks mailbox (`:47–48`), reply locks enrollment (`:89–90`), suppression upserts/cancels (`:104–107`); their shared serialization with the final transition is not specified.

**Counterexample permitted by the algorithm:** dispatcher commits claim and reads cancellation=false; revocation/opt-out/reply transaction commits and cancels the job; dispatcher performs the separately described submitting write and invokes transport. All reads passed when made, but the stop won before submission. A timestamp-adjacent recheck alone cannot rule this out. For pool traffic, recipient withdrawal after eligibility read needs the same protection. This is an underspecified concurrency algorithm, not a claim that existing code performs an unconditional UPDATE.

**Required correction:** define one conditional, serialized queued/claimed→submitting transition that checks current job state, sender consent/version, enrollment/suppression/quarantine, and recipient eligibility where applicable. Specify the shared lock/conditional-update discipline used by every stop writer, including pool recipient withdrawal, while keeping network I/O outside DB transactions. Define that transition as the irreversible boundary in spec and UI: `Architecture.md:76` exempts already *submitting* work while `Specification.md:32` only names already *submitted SMTP*.

**Acceptance example:** Given a claimed job paused before the final transition, when each stop transaction commits, then resuming the dispatcher yields zero transport calls; test the reverse ordering separately and explicitly allow only the documented in-flight boundary. The existing quota concurrency case does not test this race.

### N7-V03 — Medium: UIDVALIDITY reset defeats the only specified reply-event dedup key

**Source/quoted AC:** `Specification.md:70–72`, SC-US-006-2: “Then dedup prevents duplicate events and mailbox pauses pending safe rescan”. `Pseudocode.md:15–16` defines `ReplyEvent: unique(mailbox, UIDVALIDITY, UID)`; `:91–92` preserves existing records across reset without defining another identity.

**Counterexample:** process reply R as `(M,100,7)`, then the server rebuilds identifiers and the same R appears in rescan as `(M,101,1)`. Both keys are distinct; retaining the old record does not reject the new event. Re-setting an enrollment to replied may be harmless, but it does not establish the stated no-duplicate-events guarantee. UID regeneration under a changed validity value is allowed by [RFC 9051 §2.3.1.1](https://www.rfc-editor.org/rfc/rfc9051.html#section-2.3.1.1).

**Required correction:** distinguish transport ingestion identity from idempotent semantic reply/stop effects; define stable reconciliation identity or explicitly narrower event semantics, including malformed/missing Message-ID handling. Specify cursor/rescan completion and restart behavior. Add a fixture where the same reply returns under a new UIDVALIDITY/UID, a crash before page commit, and an unrelated/foreign Message-ID. Do not resume dispatch merely because one rescan page succeeded. Existing sender+reference matching and same-transaction page/cursor commit are sound stated intentions, but do not resolve this counterexample.

### N7-V04 — Medium: safety-critical freshness and resource bounds lack an acceptance oracle

**Sources:** `Specification.md:72` requires a fresh poll, `Pseudocode.md:49,67,93` gates on freshness/staleness; no maximum age or poll interval is defined in the reviewed contract. `Specification.md:13,156` says bounded KDF/rate limits without admission count, key/window or saturation result. `Pseudocode.md:54` says template reply limit without a number; `:120` rejects stale observations without a staleness rule.

**Reproduction:** give two implementations the same mailbox whose last successful poll was 61 seconds ago. A 60-second freshness policy blocks; a five-minute policy sends. Both satisfy every stated numerical constraint. Similarly, two arbitrary KDF concurrency ceilings or unlimited elapsed rescan pages cannot be compared against a written acceptance threshold. The specified SMTP 10s/30s, IMAP operation 30s, batch 100 and API p95 target do not define these missing limits.

**Required correction:** select explicit versioned values or a required configuration contract with absent/invalid behavior for poll freshness, rescan completion, retry/recursion bounds, KDF admission/rate limiting and observation staleness. Add just-below/at/above-boundary scenarios and a successful unrelated-user path under saturation. Values are product/design choices; this review does not invent them. This is a SMART measurable/time-bound gap in gates that authorize sending and sharing, not a demand that every UI action have an arbitrary latency SLO.

### N7-V05 — Medium: the 32 scenario IDs do not cover AC conjunctions or mandatory security paths

**Quoted AC:** `plans/mvp-xl-plan.md:91`, AC-N7-002: “Регистрация и logout; изоляция второго tenant; raw secrets отсутствуют в API/БД/логах”. The only identity scenarios (`test-scenarios.md:5–23`) are foreign-mailbox denial and a pre-revoked session. Neither creates a session nor performs logout. Credential save/canary scenarios (`:25–43`) do not exercise corrupted ciphertext, wrong tenant AAD on decryption, or transport-error redaction.

**Reproducible coverage gap:** an implementation that rejects every login/registration can satisfy SC-US-001-1/2. A logout endpoint that returns success without revocation can pass a test whose Given supplies an already-revoked session. Similarly, `SC-US-003-1` proves an absent-consent branch but never an authorized independent-scope branch. Conjunctions/slashes such as self-referral/tampered cookie/replayed callback and missing-field/header-CRLF/unsafe-markup are not enumerated test cases; `test-scenarios.md:259–261` even omits the action (`When`) for SC-US-011-3.

**Required correction:** add registration→login→logout→re-use tests; no-session/forged-session and bad-Origin denial; auth brute-force/KDF-admission and injection cases; tenant/AAD substitution and tampered ciphertext failure with zero transport calls/secret leakage. Expand each alternative threat in a Scenario Outline or separate named scenario. For unsubscribe add GET-no-mutation, forged/wrong-purpose token and unauthenticated complaint rejection, not just successful authenticated complaint handling. For reply matching add wrong sender, foreign mailbox/tenant and unrelated References. Preserve the existing useful negative scenarios. These are requirements-validator security/BDD obligations; a prose failure-mode inventory in Refinement is not a named pass/fail scenario for each branch.

### N7-V06 — Medium: unavailable sandbox is both an accepted state and a billing blocker

**Sources:** approved `plans/mvp-xl-plan.md:63–66` says “При отсутствии нужного sandbox контракт остаётся блокирующим для billing”. `Architecture.md:59` instead says “FR-n7-009 unavailable state accepted until sandbox contract verified”. `Specification.md:105–109` combines successful permitted sandbox checkout and the unavailable path; `Completion.md:14–16` requires all Specification FR/NFR for delivery.

**Reproducible contradiction:** leave the sandbox unconfigured and return 503/unavailable for every checkout. SC-US-009-2 passes and Architecture's accepted-state wording permits it, but SC-US-009-1, SC-US-011-1 and the approved usable sandbox billing contract remain unexercised. The UNCONFIRMED external row groups *live capture* with this separate local acceptance issue. Deferring live charges does not settle whether local billing can be accepted by remaining unavailable forever.

**Required correction:** state one boundary across plan/spec/architecture/completion. A useful in-scope local fake/sandbox contract can exercise immutable price/attribution, independently verified status, duplicate/reordered events and single grant, while real provider activation stays deferred. Keep unavailable as a required negative scenario. If sandbox success is intentionally deferred too, record that disposition explicitly and do not mark the billing/growth conversion AC met. No live charge or credential is needed to resolve this.

## Criterion scenarios

These are semantic mappings, not execution results. All cited SC names exist as headings/`Scenario:` entries in `test-scenarios.md`; the corresponding specification clauses are the source obligations. “Gap” means an uncovered conjunct even where an ID is present. Proposed scenarios below are not falsely counted as existing coverage.

| Criterion | Scenario | Meaning and remaining gap |
|---|---|---|
| AC-N7-001 | Existing CJM checker: keyboard skip-link, six stage layouts/no overflow; CJM_Variants A/B/C decision | Three HTML and choice rationale present; inspect existing 1440/390 receipt. No full accessibility or backend pass. |
| AC-N7-002 | SC-US-001-1/2; SC-US-002-1/2 | Foreign mailbox, revoked session, encrypted save and blocked-host canary; registration/logout/decrypt failure absent (V05). |
| AC-N7-003 | SC-US-003-1/2 | Missing scoped consent yields zero calls; queued revocation. Independent authorized scope/version-change and final-boundary races need cases (V02/V05). |
| AC-N7-004 | SC-US-005-1 | 20 claims, remaining 3, combined warmup/campaign budget; algorithm reserves atomically. No execution claimed; provider-lower-limit and UTC rollover cases remain to define. |
| AC-N7-005 | SC-US-007-1/2 | Body/header presence and repeated suppression; enumerate warmup/reply/campaign message classes, GET vs POST and token-negative cases (V05). |
| AC-N7-006 | SC-US-005-3; SC-US-006-1/2; SC-US-007-2/3 | Ambiguous outcome no blind retry, matched reply cancellation, opt-out/complaint stop; final-transition/reset/freshness gaps (V02–V04). |
| AC-N7-007 | SC-US-004-1/2; SC-US-003-2 | Eligible count=30 and fewer-than-two-tenants waiting, sender withdrawal; no successful-exchange secrecy proof or recipient-withdrawal race (V01/V02). |
| AC-N7-008 | SC-US-005-2 | Missing field/CRLF/markup rejection, escaped preview; split alternatives and add successful allowlisted substitution. Static prototype uses textContent but its browser receipt is not backend validation. |
| AC-N7-009 | SC-US-008-1/2; SC-US-010-1/2/3 | Unknown blocks improvement sharing; comparable provenance and foreign-observation denial. Stale/comparable predicates need objective definitions (V04). |
| AC-N7-010 | SC-US-010-1/2/3; SC-US-011-1/2/3; SC-US-012-1/2/3; SC-US-013-1/2/3 | 12 growth BDD exist; happy counts 1/one/1/2, edges and security intentions retained. Split compound fraud threats and define conversion action; sandbox success boundary unresolved (V05/V06). |
| AC-N7-011 | No named product scenario/implemented suite; Refinement “Required layers” and “Failure modes” | Future typecheck/lint/build/full suites, DB concurrency, secret scan and product mutations remain mandatory and unexecuted. Existing static launch mutation is only prototype evidence. |
| AC-N7-012 | Existing CJM Chromium 1440/390 cases only; no named full-product E2E/PR acceptance scenario | Corrected source hashes match, receipts/screenshots exist. Product build/E2E and PR delivery are future work, not passed or waived. |

Algorithm references: identity/credentials `Pseudocode.md:23–38`; consent/pool `:40–56`; quota/dispatch `:58–80`; replies `:82–94`; opt-out/complaint `:96–109`; observations/share `:111–124`; attribution/billing/badge `:126–148`. Every one of the 32 SC IDs is claimed by an algorithm and has a BDD entry; no missing/dangling ID was found. That mechanical equality does not repair the findings above.

## INVEST / SMART evidence and rubric

Thirteen user stories were analyzed. The following quoted acceptance clauses establish that Testable and Completeness are nonzero; they do not establish complete coverage. All quotations are from the named FR sections of `Specification.md`. Traceability uses the **Criterion scenarios** table above and the SC headings in `test-scenarios.md`; uncovered AC conjuncts are explicitly named there.

| Story / FR | Actual acceptance text being scored | INVEST / SMART judgment |
|---|---|---|
| US-001 / FR-n7-001, :10–11 | “Then 404 без данных B”; “Then 401 и ноль изменений” | Valuable, small identity kernel; clear denial oracles, incomplete registration/logout coverage; no session/rate timing contract. |
| US-002 / FR-n7-002, :18–21 | “secret сохранён только AEAD ciphertext с tenant/mailbox AAD, API возвращает masked metadata” | Estimable local crypto/adapter boundary; depends on identity, missing decryption-negative acceptance. TLS/time limits elsewhere are concrete. |
| US-003 / FR-n7-003, :29–32 | “Then transport calls=0”; “When queued job проверяется, Then canceled” | Clear control value, partially estimable due to V02; independent scopes and version invalidation need stronger BDD. |
| US-004 / FR-n7-004, :40–43 | “Then count=30; invited/disconnected/quarantined/revoked excluded”; “Then waiting и 0 exchange jobs” | Small bounded scheduler/count, dependent on credentials/consent; privacy promise and success path unresolved. Seed target is not measured adoption. |
| US-005 / FR-n7-005, :52–57 | “Then <=3 accepted reservations суммарно warmup+campaign”; “automatic resend=0” | Valuable but spans preview/queue/quota/recovery; needs decomposition and race contract. Numeric limits are clear; delivery is not exactly-once. |
| US-006 / FR-n7-006, :68–72 | “Then enrollment replied, queued steps canceled, next dispatch sends 0”; “dedup prevents duplicate events” | Specific intended stop, depends on outbound identity; reset identity and freshness are underdefined. |
| US-007 / FR-n7-007, :80–85 | “visible unsubscribe link + signed opaque List-Unsubscribe and one-click POST”; “recipient suppression + sender mailbox quarantine” | Valuable recipient control; several public/authenticated entry paths, missing negative/race branches. |
| US-008 / FR-n7-008, :95–99 | “Then reputation unknown and share-after-improvement disabled”; “report shows raw values and provenance; no causal warmup claim” | Honest observable outcome; manual evidence is explicitly labeled, freshness/comparability need tighter predicates. |
| US-009 / FR-n7-009, :106–109 | “at most one entitlement grant; redirect alone grants zero”; “no fake success and no live provider call” | Useful bounded local adapter, dependent on auth/entitlements; achievable locally, acceptance split unresolved (V06). |
| US-010 / FR-GROWTH-001, :117–122 | “Then 1 anonymous report link/copy event; no mailbox email/credentials”; “Then 404 and no report” | Value and output count clear; depends on observation evidence and staleness semantics. |
| US-011 / FR-GROWTH-002, :127–132 | “one attribution snapshot is recorded before entitlement grant”; “no fraudulent attributed conversion” | Ordering specified, fraud outcome too bundled; no When in security BDD; conversion depends on sandbox contract. |
| US-012 / FR-GROWTH-003, :137–140 | “Then 1 badge shown”; “Then badge returns”; “server entitlement keeps badge” | Focused, deterministic view-time rule; depends on server entitlement. Scope is clear and currently planned only. |
| US-013 / FR-GROWTH-004, :145–149 | “Then counts=2, duplicate provider event adds 0”; “fraud adds 0 and foreign details absent” | Clear counts and no payout promise; eligibility and compound cross-tenant/replay/self scenarios need expansion. |

Rubric vectors below are **reviewer judgments, not empirical quality measurements, test coverage percentages or schedule estimates**. INVEST order is I/N/V/E/S/T (max 8/8/10/8/8/8); SMART order S/M/A/R/T (max 6/8/6/5/5); quality is traceability/completeness (max 10/10). Independence is conservative: stories requiring unfinished identity/dispatch/entitlement foundations receive 0. Negotiability refers to implementation room within approved safety constraints. Small=4 denotes a story judged to need splitting/two sprint-sized slices, not an observed duration.

| Story | INVEST | SMART | Quality | Base /100 | Security + growth adjustment | Adjusted |
|---|---|---|---|---:|---:|---:|
| US-001 | 8/8/10/8/8/8 | 6/8/6/5/0 | 5/2 | 82 | +5 | 87 |
| US-002 | 0/8/10/8/8/8 | 6/8/6/5/5 | 5/7 | 84 | +5 | 89 |
| US-003 | 0/8/10/4/8/4 | 4/8/6/5/0 | 5/7 | 69 | +5 | 74 |
| US-004 | 0/8/10/4/8/4 | 4/8/3/5/5 | 5/7 | 71 | +5 | 76 |
| US-005 | 0/8/10/4/4/8 | 6/8/6/5/5 | 5/7 | 76 | +5 | 81 |
| US-006 | 0/8/10/4/8/4 | 4/4/6/5/0 | 5/7 | 65 | +5 | 70 |
| US-007 | 0/8/10/4/4/8 | 6/8/6/5/0 | 5/7 | 71 | +5 | 76 |
| US-008 | 0/8/10/4/8/8 | 4/4/6/5/0 | 5/7 | 69 | +5 | 74 |
| US-009 | 0/8/10/4/4/4 | 4/8/6/5/0 | 5/7 | 65 | +5 | 70 |
| US-010 | 0/8/10/4/8/8 | 4/4/6/5/0 | 5/7 | 69 | +10 | 79 |
| US-011 | 0/8/10/4/8/4 | 4/8/6/5/5 | 5/7 | 74 | +10 | 84 |
| US-012 | 0/8/10/8/8/8 | 6/8/6/5/5 | 10/7 | 89 | +10 | 99 |
| US-013 | 0/8/10/4/8/4 | 4/8/6/5/0 | 5/7 | 69 | +10 | 79 |

Base mean: 73.3/100. Security +5 reflects specific written boundaries, not adequate security test coverage; growth +5 applies to the four explicitly traced growth stories. Adjustments remain outside the base 100-point rubric. No story falls below 50, and the three zero-floor conditions do not apply to these stories because quoted AC and named scenario mappings exist. Scores do not override V01/V02 or certify missing AC conjunctions. NFR and delivery gates are assessed separately below; no fabricated scenario is used to make their coverage green.

NFR-n7-001 has concrete request/CSV/SMTP/IMAP limits but incomplete KDF/admission/retry oracles (V04). NFR-n7-002's 390/1440 prototype widths are evidenced; API p95 <500ms under ten users is explicitly a future target, not measured performance. No named standalone NFR acceptance scenarios exist in the current BDD catalog. AC-N7-011/012 remain future mandatory implementation/delivery gates; their absent product execution is expected at this phase and is not itself counted as a backend defect.

## Proposed corrective BDD (not existing or executed coverage)

These bounded examples supplement the source catalog after the relevant contract is corrected. `configured_limit` and freshness thresholds must be concretely selected under V04 before execution.

```gherkin
Scenario: VAL-AUTH-LIFECYCLE
  Given a newly registered tenant can log in and read its own mailbox
  When that session performs logout and reuses the same cookie for a mutation
  Then the mutation returns 401 and commits zero changes

Scenario Outline: VAL-AUTH-BYPASS
  Given a mutation request has <authority>
  When it attempts to change a mailbox
  Then the request is denied and commits zero changes
  Examples:
    | authority             |
    | no session            |
    | forged session        |
    | revoked session       |
    | valid session bad Origin |

Scenario Outline: VAL-INPUT-INJECTION
  Given an authenticated owner supplies <payload> in <field>
  When preview or start is requested
  Then no code or injected header executes and no invalid message job is created
  Examples:
    | payload                 | field          |
    | CRLF plus Bcc header    | subject        |
    | script markup           | template       |
    | SQL syntax in tenant id | requested id   |

Scenario: VAL-CIPHERTEXT-TENANT
  Given tenant A and tenant B have distinct encrypted mailbox credentials
  When A's ciphertext is substituted into B's record in an isolated fixture
  Then AEAD authentication fails with zero transport calls
  And no plaintext credential occurs in response or captured logs

Scenario: VAL-AUTH-ADMISSION
  Given configured_limit concurrent password verifications occupy the admission slots
  When excess attempts and an unrelated authenticated request arrive
  Then excess attempts receive the configured bounded rejection
  And active KDF work never exceeds configured_limit
  And the unrelated request can complete within its defined bound

Scenario Outline: VAL-FINAL-STOP-RACE
  Given a job is claimed and paused before the atomic submitting transition
  When <stop> commits before that transition resumes
  Then the job cannot become submitting and transport calls equal 0
  Examples:
    | stop                      |
    | sender consent revocation |
    | recipient pool withdrawal |
    | matched reply             |
    | recipient unsubscribe     |
    | authenticated complaint   |

Scenario: VAL-UID-EPOCH-RESCAN
  Given reply R was processed at mailbox M UIDVALIDITY 100 UID 7
  When a completed safe rescan sees R at UIDVALIDITY 101 UID 1
  Then the defined semantic reply effect remains single
  And dispatch remains paused until the complete rescan boundary is committed
```

The privacy case must use the corrected disclosure policy rather than perpetuate the impossible current promise. The sandbox success case must assert one independently verified grant and one attribution snapshot after duplicate/reordered events; an unavailable-provider case alone cannot replace it.

## ADR, growth and external capability disposition

| Decision | Trace and disposition |
|---|---|
| ADR-001 | FR-n7-002, Architecture :35–42, Pseudocode :33–37. Server AEAD/external keys/AAD justified by autonomous worker; masked response and no send-on-save stated. Ciphertext substitution/decrypt-failure tests still required (V05). |
| ADR-002 | FR-n7-003/005, Pseudocode :66–78. Local transport/default deny, operator plus user gates, unknown-delivery retention. Final stop/submission boundary needs V02. |
| ADR-003 | FR-n7-004/008 and FR-GROWTH-001. Seed/waiting/unknown reputation are honest. Privacy conflict V01; no fake opens, clicks or mark-not-spam behavior prescribed. |
| ADR-004 | FR-n7-009 and FR-GROWTH-002. Server prices, immutable intent/attribution, canonical status before grant, no redirect grant. Sandbox acceptance ambiguity V06. |
| ADR-005 | FR-n7-001/NFR-n7-001 and reuse-inventory. Narrow donor candidates with source hashes/rejections; actual adapted code, dependency license and compatibility tests deferred to implementation. |

All four Growth Requirements Seed IDs survive into Specification and named algorithm/BDD sections. No speculative growth effectiveness was silently converted into measured adoption. Self-referral, invalid/inactive codes, tampered cookies, duplicate callbacks and forged paid flags are forbidden in prose; their combined BDD branches still need expansion. Code attribution is not causal lift; partner rewards/payouts are not promised. One share event is not proof that public provenance metadata is free of PII; test report fields and source-reference redaction during implementation.

Public primary documentation was reopened during review (2026-10-02): [Nodemailer SMTP](https://nodemailer.com/smtp) supports required STARTTLS through `requireTLS`, pinned-IP certificate naming and verification without sending; its defaults do not satisfy N7's time limits automatically. [ImapFlow quick start](https://imapflow.com/docs/getting-started/quick-start/) supports TLS connection, mailbox selection/locking and message reads. These substantiate library feasibility only, not concrete provider-account permission, authentication compatibility, polling correctness or deliverability.

Named deferred live capabilities are: **real SMTP/IMAP account activation and sending permission**, **automated provider-specific complaint feed**, and **live payment capture**. Local SMTP/IMAP fixtures and authenticated manual operator complaint intake remain useful test targets; local billing needs the explicit V06 disposition. No source-account policy, live credentials, provider complaint integration or real charge was tested. No live capability is promoted by an exit-0 inventory check. Public source appearance is captured; authenticated source path remains out_of_scope, never a full look pass.

## Checks and evidence

Commands below ran read-only against the bound source; exit codes are preserved. Project argument was `projects/07-cold-email-warmup`.

| Check | Exit | Interpretation |
|---|---:|---|
| `node .claude/hooks/check-docs-complete.cjs <project>` | 0 | Ten required documents present; says nothing about semantic correctness. |
| `node .claude/hooks/check-growth-trace.cjs <project>` | 0 | All four growth IDs traced/rejected on record. |
| `node .claude/hooks/check-external-deps.cjs <project>` | 0 | Five inventory rows: two confirmed library capabilities, three unconfirmed live capabilities. |
| `node .claude/hooks/check-metric-source.cjs <project>` | 0 | Six metric rows name a source; values remain unmeasured. |
| `node .claude/hooks/check-look-origin.cjs <project>` | 0 | No unpromoted hypothesis/stale-origin rows. |
| `node .claude/hooks/check-look-trace.cjs <project>` | **2** | Not fully performed: source journey out_of_scope; appearance only. This is not success. |
| `bash scripts/check-pipeline-gaps.sh <project>` | 0 | Structural checks only. Its FR regex excludes lowercase `n7`; independent exact SC-set comparison supplements it. |
| Exact SC-set and corrected HTML SHA comparison, Python read-only | 0 | 32 spec = 32 algorithm = 32 BDD; 12 growth. Three current HTML hashes equal corrected receipt hashes. |
| `bash scripts/complexity-router.sh <report-path> <receipt-path>` | 0 | Mechanical T for two report files; substantive reviewed risk remains XL. |

The existing `cjm-sol-receipt.md` and `cjm-browser-corrected/checks.json` report static checks, six Chromium file/viewport combinations at 1440/390 and a detected launch-guard mutation. The script and current A HTML were read; A desktop onboarding and mobile reply/billing screenshots were visually inspected. Current source hashes match all three recorded HTML sources. This review did **not** rerun the unchanged browser/static suite. Prototype results support their enumerated UI checks only; compound product guards, live reputation, server anti-fraud, persistent auth and provider behavior were not tested there. The prototype's initial values/share invitation simulation are explicitly demo states, not accepted product evidence.

The author's receipt has no serialized prelaunch digest; that existing evidence limitation remains, without inventing one. This validator has a separate matching launch digest. No full product tests were run because no backend exists. E2E preflight for this attempt: not_applicable, inspection only. Review outcome is semantic NEEDS WORK even though structural gates mostly return 0.

## Handoff and telemetry

Only this report and the unique validation receipt were written. Apply concrete contract corrections for N7-V01..06, add the named boundary/security scenarios, then revalidate affected specification/architecture/BDD links. Preserve approved autonomy and existing external-action exclusions; no repeated plan question is requested. Do not rerun unchanged CJM checks unless a corrective change affects those artifacts.

Profile: `compact-quality-first-v2`; requested model/effort: `gpt-6-astra` / `high`. Actual model, actual effort, tokens and cost: **null**, because this reviewer has no host execution/usage metadata. A requested launch model is not actual-model proof. No measured savings claim. Launch time and observed review boundaries, elapsed duration, limitations and terminal status are recorded in [validation receipt](telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/validation-astra-receipt.md). Completion of this validation attempt does not mean product acceptance.

Validation finished at 2026-10-02T18:18:20.244Z; launch-to-finish elapsed 840.412s, including pre-review launch delay; first observed review-to-finish 698.244s. Active time is null (no complete wait intervals). Final scope check: only the two authorized reports were added; the pre-existing launch JSON is unchanged.
