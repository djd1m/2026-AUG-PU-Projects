# Project toolkit preparation

Status: prepared, generation waits for independent semantic validation of source `07d47977`. This document does not open the implementation gate.

## Inputs and detection

SPARC eleven documents under `docs/`; no enterprise DDD or `.ai-context` hierarchy. Architecture: Node 22 ESM web, PostgreSQL 16 durable jobs/ledger, private disk media, Python SD 1.5 + ControlNet-depth worker, hosted YooKassa checkout. `has_database`, `has_external_apis`, `has_pseudocode`, `has_adr`, `has_c4`, and inline `has_gherkin` are true. Enterprise aggregates and generated ORM are not required. `docs/ADR.md` is the actual ADR collection.

## Selected instruments

P0: project `CLAUDE.md`; developer instructions at `docs/DEVELOPMENT_GUIDE.md` to respect the owner's explicit Markdown folder requirement; project security, coding-style and secrets-management rules; security-patterns skill; `docs/features/` and `docs/plans/`.

P1: planner, architect and code-reviewer agents; project-context, coding-standards and testing-patterns skills; testing rule; `.claude/feature-roadmap.json`; feature-navigator skill because the root toolkit does not contain it. No `/test` command is advertised in this pre-shipped p-replicator environment.

Shared root commands start/myinsights/feature/plan/deploy/next/go/run/docs, rules insights-capture/feature-lifecycle/git-workflow/swarm-file-evidence, receipt checker and all six lifecycle skills were checked present on 2026-10-02. Root settings also exists. Reference these files through the repository root; do not copy or overwrite them. Owner explicitly restricts edits to N8 and keeps the shared toolkit at root. Existing hooks are not evidence that this native host automatically runs them; execute required checks explicitly and record receipts.

Modules 01/02/03/04/06/08 and template references were read; optional P2/P3, harvesting and cross-project learning modules are not selected. Required template sections are retained for selected templates. DDD example sections are marked not applicable to this project instead of inventing DDD artifacts. OpenAI-only coding overrides sample Sonnet/Opus labels. Server-owned provider keys override browser-key examples; no client encryption/credential entry is introduced.

## Roadmap proposal

| ID | Scope | Dependency | Initial state |
|---|---|---|---|
| F00 | Three static CJM journeys and selection | none | done, existing browser evidence |
| F01 | Web foundation, auth and private uploads | F00, validated specification | next after gate |
| F02 | Credit ledger, durable jobs and ControlNet worker | F01 | planned |
| F03 | Verified hosted payments and partner attribution | F01/F02 | planned |
| F04 | Working comparison/gallery, branded share and opt-in publication | F02/F03 | planned |
| F05 | Real GPU geometry corpus and performance acceptance | F02, verified CUDA runtime | blocked on runtime |
| F06 | Integrated browser/security verification and delivery | F04/F05 | planned |

`/next` must use the canonical roadmap schema from root `.claude/commands/next.md`; `/go` must inherit the XL financial/privacy route and current owner autonomy. F05 remains visible and cannot be closed by local fixtures. F06 may collect independent fixture evidence before F05, but overall readiness stays incomplete.

## Roles, scope and stop rules

Coordinator plans and writes documents. Sol `gpt-6.1-sol` high writes product code/tests in an isolated worktree and exclusively owns its manifests/lockfiles. Fresh Astra high independently validates/reviews. Requested model is distinct from provider-resolved evidence; unknown actual model and usage remain null. Every assignment has a unique absolute receipt path, source/launch hash, bounded attempt budget and named checks. Default implementation attempt is 25 minutes; inspect artifacts and specific delay at expiry. No optional polish after required checks pass.

## Applicability decisions

- New external spend remains zero; deployment, GPU rental and live financial effects are excluded by the published plan.
- Project rules describe commands and thresholds but do not claim host hooks, autonomous dispatch or model switching are installed.
- Shared source gates remain unchanged. Runtime-inapplicable outcomes retain their exit codes and explanations.
- No existing third-party screenshot is vendored; appearance requirements cite the actual read-only capture and distinguish unmeasured authenticated paths.

## Финальная проверка наследования

2026-10-03: standalone project verify exit1 (нет install manifest) сохранён, затем installed vendor1.13.2 verify в одноразовой read-only composed view root+project overrides exit0. Общие hooks/settings не активировались и не менялись. Standalone checkout требует доступного корневого toolkit; копия всего toolkit не создавалась. См. docs/telemetry/n8-20261002-1740/toolkit-composed-final-provenance.json и toolkit-composed-final-verify.txt.
