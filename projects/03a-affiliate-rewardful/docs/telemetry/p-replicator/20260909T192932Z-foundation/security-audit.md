# Foundation independent source security audit

RUN_ID: 20260909T192932Z-foundation
WORK_UNIT_ID: security-audit
Profile: compact-quality-first-v2; inherited XL feature, bounded independent REVIEW.
Requested model/effort: gpt-6-astra / high. Actual model/effort: null (authoritative metadata unavailable). Tokens/cache/reasoning/cost: null (usage feed unavailable). Start and elapsed: null (reliable local start timestamp not captured).

Verdict: two supported medium findings against the original pinned source; no confirmed blocker/high exploit in this bounded pass. Changes required; runtime conformance and final acceptance remain pending. All 21 core hashes matched before grading. During receipt creation the coordinator explicitly began fixing pool/config and tests; final differences are listed below. Those fixes are UNREVIEWED by this attempt.

## SA-01 — Medium: idle PostgreSQL failures escape the sanitized error boundary

Location: packages/db/src/pool.ts:4–13 in the pinned source. Related test: packages/db/tests/auth-repository.integration.test.ts, `database failure and invalid hash boundaries cannot grant identity`.

The factory returns pg.Pool without an error listener. Installed pg-pool/index.js:52–62 attaches the failed idle client to err.client, removes that client and emits the pool error event. With no listener, that asynchronous path throws outside AuthRepository query try/catch and can terminate the consuming process with an unsanitized diagnostic. The existing test ends a pool before invoking resolve, so it misses ordinary idle-connection outage behavior. This contradicts the refinement's safe DB-unavailable handling and leaves AC-foundation-7 logging behavior unproved on that path.

Minimal reproduction for the runtime owner: in an isolated child process, obtain/release an application connection, terminate that idle backend through the disposable DB administrator, and observe uncaught error/process exit. A synthetic Error event containing harmless sensitive sentinels can supplement the actual disconnect case. This source-only attempt did not execute the reproduction.

Fix: install the pool error handler at construction; log only a fixed safe operation/error code, never Error or Client objects; let the pool replace discarded connections. Verify child survival, later successful query and clean captured stdout/stderr. An intentionally managed fatal shutdown would also need an explicit sanitized policy rather than an accidental uncaught error.

Correction to the early coordinator message: password disclosure is NOT established. Installed pg hides password properties on Client and connectionParameters. Do not describe potential object diagnostics as a confirmed password leak. Final severity is medium.

## SA-02 — Medium: malformed percent encoding passes runtime database URL validation

Location: apps/web/src/lib/auth/config.ts:5–11 in the pinned source. Separate integration observation: scripts/start-web.ts validates config then starts a health-only web process without a database connection.

The validator uses WHATWG URL plus component-presence checks, but does not validate percent decoding. With a valid canonical session secret, `postgresql://n3a_app:%ZZ@postgres/n3a` passes those checks: URL.password remains the nonempty `%ZZ` string. Installed pg-connection-string/index.js:44–45 decodes credentials with decodeURIComponent and rejects that malformed escape. The startup contract therefore accepts configuration the DB driver cannot parse. This violates malformed-configuration refusal in NFR-foundation-2/AC-foundation-7; it is not an authentication bypass.

Minimal reproduction for the owner: readRuntimeConfig with that URL and a valid secret must throw invalid_DATABASE_URL; startup with that input must exit without a healthy process. Include incomplete escapes and invalid percent-encoded UTF-8 in supported credential/host/database components. This attempt did not execute the reproduction.

Fix: validate decoded components against the actual pg parsing semantics while preserving existing protocol/component/query restrictions and sanitized fixed errors. Do not log the URL or decoder error.

## Security assessment and test evidence limits

