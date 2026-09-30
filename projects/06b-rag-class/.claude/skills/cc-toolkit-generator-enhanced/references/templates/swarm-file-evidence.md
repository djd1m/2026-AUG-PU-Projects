# Swarm File Evidence Templates

> The swarm contract, in the form the GENERATOR emits it. Everything below is written INTO the
> target project — it is not guidance for this skill.
>
> WHY THIS FILE EXISTS. A worker that died looks exactly like a worker that is still running: both
> are silent. Silence therefore reads as `in progress`, and a coordinator reports in good faith
> that the review is running when no review exists. The absence of a receipt is indistinguishable
> from unfinished work, and so it reads as progress. The cure is to declare the RESULT of every
> parallel unit to be a FILE at a named path: no file, no work — and that is a fact a machine can
> establish, not a feeling a reader has to trust.
>
> MEASURED 2026-09-01 (the defect this closes): the generated feature lifecycle told the toolkit to
> launch parallel agents 22 times and required a file result zero times, while the package that
> emits it had already carried the cure in nine of its own files. The generator reproduced in every
> consumer project a defect its author had already fixed at home.

---

## 1. Rule Template: `swarm-file-evidence.md`

**Output path:** `.claude/rules/swarm-file-evidence.md`

**Do NOT overwrite** an existing file at that path — `npx @dzhechkov/p-replicator init` pre-ships
this rule, and a project initialised that way already has it. Generate it only when the path is
absent, which is the case for every toolkit produced into a project this package never initialised.

Emit the body below VERBATIM. It is byte-identical to the pre-shipped rule, and
`tests/unit/generator-swarm-contract.test.js` asserts that identity, so the two cannot drift.

```markdown
# Swarm File Evidence

## Rule

Every parallel work unit has a named file result. A narrative reply is only a pointer; silence is
neither progress nor completion. The coordinator may aggregate only positive, attributable terminal
receipts from the assigned files.

## Mechanics

1. Before dispatch, allocate a run-unique `RUN_ID` and a unique `WORK_UNIT_ID`. Resolve one absolute
   `TRACE_PATH` per `(RUN_ID, WORK_UNIT_ID)`, record its pre-launch state, and pass both fields to the
   worker. Two workers never share a path.
2. The worker writes a substantive Markdown body to a temporary regular file in the same directory,
   appends exactly `Status: completed` or `Status: failed` as the final line, renames it to
   `TRACE_PATH`, then returns a one-line pointer. The terminal marker is written last.
3. Before merge, synthesis, or completion, the coordinator checks each assigned path: absolute and
   unique; regular and non-symlink; readable and non-whitespace; absent before launch or observably
   changed after launch; final line terminal. It reads the file as the payload and reports
   `valid receipts / required receipts` with every failed `WORK_UNIT_ID` and path.
4. `Status: completed` permits consumption. `Status: failed` is a delivered failure and blocks a
   successful aggregate. Missing, empty, stale, partial, unreadable, duplicate, or probe-error
   evidence is undelivered or inconclusive. A dead PID stops waiting as failure; a live PID may only
   extend waiting. Neither PID state proves delivery.

## Bounded exception

If atomic rename is unavailable, write directly to `TRACE_PATH` and append the terminal marker last;
until that line exists the file is partial. Host-authoritative liveness may extend a deadline, but it
cannot replace the file result or turn missing evidence into success.

## Observable violation → replacement

| Observable violation | Required replacement |
|---|---|
| Task report exists but `TRACE_PATH` does not | Name the unit/path, mark undelivered, and refuse aggregation. |
| File is empty, stale, symlinked, unreadable, or non-terminal | Keep the evidence out of the aggregate and rerun or diagnose that unit. |
| Status says `running` but its recorded PID is dead | Close the unit as failed; do not report continued work from silence. |
| Fewer than all required receipts are terminal-completed | Report the partial ratio and refuse completion. |

## Self-check

For every parallel unit, point to its assignment containing `WORK_UNIT_ID` and absolute `TRACE_PATH`,
then point to the coordinator check performed before aggregation. Exercise missing, empty, stale,
partial, failed, dead-PID, and probe-error traces; only a fresh substantive file ending in
`Status: completed` may satisfy delivery.
```

