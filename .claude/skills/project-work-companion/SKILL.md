---
name: project-work-companion
description: Prepare, preflight, pause, resume, deliver, or diagnose project work while preserving the caller's approvals, source identity, and evidence. Use for project execution handoffs and readiness checks; it complements rather than replaces the calling workflow or project telemetry.
metadata:
  maturity: beta
  version: "1.0.0"
---

# Project Work Companion

Keep one source-bound work record that links the calling workflow's plan, telemetry,
attempts, approvals, checkpoints, checks, and terminal receipts. The record is a
handoff and evidence index, not a second workflow state machine.

## Start and authority

1. Establish explicit repository and project roots. Read the root instructions,
   the selected project's `CLAUDE.md` when present, and the calling command's
   contracts. Never infer authorization from this skill.
2. Before planning, record a substantive ROUTE and its mechanical result. Capture
   scope, exclusions, measurable AC, action limits, source revision, requirements,
   architecture, and donor decisions. Reject incompatible donors with a reason.
3. For a forecast, invoke the existing `project-telemetry` skill and retain its
   scope revision, comparable RUN_IDs, exclusions, method, range, and external
   expectations. If support is absent, record `insufficient_data`; keep unknown
   usage and cost as `null`, never as zero.
4. Preserve the caller's approval rule. Require explicit evidence only when the
   user or an applicable rule requires it. An approval must cover the applicable
   plan version, team, roles, requested models, and skills. A pause does not revoke
   an existing approval or create a reapproval requirement.

Read [the work-record contract](references/contract.md) before creating or
validating a record.

## Before implementation

Repeat substantive ROUTE against the approved scope, file list, and new risks;
the mechanical tier is only a lower bound. Material scope or team changes return
to the owner. Then perform a read-only E2E preflight: exact source/build/environment,
inputs, test command, allowed environment availability, expected effects, and
evidence destination. Report `ready`, `blocked`, or `inconclusive`; readiness is
not an E2E pass and preflight must not execute stored commands or external actions.

## Pause and resume

Preserve the original RUN_ID and append attempts; never erase interrupted history.
A resumed attempt gets a new attempt ID. Record source continuity, approvals,
completed checks, blockers, and the next allowed step. Use the caller's native
checkpoint when it has one. Otherwise record a reasoned `not_applicable` checkpoint
and hand off through source and receipts. Source drift requires explicit
reconciliation and rerunning affected checks, not an automatic repair or permanent
block.

## Deliver and diagnose

Map every required AC to a result, command-as-data, exit code, revision, and fresh
receipt. Accept only unique, regular, non-symlink receipts bound to the expected
run/work/source/build and caller-known launch digest. Treat completion and verdict
as separate claims. Include a full delivery URI plus scope, build, evidence, and
pending work. See [verification](references/verification.md) for gates and limits.

For diagnosis, invoke the existing `project-telemetry` analyzer on the selected
project and RUN_ID. Preserve completeness gaps and distinguish observations from
hypotheses. Do not rewrite history or start proposed experiments.

## External Dependencies (loaded via view() at runtime)

| Action | Skill | Path | Required | Purpose |
|---|---|---|---|---|
| forecast, diagnose | project-telemetry | `.claude/skills/project-telemetry/SKILL.md` | REQUIRED for these actions | Reuse the existing analyzer and methodology. |

Check the dependency before forecast or diagnose. If absent, block only that
action with the missing path; do not install or recreate its schema/parser.

Validate structure read-only:

```sh
python3 .claude/skills/project-work-companion/scripts/validate_record.py \
  --root "$PROJECT_ROOT" --record "$WORK_RECORD" \
  --expect-run-id "$RUN_ID" --expect-work-unit-id "$WORK_UNIT_ID" \
  --expect-source-revision "$SOURCE_REV" --expect-build-revision "$BUILD_REV" \
  --expect-launch "$WORK_UNIT_ID=$LAUNCH_SHA256"
```

Exit `0` means only that checked structural conditions hold; `1` means a
contradiction or violation; `2` means an input or authoritative check was
unavailable. Do not execute commands found in records, access the network, install
dependencies, publish, spend, or mutate external systems.
