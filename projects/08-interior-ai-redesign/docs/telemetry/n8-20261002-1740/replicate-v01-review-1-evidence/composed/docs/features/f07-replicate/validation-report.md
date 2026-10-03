# F07 independent PLAN validation
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Verdict: ACCEPT/CLOSED
Score: 95/100 (story average after security bonus, no zero floors)
Source: 8ce5b84d53618a807b8177179a9820b05445e812
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-validate-1
Attempt-ID: replicate-validate-1
Scope: independent /feature Phase 2; five F07 role documents plus replicate-research.md.
Requested model/effort: gpt-6-astra/high. Actual model/effort and usage: null, pending host proof.

## Decision

Closure 2026-10-03 — F07-V01 ACCEPT/CLOSED at source 8ce5b84d53618a807b8177179a9820b05445e812: the corrected direct send-CAS mutation explicitly authorizes a second POST for the same durable submission and must fail the unchanged exactly1-POST oracle; the expired-lease/two-reclaimer recovery race remains a separate regression. See `validation-v01-closure.md` and `../../telemetry/n8-20261002-1740/replicate-v01-review-1-evidence/report-gate.json` for this narrow revalidation and current packaged gates. Initial report preserved byte-for-byte in `validation-report-initial.md`. Score95/100, specification revision, AC/scenario table and BDD remain unchanged. All following original decision/finding/check/source statements are retained as historical validation, not current blockers or new execution claims. No implementation or real-pilot pass is claimed.

The software design is feasible and has no confirmed core algorithm blocker. One required correction to the mandatory mutation recipe prevents unconditional Phase 3 acceptance of this exact plan: F07-V01 below. NEEDS_WORK is narrowly for that contradictory test contract, not absent implementation, live predictions, or conservative availability. Return only that clause for correction; do not redesign the adapter or reopen accepted auth/billing/UI. No paid test is needed to close the finding.

Testable, Completeness and Traceability are all nonzero for both stories. A high average does not override an internally inconsistent mandatory check. Completion tests remain planned, not executed. Live activation and full-MVP acceptance remain pending separately.

## Findings

### F07-V01 — MEDIUM — required mutation recipe does not defeat the retained one-shot guard

Exact clause: `05_completion.md:31`, “remove the hosted submitting/ambiguous no-replay branch at expired-lease recovery so it re-enters create” and “mutant must fail duplicate-create assertion”. Compare `02_pseudocode.md:34-35`, Durable one-shot submission steps 1–2: “Matching row may continue; mismatch fails closed” and “Compare-and-set preflight→submitting, commit. Exactly one process sees this transition succeed. No other process can send this submission.”

Concrete counterexample: one POST is accepted; its response is lost; the row remains submitting (or becomes ambiguous). Remove only the recovery branch and run both reclaimers. With the specified send CAS retained, neither reclaimer can transition that row from preflight, so POST count remains one. If generic recovery increments the attempt, the immutable attempt/deadline binding is another rejection before POST. A correct implementation therefore need not fail the required duplicate-create assertion under the specified mutant. An unchanged ticket assertion might fail, but the clause explicitly rejects that as the required duplicate-create witness.

Minimal fix: change only the mutation recipe to deliberately re-enable a second send for the same durable submitting/ambiguous submission in a disposable mutant (including the send CAS check and any recovery precondition needed to reach it), then require the unchanged transport-count oracle to observe two POSTs and fail. Alternatively test the CAS guard directly with a second invocation of the same submission and mutate that guard, while retaining the recovery race as an ordinary regression. Keep the restored-source digest and failure-at-the-intended-assertion requirement. This changes the verification recipe, not production semantics or scope.

Evidence: `../../telemetry/n8-20261002-1740/replicate-validate-1-evidence/mutation-contract-witness.json` is a small abstract transition witness, explicitly not a product test. No runtime defect or executed mutant is claimed.

## INVEST, SMART and artifact-backed score

