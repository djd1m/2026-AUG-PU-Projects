# F08 — planned completion, not runtime acceptance

PLAN only at baseline e61006749f69bd352759c7520f2a7e99aef24bd2. No code, dependencies, protocol sockets, PG tests, browser, external provider, paid API or deployment executed by planner. Source-bound independent VALIDATE is next; all runtime criteria below remain pending. Companion E2E preflight: not_applicable for docs-only PLAN.

## Planned criterion coverage

These are assignments, not an executed `Criterion coverage` table. Implementation must replace with actual existing test file/title bindings and source-bound receipts.

| Criterion | Planned test file | Planned test title |
|---|---|---|
| AC-f08-live-diagnostics-001 | tests/diagnostics-integration.test.ts | diagnostic authority and tenant checks open no unauthorized sockets |
| AC-f08-live-diagnostics-002 | tests/diagnostics-integration.test.ts | production TLS adapter pins peer and rejects certificate downgrade rebinding |
| AC-f08-live-diagnostics-003 | tests/diagnostics-integration.test.ts | SMTP and IMAP authenticate independently without message commands |
| AC-f08-live-diagnostics-004 | tests/diagnostics-unit.test.ts | diagnostic byte deadlines cancellation and admission are bounded |
| AC-f08-live-diagnostics-005 | tests/diagnostics-integration.test.ts | diagnostic revision fences replacement stop quarantine and newer attempt |
| AC-f08-live-diagnostics-006 | tests/diagnostics-integration.test.ts | AEAD and protocol error canaries never escape diagnostic sinks |
| AC-f08-live-diagnostics-007 | scripts/ui/f08-diagnostics.mjs | separate diagnostic status persists and respects keyboard capacity consent |
| AC-f08-live-diagnostics-008 | tests/expanded-mvp-02.test.ts | live diagnostics enforce pinned TLS without DATA |

## Gates and handoff

PLAN: installed check-pipeline-gaps.sh actual project --traceability with explicit root feature and SPARC role-map sources, exit0 required. Raw result /tmp/n7-f08-plan-a1-phase1.txt; terminal receipt /tmp/n7-f08-plan-a1-receipt.md. This mechanical check is not independent requirements validation. Fresh validator owns validation-report with exact spec SHA/scenarios then revision/scenario gate. Parent coordinator updates telemetry and roadmap, not planner.

IMPLEMENT after fresh validation and substantive route: Node22 existing environment, npm run typecheck, npm run lint, npm run build, npm test, npm run test:integration with real PostgreSQL16, explicit tests/expanded-mvp-02.test.ts runner, focused realTLS fixtures and mutations, secret/dependency scans, relevant Docker browser after read-only preflight. Coordinate heavy/UI locks, check ports before container start, use only existing codex-ui-playwright1.63.0; no public DB host port or foreign cleanup. Future writer20min/reviewer8min bounded attempts; unfinished work returns exact remaining findings and next responsible owner, never silent timeout completion.

After real tests exist: actual Criterion coverage table, source/canon/ownership/receipt gates, installed completion gate and fresh AC-by-AC review contract. Full project completion currently has10 inherited gaps (expanded8 + F06B5/B6); F08 PLAN neither fixes nor hides them. F08 parent binding may remove only its own implemented gap after runtime acceptance; full acceptance cannot be claimed from selected feature snapshots.

## Deployment Plan

Pre-deployment requires approved scope, all tests/security/docs/review and tested rollback. Sequence:1 coordinator integrates accepted commit;2 operator separately authorizes scoped external diagnostic accounts/endpoints/grant expiry;3 run and observe only authorized diagnostics. No current publication/live permission follows from this plan. Pipeline uses test → build → separately authorized deployment, existing scripts only; no invented deploy.sh.

Rollback: disable/revoke diagnostic grant, abort in-flight diagnostics, invalidate current evidence under global lock; restore prior app while keeping additive columns and encrypted data. Never discard unknown send attempts or fabricate verified state. Test schema12→13 and old-app compatibility; do not drop mailbox data.

## Monitoring and operations

Track scrubbed counts by protocol/phase/code, diagnostic total duration, admission429, stale-result409, timeout and byte-limit rejections from application metadata; no mailbox-body/raw transcript aggregation. Operator-visible typed status is the initial alert channel; no fictitious PagerDuty/Slack integration. Existing project log retention applies; current diagnostic row holds only latest metadata, replaces old result on attempt and contains no secret.

Development handoff: six doc hashes, exact result commit, profile compact-quality-first-v2, requested Astra high vs actual host evidence/null, elapsed and unavailable usage. QA: frozen spec, validated scenarios, local TLS fixture CA/hosts and exact test commands. Operations: external grant authorization, kill switch/expiry and rollback. Future F09–F15, F06 residual gaps and external live pilot remain coordinator-owned and pending; no whole-MVP done claim.
