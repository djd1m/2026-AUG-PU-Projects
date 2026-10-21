# Foundation independent implementation review
Reviewer family: codex
Spec revision: sha256:560d87712b637d8da17454faf62484ec040cc630e2be5b7d442a5d097f3ba232
RUN_ID: 20261013T220722Z-foundation-654d
WORK_UNIT_ID: foundation-review-1
Attempt: foundation-review-1
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4 + immutable dirty source fingerprints below.
Profile: compact-quality-first-v2; consequential foundation review, XL approved scope.
Requested model/effort: gpt-6-astra / high. Actual model/effort: null; authoritative host metadata unavailable.
Usage/cost: null; no billing or token counters exposed. Fallback: null (not established).
Launch: docs/telemetry/p-replicator/20261013T220722Z-foundation-654d/review-launch.json
Implementation receipt sha256: c82840e1883038b6dc3e576945dd50f807865e656fede56e2cecfe419854398e
Author owned manifest sha256: ab662a3c20cc85285bb99060c7f7e56c3b75461c9a960851b5e5735c08dcba79; independently compared all25 files: all match.
Preflight: not_applicable — review and isolated PostgreSQL/handler checks; built-browser/Compose E2E remains integration-owned.
Verdict: corrections required; no confirmed critical/high vulnerability in reviewed foundation. Three medium implementation/schema findings, two low source-placement discrepancies, two explicit coverage boundaries below.

## Scope and method

Read root/project CLAUDE, model-routing/telemetry, risk/security/local rules, foundation01–04 plus validation/implementation receipt, and targeted canonical Specification/Pseudocode/Architecture. Applied brutal-honesty-review without its minimum-findings quota, as overridden by accepted routing policy and project reviewer instructions. Applied project-work-companion handoff/evidence boundary. `dz recall` in the canonical repository returned the bounded-review lesson: one independent pass followed by concrete fixes and affected checks. No additional agent, provider, payment, deployment or public action. Product code stayed read-only; the sole project write is this fresh receipt.

The 25 author-owned hashes match the immutable receipt. Root layout differs from the author's old build dependency: `force-dynamic` is present, required for request CSP nonces. Root SQL/migration/config/Compose/UI/script dependencies were reviewed separately. Static source review and passing factory/PG tests do not establish a built Next browser or container startup pass.

## Findings

- **FND-R1 — medium, confirmed: malformed cursor becomes server unavailable.** `packages/db/src/identity.ts:40–48` accepts any finite `Date.parse`, then `:74–76` casts the original string to timestamptz. Cursor JSON `{createdAt:"0",id:<valid-owned-uuid>}` passes JS validation but the actual PostgreSQL probe throws SQLSTATE `22008`; `apps/web/src/server/http.ts:72–76` maps this to503. This misclassifies client input and violates typed boundary handling (`docs/Pseudocode.md:231,277`). Fix timestamp validation for the exact emitted PostgreSQL format while retaining microseconds, or safely map input timestamp cast errors to400 INVALID_CURSOR. Add a production repository/handler regression for this value and retain the existing microsecond pagination test. No sensitive SQL error is exposed by the current envelope.
- **FND-R2 — medium, confirmed source/code drift: archive job work lacks project-leading index.** `docs/Pseudocode.md:48` requires indexed set-based archive work and `docs/Architecture.md:83` ownership indexes. `packages/db/src/identity.ts:103–105,119–121` filters jobs by project/account/state, but migration `:54–59` supplies only `(id,project_id)`, `(account_id,idempotency_key)`, `(state,created_at)` and admission indexes. Independent pg_indexes inspection confirms no project-leading job index. Jobs have no lifetime bound; scanning an account's accumulated jobs holds the global spend mutex and account/project locks. Fix an appropriate project-leading index for archive lookup/update; verify via catalog and the archive regression. No measured latency failure is claimed.
- **FND-R3 — medium, confirmed schema drift: unique audit event key missing.** `docs/Pseudocode.md:169` says insert unique eventKey and index kind/createdAt; `docs/Architecture.md:82` requires unique AuditEvent.event_key. `packages/db/src/migrations/001-initial.sql:108–111` has neither unique event_key nor kind/time index; actual pg_indexes contains only the primary key. Duplicate logical events could be inserted and later overcounted. Correct the schema before RecordGrowth/F6 relies on it, with a duplicate insert rejection/idempotency check. The growth endpoint itself is later-feature scope; it is not claimed implemented by foundation.
- **FND-D1 — low, confirmed canonical contradiction: Job idempotency scope.** `docs/Architecture.md:82` names `(project_id,idempotency_key)`; SQL `:54`, current immutable receipt and the account-wide replay algorithm (`docs/Pseudocode.md:103`) use account scope. Retain the stronger account-wide replay implementation and align Architecture to `(account_id,idempotency_key)` with a logged source revision. Do not silently change the database scope to match the stale line.
- **FND-D2 — low, confirmed placement discrepancy.** `docs/Architecture.md:28,34` promises domain ProjectStore/project caps policy with repositories implementing ports. Actual `packages/domain/src/identity/index.ts:57–66` supplies project schemas/DTO only; `packages/db/src/identity.ts:50–122` implements project policy/quota/archive transaction directly and no ProjectStore interface exists. AuthStore separation and domain purity are sound. Either explicitly document this small transactional repository placement as the accepted foundation design, or extract the promised port/policy when justified; a generic new abstraction is not required for safety.

