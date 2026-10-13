---
name: feature-navigator
description: >
  Navigate project features and suggest next steps. Use when the user
  asks "what's next", "what should I work on", "show roadmap", starts a new task,
  or when a feature is completed. Also trigger on "roadmap", "backlog",
  "sprint", "feature status", or "что делать дальше".
---

# Feature Navigator

Read `.claude/feature-roadmap.json` for current feature status, then present:

## Step 1: Gather Context

1. Read `.claude/feature-roadmap.json`
2. Run `git log --oneline -10` for recent progress
3. Scan for TODO/FIXME: `grep -rn "TODO\|FIXME" src/ --include="*.ts" --include="*.py" -l | head -5`

## Step 2: Present Current State

```
═══════════════════════════════════════════════════════════
📋 Feature Roadmap: [Project Name]
   Sprint: [Sprint Name] — [N/M] complete ([X]%)
═══════════════════════════════════════════════════════════

🔨 In Progress:
   • [Feature Name] — [description]
     Files: [file paths]

⏭️ Next Up:
   • [Feature Name] — [description]
     Depends on: [none | feature-id]

🚫 Blocked:
   • [Feature Name] — waiting on: [dependency]

📝 TODOs Found:
   • [file:line] — [TODO text]

🕐 Recent Work:
   [git log last 5 commits]
═══════════════════════════════════════════════════════════
```

## Step 3: Suggest Top 3 Actions

Format as numbered list, each 3-8 words:
1. **[Feature/Task Name]** — Brief actionable description. Files: `path/to/files`
2. **[Bug/TODO]** — From code scan. Location: `file:line`
3. **[Follow-up]** — Based on recent progress

## Step 4: Ask

```
Owner autonomy is active: select the highest-priority eligible feature and state it; ask only for a genuinely missing requirement outside the approved scope.
```

## Updating Roadmap

When a feature is completed during the session:
1. Update its status to `"done"` in `.claude/feature-roadmap.json`
2. If there are features with `"depends_on"` pointing to the completed feature,
   check if all their dependencies are now done → update to `"next"`
3. Inform the user: `✅ [Feature] marked as done. [Next Feature] is now unblocked.`

## Priority Rules

- `blocked` items → show but don't suggest (explain what's blocking)
- `in_progress` → suggest continuing (highest priority)
- `next` → suggest starting (second priority)
- `planned` → only suggest if no `next` items remain
- Respect `depends_on` — never suggest a feature whose dependencies aren't `done`

## Important

- Keep suggestions actionable and specific (3-8 words each)
- Under docs/decisions-owner.md autonomy, continue the eligible approved task without another permission question
- If all features are `done`, deliver evidence and pending limits; do not add optional polish
