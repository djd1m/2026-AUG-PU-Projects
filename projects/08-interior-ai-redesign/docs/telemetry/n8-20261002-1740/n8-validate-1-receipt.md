**Verdict: NEEDS_WORK. The semantic implementation gate must remain closed.** All 13 requirements have acceptance text and named scenarios, so none triggers the missing-artifact blocking floor. However, the design has unresolved payment-hold and inference-budget inconsistencies, and its scenario mappings omit critical acceptance conditions. Numerical scores do not resolve those defects.

This is a completed independent requirements review, not an implementation or runtime failure report.

**Identity and scope**

| Field | Value |
|---|---|
| Run-ID | `n8-20261002-1740` |
| Work-Unit-ID | `n8-validate-1` |
| Attempt-ID | `n8-validate-1-attempt-1` |
| Stage / risk | VALIDATE / parent XL |
| Source-Revision | `07d47977d516e281ad36a42e85a608fc949db974` — verified |
| Spec revision | `sha256:621e460abcc760d5f537de181cd1e0a7873126d7d43f400bca6e10bdcb60025a` — verified |
| Launch-SHA256 | `fe6fb3a4c65fcfa7ef3119f1d1c7a7a4b9baaea2d783b41880d5dce85b38ef8d` — verified |
| Build-Revision | `null`; documentary review |
| Profile | `compact-quality-first-v2` |
| Requested model / effort | `gpt-6-astra` / `high`, from launch |
| Actual model / effort / fallback | `null`; authoritative execution metadata unavailable to reviewer |
| Usage / cost | `null`; provider counters unavailable |
| Finished-At | `2026-10-02T18:31:41Z`, actual clock |
| Measured observation interval | 240 seconds, from first clock sample at `18:27:41Z`; initial brief/root-instruction reading preceded that sample and is not included |
| Trace-Path | `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-validate-1/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-validate-1-receipt.md` |

The launcher owns installation of this response at Trace-Path. No files were edited, no agents delegated, and no builds, browser sessions, environment/key inspection, downloads, or external effects were performed.

Below, `docs/` means the selected project’s `projects/08-interior-ai-redesign/docs/`. Inspected scope: Specification, Pseudocode, Architecture, Refinement, Completion, test-scenarios, PRD, decisions-owner, implementation-plan-v1, source-product-profile, product-discovery-brief, validation-report, webhook/job/model-cost contracts, launch/run/work records, phase-one gate receipts, look-origin correction, CJM receipt, and relevant static variant-A source. Applicable root instructions, routing/telemetry rules, requirements-validator rubric, and companion guidance were read. Project `CLAUDE.md` is absent, consistently with the stated generation gate.

**Findings, ranked**

1. **HIGH — Refund spending hold is stated but omitted from the algorithms that must enforce it.**

   Sources: `docs/Specification.md:21`; `docs/Pseudocode.md:33`, `:45`, `:57`.

   The payment algorithm says a verified refund sets `billing_hold` and forbids new reservations and badge-free export. However, reservation checks only upload ownership and ledger balance; composite generation checks only paid entitlement. Neither algorithm checks the hold. The success handler also sets entitlement/conversion without specifying how a pre-existing refund/review state constrains that transition.

   Consequence: a direct implementation of the documented reservation/export algorithms could continue spending refunded credits or serving badge-free exports. Concurrent or reordered success/refund processing has no complete documented state-transition rule.

   Bounded correction: add the hold predicate to reservation under the account lock and to export entitlement, including cached-artifact access. Specify refund verification and its binding to the existing payment/account, plus monotonic refund-review behavior under later success delivery. Keep monetary refund execution outside MVP. Add named refund-versus-reservation, refund-versus-export, and reordered-success scenarios.

