# Foundation — completion evidence

Status: accepted for the seven foundation criteria. This evidence covers only the seven foundation criteria, not full product acceptance or production readiness.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-foundation-1 | tests/workspace.test.ts | built workspace serves isolated liveness contract |
| AC-foundation-2 | packages/db/tests/migrate.integration.test.ts | migrations serialize and reject changed or missing applied history |
| AC-foundation-3 | apps/web/tests/password.test.ts | Argon2id salts and input bounds are enforced |
| AC-foundation-4 | apps/web/tests/kdf-admission.test.ts | KDF admission bounds active work and recovers from timeout and failure |
| AC-foundation-5 | apps/web/tests/credentials.integration.test.ts | generic credential denial and post-KDF state recheck prevent session issuance |
| AC-foundation-6 | packages/db/tests/auth-repository.integration.test.ts | actual opaque sessions persist only HMAC and reject expiry revocation disabled and unknown users |
| AC-foundation-7 | packages/db/tests/roles.integration.test.ts | runtime configuration cookie and database authority fail closed |

## Executed validation

`node scripts/run-foundation-integration.mjs --mutations` exited0 on 2026-09-09: strict typecheck, Next15.5.24 production build, effective infrastructure and port checks, two migrations, 10 unit tests and 13 PostgreSQL/integration/HTTP smoke tests passed. Namespace `n3a-foundation-8d9f0eececa5` was stopped after validation; its private volume is retained. No donor resource was used.

Supporting tests reject missing/malformed configuration through all four declared serve commands and establish KDF saturation without held DB clients, sanitized native/database error logging, idle PostgreSQL disconnect survival, hostile function search paths, migration rollback/lock timeout, and rejection of auth HTTP routes not implemented in this slice.

Eight deliberate mutations were detected by failed assertions; original source hashes were preserved and schema restored. See `docs/telemetry/p-replicator/20260909T192932Z-foundation/mutation-results.json`. The serial green run above independently verifies the restored original source. Source hashes: `acceptance-source-snapshot.json` in that directory.

`npm audit --json` exited0 with zero reported vulnerabilities. This is dependency advisory evidence, not a guarantee of application security. Native Argon2 smoke on Node22.22.0 measured757ms and max RSS191676KiB; these are one observed test process, not latency/memory SLOs or a load test.

A prior concurrent build/smoke invocation failed because BUILD_ID disappeared during rebuild. The harness now awaits typecheck and build before starting tests. Earlier mutation-run terminal output was unavailable after context transition; its persisted mutation result was inspected and a separate serial full verification was performed rather than inferring success.

Browser layout checks for the real application, production deployment, N1/ЮKassa E2E and full-product financial flows are not established by these checks. Existing CJM browser results apply only to prototypes.

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

Implemented project commands: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run verify:infra`, `npm run db:migrate`, `npm start`. The isolated harness enforces typecheck → build → infrastructure → migration → unit → optional mutations → integration/smoke; production deploy is not configured.

Packaged pipeline commands run from PROJECT_ROOT, with the shared root toolkit explicitly mapped:

```sh
bash node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

After VALIDATE use the same checker and role-source arguments with `--report-revision --criterion-scenarios`. After real test creation use `npm run check:completion` through the pinned adapter documented below; REVIEW must have exact spec revision, disclosed reviewer family and seven criterion verdicts per feature-report-contracts. Exit0 advances;1 repairs named gaps;2 repairs missing evidence. Do not weaken the gate or create placeholder test files.

## Monitoring and Logging

For local acceptance record process start/failure, migration filename/result, sanitized auth failure code, KDF active/queued/rejected counts and DB error category. Logs contain no raw tokens/passwords/identity hashes/SQL parameters. These measurements are test/runtime evidence, not a deployed observability backend or retention policy. Health means liveness only. Full product alerting/SLO/RPO/RTO remains outside this slice.

## Handoff

Development receives file ownership, exact dependency pins and donor provenance; QA receives seven criterion scenarios and isolated test commands; operations receives the namespace and credential separation procedure. No production access or operational readiness is claimed. Next implementation slice begins trusted enrollment and authorization after foundation acceptance; D7 and own-platform monetary billing remain pending.

## Telemetry and result reporting

RUN_ID `20260909T192932Z-foundation`, profile `compact-quality-first-v2`, XL full lifecycle. PLAN requested `gpt-6-astra` high; actual model/effort, token usage and cost remain null unless execution metadata provides them. Coordinator records stage/attempt boundaries and actual source hashes, elapsed time, checks, mutations, gaps and receipts under `docs/telemetry/p-replicator/20260909T192932Z-foundation/`. No numeric savings claim without a measured comparable baseline.

## Pinned upstream checker defect

Unmodified p-replicator1.13.2 `--completion` returns2 because its global role target is prefixed with docs twice. `scripts/check-pipeline-completion.mjs` verifies the exact upstream version and SHA, changes only the temporary checker variable for the already-prefixed path, and executes all original checks. Vendor bytes remain unchanged. Unknown upstream versions fail closed.

`node --test tests/pipeline-completion.test.mjs` passed2/2: reproduces the original failure, verifies all four corrected modes on actual documents, rejects missing criterion mapping with1 and malformed table with2, restores the fixture to0. `npm run check:completion` invokes the adapter; direct upstream completion is still affected and is not reported passing.

## Actual image startup

The Docker image built successfully. First startup failed because the host disk filled (ENOSPC); after scoped removal of our obsolete dependency backup, the same immutable image passed liveness, Russian home and non-root checks. App/test profiles were stopped explicitly; no production deployment. See runtime-checks.md for image SHA, command, failure and successful retry.

## Coordinator acceptance

Independent review accepted all7 criteria; `node .claude/hooks/check-review-contract.cjs projects/03a-affiliate-rewardful foundation` exited0 with7IDs/7rows. Completion status and this paragraph were updated after the review; the reviewed document version is preserved at code checkpoint8b60a59. No requirement, coverage mapping or runtime source changed. Foundation is done; next is trusted enrollment/program/partner authorization.
