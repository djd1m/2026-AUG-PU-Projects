# Foundation core implementation receipt

RUN_ID: `20260909T192932Z-foundation`
WORK_UNIT_ID: `foundation-core`
Profile: `compact-quality-first-v2`; risk: XL; stage: IMPLEMENT.
Assigned isolated worktree: `/tmp/n3a-foundation-core`; assigned source revision: `91e3b2d` (as dispatched; no git command run by child).
Requested model/effort: `gpt-6-astra` / `high`. Actual model/effort: null; authoritative execution metadata unavailable. Tokens, cost, retries and cached-token counters: null, not inferred.
Receipt written at: 2026-09-09T20:09:10.062917+00:00. First explicit wall-clock observation: 2026-09-09T19:56:18Z; precise dispatch/start time unavailable to child, so full elapsed duration null (coordinator can bind dispatch timestamps).

## Inputs

Root/project CLAUDE, local coding/security/secrets/testing rules, coding-standards and security-patterns skills, project Pseudocode/Architecture/ADR/webhook contract, root complexity/security/resource/mutation policies were read. Donor audit and reuse inventory were inspected before actual selected N1/N2 sources.
Canon matched dispatched SHA exactly; no contract edits or scope expansion.

| Input | SHA-256 |
|---|---|
| `docs/foundation-contract.md` | `30bfab6c7459af5c7df8da2fd28922214db50b0dbf17d8fdf610bf7c6a821bdc` |
| `docs/dispatch-plan.md` | `85da7f058a6cdbd6ac5cac3e2aa67e47e2fefacddfe5f6e5d547ac2e0398da25` |
| `docs/discovery/foundation-donor-audit.md` | `0d0d65a7927809151ec06ba94f89f53fc176768c163d03a773eb2e9f07ac9bfa` |
| `docs/discovery/reuse-inventory.md` | `9f4d4dc000f39e65ae2e774ba54330fa82247e8d4fe78ef58abeb32124597809` |
| `docs/features/foundation/01_specification.md` | `b235e4f6ae330459262df674668d5c9b283c660ba9a32f383851fc9398f92a89` |
| `docs/features/foundation/02_pseudocode.md` | `6b9e8692d2d0b6789cc3a29eee666ef8158f40f3659a7a5e3b9fb914cfe88f23` |
| `docs/features/foundation/03_architecture.md` | `0d55c0338b9663a672ea8a5c6d2c19210f7c4ee495811f7c382f129d429a4cd0` |
| `docs/features/foundation/04_refinement.md` | `7b03879fc0264c5392cc2997c1d636fd9acc035654da650479722aa8cd839abc` |
| `docs/features/foundation/05_completion.md` | `a1d97be4f385fde81274452493b3f1e3c76b358865f06983f22e34ddc8ea3f06` |
| `docs/features/foundation/validation-report.md` | `d934f719b923fec5c85ad5aaf50b0dc0121346e5fcc492a110beeddafe4f8507` |

## Donor provenance

N2 runner was adapted, not replaced by an unrelated implementation: retained sorted SQL discovery, filename/checksum map and per-file SQL+journal BEGIN/COMMIT/ROLLBACK structure. Removed baseline and truncation; added 64-hex byte SHA, full-history preflight including missing later files, journal shape/constraint checks, finite advisory serialization and sanitized CLI diagnostics.
N1 native hash/verify wrappers and primitive assertions were adapted. N3a adds code-point/byte bounds, supported stored-format bounds, explicit Argon2id v19/m65536/t3/p1/output32/fresh16-byte salt and shared FIFO admission. N1 dummy Promise/warm-up pattern was retained with randomBytes replacing Math.random; no donor login transaction/rate-limit/account schema was copied.
N1 token generation, HMAC and indexed lookup patterns were adapted to domain separation, Buffer Hash32 storage, 24-hour identity-only contexts, revocation/current enabled state, and always Secure __Host cookie. No donor imports or resources.