2. **HIGH — Admission-time capacity reservation contradicts worker-time accounting; exhaustion lacks a terminal credit-release path.**

   Sources: `docs/Specification.md:12`, `:42`; `docs/Pseudocode.md:33`, `:73`; `docs/long-job-contract.md:8`; `docs/Architecture.md:52`.

   Specification requires credit, job, and daily-attempt capacity to be reserved atomically. Pseudocode commits the credit reservation and queued job first, then claims attempt capacity when a worker leases it. Its budget algorithm rolls back when either bucket is exhausted, but does not define what happens to the already-reserved job.

   The declared 360-second job bound also lacks a queue deadline: two 180-second attempt limits alone do not bound time spent queued or waiting for capacity.

   Consequence: admission can succeed without available capacity, leaving a reserved credit and queued job without a defined terminal outcome. Retry exhaustion and capacity exhaustion are distinct failures; only the former has an explicit release path.

   Bounded correction: choose and reconcile admission-versus-attempt accounting. Define exhausted-capacity behavior, queue expiry, exactly-once release, and explicit deadline enforcement even while heartbeats continue. Preserve counting of every actual retry. Add concurrent last-slot, retry-at-limit, and queued-expiry scenarios.

3. **HIGH — Coarse requirement-to-scenario mappings conceal substantial acceptance gaps.**

   Sources: `docs/test-scenarios.md:107–155`; `docs/Specification.md:6–42`; detailed coverage inventory below.

   The table maps one requirement paragraph to one or three scenarios. For example, `Verified payment replay` tests duplicate crediting and an unspecified mismatch, but not each required account/order/paid/status check, refund hold, provider timeout/retry, or checkout idempotency. `Return URL forgery` and `Late worker fence` exist but are omitted from the Criterion scenarios table.

   Consequence: the mapping can appear complete while financially or security-critical subcriteria have no named acceptance scenario. This is a design-validation gap, not evidence that tests have failed.

   Bounded correction: give subcriteria stable identifiers and extend the existing table and Gherkin document. No new validator or testing framework is needed. Cover the omissions below, particularly payment verification/hold, credit release races, auth abuse boundaries, public-original exclusion, and budget retries.

4. **MEDIUM — Quality acceptance lacks a defined persistent provenance record and operator transition.**

   Sources: `docs/Specification.md:15`; `docs/Pseudocode.md:11`, `:35–37`; `docs/Architecture.md:44`, `:48`.

   The design requires input/model/config hashes, seed, timings, independent corpus evidence, and operator review. The canonical job structure contains a quality enum but no fields or referenced record for those generation/review facts. The algorithm says an operator reviews the result without defining the privileged acceptance operation or binding that acceptance to an immutable output.

   Consequence: `quality=accepted` can be stored without a specified auditable explanation of who accepted which generated bytes against which evidence. Publication relies on that state.

   Bounded correction: define a small generation/review record or equivalent job metadata containing the required hashes, seed, timings, reviewer identity/time, decision, and output binding. Specify the operator-only transition and rejection of fixture, missing-evidence, or changed-output acceptance. This does not require an automated geometry engine.

5. **MEDIUM — First paid conversion and tracking consent are not fully carried through the algorithms.**

   Sources: `docs/Specification.md:27`, `:33`; `docs/Pseudocode.md:13–16`, `:45`, `:53`, `:61`; `docs/product-discovery-brief.md:41`.

   Requirements limit attribution to the first verified paid conversion. The purchase algorithm sets conversion on successful payment, and the registry aggregates converted intents. Although attribution is unique per account, the algorithms do not specify an atomic “previously unconverted account” transition, the winner among concurrent differently attributed intents, or what a later purchase does.

   Separately, the discovery seed explicitly calls for “opt-in tracking”; the specification and attribution algorithm retain the cookie mechanism but omit its consent condition or an explicit decision to reject that seed condition.

   Consequence: repeat purchases can be interpreted inconsistently in partner aggregates, and the identifier-only growth trace can pass despite losing part of the original obligation.

   Bounded correction: define the account-level first-conversion transition and repeat-purchase behavior; preserve the permitted manual-code override before freezing. Carry the tracking consent condition into acceptance text, or record a deliberate product decision. Add concurrent first-payment, second-purchase, and cookie-consent scenarios.

