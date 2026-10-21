# Foundation implementation receipt
RUN_ID: 20261013T220722Z-foundation-654d
WORK_UNIT_ID: foundation-author-1
Project root: /tmp/n8-foundation-author-20261013/projects/08-interior-ai-redesign
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4 + coordinator supplied manifests/source
Canon SHA256: 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d
Profile: compact-quality-first-v2, overall XL approved autonomous; mechanical explicit paths S lower bound overridden by auth/schema/private invariants.
Actual model: null (no authoritative host metadata); usage/cost: null (not exposed).
Started: unavailable in child host metadata; coordinator launch record is authoritative. Exact child elapsed is not reconstructed from memory.
Preflight: not_applicable (implementation; actual E2E remains coordinator-owned).

Before code read root/project CLAUDE, project rules, routing/telemetry, companion, foundation five documents+validation/reuse, canon, dispatch and authoritative Specification/Pseudocode amendments. Reopened original N6 auth.ts, auth-store.ts, auth-handler.ts (http.ts absent), pool.ts, migrate.ts, tests/auth.test.ts. Existing fresh local 01–07→GitHub reuse record retained. Applied adaptation: pure injected auth ports; bcrypt and crypto separate; donor hash-before-DB and dummy comparison retained; stricter exact Origin, socket peer and PG atomic rate replace donor permissive Origin/XFF/Redis. Domain no N6 imports. No provider/network code copied.

Canonical brain recall: original root `dz recall 'аутентификация сессия защита origin лимит запросов bcrypt 72 байта N6 N8'`, exit0, no matching patterns. Therefore no unobserved memory lesson claimed. Parent bounded-time/one-pass rule applied.

Requested model: Astra high; actual model/effort remain null. No fallback claimed without launch metadata.


## Delivered contracts

- Pure `@n8/domain/identity` AuthService uses AuthStore, PasswordPort, TokenPort, Clock. Validation rejects password above72 UTF8 bytes before bcrypt and enforces12 character minimum. New/duplicate register both neutral201, duplicate token has no session. Credentials/server session fields stay outside browser DTOs.
- Concrete PgAuthStore sessions check active status, expiry and revocation; bcrypt cost10 and HMAC/random32byte token adapter. Pool max10/timeouts retained from N6 without its runtime dependency.
- PgProjects owner predicates, CAS, quota20 under account lock, stable cursor pages<=50 preserve PostgreSQL microsecond timestamps. Archive takes spend mutex80913001→account→project; revokes links, releases both origin-day budget holds plus credits for only undispatched jobs, increments fences, leaves uncertain/dispatched costs held.
- Pre-body actor/peer/atomic rate/Origin/owner/If-Match gate precedes one bounded JSON reader256KiB/10s. Auth10/min/IP and mutations60/min/account count invalid attempts before parsing. Domain errors and logs expose only allowlisted metadata.
- Custom Node sole listener sanitizes raw and normalized forwarded/reserved headers from socket, normalizes mapped IPv4, rejects duplicate security headers. CSP nonce/security headers; actual loopback test proves spoof replacement. No Next-start/standalone entrypoint introduced.
- Lazy getBase binds server config/pool/auth/projects/rate. Runtime manual/demo/live and off/live strict, missing live capabilities refuse without provider call. Health checks schema SHA+storage readiness. Runtime configuration field names sent to coordinator and accepted.

## Check ledger

| Check | Result |
|---|---|
| `npm ci` isolated worktree | exit0,193 packages; audit200 packages0 vulnerabilities. No original node_modules symlink. |
| `npm run typecheck` | exit0 after schema/helper arrival and final owned source changes. |
| `node --env-file=/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/test.env node_modules/vitest/vitest.mjs run tests/foundation` | exit0;26 tests/5files; final full pass22:34:08 UTC,2.99s. Actual private PostgreSQL, unique schemas, no skips. Updated helper excludes public search_path. |
| Same command restricted to `tests/foundation/health.test.ts` | exit0;1test;22:34:36 UTC after root changed runtime migration directory lookup. |
| `npm exec eslint -- packages/domain/src/identity packages/adapters/src/auth.ts packages/db/src/pool.ts packages/db/src/common.ts packages/db/src/identity.ts apps/web/src/server apps/web/src/server.ts apps/web/src/app/api apps/web/src/app/health tests/foundation --max-warnings 0` | exit0. |
| Initial full `npm run lint` | exit1; only existing root-owned build-cjm.cjs require-style imports. Root added explicit.cjs override; final full lint exit0. |
| Initial `npm run build` | exit1; root schema.ts static newURL directory rejected by Webpack. Root corrected runtime migration directory resolution. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | exit0; Next15.5.27 compiled, typechecked, generated all8 foundation API/health routes. Next plugin warning informational. |
| Rate production mutation `allowed: count<=limit`→`allowed:true` | targeted PG59+20 scenario failed exit1, expected1 admission got20. Restored original in finally. |
| Owner production mutation actor predicate→non-null actor parameter | targeted foreign-read scenario failed exit1 because private DTO resolved. Restored original in finally. |
| Domain dependency mutation and DB bcrypt mutation | both rejected inside passing auth purity test. |
| `git diff --check -- projects/08-interior-ai-redesign` | exit0 (tracked baseline subset; new-file contents additionally linted). |

