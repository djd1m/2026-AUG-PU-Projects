# Independent validation handoff — N7

2026-10-02. Bound source: `f5930afe0f72bba143497d5a3767975be6d7aa10`.
Later handoff/telemetry-only commit does not change these specification bytes.
RUN_ID: `20261002T173314Z-n7-replicate-a1`.

## Work envelope

Fresh Astra high/medium, separate from Sol CJM author and Astra coordinator.
Budget 15 minutes; no product edits or optional polish. Review existing project
docs, HTML and evidence against AC; output actionable findings with source lines,
reproduction/contradiction and severity, or zero findings if supported.
Do not broaden scope or ask for already granted plan approval.

Canonical repository worktree:
`/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate`.
Project: `projects/07-cold-email-warmup`. Branch: `feature/07-cold-email-warmup`.
Inputs: root CLAUDE.md and applicable rules already read by coordinator; reviewer
must read requirements-validator skill, references/scoring-system.md and exact
docs listed below. No project-root CLAUDE exists yet (Phase 3 pending).

## Target catalog and role map

TARGET_CATALOG: `projects/07-cold-email-warmup/docs/`.

| Role | File |
|---|---|
| specification | Specification.md |
| pseudocode | Pseudocode.md |
| architecture | Architecture.md |
| refinement | Refinement.md |
| completion | Completion.md |

Also: PRD.md, Solution_Strategy.md, Research_Findings.md,
product-discovery-brief.md, source-product-profile.md, CJM_Variants.md, ADR.md,
test-scenarios.md, reuse-inventory.md, decisions-owner.md, pipeline-walkthrough.md,
plans/mvp-xl-plan.md (AC-N7-001..012).

Review must challenge provider feasibility, consent races/limits, reply ingestion,
tenant secrecy, ciphertext handling, sandbox/live distinction and growth anti-fraud;
check criterion→scenario→algorithm meaning, not just ID presence. The initial
README contradicts scope by mentioning AI replies; explicit prompt overrides it.
Live SMTP/IMAP activation, provider complaint feed and live charges are named
deferred capabilities; local implementation must remain useful/testable without
pretending these have been integrated. Review whether sandbox acceptance is clear.

## Already observed checks

Executed in integration worktree:

```sh
node .claude/hooks/check-docs-complete.cjs projects/07-cold-email-warmup
node .claude/hooks/check-growth-trace.cjs projects/07-cold-email-warmup
node .claude/hooks/check-external-deps.cjs projects/07-cold-email-warmup
node .claude/hooks/check-metric-source.cjs projects/07-cold-email-warmup
node .claude/hooks/check-look-origin.cjs projects/07-cold-email-warmup
bash scripts/check-pipeline-gaps.sh projects/07-cold-email-warmup
```

All above exit 0. External deps: 2 library capabilities confirmed, 3 live capability
rows explicitly deferred. `check-look-trace.cjs` exit 2: appearance captured/traced,
authenticated source path out-of-scope; never full look pass. Scenario sets: 32/32,
no missing/dangling claims. 12 growth scenarios. These checks prove structure only.

CJM static checks and real Docker Chromium at 1440/390 passed, plus keyboard,
consent default/revocation, limits, XSS escaping, reply pause, complaint suppression
and mutation of launch guard. Sources and checks:
`docs/telemetry/p-replicator/20261002T173314Z-n7-replicate-a1/evidence/cjm-sol-receipt.md`;
corrected evidence `evidence/cjm-browser-corrected/checks.json` and screenshots.
No need to rerun unchanged green browser suite just to review docs. No backend
exists; no product build or provider test claim.

Companion `work-record.json` stage approved structurally passes using absolute
root and independent expected source `f5930afe...`. It is not delivered. Sol
receipt lacks serialized prelaunch launch digest; limitation recorded, not forged.
For new validation work allocate fresh launch JSON+TRACE_PATH before launch.

## Output contract

Reviewer writes only its isolated worktree outputs, preferably
`docs/validation-report.md` plus unique telemetry evidence receipt. First report
line exactly `**Verdict:** 🟢 READY`, `**Verdict:** 🟡 CAVEATS`, or
`**Verdict:** 🔴 NEEDS WORK`. Requirements-validator INVEST/SMART results must
reference real quoted AC and criterion scenarios; do not invent numerical quality.
Include source spec SHA256, scenario and ADR coverage, concrete blockers, and
disposition of deferred external capabilities. Last receipt line `Status: completed`
or `Status: failed`; completion isn't acceptance. Metadata actual model/usage only
from host, otherwise null. Coordinator integrates; no shared root toolkit edits.

## Next allowed work after review

Concrete confirmed fixes → revalidate affected docs → Phase 3 enhanced toolkit
from validated docs only; preserve pre-shipped root toolkit, generate project-local
CLAUDE/agents/rules/skills/roadmap/guide. Read full relevant toolkit modules before
generation, not just SKILL summary. Run vendor verify with root pre-shipped plus
project artifacts; don't silently replace unavailable vendor checker.
Then `/next` F01 → substantive `/go` ROUTE → Sol isolated implementation and tests,
independent Astra review. Owner approved autonomous continuation, no new plan pause
within published boundary. Feature telemetry run separate from this preparation run.

## Memory and measurement

`dz` 0.8.35 supports teach/recall, no standalone store subcommand. Initially root
and project recall returned empty; no source Claude learned-store file discovered.
One non-secret N7 rule taught with `--no-mirror`, recalled successfully as
`teach:c474113828ce136c`; project `.dz` is ignored. Don't copy arbitrary hidden
memory, secrets or full prompts to git. Usage/cost remain null; savings unestablished.