6. **LOW — Current validation summary does not reconcile the corrected look gate or missing embed declaration.**

   Sources: `docs/validation-report.md:11`, `:13`, `:18`; `docs/telemetry/n8-20261002-1740/phase1-gates.json`; `look-origin-correction.json`.

   The summary still shows look-origin exit 1 and describes it as not measured, while the correction receipt records exit 0. The inspected embed receipt says the contract file is absent; direct inspection confirms this. That is different from a recorded “no widget” applicability declaration.

   Consequence: the handoff requires reconstructing the current state from contradictory summaries.

   Bounded correction: update the current summary to link both historical failure and correction; add the explicit no-widget declaration if applicable. Preserve historical receipts and retain exit-2 results as non-passes.

**Per-requirement scores**

Component order is explicit:

- INVEST: Independent / Negotiable / Valuable / Estimable / Small / Testable; maxima `8/8/10/8/8/8`.
- SMART: Specific / Measurable / Achievable / Relevant / Time-bound; maxima `6/8/6/5/5`.
- Quality: Traceability / Completeness; maxima `10/10`.

These are reviewer rubric judgments, not measured delivery estimates.

| Requirement | INVEST components | SMART components | Quality components | Base /100 |
|---|---|---|---|---:|
| FR-auth-1 | 8/8/10/8/8/8 | 4/4/6/5/0 | 5/10 | 84 |
| FR-upload-1 | 8/8/10/8/8/8 | 6/8/6/5/0 | 5/10 | 90 |
| FR-redesign-1 | 0/8/10/4/8/8 | 6/8/6/5/5 | 5/10 | 83 |
| FR-geometry-1 | 8/8/10/4/4/8 | 6/8/3/5/0 | 5/10 | 79 |
| FR-gallery-1 | 8/8/10/8/8/8 | 4/8/6/5/0 | 5/10 | 88 |
| FR-payment-1 | 0/8/10/4/8/8 | 6/8/6/5/0 | 5/10 | 78 |
| FR-GROWTH-001 | 8/8/10/8/8/8 | 6/8/6/5/0 | 5/10 | 90 |
| FR-GROWTH-002 | 8/8/10/4/8/8 | 6/8/6/5/5 | 5/10 | 91 |
| FR-GROWTH-003 | 8/8/10/8/8/8 | 6/4/6/5/0 | 5/10 | 86 |
| FR-GROWTH-004 | 8/8/10/8/8/8 | 6/8/6/5/0 | 5/10 | 90 |
| FR-GROWTH-005 | 8/8/10/8/8/8 | 6/8/6/5/5 | 5/10 | 95 |
| NFR-security-1 | 8/8/10/4/4/4 | 4/4/6/5/0 | 5/10 | 72 |
| NFR-performance-1 | 8/8/10/4/8/8 | 6/8/3/5/5 | 5/10 | 88 |

Average: **85.69/100**; minimum: **72/100**; missing-artifact floor BLOCKED: **0/13**.

Traceability is **5**, not 10, throughout: actual mappings exist, but the paragraph-level identifiers conceal uncovered subcriteria. Completeness scores acceptance **text** covering successful behavior, errors, and boundaries; it does not assert full scenario coverage.

Lower independence scores reflect atomic cross-domain coupling in job reservation and purchase settlement. Estimability deductions reflect unresolved state transitions and measurement work. Geometry/performance Achievable=3 reflects ambitious, unverified targets, not demonstrated impossibility. Auth/security limits and gallery recovery/cleanup lack precise operational bounds. Time-bound=0 means no temporal criterion is supplied; an action-count target is not a duration.

Supplementary rubric checks outside the 100-point base: **Security +5**, because specific security criteria exist; **Growth trace +5**, because all five seed identifiers survive. These bonuses cannot override the substantive findings or establish complete semantic preservation of each seed condition.

**Acceptance-text evidence supporting Testable and Completeness**