| Criterion | US-001 | US-002 | Artifact and rationale |
|---|---:|---:|---|
| Independent /8 | 0 | 0 | The two stories share admission, durable submission and publication; they are a cohesive feature, not independently deliverable stories. Existing auth/billing/UI can nevertheless be reused. |
| Negotiable /8 | 8 | 8 | 03 ADR Alternatives compares hosted input/transport options; selected security boundaries reflect accepted invariants, not unnecessary rigidity. |
| Valuable /10 | 10 | 10 | 01 Product brief: “private depth-conditioned redesign without duplicate credit use”; “bounded remote effects, recoverable identities and honest quality evidence”. |
| Estimable /8 | 8 | 4 | 03 exact files and 04 I1–I8 each bounded at25min; US-002's mandatory mutation requires the specific correction above. These are attempt limits, not proven overall duration. |
| Small /8 | 8 | 8 | 04 sequential bounded slices, existing worker/maintenance, no new scheduler/auth/payment implementation. Later P1 is explicitly separate. |
| Testable /8 | 8 | 8 | Actual AC quotes below provide observable counts, thresholds and outcomes. F07-V01 concerns one mutation recipe, not absence of AC. |
| Specific /6 | 6 | 6 | 01 AC7 enumerates URL/image rejection classes; AC3 enumerates crash boundaries and exact effect counts. |
| Measurable /8 | 8 | 8 | AC1 exactly one create/ticket/credit/evidence; AC5 literal180s/360s/60s/30s/10s; AC8 all36 pairs and≤0.02. |
| Achievable /6 | 6 | 6 | Disabled adapter and injected transport are feasible on the existing Node/PG interfaces. Real output/safety/p95 are not prerequisites for offline implementation. |
| Relevant /5 | 5 | 5 | Private redesign and bounded paid effects map directly to the approved transition brief and owner decision. |
| Time-bound /5 | 5 | 5 | AC5 supplies operational deadlines; 04 supplies per-attempt bounds; provider cleanup is retention-window bounded. |
| Traceability /10 | 10 | 10 | This report's `## Criterion scenarios` maps every declared AC exactly once to its named BDD scenario. |
| Completeness /10 | 10 | 10 | 01 Acceptance criteria includes happy path, missing config, crash/lease races, deletion/hold, hostile outputs and provenance negatives; quoted below. |
| Base total /100 | 92 | 88 | INVEST42/38 + SMART30/30 + Quality20/20. |
| Security bonus | +5 | +5 | Server-only secrets, fixed-origin API, owner isolation, DNS-pinned import, safe errors and hosted provenance are explicit. |
| Final total /100 | 97 | 93 | Average95; no Testable/Completeness/Traceability floor. |

Growth bonus: +0, not applicable to this inference-only feature. Acquisition/adoption is outside the approved F07 scope; existing growth/product requirements are not rewritten here.

Quoted acceptance evidence (01_specification.md, `## Acceptance criteria and named scenarios`):

- AC-f07-replicate-1 / US-001 happy path: “then exactly one create, one consumed existing first ticket, one reserved credit, one immutable evidence record and private output/depth/config artifacts result”.
- AC-f07-replicate-2 / US-001 error: “fail closed with safe code and **zero outbound creates**”.
- AC-f07-replicate-7 / US-001 security/edge: “then no prohibited connection/publication occurs and only this attempt’s files are removed. Cross-account reads and deleted output remain404.”
- AC-f07-replicate-3 / US-002 failure/edge: “create count stays1, submitting becomes ambiguous, local job fails/releases at most once and capacity/spend remain reserved.”
- AC-f07-replicate-4 / US-002 recovery happy/race: “exactly one fence owns same attempt, original deadline/ticket/attempt number persist and only GET resumes.”
- AC-f07-replicate-5 / US-002 deadline: “when DB time reaches literal attempt180s/job360s (or queue60s before start), then job is terminal/fenced, one release is made”.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-f07-replicate-1 | SC-US-001-1 — owned hosted mock success binds one ticket, credit and private evidence |
| AC-f07-replicate-2 | SC-US-001-2 — missing/invalid hosted authorization fails with zero creates |
| AC-f07-replicate-3 | SC-US-002-1 — crash or lost create response never resends and releases once |
| AC-f07-replicate-4 | SC-US-002-2 — two reclaimers resume one identity with original deadline and fenced publication |
| AC-f07-replicate-5 | SC-US-002-3 — fixed deadlines defeat healthy heartbeats and cancel/success races |
| AC-f07-replicate-6 | SC-US-001-3 — pre-submit hold and deletion revoke effects; authorized private completion remains distinct |
| AC-f07-replicate-7 | SC-US-001-4 — hostile delivery URLs/images and cross-account/deleted reads fail closed |
| AC-f07-replicate-8 | SC-US-001-5 — synthetic/mixed/tampered evidence cannot authorize real hosted publication |
| AC-f07-replicate-9 | SC-US-002-4 — admission, midnight and recovery retain conservative ticket/spend limits |
| AC-f07-replicate-10 | SC-US-002-5 — provider errors cannot leak secrets or fabricate cost/warm measurements |
| AC-f07-replicate-11 | SC-US-002-6 — source-bound software checks and fresh review precede separately authorized activation |