---

## 2. Seam Template: the positive file receipt

**Paste this block VERBATIM into every generated instruction that dispatches parallel agents** —
the `/feature` and `/feature-ent` commands, the `feature-lifecycle` rules, `/start` Phase 2, the
autonomous `/run` and `/go` loops, and any pipeline a project builds with `pipeline-forge`.
It is short on purpose: a contract nobody can afford to repeat is a contract that gets dropped.

```markdown
#### Positive file receipt (required)

Before dispatch, allocate one `RUN_ID` and, for every unit, a unique `WORK_UNIT_ID` plus an
absolute `TRACE_PATH` unique to `(RUN_ID, WORK_UNIT_ID)`; record the launch instant and pass both
fields to the worker. Each worker must write a substantive body ending in `Status: completed` or
`Status: failed` to `TRACE_PATH` before it returns its one-line pointer. Before merge, verify every
path is a regular non-symlink file, non-whitespace, post-launch, and terminal. Narrative output or
silence is never a receipt. Name missing, stale, partial, unreadable, duplicate, failed, dead-PID,
or probe-error units and refuse merge, aggregation, or completion until every required receipt is
valid and completed. See `.claude/rules/swarm-file-evidence.md` for mechanics and the bounded
non-atomic-write exception.
```

## 3. The deterministic half: `check-swarm-receipts.cjs`

Section 2 is layer-2 text — it is read every run and violated in silence. The layer-1 half is a
utility that answers the same question without a model in the loop:

```bash
node .claude/hooks/check-swarm-receipts.cjs .claude/traces/<RUN_ID>/receipts.json
```

Three exit codes, and the third is the point:

| Exit | Meaning | Coordinator's obligation |
|------|---------|--------------------------|
| `0` | every receipt is fresh, substantive and `Status: completed` | may aggregate |
| `1` | at least one unit is undelivered or delivered `Status: failed` | refuse merge; name the units |
| `2` | THE CHECK DID NOT RUN — no manifest, malformed assignment, unreadable trace, or a still-live worker | refuse merge; this is an unknown, never a pass |

The coordinator writes the manifest BEFORE dispatch, which is what makes freshness checkable at all
— `launchMs` cannot be recovered afterwards:

```json
{
  "runId": "feature-auth-2026-09-01T12-00-00Z",
  "launchMs": 1756728000000,
  "units": [
    { "workUnitId": "api",  "tracePath": "/abs/project/.claude/traces/<RUN_ID>/api.md",  "pid": 12345 },
    { "workUnitId": "docs", "tracePath": "/abs/project/.claude/traces/<RUN_ID>/docs.md" }
  ]
}
```

`pid` is optional and can only move an ABSENT trace between "undelivered" and "still waiting". A
live worker may extend waiting; liveness has never been delivery.

## 4. Where the generator must place all of this

| Generated artifact | What must appear |
|---|---|
| `.claude/rules/swarm-file-evidence.md` | Section 1 verbatim, unless the path already exists |
| `.claude/commands/feature.md` — Phase 3 | Section 2 block |
| `.claude/rules/feature-lifecycle.md` — Implementation | Section 2 block |
| `.claude/commands/feature-ent.md` + `feature-lifecycle-ent.md` | Section 2 block |
| `.claude/commands/start.md` — Phase 2 | Section 2 block |
| Autonomous loop commands (`/run`, `/go`) | Section 2 block |
| Any `pipeline-forge` pipeline with a swarm stage | Section 2 block |
| `CLAUDE.md` lifecycle section | one line naming the rule, so the contract is discoverable |

A generated toolkit that dispatches parallel agents anywhere and carries none of this is INCOMPLETE
— `06-package-deliver.md` fails delivery on it.