## Spec conformance

Statuses below assess delivered foundation behavior; `met` does not claim final browser/operations acceptance. Test names are actual source titles and all passed in the reviewer run. Whole-product criteria copied into this feature remain unverifiable where their implementation belongs to later modules.

| Criterion | Status | Code and exact test evidence |
|---|---|---|
| AC-foundation-1 | met | Domain identity:35–54; db identity:13–30; handlers:7–19. `tests/foundation/integration.test.ts:29` — “SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted”; `:94` — “SC-US-001-1 real auth HTTP register neutral201 + login cookie then logout204 revokes”. The latter tests register/logout, while login is actually exercised at:31. Dashboard/browser flow still requires integration. |
| AC-foundation-2 | met | db identity:27–30 joins active account, expiry and revoked checks; http:26–28 rejects missing actor. `integration.test.ts:29` above and `auth.test.ts:24` — “SC-US-001-2 missing/wrong/disabled accounts have same failure and dummy compare is performed”. Additional reviewer probe disabled an account after session issue and confirmed authentication null. |
| AC-foundation-3 | met | Domain identity:5–9,26–29; adapter auth:8–14. `auth.test.ts:13` — “SC-US-001-3 permits 72 UTF8 bytes, rejects 73/multibyte suffix before hashing for register/login”; verifies compare/hash not reached for rejected bytes. |
| AC-foundation-4 | met | db identity:65–79,81–97; parameterized owner update and persisted read. `integration.test.ts:41` — “SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields”. Separate project remains unchanged. Full UI reload belongs integration. |
| AC-foundation-5 | met | db common:17–24 + identity:86–121; foreign read/write404, archive409, CAS. `integration.test.ts:49` — “SC-US-002-2/019-1 foreign and missing resources same404; ownership/CAS persists through races”; `:105` — “archive revokes links, releases predispatch origin-day reservations/credits once, retains dispatched uncertain holds”. Checks both old-day budgets and credit retention. R2 concerns its indexing, not correctness of tested transitions. |
| AC-foundation-6 | met | http:23–47 and peer:21–35. `http.test.ts:15` — “SC-US-016-1 exact Origin required after atomic rate and before body; foreign owner returns404 without parsing”; production foreign route assertion `integration.test.ts:75`. Exact Origin is the documented CSRF mechanism, not a separate missing token implementation. |
| AC-foundation-7 | met | db identity:124–130 atomic UPSERT; http:30–34 chooses mutation60. `integration.test.ts:60` — “SC-US-016-2 atomic PG 59 attempts then 20 concurrent admits exactly one; rejected attempts counted”; :131 checks HTTP auth10 edge. Reviewer additionally executed production PATCH handler against real PostgreSQL with mutation59+20: exactly1 HTTP200,19 HTTP429 with Retry-After, project version2. |
| AC-foundation-8 | met | handlers:36–43 + db identity:81–97. `integration.test.ts:75` — “SC-US-016-3 route mutation saves, envelope camelCase, me private response safe; foreign HTTP read404”; persisted name asserted after valid Origin/If-Match. |
| AC-foundation-9 | unverifiable | Foundation project boundary tested at `integration.test.ts:49,75`; composite scalar constraints in initial SQL:31,37,44,55–56,80,89,105,116–118 are present. This AC literally includes file/scalar/array/JSON relations across modules. No foundation child-file routes or transactional array/JSON validators exist yet. Keep full source requirement mandatory in F2–F6/integration and label the feature alias as partial coverage; project-only tests cannot close the literal whole-product criterion. |
| AC-foundation-10 | met | http:23–65: rate/Origin/owner precede sole JSON reader256KiB/10s and no transaction spans body. `http.test.ts:29` — “SC-US-020-1 malformed/oversized/slow body is counted and bounded before parse”; `integration.test.ts:67` — “SC-US-020-1 invalid JSON counts before parse with no retained pool client; exact Origin failures count too”. Built-server transport remains final E2E evidence. |
| AC-foundation-11 | unverifiable | Parameterized SQL shown at db identity:60,67,74,91; `integration.test.ts:41` exercises SQL/HTML-looking name. Dashboard.tsx:13 renders React text, no dangerous HTML setter. However the test renames the initial script-looking name before asserting content and does not test rendered browser execution; URL-userinfo rejection belongs later URL/reference modules. Require browser injection scenario and later URL tests before claiming the whole copied criterion. |
| AC-foundation-12 | met | http:72–83 and server.ts:27–32 allowlist logging. `http.test.ts:38` — “SC-US-021-1 error envelope/log only allowlisted code/requestId/latency, never secret exception payload”; verifies exception secrets do not reach response/log. Config startup catch emits only STARTUP_FAILED. |

