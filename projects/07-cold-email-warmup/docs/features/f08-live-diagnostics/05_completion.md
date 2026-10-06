# F08 — implementation witnesses; acceptance verification remains

Historical PLAN baseline e61006749f69bd352759c7520f2a7e99aef24bd2. No code, dependencies, protocol sockets, PG tests, browser, external provider, paid API or deployment executed by planner. Initial independent VALIDATE at b3aa56cd reported NEEDS WORK / F08-V1. This targeted correction defines durable serialized authority without changing the specification; the original report/scenarios remain preserved and narrow independent revalidation is next; all runtime criteria below remain pending. Companion E2E preflight: not_applicable for docs-only PLAN.

## Criterion coverage

Actual authored bindings, bounded implementation attempt f08-implement-a1. These bind executable witnesses, not blanket acceptance of all derived scenario variants. Exact executed counts, immutable source/build/image and remaining obligations are in /tmp/n7-f08-implement-a1-receipt.md; coordinator integrates the receipt into the project run. No external provider is contacted.

| Criterion | Test file | Test title |
|---|---|---|
| AC-f08-live-diagnostics-001 | tests/diagnostics-integration.test.ts | diagnostic authority and tenant checks open no unauthorized sockets |
| AC-f08-live-diagnostics-002 | tests/diagnostics-unit.test.ts | production TLS adapter pins peer and rejects certificate downgrade rebinding |
| AC-f08-live-diagnostics-003 | tests/diagnostics-unit.test.ts | SMTP and IMAP authenticate independently without message commands |
| AC-f08-live-diagnostics-004 | tests/diagnostics-unit.test.ts | diagnostic byte deadlines cancellation and admission are bounded |
| AC-f08-live-diagnostics-005 | tests/diagnostics-integration.test.ts | diagnostic revision fences replacement stop quarantine and newer attempt |
| AC-f08-live-diagnostics-006 | tests/diagnostics-integration.test.ts | AEAD and protocol error canaries never escape diagnostic sinks |
| AC-f08-live-diagnostics-007 | scripts/ui/f08-diagnostics.mjs | separate diagnostic status persists and respects keyboard capacity consent |
| AC-f08-live-diagnostics-008 | tests/expanded-mvp-02.test.ts | live diagnostics enforce pinned TLS without DATA |

The separate parent witness is explicitly run using `node node_modules/tsx/dist/cli.mjs --test tests/expanded-mvp-02.test.ts`; the default integration glob does not discover it. No dependency, package script or lock changes were required.

Runtime observed: real TLS465/587/993, independent rejection, wrong-host/untrusted/downgrade, unsafe/mixed/count/family DNS, one lookup per protocol, late DNS cancellation, caps, actual socket cancellation, real-PG settings/stop/quarantine/child-process overlap, revision-only guard, authority revoke before/after publication, identical grant ABA, authority/final rollback, isolated real-PG schema12→13 without backfill, and three discriminating mutations. Docker browser observes real production-adapter fixture results only after a committed revoke, preserving the production network gate.

Continuation f08-verify-a2 adds actual10s DNS/TLS/greeting/auth/trickle deadlines, bounded native Socket connect-event fault injection, exact owned socket/listener/timer counters, abort/completion ordering and actual HTTP disconnect at each phase with immediate admission reuse. Raw-connect stalling is an explicitly withheld connect event on an owned native Socket; positive TLS/pinning still uses real local TCP/TLS peers. No external TCP blackhole is implied.

Real PG additional witnesses execute expiry while awaiting FIRST lock, revoke queued behind finalization after its authority read, complaint/shared cancel before/after publication preserving submitting, and actual privileged CLI missing/invalid/expired/stale importer/rollback. Expired parsed CLI input previously failed before revoke; confirmed regression now discards grant and commits revoke. A canceled or failed matching attempt now clears its UUID under FIRST lock and projects unusable stale instead of permanently pending.

Diagnostic-specific session epoch unit guards cover late success/error. Browser pending/stale variants use snapshots captured from an actual held TLS diagnostic and durable identical-grant republish; fixture response injection tests rendering only, while the earlier independent status/reload/keyboard/busy/capacity/consent checks use the actual owner API. Production authority is revoked before browser access. Exact final E2E status is in /tmp/n7-f08-verify-a2-receipt.md; no result is inferred from readiness.

Coordinator owns secret/dependency scans, source/canon/completion gates and fresh independent review. Original full PG132/132 and full unit passes remain evidence for their exact earlier snapshots; a2 records affected final checks separately and never treats old passes as final-source execution. Package-only dependency commit6adcd529554a5c861fdf61d913e4bf3b18758443 was separately authored/reviewed, explicitly transferred and cherry-picked before the combined image build; no shared node_modules modification.


