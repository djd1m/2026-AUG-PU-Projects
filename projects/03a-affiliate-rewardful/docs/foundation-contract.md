# Foundation implementation contract

Source: docs/features/foundation/{01_specification,02_pseudocode,03_architecture,04_refinement}.md. Seven ACs remain authoritative. This file fixes implementation names before two writers start; no additional product scope.

## Runtime interface

Authentication owner exports `readRuntimeConfig(env: NodeJS.ProcessEnv): { databaseUrl: string; sessionSecret: Buffer }` from `apps/web/src/lib/auth/config.ts`. It validates `DATABASE_URL` and canonical base64url `SESSION_SECRET` with at least32 decoded bytes. No defaults or migration credential is required/passed to web. Integration owner calls it before starting Next through `scripts/start-web.ts`; offline `next build` does not call it.

Auth/database owner owns all other internal interfaces and their corresponding tests; no external writer derives them independently. SQL schema is `n3a`, roles `n3a_app` and `n3a_migrator`, bootstrap administrator `n3a_admin`, database `n3a`. Application role cannot write users; narrow hardened SECURITY DEFINER issuance as required by the feature plan. Runtime pool max10, acquire1s, lock1s, statement5s.

## Package and command boundary

Root workspace name `n3a-affiliate-rewardful`; app `@n3a/web`, database package `@n3a/db`. Integration owner alone writes all package.json/lockfiles and tsconfigs. DB package exports TypeScript `src/index.ts`, executed via tsx in migration/test tools and transpiled by Next when required. `packages/db/src/migrate.ts` is the CLI entry for `npm run db:migrate`; uses DATABASE_URL_MIGRATE and never defaults to application URL.

Vitest runs from project root. Unit command excludes `**/*.integration.test.ts` and `tests/workspace.test.ts`; integration command runs those DB/auth integration suites with a single worker (individual concurrency scenarios still create parallel DB clients). Built-workspace smoke is a separate explicit command. Integration tests FAIL rather than skip when env is missing.

## Disposable test environment

Integration suites receive TEST_DATABASE_URL (app), TEST_DATABASE_URL_MIGRATE (migrator) and SESSION_SECRET only. Fixture user creation uses migrator in the isolated test database. Tests must not mutate donor data or require a production credential. Test tables/schemas for migration experiments are temporary or uniquely named; the installed production migration bytes are immutable.

Bootstrap script `scripts/init-foundation-db.sh` is auth/database owner-owned and runs inside Postgres init with POSTGRES_USER=n3a_admin, POSTGRES_DB=n3a, N3A_DB_APP_PASSWORD and N3A_DB_MIGRATE_PASSWORD explicitly supplied. It creates both roles with quoted psql variables (no shell interpolation into SQL), transfers schema authority to migrator, revokes broad privileges, and emits no password. Root compose provides fresh test secrets and mounts only this N3a script.

Integration owner owns compose.yaml, Dockerfile, private network/volume, test orchestration and image pins. No DB host ports, host network, donor mounts or donor networks. Web local binding if used is loopback/environment-selected only. Check ports before starting any stack. No production ingress is configured.

## Evidence and authority

No auth HTTP routes or user provisioning command. No real user fixtures outside disposable tests. No monetary modules or N1 modification. Each owner records provenance for adapted files and tests; the integration owner assembles it into docs/discovery/foundation-reuse-provenance.md. Every terminal receipt records input source hash; changes to this contract require redispatch agreement before code changes.