## AC evidence

All paths below are real files in tests/foundation; every named scenario passed in the final full run. These are foundation-scope checks, not a claim that later modules or final browser integration have passed.

| AC | Exact test title and file |
|---|---|
| AC-foundation-1 | integration.test.ts — SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted; SC-US-001-1 real auth HTTP register neutral201 + login cookie then logout204 revokes |
| AC-foundation-2 | integration.test.ts — SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted; auth.test.ts — SC-US-001-2 missing/wrong/disabled accounts have same failure and dummy compare is performed |
| AC-foundation-3 | auth.test.ts — SC-US-001-3 permits 72 UTF8 bytes, rejects 73/multibyte suffix before hashing for register/login |
| AC-foundation-4 | integration.test.ts — SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields |
| AC-foundation-5 | integration.test.ts — SC-US-002-2/019-1 foreign and missing resources same404; ownership/CAS persists through races; archive revokes links, releases predispatch origin-day reservations/credits once, retains dispatched uncertain holds |
| AC-foundation-6 | http.test.ts — SC-US-016-1 exact Origin required after atomic rate and before body; foreign owner returns404 without parsing |
| AC-foundation-7 | integration.test.ts — SC-US-016-2 atomic PG 59 attempts then 20 concurrent admits exactly one; rejected attempts counted; SC-US-016-2 HTTP concurrent edge returns one200 nineteen429 Retry-After and no body reads rejected (HTTP uses auth10 cap; mutation60 covered by direct realPG concurrency) |
| AC-foundation-8 | integration.test.ts — SC-US-016-3 route mutation saves, envelope camelCase, me private response safe; foreign HTTP read404 |
| AC-foundation-9 | integration.test.ts — SC-US-002-2/019-1 foreign and missing resources same404; ownership/CAS persists through races (foundation project boundary; later feature child relations remain those features’ tests) |
| AC-foundation-10 | http.test.ts — SC-US-020-1 malformed/oversized/slow body is counted and bounded before parse; integration.test.ts — SC-US-020-1 invalid JSON counts before parse with no retained pool client; exact Origin failures count too |
| AC-foundation-11 | integration.test.ts — SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields (SQL inert parameterized storage; browser escaped rendering verification belongs final integration) |
| AC-foundation-12 | http.test.ts — SC-US-021-1 error envelope/log only allowlisted code/requestId/latency, never secret exception payload |

Additional actual checks: quota19+10→exactly1create;10concurrent CAS→exactly1write;20item microsecond cursor stable; real socket duplicate spoof removal; missing peer refuses XFF fallback; startup modes/fields strict with no fetch; actual schema drift/storage absence nonready.

## Pending integration and limits

Independent reviewer and anti-drift remain coordinator-owned. Root UI/layout force-dynamic was corrected after author build so request CSP nonce reaches bootstrap scripts; root will rebuild/browser-check its final integrated source. Initial author build used earlier root layout; no browser E2E or Compose startup is claimed here. Asset/entity relation implementations outside foundation are not claimed. No paid provider/payment call or public deployment performed. No model usage, cost or exact child wall duration available; do not infer savings. No commit created; coordinator integrates owned files only.

## Immutable owned output manifest

