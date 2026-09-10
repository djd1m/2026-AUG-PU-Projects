# identity-process-qe terminal receipt

RUN_ID: 20260909T211734Z-identity-program-partner
WORK_UNIT_ID: identity-process-qe
PROJECT_ROOT: /tmp/n3a-identity-core/projects/03a-affiliate-rewardful
TRACE_PATH: /tmp/n3a-identity-core/projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/identity-process-qe.md
Profile: compact-quality-first-v2; risk XL; authorized bounded test-only continuation.
Requested model/effort: inherited Astra/high.
Actual model/effort/input/cache/output/reasoning/cost: null (host attestation/counters unavailable).
Active time: null (no independent active/wait measurement).
Started: 2026-09-10T08:50:12.632216+00:00
Completed: 2026-09-10T08:54:37.426871+00:00
Elapsed_ms: 264794

## Delivered scope

Only the two new files below plus this trace were written. Existing delivered core sources/tests, contract, manifests, configuration and prior receipts were not changed. No Docker, namespace, service or external operation launched. No production fault injection or secrets in stdout/trace.

Five new actual-PostgreSQL integration tests:

1. Two independent Node child processes and connections race source60/identity10 limits; after both exit, a replacement process remains denied while unrelated slots remain admitted. Exact8193 rows and persisted counters are asserted.
2. Two child processes use separate source-slot sets to exceed global300; their combined admissions equal300 and a replacement process with a previously unused slot remains denied. Storage stays8193.
3. Child executes real offline bootstrap with actual migrator role. Test-only client wrapper awaits the real COMMIT, signals only committed through private IPC, then pauses before returning to production helper. Parent SIGKILL proves a real crash after committed receipt/before token output. Oracle checks empty0600file, unchanged user/session counts, persisted receipt, same-request retry returning IDs with no token/output change, one original grant, then explicit replacement revokes predecessor and successfully enrolls one owner.
4. Two real database clients serialize issuer membership revocation versus grant acceptance in both orders. Revoke-first denies unconsumed acceptance; accept-first preserves established read membership. Both subsequent used/pending-grant replay outcomes deny after issuer loss.
5. Two real app clients serialize partner suspension versus consumed invitation replay in both orders. Suspend-first replay denies; replay-first returns existing result before suspension. Subsequent replay denies, membership stays revoked/read-only, exactly one new fact and unchanged two assets.

Worker stdout/stderr is captured privately and only byte counts are asserted. IPC response contains counts/phase only. Crash input and identity secret travel through inherited trusted test environment/private IPC, never CLI arguments or printed diagnostics. Parent tracks and kills leftover child processes in afterEach; transaction tests rollback/release connections in finally. Every file below500lines.

## Executed checks

- npm run typecheck: exit0 after initial worker tests, after serial race tests, and after adding global process ceiling (final).
- git diff --check: exit0 final.
- File existence/symlink/line counts and SHA inventory: PASS.
- Actual PostgreSQL/process/crash integration execution: PENDING parent integration harness. These tests are written and typechecked; no passing runtime result is claimed.

Root should selectively integrate only these two source files plus receipt and execute npm run test:integration against the root-integrated production source. The local input snapshot predates root's concurrent fixes, so runtime acceptance must bind root's actual resulting sources. No mutation experiment or browser run was performed by this work unit.

## Input snapshot

| Path | SHA-256 |
|---|---|
| `packages/db/tests/onboarding-test-helpers.ts` | `8eda0716859c5ecf6be5031219457815f57f00fe9febb095ba1d909382681407` |
| `packages/db/src/onboarding-contract.ts` | `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511` |
| `packages/db/src/admission-repository.ts` | `9f1685399b280fb830e5382ab49afc41cffa8f685bd289c3571b99368c5cc38d` |
| `packages/db/src/onboarding-repository.ts` | `1b43f03b1ded5f46c1793bbdf2e66b97bc3f48735127efee740ac84b0e5c6265` |
| `scripts/bootstrap-pilot-owner.ts` | `140161d2c228bfc9d8006211429db02ef39455ad4d6b0f8e8bd4d719a6606c1a` |
| `docs/features/identity-program-partner/04_refinement.md` | `cabfbc15caf3c23c8136617bf8fa855254a5d89a7c3188b6079b6ce901e4a64e` |
| `packages/db/migrations/004_onboarding_helpers.sql` | `99adac7691fb66478b209431eb64b2427710ebb3dffdeb9d2cf10ee884eee3e0` |
| `packages/db/migrations/005_onboarding_enrollment.sql` | `7c7581120731e4cbfb773f10d90eaf6c53ea62ef2e19b8b302a7e7a01b31a3ca` |
| `packages/db/migrations/007_onboarding_partner.sql` | `2c6024e8468d3b29eaee8ec9d7dabaf8dcb7fc9e03f1d918ea8f1910384e3606` |
| `packages/db/migrations/009_onboarding_admission.sql` | `eaf308525595e3cc123c0593de8577e9375f0aa8a6c73752df1e3ce328e11a7b` |
| `packages/db/migrations/010_onboarding_bootstrap.sql` | `d124b5e69cb0d380308b6081ec98fda9f9b1367f1b3e1e4c7713704c65e6c6e0` |

## Delivered SHA snapshot

| Path | SHA-256 |
|---|---|
| `packages/db/tests/onboarding-process.integration.test.ts` | `207e4f166505a94cce0546c2ee7976ff04b9fd1f6cd6f2bd06d0459d5ea63d70` |
| `packages/db/tests/onboarding-process-worker.ts` | `11363281616d6cac3b75a39cc9aab90d2a811efa495fee43859ab21b6aa8c419` |

Status: completed
