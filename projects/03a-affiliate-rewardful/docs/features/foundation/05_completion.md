# Foundation — completion plan

Status: PLAN only. No code, real tests, deployment, fixture account, migration or payment is created by this document. The seven criteria below are **planned test targets**. They must be converted to the exact `## Criterion coverage` table only after regular test files exist and their verbatim titles are verified by the packaged checker.

## Planned criterion tests

| Criterion | Planned test file | Planned test title |
|---|---|---|
| AC-foundation-1 | tests/workspace.test.ts | built workspace serves isolated liveness contract |
| AC-foundation-2 | packages/db/tests/migrate.integration.test.ts | migrations serialize and reject changed or missing applied history |
| AC-foundation-3 | apps/web/tests/password.test.ts | Argon2id salts and input bounds are enforced |
| AC-foundation-4 | apps/web/tests/kdf-admission.test.ts | KDF admission bounds active work and recovers from timeout and failure |
| AC-foundation-5 | apps/web/tests/credentials.integration.test.ts | generic credential denial and post-KDF state recheck prevent session issuance |
| AC-foundation-6 | apps/web/tests/session.test.ts | opaque session lifecycle rejects expired revoked and disabled identities |
| AC-foundation-7 | packages/db/tests/roles.integration.test.ts | runtime configuration cookie and database authority fail closed |

Each umbrella test may call supporting assertions in other named suite files; preserve one concrete executable title per criterion for the machine gate. This table is not coverage evidence and completion gate is intentionally not claimed passed in PLAN.

## Deployment Plan

First deliverable is a locally runnable testable foundation. Production deployment remains a separate gate; no deploy.sh, PagerDuty, Slack or email integration is invented for this slice.

Pre-deployment checklist for the isolated validation environment:
- Independent VALIDATE report tied to exact specification SHA and all7 scenario mappings; no blocker.
- Dependency install from own lock, typecheck, all unit/integration tests and production build pass.
- Actual DB-role and concurrent migration/KDF tests pass; required mutations turn red and restoration green.
- Repository port-conflict check before any container start; effective compose guard and secret-boundary checks pass.
- Runtime tests and benchmark observations tied to source/build snapshot; unresolved limitations disclosed.

Sequence:
1. Integration owner creates workspace and pins lock; database/auth owners implement only the explicit file lists in architecture (sequential implementation is valid if one owner handles all).
2. Create an isolated disposable test namespace with newly supplied secrets; bootstrap roles, apply migrations, run full suites, build/start web and check HTTP liveness. App receives no admin/migration password. No auth routes exist.
3. Independent reviewer receives source, this specification and validation report; reviews AC conformance and actual test/mutation evidence. Coordinator integrates only with terminal receipts and passing packaged gates.

Rollback: stop only the uniquely identified N3a test stack; retain source/lock and failure evidence. Schema changes use forward migrations; never edit applied SQL or infer baseline. Disposable test volume recreation is allowed only for the verified test namespace, never through broad cleanup commands. No rollback touches N1/N2 or monetary history.

## CI/CD gates

Planned project commands: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run verify:infra`, `npm run db:migrate`, `npm start`. Scripts must become real commands during implementation. CI order is test → typecheck → build → isolated smoke; production deploy is not configured.

Packaged pipeline commands run from PROJECT_ROOT, with the shared root toolkit explicitly mapped:

```sh
bash node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

After VALIDATE use the same checker and role-source arguments with `--report-revision --criterion-scenarios`. After real test creation use `--completion`; REVIEW must have exact spec revision, disclosed reviewer family and seven criterion verdicts per feature-report-contracts. Exit0 advances;1 repairs named gaps;2 repairs missing evidence. Do not weaken the gate or create placeholder test files.

## Monitoring and Logging

For local acceptance record process start/failure, migration filename/result, sanitized auth failure code, KDF active/queued/rejected counts and DB error category. Logs contain no raw tokens/passwords/identity hashes/SQL parameters. These measurements are test/runtime evidence, not a deployed observability backend or retention policy. Health means liveness only. Full product alerting/SLO/RPO/RTO remains outside this slice.

## Handoff

Development receives file ownership, exact dependency pins and donor provenance; QA receives seven criterion scenarios and isolated test commands; operations receives the namespace and credential separation procedure. No production access or operational readiness is claimed. Next implementation slice begins trusted enrollment and authorization after foundation acceptance; D7 and own-platform monetary billing remain pending.

## Telemetry and result reporting

RUN_ID `20260909T192932Z-foundation`, profile `compact-quality-first-v2`, XL full lifecycle. PLAN requested `gpt-6-astra` high; actual model/effort, token usage and cost remain null unless execution metadata provides them. Coordinator records stage/attempt boundaries and actual source hashes, elapsed time, checks, mutations, gaps and receipts under `docs/telemetry/p-replicator/20260909T192932Z-foundation/`. No numeric savings claim without a measured comparable baseline.