## Confirmed independent review corrections

Fresh review on00f6888f found only F08-R1/R2. R1 now carries the request signal into finalization, checks after FIRST-lock acquisition and after awaited persistence, and uses an optional synchronous before-COMMIT guard in the existing transaction helper. FIRST remains the first transactional operation for all callers; existing callers retain the default behavior. Cancellation observed before COMMIT submission rolls back and clears only the matching revision/attempt. COMMIT submission after the last synchronous guard is the defined irreversible boundary: an abort ordered after submission cannot retroactively revoke a committed observation.

Actual PG tests in tests/diagnostics-final-cancel-integration.test.ts named `final cancellation after FIRST wait and persisted SQL rolls back and releases admission` discriminate both waits, admission reuse, HTTP server-observed disconnect and post-commit ordering. Actual pre-fix source failed both cancellation tests. R2 requires loadConfig's validated configured operatorTokenDigest before readiness, file parsing or authority action; no new token argument or auth engine. `actual CLI without configured operator capability cannot publish or revoke` fails on pre-fix source and checks unchanged authority for both actions with OPERATOR_TOKEN_FILE unset. Existing authorized invalid/missing/expired committed-revoke and conflict/rollback tests remain mandatory. Exact corrected source/check receipts are /tmp/n7-f08-review-fix-a3-receipt.md; focused independent review remains coordinator-owned. Unchanged UI browser20 assertions remain bound to00f6888f, not relabelled as a new browser run.

## Gates and handoff

PLAN: installed check-pipeline-gaps.sh actual project --traceability with explicit root feature and SPARC role-map sources, exit0 required. Raw result /tmp/n7-f08-plan-a1-phase1.txt; terminal receipt /tmp/n7-f08-plan-a1-receipt.md. This mechanical check is not independent requirements validation. Fresh validator owns validation-report with exact spec SHA/scenarios then revision/scenario gate. Parent coordinator updates telemetry and roadmap, not planner.

IMPLEMENT after fresh validation and substantive route: Node22 existing environment, npm run typecheck, npm run lint, npm run build, npm test, npm run test:integration with real PostgreSQL16, explicit tests/expanded-mvp-02.test.ts runner, focused realTLS fixtures and mutations, secret/dependency scans, relevant Docker browser after read-only preflight. Coordinate heavy/UI locks, check ports before container start, use only existing codex-ui-playwright1.63.0; no public DB host port or foreign cleanup. Future writer20min/reviewer8min bounded attempts; unfinished work returns exact remaining findings and next responsible owner, never silent timeout completion.

After real tests exist: actual Criterion coverage table, source/canon/ownership/receipt gates, installed completion gate and fresh AC-by-AC review contract. Full project completion currently has10 inherited gaps (expanded8 + F06B5/B6); F08 PLAN neither fixes nor hides them. F08 parent binding may remove only its own implemented gap after runtime acceptance; full acceptance cannot be claimed from selected feature snapshots.

## Deployment Plan

Pre-deployment requires approved scope, all tests/security/docs/review and tested rollback. Sequence:1 coordinator integrates accepted commit;2 operator separately authorizes scoped external diagnostic accounts/endpoints/grant expiry;3 run and observe only authorized diagnostics. No current publication/live permission follows from this plan. Pipeline uses test → build → separately authorized deployment, existing scripts only; no invented deploy.sh.

Rollback: run privileged diagnostic-authority revoke with expected current revision and verify its committed new revision (file deletion alone is not revocation), abort in-flight diagnostics, invalidate current evidence under global lock; restore prior app while keeping additive columns and encrypted data. Never discard unknown send attempts or fabricate verified state. Test schema12→13 and old-app compatibility; do not drop mailbox data.

## Monitoring and operations

Track scrubbed counts by protocol/phase/code, diagnostic total duration, admission429, stale-result409, timeout and byte-limit rejections from application metadata; no mailbox-body/raw transcript aggregation. Operator-visible typed status is the initial alert channel; no fictitious PagerDuty/Slack integration. Existing project log retention applies; current diagnostic row holds only latest metadata, replaces old result on attempt and contains no secret.

Development handoff: six doc hashes, exact result commit, profile compact-quality-first-v2, requested Astra high vs actual host evidence/null, elapsed and unavailable usage. QA: frozen spec, validated scenarios, local TLS fixture CA/hosts and exact test commands. Operations: external grant authorization, privileged publication/revocation with committed revision receipts, expiry and rollback; failed/rolled-back revoke is not reported complete. Additional F08-V1 real-PG witnesses in refinement cover both commit orderings, stale importer, missing input and authority rollback. Future F09–F15, F06 residual gaps and external live pilot remain coordinator-owned and pending; no whole-MVP done claim.