The following quotations are from `docs/Specification.md`, under the exact requirement headings. Together with the remaining clauses at each cited line, they establish actual AC artifacts.

| Heading / line | Actual acceptance text |
|---|---|
| `FR-auth-1`, line 6 | “Email/password registration and login, opaque revocable cookie session (HttpOnly, SameSite=Lax, Secure outside localhost), CSRF origin check on mutations, generic failed-login response. One trial credit per account transaction. Password ≥12 chars, body size bounded, registration/login rate-limited; concurrent requests cannot grant twice.” |
| `FR-upload-1`, line 9 | “Authenticated JPEG/PNG/WebP upload ≤10MB and ≤20MP, magic-byte/decode validation, EXIF removal, opaque server filename. No remote URL input. Private read requires owner; wrong owner returns 404.” |
| `FR-redesign-1`, line 12 | “Create with upload_id, enumerated style and idempotency key returns 202 + job_id before inference. Same key/body returns same job; changed body conflicts.” / “Postgres queue, lease, heartbeat, fencing, ≤2 automatic attempts, maximum 180 seconds per attempt.” / “Failed job releases its credit once.” |
| `FR-geometry-1`, line 15 | “Worker uses actual SD + ControlNet-depth, saves input/model/config hashes, seed and timings.” / “acceptance corpus≥12 rooms×3 styles, no added/removed openings and anchor displacement≤2% image diagonal.” / “Fixture mode always labels the result and cannot grant production quality verification.” |
| `FR-gallery-1`, line 18 | “User can list only their jobs/images, reopen comparison slider, see queued/running/succeeded/failed/unknown states and clear error recovery.” / “Separate before/after alt text, keyboard slider, minimum 16px body, mobile390 no horizontal overflow.” / “Delete revokes sharing and removes associated private media through bounded cleanup.” |
| `FR-payment-1`, line 21 | “Package ROOM20: 20 credits / 90000 minor RUB, server authoritative.” / “Provider GET verifies account, amount, RUB, order metadata and succeeded/paid status before transaction.” / “Unique provider payment and credit ledger guard replay/concurrent duplicate. Return URL never grants credit.” / “refunded provider state freezes further spending and entitlement pending operator review” |
| `FR-GROWTH-001`, line 24 | “Single share CTA directly next to first available result creates branded before/after composite.” / “Track share_attempt separately from confirmed browser share completion or export delivery; cancelled share is not completed.” / “Export delivery is labelled export, not proven external publication. Target≤2 actions from result to artifact.” |
| `FR-GROWTH-002`, line 27 | “Partner attribution survives onboarding until first verified paid conversion.” / “cookie failure still allows code.” / “First valid attribution frozen at payment intent; manual code may replace unconfirmed cookie before that.” / “Self-referral, owner-tampered code and duplicate conversions rejected; no partner payout.” |
| `FR-GROWTH-003`, line 30 | “Free export embeds visible RoomKind attribution in pixels. Removing badge requires confirmed paid-package entitlement server-side; client flag and direct media URL cannot bypass it. AI redesign label remains on share regardless of paid badge. Original private media never exposed through share token.” |
| `FR-GROWTH-004`, line 33 | “Operator creates unique per-partner opaque code and owner binding; public signup cannot mint privileged codes. Store distinct conversion counts and amount from verified payments. Self-referral, repeated payment delivery and reversed payment do not inflate conversions.” |
| `FR-GROWTH-005`, line 36 | “Public gallery only after explicit per-result unchecked opt-in plus style, source context and useful owner description≥40 chars.” / “Revocation immediately disables public route and composite access with no public cache; malformed HTML escaped.” / “Only verified non-fixture results become indexed public entries” |
| `NFR-security-1`, line 39 | “Fail closed on missing signing secret/database/storage/runtime configuration; no secret browser bundle/log, public DB port, default password, external upload fetch, or permissive cross-origin write.” / “Public routes have size/rate limits. Resource limits and DB parameterization apply to all paths. Test two-account isolation and replay mutations.” |
| `NFR-performance-1`, line 42 | “Warm generation target p95≤25s on≥30 actual GPU jobs, queue delay recorded separately.” / “Daily inference-attempt ceiling200, account ceiling20; every attempt consumes capacity even if credit is refunded. Ceiling exhaustion refuses instead of silently degrading.” |

