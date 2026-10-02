# N7 F01 implementation receipt

WORK_UNIT_ID: n7-f01-sol
RUN_ID: 20261002T192500Z-f01
Attempt: implement-1
Profile: compact-quality-first-v2; sole coding unit explicitly requested gpt-6.1-sol/high. No agents spawned.
Actual model/effort: null. Host runtime proof is unavailable; requested metadata is not treated as actual.
Usage tokens/cost: null; no measured billing metadata. Active wall time: null (intervals not independently measured).
Start: 2026-10-02T19:23:01.853875+00:00; finish: 2026-10-02T19:41:13.396519+00:00; elapsed: 1091.543s of hard1500s.

## Source and build binding

Assigned baseline: `4947df93a610f98a0bae34a263ae51fa35127aee`. Output code/config revision: `f32ab9bedd7658a6afffcd2890f34950af6aa0bf`.
Implementation commit: `d7d52b3b`; concrete log correction: `f32ab9be`. Receipt-only commit follows.
Launch preserved byte-for-byte: SHA256 `f5c8253dda4b455c790c5961e7b90ae9aefec4cbde07606db275de824c2cecb6`.
Receipt manifest preserved; neither preallocated file is edited or included in worker commits.
Caller launch spec_sha256: `8c8603677811889b7ce9fb1498d689820bdee0fdc14276c4e0949cdd252afc23`; its input set was not defined to the worker and differs from the canonical file digest below. Canonical Specification/Pseudocode bytes were compared to git baseline and are unchanged.

| Source | Actual SHA256 |
|---|---|
| `docs/Specification.md` | `9faaacfa11f4c6351f936d26e1ee74839eadab6b47289a7d1890ba5878dd211c` |
| `docs/Pseudocode.md` | `4cfb8ac0df218e1e16eefa418d76414d9c928ecc4da63ec0c05cc3578bcc4011` |
| `docs/Architecture.md` | `221f517d7d469c7f33ca4c97855b1bf007ffdbc3563442e03fd5663743b824c6` |
| `docs/tests/security-scenarios.md` | `5f5efc82aae396982928591c5c8a8ba736a83337078f12ce1d73708927ec4591` |
| `docs/features/f01-foundation-auth/01-specification.md` | `8c8603677811889b7ce9fb1498d689820bdee0fdc14276c4e0949cdd252afc23` |
| `docs/features/f01-foundation-auth/02-pseudocode.md` | `8374ad727fda2872d384ab6c30419e7291687c28e2bdd374934312fc90432c10` |
| `docs/features/f01-foundation-auth/03-architecture.md` | `5fa3337a6ace31083c5b7aee436a82dc184146dfd4555fda2dd45af5615c19c8` |
| `docs/features/f01-foundation-auth/04-refinement.md` | `bb1f6cf2f53d8472e1b424c6ac692d793446559fde6ab40227c17366bffc4a73` |
| `docs/features/f01-foundation-auth/05-completion.md` | `a626345250e1774b6e62c705c433af4d53a19d6df94dd3044c5dd65ce28de8a9` |

Build-input snapshot SHA256: `9596eaea1f3da13e9f5aba7ea24b4d0afea4f9cd2e040485b822fdeb8df00d7c`. `evidence/build-inputs.json` records each copied input; running image input hashes exactly match frozen source.
Web image: `sha256:6a77e7410ef8d66f032f6cbbbf1afd2631b9c53d033ebbc403b075b016db465f`; Node22.20.0. DB image: `sha256:38471f330eb885e04de130b768d6db4e10469e2311879c7e5c699f6d2d8a1c74`; PostgreSQL16.10.

## Implementation and reuse

Native HTTP/strict TypeScript; transactional migration and tenant/account/session/auth_bucket/minimal mailbox metadata. Registration does not grant consent. Exact Argon2id v19 m65536/t3/p1/salt16/output32; Unicode8–200 and <=800UTF8bytes checked before KDF. Singleton KDF admits2/noqueue,503/RetryAfter1, finally release. Normalized-email5/15min + direct-socket-IP10/min login and IP5/hour registration use durable atomic fixed UTC UPSERT buckets; rejected attempts remain counted.
Random32byte opaque token; only HMAC-SHA256 digest persisted; external>=32decodedbyte key; absolute7day TTL. Cookie HttpOnly/SameSite=Lax, Secure for HTTPS; durable revoke before clearing. Active account/tenant and current password-hash checked atomically under row share locks for grants. Tenant-derived UUID mailbox query, foreign404, malformed400. Mailbox mutations deliberately return405 after authorization; F02 is excluded.
Adaptations and exact five donor source SHAs/digests: `docs/features/f01-foundation-auth/reuse-implementation.md`. N3a native KDF/bounds retained; queue and salt16–64 rejected. N1 HMAC retained; TTL30days/key16chars rejected. N5 AuthStore retained, bcrypt/imports rejected. N6 active grant/revoke retained and tenant guard added. No donor assets/docs or unrelated source were copied.
Pinned installed direct/transitive metadata licenses: `docs/features/f01-foundation-auth/dependency-licenses.md` (145 installed lock entries, 44 optional platform entries explicitly marked lock-only). All installed entries have license metadata; no inferred repository OSS license. Owner-authorized internal reuse. Registry audit:0 known vulnerabilities. ESLint9.39.1 installation reports deprecated upstream support; retained pinned tooling passes lint and audit.