## Anti-drift

| Direction / source | Actual code → tests/evidence | Assessment / action |
|---|---|---|
| Source→code→tests: Specification:23 / Pseudocode:32–39 auth | domain identity:5–54 → db identity:6–31 → auth.test.ts:13,24,35 and integration.test.ts:29,94 | Aligned: bcrypt10 outside transaction,72UTF8 boundary, neutral duplicate response with unstored token, HMAC32byte random tokens,7day cookie, revoked/active/expiry checks. |
| Source→code→tests: Specification:31,185 / Pseudocode:41–48,203 | db identity:52–122 and common:17–24 → integration.test.ts:41,49,84,105 | Correct owner/CAS/quota20/cursor≤50 semantics in checked cases; FND-R1 invalid cursor and FND-R2 missing archive index require narrow fixes. |
| Source→code→tests: Specification:149–158,212 / Pseudocode:172–179 | http:23–65; peer:21–35; server.ts:18–26 → http.test.ts:15,29,53,59,67; integration.test.ts:60,67,131 | Atomic shared PG gate, sole pre-body transport boundary and socket-derived peer; no trusted browser XFF. Tests exercise direct loopback sanitizer, not built Next adapter. Mandatory final built-server ingress check remains. |
| Source→code→tests: Specification:163 / Architecture:80–84,119 | initial SQL:31–134 composite FKs and immutable triggers; migration/helper actual26-test schemas | Scalar ownership/pointers and immutable revision triggers exist. Full later array/JSON/file guards are not yet implemented; AC alias must explicitly retain later mandatory evidence. R3 audit uniqueness, D1 key scope and missing history/index guarantees require source/code reconciliation. |
| Source→code→tests: Specification:170–173,212 / Pseudocode:181–188 | config.ts:20–55; health.ts:5–14; schema.ts:5–13; init-db.sh:5–12; migrate.ts:13–16 → config.test.ts:9,17,25; health.test.ts:12 | Fail-closed configuration/schema/storage; no provider call. Separate migrator/runtime grants and revoked metadata writes are in scripts; actual deployed least-privilege and restart/recovery are final integration obligations, not established by superuser-capable test schemas. |
| Code→source: sole custom server/nonce/layout | server.ts:16–26; layout.tsx:3; package.json start:web; Dockerfile CMD → Specification:212 / Architecture:118 | Only custom Node listener supplied. Dynamic layout change is correct for request nonce extraction. Must rebuild and browser-check nonce/CSP; author build predates root layout change. |
| Code→source: Compose host/container ports and private resources | docker-compose.yml:9–10,20,44,55–64; scripts/setup-local.mjs:7–12; init-db.sh:5–12 → Specification:170 / Architecture:84 | Internal web3000/all-interface listener with host loopback3088 variable binding; DB expose only; private generated secrets. Worker path not yet present and no Compose smoke claimed. Setup and role scripts do not replace actual deployment checks. |
| Code→source: creation/session/private DTO extensions | handlers.ts:46–61 me usage and db identity:33–36 ProjectDto → Specification:166; Pseudocode:9–11,231 | Account usage response is source-authorized; secret/session/password/file-key fields are not exposed. SQL cost aggregation intentionally returns known sum plus unknown count. |
| Code→source: project policy in persistence | db identity:50–122 versus Architecture:28,34 | FND-D2: make placement decision explicit; pure AuthService already follows ports and dependency checks. |
| Code→source: new entire initial SQL17 domain tables | migration001 vs Pseudocode:9–25,169 and Architecture:82–83 | Foundational schema anticipates later modules, not proof they are implemented. FND-R3 and FND-D1 are concrete schema/source deltas; implement/delineate required indexes as those paths arrive, including R2 now. |

