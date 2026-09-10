# identity-core-resume terminal receipt

RUN_ID: 20260909T211734Z-identity-program-partner
WORK_UNIT_ID: identity-core-resume
PROJECT_ROOT: /tmp/n3a-identity-core/projects/03a-affiliate-rewardful
TRACE_PATH: /tmp/n3a-identity-core/projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/identity-core-resume.md
Base commit: 7f9967b75e2f58b53a50b778a65b7e0580c7e3fe
Profile: compact-quality-first-v2; risk XL; parent-authorized continuation.
Requested model/effort: inherited parent selection; not independently attested.
Actual model/effort: null; this host exposes no attesting execution metadata.
Usage input/cache/output/reasoning/cost: null; host counters unavailable.
Active time: null; no active/wait interval instrumentation.
Measured trace start: 2026-09-10T05:58:04.646720+00:00
Measured terminal time: 2026-09-10T07:11:08.268953+00:00
Measured trace elapsed_ms: 4383622
This interval excludes initial reading before trace creation; previous interrupted attempt is accounted by parent, not reconstructed here. It includes tool/approval waits; no claim of active duration or savings.

## Delivered core scope

All25 exact identity-core owned files below are regular nonsymlink files, each below500 lines. Continued prior unintegrated implementation. No contract,001/002, shared config/manifests/exports/harness, canonical docs or prior trace edits. No commits/push, real identities, provider activity, notifications or deployment.

New SQL003..010 implements trusted ownerless pilot bootstrap, identity-bound enrollment, current scoped authority, immutable runtime policy/consent/history, atomic partner assets, historical eligibility, fixed8193 admission rows, and offline replacement receipts. Typed service/repository use validated nested DTO decoding and sanitized database outcomes. Registration KDF runs between completed preflight and final database transactions.

Actual implementation defect found and corrected:004 check_grant used SQL alias m colliding with PL/pgSQL row variable m; PostgreSQL enrollment preflight failed ambiguous_column. Replaced only replay relation alias. Initial PG run proved the defect; all following baseline and expanded successes use corrected004. Disposable schema was recreated to preserve migration checksum checking, then all001..010 reapplied; no migration journal checksum was forged.

Test corrections: observe app lock waits through the actual app role (migrator lacks other-role wait_event visibility); app CREATE TEMP correctly denies, so hostile schema is provisioned by migrator and then used in app search_path; explicit partner asset DTO inputs avoid nullable fixture partner_id type error.

## Executed checks and outcomes

Commands use this project root unless otherwise stated.

| Command | Exit | Actual result |
|---|---|---|
| npm run typecheck | 0 final | Full TypeScript check; initial resumed pass, temporary new-fixture typing errors corrected before final |
| npm test | 0 escalated |30/30,9files; initial sandbox run29/30 because tsx local IPC EPERM, rerun outside sandbox passed |
| npm run build | 0 | Offline Next production build passes with baseline routes; integrated HTTP/UI build belongs to root |
| node /tmp/n3a-core-check.mjs migrate | 0 | Exact prior private namespace inspected, then clean001..010 replay after004 fix |
| node /tmp/n3a-core-check.mjs | 1 initial |14/30 failed: SQL alias bug plus absent build; next run27/30 with role-observer/hostile TEMP fixture defects |
| node /tmp/n3a-core-check.mjs packages/db/tests/onboarding-enrollment.integration.test.ts packages/db/tests/onboarding-policy.integration.test.ts packages/db/tests/onboarding-roles.integration.test.ts | 0 |11/11 corrected focused PostgreSQL checks |
| node /tmp/n3a-core-check.mjs | 0 expanded |36/36, then37/37 after final additional rollback/symlink evidence |
| git diff --check | 0 | No whitespace errors |
| node scripts/check-foundation-infra.mjs | 2 standalone | No explicit environment: infra_configuration_unavailable; subsequently PASS inside configured harness |
| node /tmp/n3a-core-check.mjs down | 0 | Exact previous stack removed before fresh orchestration; no volume deletion |
| node scripts/run-foundation-integration.mjs | 0 | FINAL: typecheck/build, infra/port gate, fresh migration001..010, unit30/30, PostgreSQL+workspace37/37; complete cleanup |