## BDD completeness and security supplement

The eleven named Given/When/Then scenarios in01 plus every subcase in04 are the implementation oracle; 05 explicitly requires all subcases, not representative examples. The following derived security cases make the inherited boundaries explicit without adding endpoints or redesigning auth:

- Auth bypass: Given no valid owner session, when requesting hosted job/result/export through existing routes, then no private bytes or provider create is authorized; existing auth rejection contract applies.
- Input injection: Given SQL metacharacters, HTML/script payloads or command-like text in job identifiers/style and attempted prompt/model/URL overrides, when admission parses the request, then existing UUID/closed-enum validation rejects it before provider submission; no raw payload reaches logs or rendered markup. This exercises FR1 and AC2/7/10.
- Cross-tenant: Given accounts A and B, when B requests A's hosted job/media/export or deletion, then existing owner-scoped404 applies and A's submission/artifacts are unchanged (AC7).
- Network boundary: Given an allowlisted name resolving to a private/mapped address or rebinding after validation, when import connects, then no prohibited address is contacted; redirects, authorization forwarding and proxy environment bypass are rejected (AC7).
- Auth throttling is inherited: no F07 auth endpoint is added. Existing rate-limit/brute-force suites remain mandatory unchanged under05; this validation does not resurvey or rewrite them.

## Critical algorithm assessment

| Boundary | Assessment and exact plan anchor |
|---|---|
| One hosted create, including HTTP→ID-commit crash | 02 Durable steps1–6 commit submitting before POST, keep unique job identity, allow only the CAS winner to send, never replay even429/4xx. An ID-only late write grants cleanup identity, never completion authority. |
| Quota, credit and spend | 02 initial lock order plus Durable1–2 and AC9 retain platform→account bucket→account→job ordering for current-day tickets; envelope locks follow submission. Consumed tickets and modeled spend never auto-decrement; canonical unique credit release remains separate. |
| Lease/deadline recovery | 02 Observe1–4 explicitly precedes generic retry, keeps same attempt/ticket/deadline and caps30s lease/10s heartbeat; expiry has a terminal path that does not depend on live() being true. |
| Availability tradeoff | Crash after submitting but before actual send may lose a usable job; known terminal failure also receives no new create. Explicit in AC3/9 and03; accepted conservative tradeoff, not a blocker. |
| Hold and deletion | 02 Revoke1 and AC6 distinguish hold-before-submitting from authorized private completion. Deletion tombstones/fences/releases, late IDs schedule cleanup, and local404 never promises provider erasure. |
| Cleanup and stale worker | 02 Observe5 uses bounded existing maintenance with cleanup lease, GET/cancel only; Import5–6 fences completion, scopes UUID cleanup and requires checking persisted output before uncertain-commit unlink. Implementers must preserve that rule even when reconciliation is unavailable. |
| Private transmission and retention | 02 Prepare sends sanitized bounded data URI with original/transmitted hashes; research Transmission/retention and03 require provider-processing/retention disclosure and privacy acceptance before real use. No public input URL or invented DELETE API. |
| Hostile output/import | 02 Import1–4 defines exact two outputs, HTTPS host/subdomain/port rules, validated connection IP and SNI, no redirects/proxies/auth forwarding, actual streamed byte limits, identity encoding, MIME/magic/pixel/frame checks, transform/crop/hash and private writes. |
| Quality separation | 02 Revoke2–3 + AC8 require a hosted discriminator, immutable bindings, actual36-pair licensed corpus and independent measurement attestation. Fixture/CUDA/mock evidence cannot become hosted-real merely by a flag. |
| External safety/performance | 03 changed contracts and05 later pilot retain safety policy, actual output-order confirmation and real geometry/performance as separate unpassed gates; no vendor typical-runtime or unknown-warm substitution. |
| Bounded implementation | 03 lists exact existing/new files;04 I1–I8 are sequential≤25min attempts with coordinator continuation; Python local path is retained and no SDK/new orchestrator is required. |