| Actual inspected donor | SHA-256 |
|---|---|
| `projects/01-testimonials-senja/apps/web/src/lib/password.ts` | `0566315c95d3f12dc32ac694f880824b7fc8d0306fcf488773fd64f979c91505` |
| `projects/01-testimonials-senja/apps/web/src/lib/login.ts` | `386a9a9ad71d34061ba4a3af8c20fcf2752579181c9d6b1b914d00d0d9b6c668` |
| `projects/01-testimonials-senja/apps/web/src/lib/session.ts` | `5f22ed53dc93ca1c775c101a59835f19459ab525f678e5298579c6ae54b32376` |
| `projects/01-testimonials-senja/apps/web/src/lib/current-session.ts` | `b849d831a642c78178b6e1f8bd55812e35cfa18e5413f32b3e85a850c9965b70` |
| `projects/01-testimonials-senja/apps/web/tests/auth-primitives.test.ts` | `423baee432541d3d1e143749eb25487486386c65f6c7901b3d0944b5d1d77d40` |
| `projects/02-review-qr-reputation/packages/db/src/migrate.ts` | `8bda5fd4c75c0ec33c8e83c8b9edd70e3d32828d5e39fb2b194225d5bce8e5d0` |

N3a-specific schema/repository/admission/config/bootstrap and resource/race/privilege integration tests are new because donors lack the required dependency closure.
Pinned actual @node-rs/argon2 index.d.ts was read from coordinator installation: algorithm enum numeric2, version V0x13 numeric1 (encoded v19), memoryCost/timeCost/parallelism/outputLen/salt options confirmed.

## Implementation and interfaces

- `readRuntimeConfig(env)` matches canon exactly; startup bypass is not present in auth code.
- `createRuntimePool(url)` applies max10, acquire1s, lock1s, statement5s. Composition root constructs process pool.
- `AuthRepository(pool, clock?)` provides findUser/issueSessionIfCurrent/resolveSession/revokeSession. Optional clock is an internal deterministic-test seam; production SQL defaults to statement_timestamp(). Context contains only user_id/session_id/expires_at.
- `createCredentialService(repository, secret, passwords?)` warms one dummy per PasswordService; process default PasswordService shares the singleton KdfAdmission. authenticate returns closed error outcomes or committed token/context.
- KDF admission 2active/8FIFO/5s; waiting abort removes task, running abort keeps capacity until underlying settlement. Snapshot lookup releases pool client before native KDF. Function under row lock rechecks enabled and byte-identical hash immediately before INSERT.
- SECURITY DEFINER function, trusted search_path, qualified relations and PUBLIC revoke are in migration001 transaction. App gets no users writes/direct session INSERT; 002 grants only intended reads/revoked_at update.
- Migrator CLI takes DATABASE_URL_MIGRATE only, no baseline flag. Bootstrap script expects POSTGRES_USER=n3a_admin, POSTGRES_DB=n3a plus distinct explicit app/migrator password envs.
- No HTTP auth/provisioning, N1 change, membership/finance/D7 or production deployment.

## Checks actually run

1. Unit command: `/tmp/n3a-build/projects/03a-affiliate-rewardful/node_modules/.bin/vitest run --config /tmp/n3a-build/projects/03a-affiliate-rewardful/vitest.config.ts --root /tmp/n3a-foundation-core/projects/03a-affiliate-rewardful apps/web/tests/password.test.ts apps/web/tests/kdf-admission.test.ts apps/web/tests/session.test.ts apps/web/tests/auth-config.test.ts` — PASS, 4 files / 8 tests, 2.92s, start20:05:32 UTC. Actual native smoke Nodev22.22.0, 955ms, process.resourceUsage().maxRSS183820KiB. Observational host evidence, not target-container throughput.
2. Strict TypeScript compiler API over all19 owned TS files with noEmit/strict/ES2022/ESNext/Bundler/esModuleInterop/skipLibCheck/isolatedModules and an in-memory @n3a/db→local index mapping — PASS 0diagnostics. No config files edited. Initial direct tsc failed because coordinator package source had not yet been integrated and one test relative path was incorrect; relative path fixed, in-memory alias resolved actual dependency interface, clean check passed.
3. `bash -n scripts/init-foundation-db.sh` — PASS.
4. Missing-env negative: integration vitest command for migrate.integration.test.ts with coordinator integration config — expected exit1; actionable explicit TEST_DATABASE_URL/TEST_DATABASE_URL_MIGRATE requirement, zero skipped tests. This is not PostgreSQL behavioral evidence.
5. Contract/donor SHA comparison — match. Every owned file has fewer than500 lines.

## Pending coordinator integration evidence