## Commands and results

Commands ran in `/tmp/n7-f01-sol` or N7 project cwd; no secret values/headers were printed. Heavy grant `/tmp/n7-heavy-tests.allowed` checked before build/PG suites. Dedicated runtime CPU2 and test file concurrency1; all checks sequential.

| Command | Exit / result | Evidence |
|---|---|---|
| npm install --save-exact pg@8.16.3 @node-rs/argon2@2.0.2; dev versions in manifest |0; hostNode20 engine warning; final runtime checkedNode22 | package-lock.json |
| bash scripts/complexity-router.sh (four explicit F01 paths) |0; S mechanical lower bound; substantive inheritedXL | sol-run.json |
| npm run typecheck; npm run lint; npm test (host) |0 /0 /0, unit5 passed; initial lint before tests existed exited2, resolved by creating planned tests | final Node22 evidence below |
| scripts/local-runtime.sh |0; keys present, values suppressed | external/tmp files only |
| bash ../../scripts/check-port-conflicts.sh . |0 before first launch; own binding verified for later recreation | build/runtime evidence |
| docker compose build (grant present; twice because HTTP media-type predicate changed) |0 /0; native addon/build work inNode22 | evidence/build.txt |
| docker compose up -d --no-build --wait |0; own db/web healthy | evidence/runtime.txt |
| docker compose exec -T web node --version |0| evidence/node22.txt |
| docker compose exec -T web npm run typecheck |0| evidence/typecheck.txt |
| docker compose exec -T web npm run lint |0| evidence/lint.txt |
| docker compose exec -T web npm test |0| evidence/unit.txt |
| docker compose exec -T web npm run test:integration |0| evidence/integration.txt |
| python3 scripts/check-tenant-mutation.py |0; deliberately broken tenant predicate makes foreign200!=404 and suite exit1; restored source | evidence/tenant-mutation-result.txt |
| docker compose exec -T web npm run test:integration (after log correction) |0;7 subtests + parent,8 passed | evidence/integration-after-log-fix.txt |
| npm audit --json |0;0 vulnerabilities | evidence/dependency-audit.json |
| python3 scripts/dependency-licenses.py |0; installed metadata + lock-only gaps | dependency-licenses.md |
| python3 scripts/check-secret-scan.py |initial1: synthetic canary inPG logs; final0 after concrete config correction | evidence/secret-scan.txt |
| node ../../.claude/hooks/check-ports.cjs . |0; no DB host port | evidence/compose-ports.txt |
| docker compose stop db; health/readiness probes; docker compose start db; probes |0;503 while down,200 after restore | evidence/db-readiness-fault.txt |
| frozen copied input hashes vs running image; git diff --check |0 /0 | evidence/build-inputs.json |

## AC evidence and handoff

AC-F01-1 PASS: Node22/PG16 Compose runnable, own network/volume, loopback configurable18701, unexposed DB, actual migrated readiness and DB-down503/restored200.
AC-F01-2 PASS: two registrations; exact hashes/digest/TTL; login/logout twice; revoked/expired/inactive account/tenant rejected; duplicate transaction rolls back and cannot enter existing account.
AC-F01-3 PASS: unauthorized/forged/revoked401, wrongOrigin403 and mailbox snapshots unchanged; own200, foreign404; malformed/SQLpayload400. Tenant mutation guard went red as expected.
AC-F01-4 PASS: unit before-KDF bounds/exact PHC/admission/finally; real native registration stored exact supported parameters. Third operation503/RetryAfter1, unrelated free slot succeeds.
AC-F01-5 PASS: realPG concurrent5-email,10-IP,5-registration boundaries, rejected attempts recorded, UTC-window resets, unrelated key allowed; wrong-password attempts counted and spoofed forwarded IP cannot evadeHTTP10/min.
AC-F01-6 PASS: typecheck/lint/build/unit5 and realPG integration8; error canary API/log scan; pinned metadata license report and donor adaptations.

Leave own containers running for review: `n7f01-web-1`, `n7f01-db-1`; network `n7f01_network`; volume `n7f01_pg`; URL `http://127.0.0.1:18701`. Runtime key files remain external under `/tmp/n7-f01-runtime`; only presence reported. Shared proxy/other containers/root manifests/toolkit symlinks untouched. No pushes, SMTP/IMAP/live charge/LLM/deploy calls or host browser installation.
Pending coordinator acceptance: fresh independent review and auth browser E2E via existing codex-ui-playwright1.63.0. E2E preflight is not_applicable in this coding unit; no browser pass claimed. Integration suite truncates dedicated local F01 DB; do not run on owner data. Later providers/AEAD/consent/full cabinet remain excluded; full N7 MVP is not claimed complete.
Forecast/savings: insufficient comparable telemetry; savings not established. Terminal status below means the bounded implementation/check unit completed, not independent feature acceptance.

Status: completed
