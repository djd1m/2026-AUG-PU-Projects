# RoomKind development guide

## Setup and bootstrap
Read project CLAUDE plus root instructions; confirm current branch/worktree and41AC. Use root /start instruction with N8 paths, no shared overwrite. Implementation supplies Node22 package scripts (test/lint/build/migrate), SQL migrations and .env.example containing names/placeholders only. Provision ignored local environment without printing values. Validate config and free loopback port before Compose. PostgreSQL stays internal; migration runs once against isolated test DB, seed only explicitly labelled test accounts/images and never a privileged public signup. No automatic seed in production. Pin lockfiles; do not download GPU weights during ordinary npm install/build.

## Development workflow
1. /next reads local roadmap and chooses eligible MVP feature.
2. /go explicit feature uses existing accepted SPARC, repeats substantive complexity ROUTE with file list, then PLAN→VALIDATE→IMPLEMENT→REVIEW. Monetary/privacy invariants retain XL checks, scope approval already in decisions-owner.
3. Coordinator delegates Sol6.1high a25min bounded attempt in isolated worktree with unique absolute TRACE_PATH and WORK_UNIT_ID. Code owner alone writes N8 manifests. No other project writes.
4. Source-bound unit and real Postgres integration checks precede fresh Astra review. Review must reference exact revision, actual commands and concrete findings. Correct only findings, rerun affected tests.
5. Update feature status only after required evidence; commit Russian/push branch. Keep GPU acceptance pending until real measurements exist.

## Feature workflow
Feature plans in docs/features/<id>/ and docs/plans/. /feature shares root lifecycle skills, local project-context/coding-standards/testing-patterns provide product facts. Do not copy root vendor toolkit. Source/donor security deltas in reuse-inventory. /next update scans evidence; owner's autonomy permits factual status transitions without a new preference question. Missing dependencies remain blocked.

## Autonomous development
/run loops /next→/go with one bounded coding work unit then independent review. Budgets control attempts, not permission to abandon scope. At expiry inspect artifacts/reason and name concrete next action. Shared4 active executors include CLI; coordinator waits when its worker occupies reserved lane. Common Docker browser is reused by lease; one heavy build at a time,CPU2. No project edits global model/hooks/settings.

## Validation and testing
Use41AC maps in docs/test-scenarios.md. Runtime commands must be implemented before claiming pass; planning snippets are not test results. Required layers: validator/lint/build; unit security/provider/validation; real Postgres concurrency and rollback; actual app Docker-browser E2E1440/390; negative guard mutations; real GPU corpus12×3 and warm≥30p95≤25s separately. Read-only companion preflight immediately before E2E binds source/build/env/input/effects; browser health alone is not application E2E. Test and provider fixtures are visibly labelled and forbidden in production. No live checkout/API spend.

## Command reference
| Root instruction | Purpose |
|---|---|
| /start | Bootstrap web/db/worker, migration and explicit local seed |
| /myinsights | Query/append reproducible lessons |
| /feature | Four-stage validated feature lifecycle |
| /plan | Persist bounded implementation plan |
| /next | Read evidence-based roadmap |
| /go /run | Execute selected feature / authorized loop |
| /docs | RU/EN product docs under docs/README |
| /deploy | Separate release process, not currently authorized |
No /test command; actual npm/python scripts are the execution interface once implemented.

## Agent and skill reference
Planner/architect/reviewer request Astrahigh; coder requests Sol6.1high. Fresh reviewer differs from coder. Local skills: project-context, coding-standards, testing-patterns, security-patterns, feature-navigator. Root lifecycle skills and companion remain shared. Host metadata, not template frontmatter, establishes actual model.

## Troubleshooting
Read docs/myinsights/1nsights.md, then matched detail. No CUDA/model means explicit unavailable; no CPU/fixture fallback. Return URL never credits. If provider GET times out, do not consume dedupe; retry safely. A stale worker fence cannot attach output. Wrong-owner404 is deliberate. CLI stdin must be closed; long briefs/raw logs outside git. Missing terminal receipt is failed delivery, even if process exits0.

## Deployment and rollback
No deployment/livecharge/rental authorization in this local scope. Completion.md lists future release gates; preserve DB/ledger/media during rollback, test restore only isolated copy. Do not call shared proxy or production mail. Required actual GPU quality remains a blocker for full MVP readiness, not an excuse to skip independent software work.