Final harness namespace n3a-foundation-1b13cc9ace2c. Fresh random independent secrets; internal network; no database host ports; port4183 checked free before compose up. Private diagnostic handle /tmp/n3a-foundation-1b13cc9ace2c-qUMIlL contains secrets and is NOT an integration artifact. Both this namespace and previous n3a-core-be2b88be9207 containers/networks cleaned; named disposable volumes retained by harness design. No runtime left running by this work unit.

Final unit measured start07:09:19 UTC, runner duration7.31s. Final integration measured start07:09:28 UTC, runner duration15.04s. Native Argon2 fixture smoke measured832ms, maxRSS205256KiB; this is a smoke measurement, not production capacity/p95.

## AC and critical correction evidence

- AC1: enrollment integration tests prove no implicit user/membership, draft null owner,0600 file, receipt replay with existing output, conflicting/missing evidence, app SQL denial, reissue chain tip, both reissue/accept lock orders, symlink refusal and owner assignment rollback.
- AC2: strict ASCII normalization vectors, concurrent normalized signup single account/password winner; revoke and expiry during paused KDF deny final write; KDF phase has zero held app leases; foreign identity denies.
- AC3 core portion: foundation real credential/session tests retained; session revoke-first read denies after wait; mutation-first session SHARE causes actual app logout UPDATE to wait until commit, subsequent mutation unauthorized; post-user-lock session expiry denies. CSRF/cookie/HTTP behavior is root-owned.
- AC4: owner tuple atomicity; operator scope/configure denial, issuer membership revocation blocks pending grant, issuer disable blocks replay while established operator membership retains its own current authority; revoked operator replay does not restore membership.
- AC5: expected-version race one immutable version; effective future policy retains current terms/timezone; future/stale consent denies; paused locked calendar rejects changed timezone; wait crossing scheduled effectiveness rejects stale terms using fresh clock; activation always integration_not_ready.
- AC6: concurrent consent returns identical membership/assets; failpoints after partner, membership, each link/promo, each asset fact, grant consume, invitation consume and audit rollback counts/state/consumption, then same invitation succeeds; bad terms hash denies; immutable consent protected.
- AC7: existing identity binds and accepts second-program invitation with no additional user/session, original membership/assets retained; unbound/foreign/stale/expired/revoked grants deny.
- AC8: suspension blocks portal/replay, identical transition adds no fact, reactivation restores read and preserves revoked asset, historical eligibility remains stable; synthetic future latest fact rejects backdated transition.
- AC9 database portion: exactly8193 precreated rows, concurrent global300/source60/identity10 caps, failed source request does not charge global, repository recreation retains counters, expired windows reset in place, out-of-range slot denies. Full process restart, forwarding spoof, handler/body bounds belong to root HTTP/integration gates.
- AC10 database portion: actual app/migrator ACLs and PUBLIC execute checks, internal/bootstrap function denial, fixed search_path, hostile schema, cross-program FK denial, forbidden SQL scope denial, scoped DTO absence of sensitive fields. Root covers HTTP/DOM escaping/no-store/sentinel output.

All six PLAN corrections are represented in code and direct tests: session SHARE ordering; post-all-lock decision time; paired effective policy/timezone; receipt lookup before output; program/predecessor locking for offline reissue; fixed admission and KDF boundaries.

## Remaining integration gates and measurement limits

This receipt completes the bounded core implementation work unit, NOT full feature acceptance. Root must integrate exact files/exports, run combined HTTP/UI/browser at all four widths, process-level admission/restart probes, targeted named guard mutations, independent security REVIEW and integrated regression. No mutation kills or browser results are claimed here. Bootstrap crash-after-commit-before-write recovery is implemented and sequential/race reissue is tested; process-crash delivery fault itself is not injected. Full acceptance/suspension and issuer-revocation lock-order combinations remain additional independent QE probes beyond executed cases above. Real operational identity verification, N1/YooKassa and production remain unexecuted.