## Checks and evidence limits

- Reviewer command `node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/foundation`: **exit0**,5 files/26 tests, started2026-10-13 22:37:51UTC, reported duration3.29s. Real private PostgreSQL; no skip, no credential printed. Unique schemas cleaned by helper.
- Independent malformed-cursor/catalog probe: **exit0** for probe execution; observed deliberate invalid-input failure DatabaseError22008, not a passing cursor behavior. Actual catalog confirms missing job project-leading and audit unique/kind-time indexes.
- Independent actual production `projectHandler('PATCH')` probe: **exit0**; literal mutation59+20 yielded1 success and19 rate rejections, Retry-After present, persisted version2. Same probe confirms existing session becomes invalid after account disable. Isolated schema cleaned.
- All25 delivered author-owned file hashes independently match. Their immutable manifest and source receipt are linked above; source/source-dependency hashes below bind this pass.
- Author receipt records npm ci/audit0, typecheck/lint/build success and meaningful owner/rate production mutations that failed expected guards. These are **author-recorded evidence**, not rerun claims by this reviewer. Root separately reports real installation audit0. No unchanged full build rerun solely for reassurance.
- BrowserE2E, restart recovery, deployment least privilege, all later suites and final performance checks remain integration-owned. AC aliases do not waive those checks. Review stage completion is not product delivery acceptance.

## Source fingerprints

All paths relative to projects/08-interior-ai-redesign. Fingerprints below captured from reviewed bytes before any coordinator corrections; corrections need narrow follow-up rather than rewriting this original receipt.