```text
42705e8a68f74b930d6fa69f66c9d8d590e5575a06383c0fafa1e1cedcf941c3  apps/web/src/app/api/auth/login/route.ts
befcbd4ea13e6e942cb3b9667dae8e52f8933d709d0b6d6afbb0b3fbeed305b2  apps/web/src/app/api/auth/logout/route.ts
1a22579578f85b0b068a601118e338694a7f64ec057a793e0dee1f55fdbb3d0e  apps/web/src/app/api/auth/register/route.ts
77fdf75c0754b6899551904849dd70840d208b5ef51dac388558265f8ce4658a  apps/web/src/app/api/me/route.ts
fa2e4be24f08c86dc8cac98dd84c7b7cf6877c6217c9d4f8248a733cdfbf3178  apps/web/src/app/api/projects/[projectId]/route.ts
92e7b6ad14229c7087816e8df37f73fe9b6bfb86d482d57df3c8ab1c7e555bf7  apps/web/src/app/api/projects/route.ts
e6bdb9588a69771021cf72cc325ff7f74b8b61eb2c4c0ea1d40ea99efef68512  apps/web/src/app/health/live/route.ts
0dea9aee1a9a3fc02bd3d3f7371d7771a60be4e3a104843aa4ad391f8d63cdd9  apps/web/src/app/health/ready/route.ts
3e9150e8e0378e22535e350a4da6f9dd83f0b78dd3c24c5fc05e2b29cad728f8  apps/web/src/server/composition.ts
8f0b31423e89dd0e127747f431d2c82577a438562705c5e75e53a8ff1aa61d04  apps/web/src/server/config.ts
25fd493389fa6c5d166907615afe2092acd12c1e77375e031a180b7c63de2267  apps/web/src/server/handlers.ts
574f2a779034e307085f06463cc868a51c663f2f8f4d1ccfddb936f664917902  apps/web/src/server/health.ts
ad7ab98f47370a80904aadb4e26e0ffda1265cabc6ba011bf902f32eb613ddb8  apps/web/src/server/http.ts
04052144e5a4024ead67f18045fd6165264c96caabf5b9a91dc57b2a1f6b022a  apps/web/src/server/peer.ts
70df6320afd67096ddda132c731d59e585aa7e067058e1631b891f1e0c6bc296  apps/web/src/server.ts
22cdd80db18672d976ff846407522545e82a0935947de2077e0fac1aa066305b  packages/adapters/src/auth.ts
bb26426dbf34b0bc1836c8907a59f0ea6205ff92967471c6ba9123c178bbcc40  packages/db/src/common.ts
32b104a883accb4b0d9f72d1e003de00a11b989f796a5fa51d3c9363c434ac46  packages/db/src/identity.ts
e0eab8ad9608d1b748dade8550757ed9bcacdf73e8997055a9ee577dc943ec88  packages/db/src/pool.ts
8c76bf41be719c1f0241af18dc960e5c9ba273e7f558e8775d3d810d3f3f9495  packages/domain/src/identity/index.ts
103956b4281774f3cc6d98f13471e6e64fb80f18d4882023b26db39c22b99684  tests/foundation/auth.test.ts
3571ee6df7183889210edb433e0de5f347eadca4fdb7e99cd6c438a4f570f3e6  tests/foundation/config.test.ts
7294b48bb117cec8009b0b9e86f1735ec5df5c8d9822d946ccbda92690a3f647  tests/foundation/health.test.ts
bab1db5f22017ea76a10233b6f8b34abcb82a63c8913ac791a150d0545da284a  tests/foundation/http.test.ts
49a6b278354426fceb88a8b57ce536527c4adf37533d47fa4dbff50a04609ba0  tests/foundation/integration.test.ts
```

Owned manifest SHA256: ab662a3c20cc85285bb99060c7f7e56c3b75461c9a960851b5e5735c08dcba79

## Read-only dependency/source fingerprints

```text
70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d  docs/canon.md
7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd  docs/Specification.md
af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59  docs/Pseudocode.md
5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee  docs/Architecture.md
560d87712b637d8da17454faf62484ec040cc630e2be5b7d442a5d097f3ba232  docs/features/foundation/01_specification.md
2aa816f397cb8d2cd4bda083d1e39cf4a934a57ec37f75c9e6aff68c7b13ad63  docs/features/foundation/reuse.md
255b6c7c1f1c5270ed84708648d52eb96af98faab429952db9c07b4703b5a45b  packages/domain/src/common.ts
630ff6aa33f6852b7054c89b9079952f760966f08357459a6ae96c035f6f7d62  packages/db/src/schema.ts
4eb8adf1de23f115b01cda969cc44576c72e04a423ec126fa826042428d09080  packages/db/src/migrate.ts
c24a4540d2f4c27dee11a51388eb914cd838853c4a43fe150d7febad58692f98  packages/db/src/migrations/001-initial.sql
a7b404328b879f31b1cd310c84f0f40055f81086ab0f053389887ef758618232  tests/helpers/db.ts
b0cf6f0a07d19e75169b3c60f302daa890a29a2b3e2d13a0134b89570d9b1a2d  package-lock.json
0b8b0035ad3ce26fc2e6af8f685488e25b850481b250856fa338aabc99a9c165  eslint.config.mjs
1955db25e4bf39f829c174dc28c13cd41a55927270875dfedb45c8d8abaf8dd1  apps/web/src/app/layout.tsx
```

Finished at: 2026-10-13T22:36:31.966232+00:00
Acceptance: pending independent review and integrated source/build/browser closure. Bounded author implementation/check artifacts delivered.

Status: completed