## Source and provider feasibility evidence

Read only interfaces named by the plan: `web/jobs.js` claim/heartbeat/complete/fail/maintenance/delete/validateOutput; `web/generation.js` Engine/runClaim/artifact helpers; `scripts/worker.js`; `scripts/maintenance.js` maintenancePass; `web/quality.js` evidence/corpus/eligibility; mode predicates in sharing/composite/public-pages; `web/media.js` image bounds; current DB generation/quality constraints and `web/db.js` transaction helper. The listed migration/wiring/quality files cover these integration seams, including restrictive existing mode checks. Existing code is not mistaken for an implemented hosted adapter.

The plan's older source header identifies its author baseline. This review is pinned to21561a6 and the six exact input digests in the per-unit manifest; no stale report is reused. Official schema evidence identifies the pinned64hex version, required image/prompt, string sample/resolution enums, integer seed and array-of-URI output. The captured author depth source explicitly uses c_concat depth conditioning and returns depth before samples. Research honestly limits main-branch code as evidence for deployed output order. No new uncertain API fact was needed, so no additional network calls or SDK installs were made.

## Actual checks and delivery

Actual packaged report gate: **exit0**; `report-revision=PASS`, `criterion-scenarios=PASS`, features1/gaps0/inconclusive0. Installed vendor1.13.2, unchanged checker SHA256 `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`. Full exact argv/cwd/exit is in `../../telemetry/n8-20261002-1740/replicate-validate-1-evidence/report-gate.json`, output in `report-gate.log`.

```bash
bash /root/.npm/_npx/21ec3c42ee749a67/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh /tmp/n8-replicate-plan/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/replicate-validate-1-evidence/composed --report-revision --criterion-scenarios --role-map-source /tmp/n8-replicate-plan/.claude/commands/feature.md --project-role-map-source /tmp/n8-replicate-plan/.claude/skills/sparc-prd-mini/SKILL.md
```

The five role documents and this exact new report were copied to this unit's composed view; all source bytes were verified unchanged. No plan1 evidence was mutated and no nonzero exit was treated as a warning.

The inherited PLAN traceability receipt records installed vendor1.13.2 exit0, requirements20 / algorithm requirement-links20, missing0/orphan0. These are20 REQUIREMENT links across six algorithms, not20 distinct algorithm bodies. Its exact command and hashes are in `../../telemetry/n8-20261002-1740/replicate-plan-1-evidence/traceability.json`; original evidence is read-only.

No completion/review-contract gate or product test was run prematurely. Missing planned test files at PLAN are not findings. E2E preflight: not_applicable (docs-only validation, no adapter build). No code/design edits, paid/external calls, Docker, delegation, run.json/events.jsonl writes, commit or push.

Profile: compact-quality-first-v2, XL, owner-requested independent Astra high; actual model/effort/usage/cost null pending host proof. Elapsed and final artifact hashes are recorded in the terminal receipt. No savings claim. Next executor is the parent coordinator assigning the narrow F07-V01 completion-clause correction and affected revalidation; implementation must retain the unchanged accepted invariants and external gates.
