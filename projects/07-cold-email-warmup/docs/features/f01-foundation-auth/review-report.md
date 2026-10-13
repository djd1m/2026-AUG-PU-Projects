**Verdict:** ACCEPT — code review only; source `cdacc97bdb4cbbc08a38d8b43227e0b05c28917d`; Spec-SHA256 `8c8603677811889b7ce9fb1498d689820bdee0fdc14276c4e0949cdd252afc23`.

Accepted code with auth E2E pending. No concrete in-scope AC/security code finding was established. This does not close the mandatory browser gate or declare F01/the N7 MVP done.

## Scope and independent method

RUN_ID `20261002T192500Z-f01`; WORK_UNIT_ID `n7-f01-astra-review`; attempt `review-1`. Reviewed the specified auth, configuration, database, HTTP, startup/migration, page, SQL, Docker and package files, both auth test files, and the three evidence scripts. Read the six feature AC and canonical FR-n7-001, safety-v1 numeric limits, and identity algorithm steps 1–3 before reading the author's receipt. Reviewed correctness, security, architecture, resource use and test assertions serially.

Root/project instructions, applicable rules, brutal-honesty-review and project-work-companion were applied. The owner overrides the skill's minimum-findings requirement. Profile: `compact-quality-first-v2`; inherited XL feature context, bounded independent REVIEW only. Requested model/effort: `gpt-6-astra` / `high`; actual model/effort and usage are unverified (`null`), not inferred from the launch request.

No source edits, child agents, network calls, Docker/build/PG regression runs, browser runs, commits, pushes or ledger edits were performed. Mailbox reads plus database fixtures establish the F01 tenant boundary; authorized mailbox mutations intentionally return 405. Provider credentials, transport, payment, consent implementation and the full cabinet remain F02+ scope.

## Obligations and verdicts

Evidence paths below are relative to `docs/telemetry/features/20261002T192500Z-f01/`. PASS means source inspection plus the existing, reconciled runtime evidence; it does not mean tests were rerun by this reviewer.

| AC | Verdict | Independently checked obligation and evidence |
|---|---|---|
| AC-F01-1 | PASS | `Dockerfile` pins Node22.20.0; Compose pins PostgreSQL16.10, has a dedicated network/volume, no DB host publication, and a variable loopback web port. `src/main.ts` migrates before listening; `src/db.ts` readiness queries migration version and returns false on DB errors. `evidence/build.txt`, `node22.txt`, `compose-ports.txt`, integration readiness assertions, and `db-readiness-fault.txt` support runnable/migrated service, both probes returning 503 with DB stopped and 200 after restoration. |
| AC-F01-2 | PASS | `src/auth/session.ts` creates random 32-byte opaque tokens, HMAC-SHA256 digests and absolute 604800-second expiry. Only the digest crosses the store boundary. Registration inserts tenant/account/session in one transaction; duplicate rollback cannot grant the existing account. `store.ts:33` conditions login grants on current password hash and active account/tenant under row locks. `store.ts:41` rejects revoked, expired and inactive identities; logout awaits durable revocation before clearing the cookie (`server.ts:63`). Unit and integration receipts cover token/cookie/TTL, usable registration, two logout cycles and inactive/expired rejection. |
| AC-F01-3 | PASS | Origin rejection precedes writes (`server.ts:39`); API identity comes from the session, never request tenant input. UUID validation precedes parameter-bound `WHERE tenant_id=$1 AND id=$2` (`store.ts:48`). Integration asserts own 200/foreign 404, malformed/SQL payload 400, absent/forged/revoked 401, bad Origin 403, and unchanged mailbox snapshots. `evidence/tenant-mutation.txt` contains the actual `200 !== 404` failure after removing the tenant predicate, with restoration followed by a passing integration receipt. This proves the read guard, not future mailbox writes. |
| AC-F01-4 | PASS | `src/auth/password.ts` checks 8–200 Unicode code points and <=800 UTF-8 bytes before KDF; native hash uses Argon2id v19, m65536/t3/p1, random salt16 and output32. The exact PHC whitelist includes canonical base64 and rejects unsupported costs/lengths before verify. The default admission object is process-wide: max2, no queue, immediate 503/Retry-After1, release in finally. Unit tests check invalid inputs cause zero KDF calls, PHC rejection, saturation/free-slot progress and exception release. Real-PG registration asserts native stored hashes satisfy the exact format. |
| AC-F01-5 | PASS | `store.ts:51` uses atomic PostgreSQL UPSERT counters in short transactions and fixed UTC 900/60/3600-second windows: login normalized-email5 and socket-IP10; registration socket-IP5. Counters commit before 429 is thrown; wrong/duplicate credential attempts are charged before KDF. `server.ts:50` normalizes email and ignores forwarding headers. Integration asserts concurrent ceilings, persisted rejected attempts, resets, unrelated-key progress, wrong-password counting, HTTP Retry-After and forwarded-IP spoof resistance. |
| AC-F01-6 | PASS | `evidence/checks.json` records exit0 for Node22/typecheck/lint/unit/integration. Actual TAP receipts show unit5/5 and integration8/8 (seven subtests plus parent), including the post-log-fix rerun. Build output contains successful `tsc` and image export. The secret-canary assertion and final scan receipt agree with typed API errors and corrected PG log settings. `reuse-implementation.md` records five exact donor fragments, revisions/digests and adaptations; `dependency-licenses.md` records direct/transitive versions/licenses and explicitly distinguishes optional lock-only entries. |

