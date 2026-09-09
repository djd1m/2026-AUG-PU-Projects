---
name: feature-navigator
description: >
  Read and update the N3a feature roadmap. Use for "what's next", roadmap, backlog,
  feature status, dependency planning, or marking a verified feature complete.
---

# N3a feature navigator

`.claude/feature-roadmap.json` follows the canonical schema in the inherited root
`.claude/commands/next.md`. Work from the roadmap plus `docs/implementation-plan.md` and
`docs/validation-report.md`.

## Selection

1. Continue `in_progress` work only when a current receipt or user instruction identifies it.
2. Among `next` items, sort by priority `mvp > high > medium > low`, then dependency order.
3. A `planned` item becomes `next` only after every `depends_on` entry is `done` and no blocker
   remains. Never infer completion from a plan or expected path.
4. Show blocked items with their explicit blocker. D7 remains blocked by the owner decision,
   even if its dependencies are done.
5. Present at most three bounded actions and name the binding docs/FRs.

## Status changes

- `planned → next`: dependencies and external prerequisites are evidenced.
- `next → in_progress`: implementation actually starts and the run/owner is known.
- `in_progress → done`: required focused tests and review passed at an exact revision.
- any → `blocked`: record the blocking decision/dependency without fabricating a feature ID.

When marking done, update dependent features only if all their dependencies are done. Keep
external/owner blockers intact. Record evidence in the feature's `evidence` array or description
only when a real path/revision exists.

The current roadmap is an N1 MVP implementation plan. The project-specific toolkit itself is
bootstrap metadata and does not mark any application feature done. Future `/next`, `/go`, `/run`,
and `/feature` behavior comes from the inherited root toolkit; this skill does not install hooks
or commands.
