# F15 — управление источниками и хранением

Run-ID: 20261003T053651Z-source-management. Baseline c7e5c65fcf7d880c8eae686d4221053085ca692f.
Coordinator plan; separate Sol validates before implementing; fresh Astra reviews independently.

## Основания и ROUTE

Specification FR-n6b-17, SC-US-017-1..3, NFR-n6b-4; Pseudocode Source management and retention;
Architecture tenant/service separation; ADR-005 jobs; Refinement deletion conflict. Read own documents only.
Mechanical route before PLAN: S/exit0 for DB/handler/retention paths (recorded evidence).
Substantive route **M**: existing tenant lifecycle, but destructive row removal, job races, time cutoffs require
full unit/real PG/type/build, fixed-oracle mutation and actual Docker browser. Repeat route before implementation.
No schema, role/grant, dependency, manifest, toolkit or donor edits; no public deployment/provider calls.
Existing owner authorization continues MVP through stages; no intermediate permission stop.

## Acceptance criteria

- SRC-01: authenticated same-origin DELETE /api/sources/{id} gives204; missing/foreign/revoked404,
  unauth401, cross-origin403 before effects. Source file/document/chunks/jobs removed atomically; other source/bot
  rows unchanged and deleted chunks absent from real retrieval. Any queued/running job ->409 exact
  «дождитесь окончания индексации», no partial deletes. Rollback and concurrent retry/recrawl are covered.
- SRC-02: POST /api/sources/{id}/recrawl gives202 with new job for terminal source, both site/PDF keep source ID,
  file and documents. Existing live job should return same job (idempotent accepted202); no second live job.
  Preserve existing worker hash reuse: unchanged chunks cause zero new embedding calls in real worker/PG case.
  Ownership and initial202 before long work retained. Fresh queued job resets per-run attempt/progress defaults.
- SRC-03: cabinet lists each source and latest task deterministically (created_at DESC,id DESC ties), source
  actions show safe error/busy/progress states, confirmed deletion updates view, recrawl starts visible job.
  Existing add-site/add-PDF controls remain accessible. No duplicate mandatory UX analytics dashboard.
- SRC-04: GET /api/bots/{id}/stats under session/RLS returns only questions_7d,dont_know_7d;
  all widget/demo rows created_at > now-7days counted, unknown only below_threshold/model_unknown/invalid_citation;
  sandbox and older rows excluded. Published bot displays exact two-number meaning and “Добавить источник” action.
  No question text or visitor identifier returned, no service bypass for cabinet statistics.
- SRC-05: worker startup and daily scheduling actually invoke retention, deleting question_log strictly older
  than30days and quota_counter day strictly before Moscow today-2. Preserve exact boundary/recent/auth-hour
  counters; no quota reset. Bounded non-overlapping cleanup, clean stop awaits in-flight cleanup before pool.end.
  Existing sweeper/index loop remains functional; errors log class/count only, no content or secrets.
- SRC-06: real PG barriers exercise delete vs new recrawl and old failed-job retry, worker state transitions,
  cascades, other tenant, accessible/revoked studio after handover, stats cutoffs and retention boundaries.
  Meaningful critical guard mutation with fixed assertion RED then byte-exact restore GREEN.
- SRC-07: full regression plus production build and real Docker UI1440/390/source hash binding and cleanup;
  fresh independent review accepted. No false browser paid/indexing claim; any fixture completion explicit.

## Lock and transaction obligations

Delete must serialize both creation of a new live job (including existing enqueueSiteSource) and transition of
an old failed job via existing SECURITY DEFINER n6b_retry_job. Merely SELECT live then DELETE is unsafe.
Current tenant has source DELETE/UPDATE but **no index_job UPDATE grant**, so SELECT FOR UPDATE on jobs may fail.
Use existing privileges and an atomic strategy with explicit real PG races, or report concrete need before
changing grants/schema. Source lock blocks FK inserts but by itself does not block failed→queued retry.
Preserve all data on409 even if terminal rows tentatively deleted in transaction. Handle wait snapshots freshly.
Do not change F14 account ownership or loosen RLS. Existing worker persists only under job state/fence guards.
No re-embedding unchanged bytes; don't delete chunks as a recrawl shortcut.

## Boundaries

Allow relevant files only:
- packages/db/src/source-management.ts (new), jobs.ts, index.ts; optional cabinet.ts only if useful.
- apps/web/src/server/source-management-handler.ts (new), runtime.ts;
  app/api/sources/[id]/route.ts, app/api/sources/[id]/recrawl/route.ts, app/api/bots/[id]/stats/route.ts (new).
- apps/web/src/app/cabinet/source-actions.tsx, bot-stats.tsx (new), page.tsx; minimal add-source.tsx/globals.css
  if needed for accessible Add source action or mobile layout.
- services/worker/src/retention.ts (new), loop.ts/main.ts only necessary lifecycle wiring.
- relevant new tests under packages/db/tests/integration/source-management*.test.ts,
  services/worker/tests/{unit,integration}/retention*.test.ts and source-management*.test.ts,
  apps/web/tests/unit/source-management*.test.ts; existing affected test seam if needed.
- docs/features/source-management/{02_validation,05_completion}.md;
  tests/artifacts/source-management/{implementation-source-hashes.json,focused-tests.txt,typecheck.txt};
  scripts/mutate-source-management-guard.mjs if authored reproducible real PG guard mutation needed.
Any extension requires concrete AC reason recorded; no broad refactor or optional polish. Files under500lines.

## Execution and stop condition

Separate Sol6.1 high author: ≤1500seconds including reading, independent validation, implementation and checks.
No child agents/Docker/network/ports/paid requests/commit/push. Existing Node22/deps available. Author writes realPG
regressions and mutation runner, coordinator executes Docker CPU2/internalDB under mutex after frozen snapshot.
On deadline deliver exact completed/remaining/failed checks and immutable hashes, never silently extend samepass.
Final CLI answer must itself be full sourcebound receipt with final line Status: completed or Status: failed.
Fresh Astra medium≤480seconds independent obligations first, then source/report; no forced findings.
Coordinator owns telemetry, integration, full runtime, actualUI, acceptance and next F16 gate.