- KDF: explicit Argon2id work factors and supported-hash parser bound normal verification before native work; fresh random salts; password code-point/byte bounds; one default process queue for normal hash and credential paths. FIFO admission retains active slots until underlying work settles after running cancellation, removes queued cancellation/expiry and releases in finally. Tests meaningfully exercise barriers, native rejection, overload, recovery and deadline-before-timer. Saturated credential integration also checks no checked-out DB clients and an independent query. The exported internal adapter/verifyAdmitted helpers assume trusted module callers; no public route was inferred. Native timing/RSS and target compatibility remain pending execution.
- Credentials: copies mutable identity bytes, uses bound SQL parameters, selects dummy verification for missing/disabled/unsupported snapshots, performs one verification and invokes locked issuance only on success. Real DB test design pauses KDF and separately commits disable/password-change mutations before resume. Results are not asserted by this source pass.
- SECURITY DEFINER: n3a-qualified tables, fixed pg_catalog then pg_temp search path, null/Hash32 guards, byte-identical convert_to comparison, User row lock and transactional insert. PUBLIC execution is revoked in migration001 before commit; app has no direct session INSERT. Actual-role tests enumerate forbidden operations, inspect ACL/search_path and attempt hostile schema redirection. The trusted app's ability to call issuance with a current snapshot is an explicitly accepted plan boundary, not a new finding.
- Migrations: regular inventory, full SHA-256, safe schema identifier allowlist, complete applied-history preflight, session advisory serialization and bounded connection/lock/statement budgets. Each trusted transaction-compatible SQL file and journal entry share a transaction. Tests cover two concurrent runners, changed/missing later history before earlier new SQL, rollback/corrected retry, lock timeout and legacy journal rejection. No SQL-injection path was found in the bound values or validated identifier interpolation.
- Sessions: canonical 32-byte tokens, domain-separated HMAC-only storage, strict expiry, enabled/revoked checks, idempotent revocation and identity-only output are implemented with behavioral tests. Cookie is Secure/HttpOnly/SameSite=Lax/root scoped with __Host prefix and no Domain. No program authority was inferred.
- Logging evidence gap: credentials.integration.test.ts:62–70 is titled database and native errors, but injects only native failure and spies on selected console methods. Config tests supply a DB-password sentinel, but full process stderr/stdout tests for DB errors, session secret, raw token and identity sentinels are missing from this snapshot. Native exception is silently denied although pseudocode also calls for a sanitized diagnostic. Complete prescribed sentinel coverage before AC7 acceptance. No additional leak is claimed from missing tests.
- This unit ran no tests, dependency install, network operations, containers, git or code changes. Actual PostgreSQL results, native smoke, dependency audit, all required mutations with restoration/clean reruns and final build remain coordinator-owned evidence. Changing Compose/isolation was not accepted here. No HTTP authentication was expected: it is explicitly deferred.

## Snapshot provenance

Initial hash verification: 21/21 match before source grading. The following are the original inspected hashes, relative to /tmp/n3a-build/projects/03a-affiliate-rewardful:

```text
dd8d3ff1482794d4a358da4464168b37f0d064db4293d603c1d3674c3671a262  apps/web/src/lib/auth/session.ts
d2618e5028b1dde8a20506ba451acc18f46cea623f70641fead9dd7fd6bbc30e  apps/web/src/lib/auth/kdf-admission.ts
2c36067ac9b281068e7215131b4afa0deaaea1d076415e55f3dacb79273c3aa3  apps/web/src/lib/auth/config.ts
00eaca125e7a739f0dda361e0b452dd3279564777927c8ab30aa06bfaec5974c  apps/web/src/lib/auth/credentials.ts
f61d3bf4d3dd6f562dffb0bc43870cc856d5a36649223c80df985a094b37cae0  apps/web/src/lib/auth/cookie.ts
709978d0666ce3a5cbe3ccc251c472bb609d0fd3216eba92e962472f3f8ceb54  apps/web/src/lib/auth/password.ts
e3d6e39815a00076a7dd4015f6192d83755680c5592d0e0f2d335f4c7e806636  packages/db/src/auth-repository.ts
5e3287b5a8e74e2738d9c0990782a1b56715142a226419eecf0dc987131f67ed  packages/db/src/pool.ts
d63996f70dcb778deca616628eb9bcd0801a071ff87b85cb6436b88ee54271ed  packages/db/src/migrate.ts
0bdd1141ccffd142a2ae9ab7c6e74f2263964f981c2a54335be60631f12d8952  packages/db/src/index.ts
7dbded87c61478ddb2ee03dafa5c8d660cdb3dc376579b93e120234fd4a56b6e  packages/db/migrations/002_runtime_grants.sql
70106a564616aa1df6f2cf5f4df2aef72ef4fffc114d6e9647652c171cef56cc  packages/db/migrations/001_identity_sessions.sql
0d2dee12be068b4e08b43248ccb83e93b4a3086594a35cd7b2c8b048ec60b9bf  packages/db/tests/roles.integration.test.ts
7a65c8f4514b8f9ca501d7c1e22be5657e1ce20cf8b32081b17a92faf3afb383  packages/db/tests/helpers.ts
a839064980ca915bd1042bcda3ccdd70a5fa3204376b12f6cad5b60eda45b9d7  packages/db/tests/migrate.integration.test.ts
fde3684ec512f86fa17b7a864281a960bebb0ecd5586128a4596ff849c6f7e79  packages/db/tests/auth-repository.integration.test.ts
44711b55e5dc406d5af7addbad1115a47ac8c8b7633f993014c33c250ca890ae  apps/web/tests/session.test.ts
0b3b576e6ebd707deda2f74337d7f019ad267b2ec78eb2f7e54f8f804422e7a6  apps/web/tests/auth-config.test.ts
a67e874f47691ef996ad6a4694bec37704042e8107d5af2dda1a6258a217b09c  apps/web/tests/password.test.ts
c4ef1904b8d6909263c780640dc8b3b334b371e78e37a7f0db35597e3a7b1d3d  apps/web/tests/kdf-admission.test.ts
c8eec6375c14d49f84ab241330f3faf5f268feb4e5a4b07575df5a1e064c9a58  apps/web/tests/credentials.integration.test.ts
```

