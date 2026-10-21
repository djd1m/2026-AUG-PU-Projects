R1 correction receipt

RUN_ID: 20261002T201500Z-f02
WORK_UNIT_ID: n7-f02-sol-r1
Attempt-ID: correct-1
Source-Revision: 67aee9f8158ea0321bf800ba5cf3b35e75507f66
Spec-SHA256: 651a803c327b9b8282085d661ddcca68d7bba5e63fc67b5bc3c6faf0135cf76e
Launch-SHA256: b0f5f7ba5f9f8c3dfff0918389d978c03a73b1a1a31e9e14712f6a70f1372356
Build-Revision: sha256:c8f2c91a37f6cbd51c47abfe6b57a1b24ed2d8be97c84604cd9ffc5c9d98f999
Corrected-Source-Snapshot: evidence/r1/source-snapshot.json
Corrected-Source-Snapshot-SHA256: c8f2c91a37f6cbd51c47abfe6b57a1b24ed2d8be97c84604cd9ffc5c9d98f999
Image-Digest: sha256:38ba08e3e736eb8cc4fb334ea12c765265bc00ef71085016cfa47f8865ed48ce
TRACE_PATH: /tmp/n7-f02-r1/projects/07-cold-email-warmup/docs/telemetry/features/20261002T201500Z-f02/sol-r1-receipt.md
Profile: compact-quality-first-v2
Requested-Model: gpt-6.1-sol high
Actual-Model: null
Actual-Effort: null
Tokens: null
Cost: null
Measurement-Gaps: actual model/effort, usage and cost pending parent host evidence; active time unavailable. No inferred model switch or estimated usage.
Launch-Started-At: 2026-10-02T20:47:02.123032+00:00
Observed-Work-Started-At: 2026-10-02T20:47:29Z
Finished-At: 2026-10-02T20:57:19Z
Elapsed-Since-Launch-Seconds: 617.040
Verdict: PASS — confirmed R1 corrected; required checks passed; independent acceptance remains with parent reviewer.

Fixed finding: AC-F02-3 reserved/unallocated IPv6 in2000::/3 formerly passed. Native allocation membership now covers all36 ALLOCATED prefixes from the primary IANA IPv6 Global Unicast Address Space registry, updated2025-10-10; absent entries reject. Existing IETF/6to4/documentation and all IPv4 exclusions remain. Registry URL https://www.iana.org/assignments/ipv6-unicast-address-assignments ; retrieved CSV, digest and16,486 boundary/gap probes are in evidence/r1/registry-oracle.json. No four-address blacklist.

Regression:40 reserved/unallocated addresses, including exact2d00::1,3000::1,3800::1,3ffe::1, each tested alone and mixed with8.8.8.8 in both orders through resolveEndpoint and verifyTest; unsafe_address and zero injected adapter calls.26 allocated positive controls and existing public controls retained. No socket/mail connection.

Commands and exits (project cwd unless noted):
- Root: bash scripts/complexity-router.sh projects/07-cold-email-warmup/src/mailboxes/network.ts projects/07-cold-email-warmup/tests/mailboxes-unit.test.ts →0, mechanical M; bounded correction inherits authorized F02 XL. No shared-resource change; full regression preserved.
- taskset -c 0,1 node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/mailboxes-unit.test.ts →0,5/5 affected tests (evidence/r1/affected-unit.txt).
- python3 scripts/check-f02-r1.py →0;16,486 registry oracle probes,0 mismatches. Reserved predicate mutant and DNS bypass mutant each exit1 with meaningful assertion/rejection failures; exact source restored (separate mutation logs).
- bash ../../scripts/check-port-conflicts.sh . →1, expected occupied own18702. Ownership-equivalent preflight →0: n7f02/web, loopback only, no DB published port, own network/volume, CPU2 (preflight.json/port-check.txt).
- bash scripts/check-f02-r1-heavy.sh →0 (heavy-checks.txt). Exact constituent commands and exits:
  taskset -c 0,1 npm run build →0;
  env DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f02-web . →0;
  docker compose -p n7f02 up -d --no-build --wait →0;
  docker compose -p n7f02 exec -T web npm run typecheck →0;
  docker compose -p n7f02 exec -T web npm run lint →0;
  docker compose -p n7f02 exec -T web npm test →0,10/10;
  docker compose -p n7f02 exec -T web npm run test:integration →0,14/14 (full required F01/F02 realPG),0 skips/failures.
- python3 scripts/check-f02-r1-evidence.py →0; immutable30-file local snapshot matches and29/29 image-copied files match in Nodev22.20.0 (Dockerfile not copied). Image digest recorded above; own-stack/project runtime-secret and canary scan pass, values suppressed.
- Root: git diff --check →0.

Safety and provenance: /tmp/n7-f02-heavy.allowed checked before Docker/PG. RAM>=2,500,000kB and CPU affinity0,1 checked under /tmp/codex-heavy-build.lock; lock explicitly released immediately after actual checks. Existing own synthetic stack only, tests own reset, no broad kill/removal. Existing heavy script blocks on its own occupied port, so equivalent script retains all checks and commands with explicit ownership reconciliation. Donor node_modules reused by symlink after exact package-lock comparison; no npm install or donor writes. Symlink removed after checks. Prior source/test/runtime evidence and caller launch/manifest bytes preserved; only network source and mailbox unit test differ in30-file snapshot.

Attempt limits/gaps: initial shell creation had wrong cwd (exit127), corrected before any heavy execution. First mutation harness returned1 because its expected TAP text included quote characters; substantive mutant was already red, assertion text corrected and both mutants proved. Two initial flock -w1 attempts exited1 without heavy execution; bounded45s acquisition succeeded. Initial attempt logs preserved. No independent agent/review spawned; parent performs acceptance. UI E2E not_applicable (F06). No auth/consent/API/schema/UI changes, dependencies, live SMTP/IMAP, charge, LLM, deploy, proxy changes, push or other stacks. All authorized correction checks completed within600s; spend/efficiency comparison unavailable.

Status: completed
