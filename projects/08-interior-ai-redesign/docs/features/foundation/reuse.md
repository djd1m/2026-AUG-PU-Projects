# Foundation reuse before coding

2026-10-13, baseline3b84e9ef. Local sweep FIRST:01 testimonial auth/rate;02 reputation auth;03 JS payments/auth;03a scoped membership/session;04 device-session/lease;05 auth/storage;05a discovery copy;06 most compatible Next/pg/AuthStore/cabinet;07 README-only. Actual rg --files paths inspected, selected donors reopened with their tests. Donor run/reports not N8 evidence. Root LICENSE absent; internal adaptation explicitly authorized, external relicensing not inferred.

| Source | SHA256 | Decision |
|---|---|---|
| projects/06-rag-sales-chatbase/apps/web/src/server/auth.ts | 999f6c8969e418c95310f7325a4b87f1730a599415b2d9e8d49622385229ab3e | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/apps/web/src/server/auth-store.ts | 92bde38cef54de68b9b3e6be6c801738caf4c3cb3bda9068d49a049a7a096ecf | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/packages/db/src/pool.ts | 4bd231db11d91b97c954ba5606ad11f20b394c9bc8695f774968aa5a837a6b15 | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/packages/db/src/migrate.ts | ce2c874a296e2ae1d68126ca8ff5e666e7e9b39a378b0fe6c0e948d205cd026d | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/apps/web/src/server/source-upload-handler.ts | 160abe76eec4d693136257831ccb777a23eea9c5dbcdf0158b348861321a7df7 | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/apps/web/src/app/login/AuthForm.tsx | 487f36f1b7e22865813dd0a735db67f240f0bb21205113247a3f15ebb97f40ac | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |
| projects/06-rag-sales-chatbase/tests/auth.test.ts | cbf193b27b71dc61fed443ad1746c41b63c21bb4abae23328af5fb80b9ca84df | adapt contracts/patterns, strip N6 business dependency; fresh N8 tests |

GitHub search AFTER local sweep: better-auth session/security and node-postgres pool/transactions official repository sources. {"checked_at": "2026-10-13T21:26:50.459559+00:00", "repositories": [{"repo": "better-auth/better-auth", "commit": "ea85d133d640233c1564417f3bad611d99356bb9", "license": "MIT", "license_path": "LICENSE.md", "source_url": "https://github.com/better-auth/better-auth"}, {"repo": "brianc/node-postgres", "commit": "0980cefebe0ae461da8883703be049fe13ca96cf", "license": "MIT", "license_path": "LICENSE", "source_url": "https://github.com/brianc/node-postgres"}]}

Decision: adapt N6 password/session store/service/HTTP boundary and N6 pg/migration/UI form patterns; preserve literal bounds and tests, replace table names/owner semantics. BetterAuth MIT broader framework not needed for this limited local auth; node-postgres MIT reused actual library. Raw bcrypt >72 UTF8 explicitly rejected. New atomic PG UPSERT rate needed because N6 Redis excluded and N1 split count/record not atomic. N8-specific schema/domain/DTO independent of donor business fields; new code simpler than carrying RAG/partner/subscription logic. Reuse all17 initial logical entity naming from accepted Pseudocode; schema is foundation, module business effects tested in owning feature. Exact versions audited in /tmp/n8-dependency-audit; fresh product lock/audit required.

## Shared canonical serialization and initial DDL

Coordinator fresh local search for stable JSON found no suitable existing common function; then primary GitHub epoberezkin/fast-json-stable-stringify (MIT, release2.1.0) inspected. Selected pinned library2.1.0 rather than inventing canonical serialization. N6 migrations001 read as donor account/session constraints; N8 adds its normative entities and composite same-project keys, excludes pgvector/RAG columns. Frontend AuthForm adapted from projects/06-rag-sales-chatbase/apps/web/src/app/login/AuthForm.tsx: preserves controlled submission/API envelope/error pattern, replaces N6 partner/preview semantics with N8 neutral registration and 12char/72byte contract. CSS/layout original editorial design; no app behavior in styling.

## Coordinator runtime/migration adaptation review

Local projects01–07/03a/05a migration and Compose paths searched; donor N6 migrate.ts supplies transaction+advisory lock+SHA journal algorithm, adapted ESM/runtime path/new mutex80913000. Primary GitHub docker-library/postgres docker-entrypoint.sh SHAd588a44673ea9d123c1acb1a6924de10a27fc315 (official image implementation, Apache2.0 repository) reviewed for executable init scripts and parameterized psql roles. Runtime separates bootstrap/migrator/app, no DB host port. Provenance limitation: this deeper migration/init review was recorded after initial scaffold writing, before acceptance; no claim of a pre-code subtask search timestamp. Owner requirement remains enforced for subsequent business feature authors before code.
