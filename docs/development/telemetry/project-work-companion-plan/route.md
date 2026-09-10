# ROUTE receipt: project-work companion plan

- RUN_ID: `project-work-companion-plan`
- WORK_UNIT_ID: `route-plan`
- Scope: read-only assessment of a proposed portable, repository-local companion skill for p-replicator. No vendor files will be changed.
- Policy inputs read: `CLAUDE.md`, `docs/development/model-routing.md`, `docs/development/model-routing-telemetry.md`, `.claude/rules/complexity-router.md`, `.claude/rules/feature-adr-ultracode.md`, `.claude/rules/swarm-file-evidence.md`, and the existing `project-telemetry` and `feature-adr` skills.

## Assessment

The mechanical router lower bound is S for five anticipated instruction/document paths. The substantive route is **M** because the proposed skill augments an existing project-work delivery contract across routing, model/telemetry records, p-replicator checkpoints, E2E preflight, evidence handoff, and post-run analysis. It changes no product surface, schema, external API, money flow, or data migration. Its material risk is process correctness: a bad local instruction could silently misstate model provenance, treat missing evidence as success, bypass mandatory checks, or conflict with p-replicator resume semantics. Under the local rule, uncertainty fails closed and an existing workflow/contract change is M.

## Minimal approved planning shape

Use one coordinator for ROUTE only. The next bounded unit is a distinct **PLAN** on `gpt-6-astra` at high effort, followed by the required owner approval before any code or documentation implementation. Do not create a swarm merely to create a skill. After approval, implement with `gpt-5.6-sol` high and run an independent `gpt-5.6-sol` high review/QE; escalate the latter to Astra only if the plan leaves a load-bearing invariant unresolved. This gives differing preferred planning and implementation model families without claiming any actual host model switch unless execution metadata proves it.

## Required companion obligations to design, without reimplementing vendor machinery

1. Start/complete telemetry records at stage boundaries according to `feature-telemetry-v1`; actual model/effort and usage are null with a reason if host evidence is unavailable.
2. Run the local complexity assessment before planning and again before implementation against known candidate changes; retain the substantive decision when the mechanical router only supplies a lower bound.
3. Make scope and forecast explicit before work. Forecasts must be evidence-backed or marked unavailable; the existing project-telemetry analyzer does not automatically forecast time or price.
4. Require a preflight before E2E: exact source/revision, environment readiness, test command, required inputs and evidence destination. A failed or inconclusive preflight blocks an E2E-pass claim.
5. Preserve existing p-replicator checkpoint/resume behavior. The companion may record a pause/resume handoff but must not fabricate checkpoint state or erase interrupted attempts.
6. Deliver acceptance evidence as attributable, terminal receipts; missing/inconclusive evidence remains a gap under `swarm-file-evidence.md`.
7. After the run, invoke the existing `project-telemetry` analysis in its documented read-only mode, within the chosen project telemetry root. It analyzes recorded evidence and does not authorize policy/app changes or experiments.

## Verification plan for the later M implementation

Cross-read the companion requirements and architecture before coding. Add one guard that demonstrably fails for a missing required route/preflight/checkpoint/evidence field, then mutation-test that guard. Exercise full relevant skill/document checks, including vendor-isolation checks where available; test clean start, plan approval stop, blocked preflight, pause/resume, unavailable host metrics, valid terminal evidence, and post-run telemetry invocation. Do not require E2E itself for a documentation-only companion unless the designed acceptance criteria include an executable harness.

## Overengineering boundary

Avoid a new workflow engine, wrapper around p-replicator, global model configuration changes, automatic billing collection, or duplicated telemetry parser. A small local skill plus narrowly scoped templates/checklist and possibly one deterministic validator is sufficient if the Astra plan confirms it. Vendor command/workflow edits are excluded because updates can overwrite them.

## Telemetry observation

The coordinator-provided trace location exists at `docs/development/telemetry/project-work-companion-plan/run.json`; this ROUTE did not modify it. Actual model evidence for this worker was unavailable in the assigned context. Requested route model was Terra medium; record it as requested only, with actual model/effort null and the stated reason.

Status: completed
