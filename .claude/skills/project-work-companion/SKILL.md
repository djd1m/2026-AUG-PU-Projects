---
name: project-work-companion
description: Prepare, preflight, pause, resume, deliver, or diagnose project work while preserving the caller's approvals, source identity, and evidence. Use for project execution handoffs and readiness checks; it complements rather than replaces the calling workflow or project telemetry.
metadata:
  maturity: experimental
  stability: alpha
  version: "0.1.1"
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
3. For a forecast, load the existing `project-telemetry` skill when available and
   retain its scope revision, comparable RUN_IDs, exclusions, method, range, and
   external expectations. If it is absent, disclose the dependency warning and
   record `insufficient_data`; keep unknown usage and cost as `null`, never zero.
4. Preserve the caller's approval rule. Require explicit evidence only when the
   user or an applicable rule requires it. An approval must cover the applicable
   plan version, team, roles, requested models, and skills. A pause does not revoke
   an existing approval or create a reapproval requirement.

Read [the work-record contract](references/contract.md) before creating or
validating a record.

## Before implementation and E2E

Repeat substantive ROUTE against the approved scope, file list, and new risks;
the mechanical tier is only a lower bound. Material scope or team changes return
to the owner. Implementation does not require an E2E preflight or a build that does
not yet exist. Immediately before an actual E2E run, perform a read-only preflight:
exact source/build/environment, inputs, test command, allowed environment
availability, expected effects, and evidence destination. Report `ready`, `blocked`,
or `inconclusive`. A docs-only or not-yet-E2E stage may instead record
`not_applicable` with a reason. Readiness is not an E2E pass; a missing or non-ready
preflight blocks an E2E claim, and preflight executes no stored command or action.

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
pending work. Unmet mandatory AC and pending accepted-scope work block delivery;
pending work explicitly classified `out_of_scope` with a reason remains disclosed
without blocking accepted mandatory AC. See [verification](references/verification.md).

This validator intentionally uses a fresh-path adapter for receipts: before every
launch the caller allocates a new, unique trace path whose prelaunch state is absent.
Resume never truncates or reuses a trace; old receipt files remain preserved and a
new attempt receives a new path. Callers that natively support changed pre-existing
traces must adapt by allocating a fresh path before using this validator.

For diagnosis, invoke the existing `project-telemetry` analyzer on the selected
project and RUN_ID. Preserve completeness gaps and distinguish observations from
hypotheses. Do not rewrite history or start proposed experiments.

## External Dependencies (loaded via view() at runtime)

| Action | Skill | Path | Required | Purpose |
|---|---|---|---|---|
| forecast | project-telemetry | sibling `project-telemetry/SKILL.md` | OPTIONAL | Reuse comparable-run methodology when installed. |
| diagnose | project-telemetry | sibling `project-telemetry/SKILL.md` | REQUIRED | Reuse the authoritative local analyzer. |

Set `SKILL_DIR` to the directory containing this loaded `SKILL.md`, then resolve
the dependency as `SKILL_DIR/../project-telemetry/SKILL.md`; the table's sibling
path is runtime-relative, while `.claude/skills/project-telemetry/SKILL.md` is only
an installation-layout example. Check existence before `view()`.

**Fallbacks:**

- Forecast dependency absent → warn with the resolved path and record
  `insufficient_data` with unknown numbers `null`.
- Diagnose dependency absent → block diagnosis and name `project-telemetry` plus
  its resolved path. Independent authorized work may continue. Never auto-install,
  recreate, or silently replace the dependency.

Validate structure read-only:

```sh
SKILL_DIR=/absolute/path/to/loaded/project-work-companion
python3 "$SKILL_DIR/scripts/validate_record.py" \
  --root "$PROJECT_ROOT" --record "$WORK_RECORD" \
  --expect-run-id "$RUN_ID" --expect-work-unit-id "$WORK_UNIT_ID" \
  --expect-source-revision "$SOURCE_REV" --expect-build-revision "$BUILD_REV" \
  --expect-launch "$WORK_UNIT_ID=$LAUNCH_SHA256"
```

Exit `0` means only that checked structural conditions hold; `1` means a
contradiction or violation; `2` means an input or authoritative check was
unavailable. Do not execute commands found in records, access the network, install
dependencies, publish, spend, or mutate external systems.