Changes detected at receipt creation, explicitly announced by coordinator for fixes (unreviewed):

- apps/web/src/lib/auth/config.ts
- packages/db/src/pool.ts
- apps/web/tests/auth-config.test.ts

Additional inspected source/documentation inputs, outside the core pin. Hashes measured at receipt creation; changing integration/dependency inputs are observational only:

```text
b718f42664ce6f0a22265df08f18f39ac29eeec6c7be5ba41279d29f890b826c  CLAUDE.md
30bfab6c7459af5c7df8da2fd28922214db50b0dbf17d8fdf610bf7c6a821bdc  docs/foundation-contract.md
b235e4f6ae330459262df674668d5c9b283c660ba9a32f383851fc9398f92a89  docs/features/foundation/01_specification.md
6b9e8692d2d0b6789cc3a29eee666ef8158f40f3659a7a5e3b9fb914cfe88f23  docs/features/foundation/02_pseudocode.md
0d55c0338b9663a672ea8a5c6d2c19210f7c4ee495811f7c382f129d429a4cd0  docs/features/foundation/03_architecture.md
7b03879fc0264c5392cc2997c1d636fd9acc035654da650479722aa8cd839abc  docs/features/foundation/04_refinement.md
d934f719b923fec5c85ad5aaf50b0dc0121346e5fcc492a110beeddafe4f8507  docs/features/foundation/validation-report.md
b741b3a05d448631b4f90d34bc010cadce13368170e5a098d697507ffee6c93d  scripts/init-foundation-db.sh
e4fe6f40a5115fabeef7998017147519777ca59aed7819d1880a7a98a989523f  scripts/start-web.ts
6f304776edaabde2954cbf8c4366fa6d9512bfba0e408e78cc56b3c46c69d058  node_modules/pg-pool/index.js
992c12d10cd42ece06b0b224601fa783a02ed08f3ace8bd8089cc441b6308abf  node_modules/pg/lib/client.js
6b6548f99acba3502663a17a180582ba8e1f1725aa9d94b5f47cac19dcb6211b  node_modules/pg/lib/connection-parameters.js
6523b5d5ad961775b9befa691edccf8080a79da52b91142834f9e6f6d75eb5e3  node_modules/pg-connection-string/index.js
743d58c0b4dc25441b0974625d951e3aac5d04cdaae4ffd5cab657d5fad51e98  .claude/rules/coding-style.md
16819fcb67636e1b573a45d872282bfba3b24451c3ec15d683c2e49260bede03  .claude/rules/security.md
6c070aade74e0e03f560a9d8a67a241dbe74488916f00b5c2bb82471e550869c  .claude/rules/secrets-management.md
4c824d7ece54503c050df046232e577d916835261b892f5fae4522ab3e549be4  .claude/rules/testing.md
```

Repository instructions inspected, relative to /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects:

```text
3f1e27b17ed1671988bafef56fe5d6c47680bf6efb87601ba1764a8eb347f241  CLAUDE.md
f49957f8bac6b55ab49bb953867b1aa3d6d658f4a1d24eddec5b05a71a07da54  .claude/skills/brutal-honesty-review/SKILL.md
cc958dec9cd12d0a83b0662fdb57d5a3f0874535f36bdf1d1e7b424f4660e1d9  docs/development/model-routing.md
22ba852701d2c78b372cb07ed9b53f4227799ff6f8dc9c57849c09d0c35829cd  docs/development/model-routing-telemetry.md
422a1d1952f7755c1ea772b33e9e41e1bd78a239af8a0a490f03bc48eb4e0c70  .claude/rules/complexity-router.md
c71a216dbc3fd633c30949823ceac354f8439b96279a1a8dd606afb1b3ef5c45  .claude/rules/swarm-file-evidence.md
02c4ec35e724db1c2001c7070037b565802087af76d2349a447fda1d454f03bd  .claude/rules/security-operation-order.md
dde3be22d932418dacb52364b744979a95fc98ca14e1b6917a6d952b261827b3  .claude/rules/fail-closed-defaults.md
089000585e52deb6026bc1e60cf647d203bddfa4a751fb0bab33dd46e3450733  .claude/rules/silent-fallbacks.md
7b4ce52be26f4fb9950a117c014fdc1aa6987ef46eb4b5b2daea1ae5e9191d5c  .claude/rules/guard-must-be-able-to-fail.md
```

Model policy overrides the skill findings quota. Source security assessment used technical precision without invented findings. Root owns run/events and final acceptance; source fixes now require a separate review attempt.
Completion timestamp: 2026-09-09T20:27:47.771506+00:00

Status: completed