```text
c24a4540d2f4c27dee11a51388eb914cd838853c4a43fe150d7febad58692f98  packages/db/src/migrations/001-initial.sql
4eb8adf1de23f115b01cda969cc44576c72e04a423ec126fa826042428d09080  packages/db/src/migrate.ts
630ff6aa33f6852b7054c89b9079952f760966f08357459a6ae96c035f6f7d62  packages/db/src/schema.ts
a7b404328b879f31b1cd310c84f0f40055f81086ab0f053389887ef758618232  tests/helpers/db.ts
7dc1cbe9822c2b82fb1768f4600f1738cccdf8a24d09c0a2d8b26d06677d8538  apps/web/src/app/layout.tsx
f69f578ea6bcad7d246abf703472940d278de599de66489c7c8758c5b3cef6b5  apps/web/src/components/AuthForm.tsx
2d66e60c788a0fe59727af69848816be856a4d6078cd261a39edfb2b719d2d81  apps/web/src/components/Dashboard.tsx
1e8f29c5bbfe68031f4a9722d3ce0dd323df6010a8dec04392495ed1a6c23fa4  apps/web/src/lib/api-client.ts
7ede3c1d66147ae1fd980b8f819d57c3f892a23834314cedaead568cfadb3fb4  docker-compose.yml
5560eb09eb7b7ba2cd3723007507514060c0e08e802f19905a86a0538390a20d  Dockerfile
96c4de3dc755b2e6648935c49b70dd1972b6a9f372cad4127250a9a9c962968b  scripts/setup-local.mjs
a7afdabf21443c5a58e0a4a71cccd4f52b3a1926a31eb9541aa223acde073104  scripts/init-db.sh
373268683a3bdd3d090077e2322de8c71c26c71856d28d96ffcabcd0c7b1ee2d  package.json
b0cf6f0a07d19e75169b3c60f302daa890a29a2b3e2d13a0134b89570d9b1a2d  package-lock.json
1a902141862ccbfa411fb853460506a3238b8e6c10ba70a774ea1ba822f6b99c  docs/Architecture.md
af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59  docs/Pseudocode.md
7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd  docs/Specification.md
```

Launch SHA256: 37287cb767dde8c0ba29dda1f6b38c22087754f845ebcb456f8c47ce1345ee7c
Started: 2026-10-13T22:37:04.166791+00:00
Finished: 2026-10-13T22:42:33.730765+00:00
Elapsed wall ms: 329563 (launch-to-receipt, includes reading and checks). Active wall ms: null; separately measured wait intervals unavailable.
Telemetry: docs/telemetry/p-replicator/20261013T220722Z-foundation-654d/. Actual model/effort, token usage and cost unavailable; no savings inference.

Status: completed

## Narrow correction closure — same review attempt, original findings retained

Final review disposition: **FND-R1, FND-R2, FND-R3, FND-D1 and FND-D2 closed** on the corrective source below. No remaining confirmed implementation finding from this pass blocks proceeding to later modules/integration. Literal cross-feature relation and browser/URL criteria remain unverifiable at foundation scope as stated in the conformance table; no full-product or twelve-of-twelve acceptance is claimed. Initial “corrections required” verdict above is superseded by this closure, not erased.

Coordinator corrections arrived while the original receipt was being written. Clarification of snapshot timing: the initial25-file comparison and26-test run used the author's immutable bytes; original finding line references belong to that source. The first fingerprint block captured `Architecture.md` after the D1 correction (`1a9021…`); the actual pre-correction inspected Architecture SHA was `5bfc8c2debc9f0ba67a028d3d348a3b4e63483943eed2fe38b0c1b21845345ee`, also preserved in author receipt and DRIFT-004. It was inaccurate to label that one captured hash pre-correction; this note corrects its provenance. No initial finding evidence has been replaced.

