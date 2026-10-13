F01’s substantive implementation candidate is ready in the isolated worktree. Acceptance remains pending dependency/runtime checks and fresh independent review.

RUN_ID: `n8-20261002-1740`  
WORK_UNIT_ID: `n8-f01`  
ATTEMPT_ID: `n8-f01-attempt-1`  
Source-Revision: `6b93c0e5f5befcc22500ea8b35d80c0ca13bba2a`  
Launch-SHA256: `1b92d5a50074fc281d038491c28201a2014f6a4cecd269f1189622361dad4904` — verified against the launch file.  
Build-Revision: `873b4ae2d415a2736b306fd9346c6d5b3d2526d824cb3930c83fccec7afd7740` — immutable dirty-source snapshot; no container image built.  
Finished-At: `2026-10-02T19:49:52.511775+00:00` — partial observation timestamp.  
Verdict: substantive bounded candidate delivered; F01 acceptance pending.

REPO_ROOT: `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f01`  
PROJECT_ROOT: `REPO_ROOT/projects/08-interior-ai-redesign`  
TRACE_PATH: `PROJECT_ROOT/docs/telemetry/n8-20261002-1740/n8-f01-receipt.md` — this final response is the launcher’s receipt payload.

Implemented:

- Node22 ESM `node:http` API and static Russian UI following CJM A’s personal-room and photo steps.
- Register/login/logout/me, canonical email, 12–128-character passwords, bcrypt10 with a fixed-length password prehash, unknown-account dummy verification, random32-byte sessions stored only as HMAC, seven-day expiry and logout revocation.
- Transactional account, unique trial-credit ledger and session creation.
- Exact Origin checks,16KiB JSON limits, specified auth/public rate caps, bounded concurrency, bounded DB pool/timeouts and opaque errors.
- Private JPEG/PNG/WebP uploads with10MiB/20MP limits, matching magic and decoder format, orientation normalization, EXIF removal and UUID WebP storage.
- Owner-scoped list/read/delete, tombstones, failed-write file cleanup and bounded orphan sweeping.
- PostgreSQL16 migration, project-owned dependency manifest/lockfile, Dockerfile and isolated Compose configuration: loopback web, unpublished DB, private network and combined2CPU limit.
- Meaningful auth/upload interface that explicitly states redesign generation is unavailable.

N5 auth and N6 upload-cleanup sources were inspected at pinned revision `3b84e9ef` and adapted. Jobs, payments, workers, GPU inference, deployment and sharing remain outside this unit.

All paths below are relative to PROJECT_ROOT. Added24 product/test/configuration files:

```text
web/app.js
web/auth.js
web/boundaries.js
web/config.js
web/db.js
web/media.js
web/server.js
web/public/app.js
web/public/index.html
web/public/style.css
db/001-foundation.sql
scripts/check.js
scripts/migrate.js
scripts/mutation.js
scripts/sweep.js
tests/boundaries.test.js
tests/media.test.js
tests/integration.test.js
package.json
package-lock.json
Dockerfile
compose.yaml
.env.example
.dockerignore
```

Evidence/setup files are under `docs/features/f01/`: `README.md`, `attempt.json`, `events.jsonl`, `checks.json`, and `build-snapshot.json`. No other project files, shared manifests or historical telemetry were changed. The pre-existing launch file belongs to the coordinator.

| Check | Exit | Result |
|---|---:|---|
| Mechanical complexity router | 0 | Mechanical S; accepted parent XL retained |
| Offline lock-only normalization | 0 |49-package closure; no dependency installation |
| Node22.22.3 `scripts/check.js` | 0 | All JavaScript syntax passed; static build requires no bundler |
| Node22.22.3 `tests/boundaries.test.js` | 0 | Seven meaningful boundary cases passed |
| Node22.22.3 Origin mutation | 0 | Mutated guard caused the targeted assertion to fail, child exit1 |
| `npm test` | 1 | Seven boundary cases passed; media suite could not load absent `bcrypt` |
| `npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=5000` | 1 | Registry DNS failure, `EAI_AGAIN`; no advisory verdict |
| `docker compose config --quiet` | 0 | Configuration parsed using non-secret static placeholders |
| Explicit Compose port-conflict script | 0 | Static checks passed; running-container completeness remains unknown |
| `check-ports.cjs …/compose.yaml` | 0 | Configuration-only DB publication policy passed |
| Docker image-list probe | 1 | Docker socket permission denied |
| `git diff --check` | 0 | No tracked-diff whitespace errors |

The initial port-check directory invocation returned2 because it expected `docker-compose.yml`; the corrected invocation used `compose.yaml`. The initial mutation harness was inconclusive because captured subprocess pipes returned `EPERM`; using a temporary output file resolved it, and the standalone mutation rerun passed.

Required checks not run: dependency installation, real image/bcrypt suite, isolated PostgreSQL16 migration/race/session/revocation/HTTP/media/cleanup integration, owner mutation, and Docker build/start. The root heavy-build lease remained absent; Docker access was denied; registry access failed; no dedicated test DB was supplied. No fake DB pass was substituted. Actual browser E2E belongs to the integrated phase and was not claimed.

| AC | Coverage |
|---|---|
| AUTH-01 | Validation passed; atomic trial implementation present; real registration race pending |
| AUTH-02 | Implemented; runtime session/bcrypt/dummy-hash lifecycle verification pending |
| AUTH-03 | Origin/body/rate boundaries passed; actual HTTP-cap verification pending |
| AUTH-04 | Owner scopes implemented; real two-account test and mutation pending |
| UPLOAD-01 | Implemented; real decoder/size/orientation matrix pending |
| UPLOAD-02 | Implemented; real DB-failure and orphan-cleanup verification pending |
| SEC-01/02, applicable portion | Config/boundary/static Compose checks passed; startup/runtime/audit pending |
| SEC-03, applicable portion | Origin mutation passed; owner mutation pending |

Remaining material risks are unverified runtime/container behavior and dependency advisories. Orphan cleanup requires an operator scheduler; F01 provides the command but installs no scheduler. Password hashes use prehashing and are incompatible with raw-password donor hashes.

Pinned dependencies are `pg8.23.0`, `bcrypt6.0.0`, and `sharp0.35.4`; official maintainer package sources were inspected for [bcrypt](https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/v6.0.0/package.json) and [sharp](https://raw.githubusercontent.com/lovell/sharp/v0.35.4/package.json). These pins are not an audit pass or a claim of latest versions.

Profile: `compact-quality-first-v2`. Requested model/effort: `gpt-6.1-sol / high`. Actual provider-resolved model, fallback, usage and cost: `null`, unavailable. No subagents were spawned. Observed elapsed time:20m08.511s of the25-minute budget; active time is unknown. Savings are not established.

Telemetry: `PROJECT_ROOT/docs/features/f01/attempt.json`, with exact check records and source hashes alongside it. No commit was attempted because the worktree Git index resolves outside writable roots. The coherent candidate remains uncommitted for coordinator integration and fresh Astra review.

Status: completed