**Criterion scenarios and uncovered subcriteria**

Actual mapping artifact: `docs/test-scenarios.md`, heading **Criterion scenarios**, lines 107–123. All referenced scenario names resolve to definitions. The names below reproduce that mapping; omissions are named rather than hidden behind a coverage percentage.

| Requirement → existing named scenarios | Uncovered or insufficiently specified subcriteria |
|---|---|
| FR-auth-1 → `Session isolation` | Registration/login success; password boundary; cookie flags; CSRF; logout revocation; concurrent one-time trial grant; body cap; brute-force/rate-limit behavior; injection attempts. |
| FR-upload-1 → `Image boundary validation` | Each allowed format; exact 10MB/20MP boundaries; magic-byte mismatch; remote-URL rejection; owner denial for upload reads/deletes; UUID/path traversal; failed-write cleanup. “Malicious file” does not identify these cases. |
| FR-redesign-1 → `Durable job concurrency` | 202 before inference; changed-body conflict; invalid style/upload ownership; crash/reclaim; two-attempt and 180-second bounds; terminal release exactly once; completion/release races; unknown status on fetch failure; exhausted capacity. `Late worker fence` at lines 101–105 is defined but not mapped. |
| FR-geometry-1 → `Real geometry corpus` | Persisted model/config/input hashes, seed/timings; reviewer/output provenance; public rejection of unverified output; fixture labelling; operator authorization; explicit acceptance/rejection lifecycle. |
| FR-gallery-1 → `Private comparison journey` | All status/error states; separate alt text; 16px text; explicit no-overflow assertion; non-indexing; delete/revoke transaction; bounded media cleanup. Testing at 390px alone does not assert no overflow. |
| FR-payment-1 → `Verified payment replay` | Separate merchant/account, provider ID, amount, currency, order, paid and status mismatches; intent-create retry; provider failure followed by successful retry; missing-key refusal; refund hold and races; reordered events. `Return URL forgery` at lines 95–99 is defined but not mapped. |
| FR-GROWTH-001 → `Growth 001 happy-path`; `Growth 001 edge-case`; `Growth 001 security` | Download fallback; `export_delivered` distinct from completion; failed native share/export; repeated event deduplication; branded artifact content; absence of automatic messages. |
| FR-GROWTH-002 → `Growth 002 happy-path`; `Growth 002 edge-case`; `Growth 002 security` | Onboarding persistence; 30-day expiry; manual override before freeze; immutable attribution afterward; tampered/inactive code; concurrent first conversions; second purchase; tracking consent. |
| FR-GROWTH-003 → `Growth 003 happy-path`; `Growth 003 edge-case`; `Growth 003 security` | Direct media bypass; public-token original exclusion; held/refunded entitlement; free-export AI label; cached composite behavior after entitlement change. |
| FR-GROWTH-004 → `Growth 004 happy-path`; `Growth 004 edge-case`; `Growth 004 security` | Non-operator code minting; owner-binding tampering; self-referral aggregate exclusion; verified amount aggregation; reversed-payment exclusion; repeat purchase versus first conversion. |
| FR-GROWTH-005 → `Growth 005 happy-path`; `Growth 005 edge-case`; `Growth 005 security` | Default unchecked consent; per-result consent isolation; missing style/source context; 39/40-character boundary; PII/EXIF exclusion; no-cache behavior; XSS with an otherwise valid accepted result. The existing fixture/unverified case may reject before exercising HTML rendering. |
| NFR-security-1 → `Fail closed configuration` | Missing DB/storage/runtime configuration independently; secret leakage; published DB ports/default credentials; origin bypass; public rate/body caps; SQL/path/HTML injection; resource saturation; replay mutations. |
| NFR-performance-1 → `Bounded inference budget` | Concurrent last-slot admission; retry/failure consumption; rollback when only one bucket is exhausted; UTC rollover; missing/invalid limits; rejection of fixture/cold samples; separate queue timing and hardware/model/source evidence. |