| Finding | Narrow closure evidence |
|---|---|
| FND-R1 | First strict timestamp fix still accepted `2026-10-13 12:00:00+23:00`; independent actual PG probe reproduced22009. Final db identity:38 emits UTC ISO with6fractional digits through `to_char`; :40–56 validates exact UTC syntax/calendar before SQL. Regression `integration.test.ts:29` covers0, impossible dates/hours, missing time and+23 at both repository and real production handler. Targeted reviewer run22:44:29 exit0:3passed/8 deliberately filtered (FND-R1, microsecond cursor/quota, archive holds). Original source weakening rejected by DRIFT-005. |
| FND-R2 | New002-indexes.sql:5 has job_project_history(project_id,created_at,id), plus job_account_history and dispatch index. Actual fresh database catalog independently contains job_project_history. Existing archive old-day reservation/uncertain retention test passed in reviewer targeted run. Initial001 remains immutable. |
| FND-R3 | New002-indexes.sql:16–17 adds UNIQUE(event_key), index(kind,created_at). Independent freshDb duplicate event insertion returns23505 and catalog confirms both indexes. Later growth service must handle conflict idempotently, still within F6 acceptance scope. |
| FND-D1 | Architecture:82 now documents account_id/idempotency_key, agreeing with actual SQL and account-scoped replay; decision DRIFT-004 records before/after and rejected alternative. |
| FND-D2 | Domain identity:69–82 now exposes ProjectStore plus pure capacity/page policies; PgProjects implements the port and invokes policies under existing locks. SQL ownership, locking and financial archive transactions appropriately remain persistence-owned; DRIFT-006 records this choice. After this additional source change, reviewer targeted run22:45:05 exit0:2passed/13 deliberately filtered (production PG quota/pagination and domain dependency/persistence-bcrypt mutation guard). |

Commands actually run for closure (cwd=project root):

```sh
node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/foundation/integration.test.ts -t 'FND-R1|bounded cursor|archive revokes'
node --env-file=.runtime/test.env node_modules/vitest/vitest.mjs run tests/foundation/integration.test.ts tests/foundation/auth.test.ts -t 'bounded cursor|mutation guard rejects'
```

The original production mutation59+20 and disabled-existing-session probe was executed via `node --env-file=.runtime/test.env --import tsx --input-type=module` with stdin imports from actual project modules. Equivalent source retained at `/tmp/n8-foundation-review-20261013-mutation-probe.mts` (temporary artifact, not a committed test), SHA256 `19093ba67a18263807a2e5a66a2e027368055cee880167efd23593e958516276`. Reproduce with `node --env-file=.runtime/test.env --import tsx /tmp/n8-foundation-review-20261013-mutation-probe.mts` from this project. It creates a fresh schema, issues a real session, seeds mutation count59, launches20 actual PATCH handlers, asserts1/19 statuses/Retry-After/version2, disables the account, asserts its token now fails, and cleans the schema. The saved-file form was not redundantly rerun; the original stdin probe did pass.

The compact schema/cursor closure probe used `freshDb`, `PgProjects.create/list` and actual SQL. Observations: cursor0 now400 INVALID_CURSOR; intermediate+23 produced22009 (subsequently covered by final passing regression); second insert of the same audit event_key produced23505; actual pg_indexes contained audit_event_event_key_key, audit_kind_created, job_project_history. This is narrow inspection of the reported corrections, not another whole-project review.

Final corrective source fingerprints:

```text
e63f2669d43754dca23a8092f6d6afc7b589c6f31697fd731fb5b45ffb01a656  packages/domain/src/identity/index.ts
e65cae4bed04e5d4722f4934a13afb54b73d4f4cfe83494f8615f4010f7f22d2  packages/db/src/identity.ts
0e104ea7de611aae6c7f13f683a466c600e42c71739d0c2a11d52dd27face8af  tests/foundation/integration.test.ts
8e94f8b99f4e0f63c5d6c5ef401f893fb467841ca9bdeec11900ca0ab2a48da8  packages/db/src/migrations/002-indexes.sql
1a902141862ccbfa411fb853460506a3238b8e6c10ba70a774ea1ba822f6b99c  docs/Architecture.md
c43d2060592fdda8f3ae8a3553fabab8e5dc5d7eb037f5b12f2a036d59d71eab  docs/anti-drift-decisions.md
560d87712b637d8da17454faf62484ec040cc630e2be5b7d442a5d097f3ba232  docs/features/foundation/01_specification.md
```

Closure finished: 2026-10-13T22:45:46.597815+00:00
Final elapsed wall ms: 522431. Actual model/effort/usage/cost remain null for the same unavailable-metadata reasons.

Status: completed
