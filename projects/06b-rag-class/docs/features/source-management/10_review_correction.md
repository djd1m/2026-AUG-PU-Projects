# Source management — bounded independent correction review

Run-ID: 20261003T053651Z-source-management
Work-Unit-ID: source-management-correction-review
Attempt-ID: review-2
Source-Revision: 57555e55d03ba5d8c841a3abee4b274588916ff5
Build-Revision: none
Launch-SHA256: e5b6947484f728ed0073e2884db9b2c4566324d9a50f6a3a6fb0082fd86ab7cc

Verdict: ACCEPT_WITH_CAVEATS — source correction accepted; runtime verification and feature acceptance remain open. No new actionable source finding. F15-R1 is addressed by inspection, but its required dynamic adjudication is not yet complete in the available evidence.

## Independent obligations and exact scope

Read Specification FR-n6b-17/NFR-n6b-4 and Pseudocode “Source management and retention” before the prior review and correction claims. Obligations: live work must yield409 without partial deletion; deletion/retry serialization must retain tenant isolation and worker compatibility; retention must preserve strict cutoffs. Read Architecture Data/Security, applicable rules and existing SRC-01..07 plan. This is correction-only review, not a new review of the unchanged feature.

HEAD and launch digest match the assignment. `tests/artifacts/source-management/final-source-hashes.json` SHA256 is `2aa1bd4b8d2585254ff21b793a40d71fbcdca5d4bdb89a0fe81eb00a3ec2c978`; all23 file hashes match current raw bytes. Comparison with `implementation-source-hashes.json` confirms exactly four changed paths and19 unchanged paths. The final manifest retains its author's earlier base revision; current review identity is the verified committed HEAD plus these exact bytes.

## Source and regression assessment

- `packages/db/src/source-management.ts:14–22`: source FOR NO KEY UPDATE remains. Early visible-live rejection prevents D from tentatively deleting L while waiting on retry-held F, breaking the specific R1 cycle. The existing DELETE RETURNING state guard still rolls back when an initially invisible failed→queued retry commits during the DELETE wait. SourceBusy is translated to the exact409 body by the unchanged handler. No grant, schema, tenant job UPDATE, source lock strengthening or service bypass was added.
- `packages/db/tests/int/source-management.test.ts:86`: queued and running fixtures include a separate historical failed job. The owner fixture holds the same F row predicate/mode as the retry function, then executes the real function under tenant role. Forced sequential visitation, ctid ordering and EXPLAIN make the old L-before-F schedule reproducible. On the mutant path, pg_blocking_pids establishes D waiting on R and the independent KEY SHARE NOWAIT probe establishes D's incompatible lock on L. Fixed assertions require DELETE409, retry source-busy, the exact body, unchanged row counts and preserved states. This is real SQL with barriers, not mocked results.
- The worker barrier now pauses after acquiring the source lock, so its document FK insertion still tests compatibility with the actual held lock even though the new early read avoids the old job-delete wait. The failed-only retry test remains essential: the uncommitted retry is invisible to the early read and exercises the post-lock guard.
- `services/worker/tests/int/retention.test.ts:35`: only `$2::integer` was added. It resolves overloaded date subtraction in the fixture; production retention and strict boundary assertions are unchanged.
- `scripts/mutate-source-management-guard.mjs:10–39`: --live-retry removes only the new early read/throw; independent byte reconstruction confirms the prior product implementation after removing the two new comments. Default mode now targets the failed-only race so the early check cannot mask removal of the RETURNING guard. Baseline/RED/restoration/GREEN checks remain.

## Dynamic proof: required, not inferred

R1 acceptance requires `node scripts/mutate-source-management-guard.mjs --live-retry`: baseline GREEN, observed D-owns-L/D-waits-R boundary, old-code RED with40P01 or wrong domain503, byte-exact restoration to `f716c7bd48af173e95812f96e3b653a6005504398f4679e1bae84f6cfeae408d`, restored GREEN. The script's predicate is practical rather than an exhaustive infrastructure classifier: generic503 alone does not identify a PostgreSQL deadlock. Read the actual RED assertion/DB diagnostic alongside the lock marker; setup, timeout or connection failure alone cannot close R1. No runtime reproduction was executed by this reviewer.

Available evidence inspected at2026-10-03T06:31:19.305469+00:00:

- `correction-typecheck.txt`, `correction-focused-tests.txt`, `correction-checks.json`: author reports exit0 root/web typecheck and18 focused tests/4files. Static reconstruction independently confirmed in this review.
- `correction-final-full-regression.txt`:646 unit tests/44files passed and the corrected DB source-management file14tests passed; corrected retention2tests also passed at final inspection. No terminal full integration result, default mutation, --live-retry mutation or production build result was present in the inspected log. `correction-full-stage-exits.json` was absent. These are partial observations, not full-gate passes.
- Earlier308 passing PG tests plus the retention fixture failure remain historical evidence; they do not establish corrected full regression. No browser receipt was inspected; untracked UI harness/fixture are coordinator-owned pending work, not proof of UI execution.

All artifact names above are under `tests/artifacts/source-management/`. Coordinator owns required mutation proof, corrected full regression/build, actual1440/390 UI, cleanup and delivery reconciliation. SRC-06/07 remain open; this verdict must not be used as feature acceptance. If new evidence arrives after this bounded review, reconcile it against the same snapshot without treating this report as a runtime pass.

## Execution limits and telemetry

Profile compact-quality-first-v2; substantive M, recorded mechanical S/exit0 lower bound. Existing launch/work record predate review. Applied project-work-companion for source-bound handoff; E2E preflight not_applicable because this attempt only reads evidence. Requested model/effort gpt-6-astra/medium; actual per-attempt model/effort metadata unavailable. Usage, cost and active time null; no savings claimed. Coordinator retains ownership of shared telemetry at `docs/telemetry/p-replicator/20261003T053651Z-source-management/`.

No donors, children, source edits, tests/probes, Docker, ports, network, dependencies, commit or push. Writes limited to this report and the assigned review-2 receipt. No reviewer background work remains. Completion means this bounded review was delivered, not that pending mandatory gates passed. Elapsed time is recorded in the final receipt.