## Input SHA snapshot

| Path | SHA-256 |
|---|---|
| `docs/features/identity-program-partner/01_specification.md` | `f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da` |
| `docs/features/identity-program-partner/02_pseudocode.md` | `85f820c5237e0d56ce15e6fa4578b5049fc0d62d2d5e5662e3dffc042625db61` |
| `docs/features/identity-program-partner/03_architecture.md` | `c48fda7bcf48300a88a006bbeb1e887ddb3e0b89b179e6a759713e91047f02a4` |
| `docs/features/identity-program-partner/04_refinement.md` | `cabfbc15caf3c23c8136617bf8fa855254a5d89a7c3188b6079b6ce901e4a64e` |
| `docs/features/identity-program-partner/05_completion.md` | `880259fe23b9c6d3da84f96f6795216f833efe3d360d4d96e3bcd470cbd5abd6` |
| `docs/features/identity-program-partner/validation-report.md` | `5e3081ff951d667074e7651238108281bff363620e13f2a7b135f0e6a484d307` |
| `docs/dispatch-plan.md` | `0318bbf1b9353843fbc8151ff40da59d7e9d64f042112fe98c27845532512416` |
| `docs/discovery/identity-donor-audit.md` | `54430e50a3b1c837b62837ab770aed816d93a0a19ed9f51e45bdf9514d9cecf4` |
| `packages/db/src/onboarding-contract.ts` | `9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511` |
| `packages/db/migrations/001_identity_sessions.sql` | `70106a564616aa1df6f2cf5f4df2aef72ef4fffc114d6e9647652c171cef56cc` |
| `packages/db/migrations/002_runtime_grants.sql` | `7dbded87c61478ddb2ee03dafa5c8d660cdb3dc376579b93e120234fd4a56b6e` |
| `packages/db/src/auth-repository.ts` | `e3d6e39815a00076a7dd4015f6192d83755680c5592d0e0f2d335f4c7e806636` |
| `packages/db/src/pool.ts` | `b56c60405ebb74cc2d2750aa9934623e417195483fef4ffadbdc58e88b3f3394` |
| `apps/web/src/lib/auth/credentials.ts` | `8c8bd8d70d722d89bd2a14d09a47c8232bb3721ca4fb3e8177646f9fd0ea670e` |
| `apps/web/src/lib/auth/session.ts` | `dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262` |
| `apps/web/src/lib/auth/kdf-admission.ts` | `d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e` |
| `scripts/run-foundation-integration.mjs` | `4f3e58dcbad561b43ca9968748f526f63ea931dccc60a33d7a780b7607a85b23` |
| `compose.yaml` | `1bbc262055f0b93881999cc6849438742c25af33eced13098140ac8e1d3f8f88` |
| `package-lock.json` | `08d9ee0b17ac2524bf93e787764e0d217c2ea32d2f136ab84603959006197731` |

N1 normalizer provenance retained from prior verified trace/source audit:52bfa7c785ad7cff2258ca223aa76d839c4bb8a68bb0bb10edaed4e8996c3c0f. No N1 runtime imports.

## Exact delivered owned-file SHA snapshot