Actual PostgreSQL suites, built workspace, full root typecheck, dependency audit, target-image native compatibility, required mutation experiments and independent review NOT RUN by child. These remain required before foundation acceptance. Child performed no network/install/container/git commands. No actual-role or database-race pass is claimed.
The AC6 unit umbrella exercises token/HMAC/service boundaries; real expiry/revocation/disabled-user lifecycle assertions reside in packages/db/tests/auth-repository.integration.test.ts, including exact expiry and -1ms using actual SQL. Coordinator should use that real integration test in completion criterion mapping or explicitly link supporting evidence.
Temporary node_modules symlink points to coordinator installation solely for dependencies; it is excluded from owned source/evidence and must not be committed.

## Owned regular files at handoff

| File | Lines | SHA-256 |
|---|---:|---|
| `packages/db/src/auth-repository.ts` | 79 | `e3d6e39815a00076a7dd4015f6192d83755680c5592d0e0f2d335f4c7e806636` |
| `packages/db/src/index.ts` | 3 | `0bdd1141ccffd142a2ae9ab7c6e74f2263964f981c2a54335be60631f12d8952` |
| `packages/db/src/migrate.ts` | 116 | `d63996f70dcb778deca616628eb9bcd0801a071ff87b85cb6436b88ee54271ed` |
| `packages/db/src/pool.ts` | 14 | `5e3287b5a8e74e2738d9c0990782a1b56715142a226419eecf0dc987131f67ed` |
| `packages/db/migrations/001_identity_sessions.sql` | 48 | `70106a564616aa1df6f2cf5f4df2aef72ef4fffc114d6e9647652c171cef56cc` |
| `packages/db/migrations/002_runtime_grants.sql` | 4 | `7dbded87c61478ddb2ee03dafa5c8d660cdb3dc376579b93e120234fd4a56b6e` |
| `packages/db/tests/auth-repository.integration.test.ts` | 59 | `fde3684ec512f86fa17b7a864281a960bebb0ecd5586128a4596ff849c6f7e79` |
| `packages/db/tests/helpers.ts` | 37 | `7a65c8f4514b8f9ca501d7c1e22be5657e1ce20cf8b32081b17a92faf3afb383` |
| `packages/db/tests/migrate.integration.test.ts` | 65 | `a839064980ca915bd1042bcda3ccdd70a5fa3204376b12f6cad5b60eda45b9d7` |
| `packages/db/tests/roles.integration.test.ts` | 66 | `0d2dee12be068b4e08b43248ccb83e93b4a3086594a35cd7b2c8b048ec60b9bf` |
| `apps/web/src/lib/auth/config.ts` | 21 | `200bd7128e67214e790c861587d64929dbc13fee511dc0f43f1cfe7071930126` |
| `apps/web/src/lib/auth/cookie.ts` | 9 | `f61d3bf4d3dd6f562dffb0bc43870cc856d5a36649223c80df985a094b37cae0` |
| `apps/web/src/lib/auth/credentials.ts` | 39 | `00eaca125e7a739f0dda361e0b452dd3279564777927c8ab30aa06bfaec5974c` |
| `apps/web/src/lib/auth/kdf-admission.ts` | 72 | `d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e` |
| `apps/web/src/lib/auth/password.ts` | 57 | `709978d0666ce3a5cbe3ccc251c472bb609d0fd3216eba92e962472f3f8ceb54` |
| `apps/web/src/lib/auth/session.ts` | 34 | `dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262` |
| `apps/web/tests/auth-config.test.ts` | 25 | `0b3b576e6ebd707deda2f74337d7f019ad267b2ec78eb2f7e54f8f804422e7a6` |
| `apps/web/tests/credentials.integration.test.ts` | 71 | `c8eec6375c14d49f84ab241330f3faf5f268feb4e5a4b07575df5a1e064c9a58` |
| `apps/web/tests/kdf-admission.test.ts` | 65 | `c4ef1904b8d6909263c780640dc8b3b334b371e78e37a7f0db35597e3a7b1d3d` |
| `apps/web/tests/password.test.ts` | 52 | `a67e874f47691ef996ad6a4694bec37704042e8107d5af2dda1a6258a217b09c` |
| `apps/web/tests/session.test.ts` | 30 | `44711b55e5dc406d5af7addbad1115a47ac8c8b7633f993014c33c250ca890ae` |
| `scripts/init-foundation-db.sh` | 32 | `b741b3a05d448631b4f90d34bc010cadce13368170e5a098d697507ffee6c93d` |

Status: completed