## Source and evidence reconciliation

HEAD is the assigned source and the reviewed tracked worktree was clean. The only pre-existing untracked files were the caller's review launch and manifest. The launch hash is exactly `85846d2040fd68796726fe2296273954e4e0f012dfa1b9226f14a7a54764ea5a`; its bytes remain unchanged.

Independently SHA256-compared all 19 files in `evidence/build-inputs.json` with this worktree: 19 matched, zero mismatches. The evidence's implementation revision `f32ab9bedd7658a6afffcd2890f34950af6aa0bf` differs from the assigned revision only in N7 telemetry files; source, tests, dependency lock, Dockerfile and Compose are unchanged. This reconciles reuse of the recorded checks. The running image was not inspected again; `image_matches_source` remains the author's recorded runtime observation.

Canonical `docs/Specification.md` SHA256: `9faaacfa11f4c6351f936d26e1ee74839eadab6b47289a7d1890ba5878dd211c`. Canonical `docs/Pseudocode.md` SHA256: `4cfb8ac0df218e1e16eefa418d76414d9c928ecc4da63ec0c05cc3578bcc4011`. The first-line Spec-SHA256 identifies the feature's six-AC specification, not the canonical document.

The scripts were read, not executed. `check-f01.py` captures actual command output and exit codes and stops on failure. `check-tenant-mutation.py` requires the specific foreign-read assertion to fail, then restores source in finally; the post-correction integration receipt corroborates restored behavior. `check-secret-scan.py` checks runtime key/password values and the synthetic canary prefix in own Compose logs and scans project files for runtime secrets. Its statement about the API canary is supported separately by the integration assertion. No runtime key files, environment dump or runtime log dump were opened during this review.

The stored audit JSON reports zero known vulnerabilities at implementation time; no fresh advisory check was attempted. License/provenance records were reviewed as the required recorded evidence; installed dependency contents and donor repositories were not independently reread.

## Architecture, performance and remaining gate

KDF work and request-body reads occur outside checked-out DB transactions. The shared DB pool is capped at6, connection acquisition at2s and statements at3s; rate-bucket locks end before KDF. Grant/revoke operations and tenant predicates match the scoped identity algorithm. Native KDF memory is bounded by two simultaneous 64MiB operations, excluding ordinary runtime overhead. No measured p95 or broader load-test claim is made.

Concrete findings: none. No optional polish or F02 features are requested as review fixes.

Mandatory next gate: source-bound auth UI browser E2E through the approved shared Playwright environment, with readiness preflight, 390/1440 layouts, keyboard flow and session persistence/logout checks. It remains PENDING and was explicitly excluded from this review's execution permission. Shared browser-container health is not application acceptance.

Review timing, unavailable actual-model/usage fields, limits and terminal status are recorded in [astra-review-receipt.md](../../telemetry/features/20261002T192500Z-f01/astra-review-receipt.md).