| Path | SHA-256 |
|---|---|
| `packages/db/src/onboarding-repository.ts` | `1b43f03b1ded5f46c1793bbdf2e66b97bc3f48735127efee740ac84b0e5c6265` |
| `packages/db/src/admission-repository.ts` | `9f1685399b280fb830e5382ab49afc41cffa8f685bd289c3571b99368c5cc38d` |
| `apps/web/src/lib/onboarding/identity.ts` | `ddb160ace4b64a83af1da3061b1861f8389e32fafda23fec4a5b85444b077d2e` |
| `apps/web/src/lib/onboarding/service.ts` | `747dc952639c88676ca27e2af6d55191c9be466a7d5534f04138cca3006d9f5e` |
| `apps/web/src/lib/onboarding/policy.ts` | `8f0cbf7a034347a2462326cdbd3ffe3cac59beced31449412d2d6d49e838bd66` |
| `apps/web/src/lib/onboarding/partner.ts` | `1c122b63cd68c9915e18816ccc195e834b07cd30a56d9d54104f7d2ee119e310` |
| `scripts/bootstrap-pilot-owner.ts` | `140161d2c228bfc9d8006211429db02ef39455ad4d6b0f8e8bd4d719a6606c1a` |
| `packages/db/tests/onboarding-test-helpers.ts` | `8eda0716859c5ecf6be5031219457815f57f00fe9febb095ba1d909382681407` |
| `apps/web/tests/onboarding-identity.test.ts` | `9fe474945a052fb2dac153289f1fe64a1d0e7e85d857443b40714389af680764` |
| `apps/web/tests/onboarding-policy.test.ts` | `8d0f7ed31fdea1ffc4f7b38d4dac9c44108a7f87e022a49df8282ba62fb9eae0` |
| `apps/web/tests/onboarding-service.test.ts` | `b3777b8d4fe31e0d6be931cd3c8570174b455c94442abc10bcd67d58c24b57a9` |
| `packages/db/migrations/003_onboarding_schema.sql` | `4b69a39673ef79bc59f67afe791aab89170cfeff8002f6d1730b72a212be6a1b` |
| `packages/db/migrations/004_onboarding_helpers.sql` | `99adac7691fb66478b209431eb64b2427710ebb3dffdeb9d2cf10ee884eee3e0` |
| `packages/db/migrations/005_onboarding_enrollment.sql` | `7c7581120731e4cbfb773f10d90eaf6c53ea62ef2e19b8b302a7e7a01b31a3ca` |
| `packages/db/migrations/006_onboarding_policy.sql` | `5af2bb6605711465929e1e2344899b49939b785210bfacfab677227b5feaca83` |
| `packages/db/migrations/007_onboarding_partner.sql` | `2c6024e8468d3b29eaee8ec9d7dabaf8dcb7fc9e03f1d918ea8f1910384e3606` |
| `packages/db/migrations/008_onboarding_reads.sql` | `5d0dabf58fc5c44ccf4f3319550f096d89282872cd0c33b3b58828f61198b56d` |
| `packages/db/migrations/009_onboarding_admission.sql` | `eaf308525595e3cc123c0593de8577e9375f0aa8a6c73752df1e3ce328e11a7b` |
| `packages/db/migrations/010_onboarding_bootstrap.sql` | `d124b5e69cb0d380308b6081ec98fda9f9b1367f1b3e1e4c7713704c65e6c6e0` |
| `packages/db/src/onboarding-codecs.ts` | `2dac78c6a2917e4949ff4a7f7027d82fb2d5d398317f128d888b7095d1958a41` |
| `packages/db/tests/onboarding-enrollment.integration.test.ts` | `60e2b3b95fe52845c3e1dc57f6ae096f0135863410a759717ef4c1f00aa1f731` |
| `packages/db/tests/onboarding-policy.integration.test.ts` | `c1b7556c948d1942bb18acec10b10d90a63c773bc8151b2f9d9e26ea6beeb0ee` |
| `packages/db/tests/onboarding-partner.integration.test.ts` | `cbf6dfc8b03af62bbbac00f6056cb93e6a60c33da36843c3109b7bf2af038cea` |
| `packages/db/tests/onboarding-admission.integration.test.ts` | `d0d8b8bc6f1ff98d1ab77fadb3dd00cb57374544aa3ff7c46ce3defd24beb859` |
| `packages/db/tests/onboarding-roles.integration.test.ts` | `d95ad6bcbeda2fcc491c7265174e2ee03c73014cf62f508e4a2858199c7e34f0` |

Status: completed