The minimal corrective BDD additions should include these explicit outcomes:

- Given a verified refund hold, when reservation and export race with refund processing, then no operation linearized after the hold can create a new reserve or deliver a badge-free export.
- Given the final available platform/account attempt slot, when two workers claim concurrently, then at most one attempt starts; the other job reaches the specified bounded outcome with exactly one credit release.
- Given provider verification fails transiently, when a valid notification is retried, then no prior dedupe claim prevents the single legitimate credit grant.
- Given two differently attributed intents for one unconverted account, when both verified payments settle concurrently, then exactly one first-conversion record is created according to the documented rule.
- Given a real accepted result with malicious description text, when published and viewed, then text is escaped; rejection for fixture status must not substitute for this test.
- Given missing or mismatched generation/review provenance, when an operator attempts quality acceptance, then acceptance and public indexing are refused.
- Given native sharing is cancelled or unavailable, when the user cancels or completes a download, then completion remains zero for cancellation and download records only export delivery.

**Checks and evidence limits**

Executed read-only identity commands:

```text
git rev-parse HEAD
git status --short
sha256sum projects/08-interior-ai-redesign/docs/Specification.md
sha256sum projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-validate-1-launch.json
```

All exited 0. Revision and digests match the brief. `git status --short` showed only the untracked reviewer launch JSON; no tracked source changes were reported.

Read commands used `cat`, `nl -ba`, `sed -n`, and `rg` over the scope listed above. Two read-only `python3 - <<'PY'` checks:

- Extracted specification headings, Criterion table rows, and `Scenario:` definitions: **13 requirements, 25 named definitions, zero undefined mapped scenario names**. Confirmed absent project `CLAUDE.md` and `embed-contract.md`. Exit 0.
- Summed the disclosed rubric components: **average 85.6923076923077**, minimum 72. Exit 0.

These checks prove identity, mapping syntax, and arithmetic only.

Prior gates were inspected, not rerun:

| Gate/evidence | Recorded result | Review interpretation |
|---|---:|---|
| docs-complete, external-deps, growth-trace, handoff-manifest | 0 | Documentary checks passed; no semantic/runtime proof. |
| look-origin | Initial 1; correction 0 | Preserve both; current summary needs reconciliation. |
| look-trace | 2 | Authenticated source path remains unmeasured. |
| embed-contract | 2 | Inspected receipt says missing declaration, not verified no-widget applicability. |
| job-contract | 2 | No worker/runtime verification. |
| webhook-contract | 2 | Not implemented; generic signature assumptions do not prove authenticated-GET equivalence. |
| model-cost | 2 | Declared no external model API; self-hosted inference limits still require verification. |
| Static CJM receipt | Reported pass | Six fixture journeys / 42 screen assertions at 1440 and 390; not actual application E2E. |

Static `docs/cjm/variant-a.html:25–31` records demo share completion on a local confirmation button, simulates publication/revocation, and performs no actual download/payment. Its visible fixture disclosures make that acceptable prototype behavior. It supplies no evidence for native-share completion, real export delivery, backend consent enforcement, or verified payment.

The real SD+ControlNet requirement is preserved. The **12 rooms × 3 styles geometry corpus** and **30 warm GPU jobs** remain pending. Lack of runtime evidence does not itself prevent correcting and validating the design, but it continues to prevent full MVP acceptance.

**Disposition**

The numerical minimum and artifact floor are satisfied; semantic correctness and scenario sufficiency are not. Close findings 1–5 through bounded document/scenario corrections, reconcile finding 6, and revalidate the changed specification with a fresh digest. No repeated owner approval is needed within the existing authorized scope. Toolkit generation and the semantic implementation gate should wait for that validation; production, external spend, and MVP acceptance remain separately gated.

Status: completed