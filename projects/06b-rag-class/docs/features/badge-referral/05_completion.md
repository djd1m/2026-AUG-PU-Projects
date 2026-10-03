# F10 bounded implementation handoff

Run-ID: `20261003T000534Z-badge-referral`; work unit `badge-referral-implementation`, attempt `implementation-1`.
Baseline/source revision: `4a4f602cda39954900365d3ba7085db7c4d732b3`; build revision: none.
Launch SHA256: `82906a01abc6e5d03797de70c7b55c40f36cfb2f9cf8a5227e111f0d8c628a55`.
This is implementation handoff evidence, not feature acceptance or a runtime pass.

## Implemented scope

| AC | Implementation and evidence | Remaining gate |
| --- | --- | --- |
| REF-01 | `/r/b/[public_id]` GET returns fixed local 302; DB click uses existing HMAC, Moscow day, and partial unique predicate `WHERE kind = 'click'`. Unit redirect/IP tests pass; concurrent real-PG tests authored. Unpublished existing bots remain eligible. | Execute PG click concurrency tests. |
| REF-02 | Narrow `/` middleware imports only `next/server` and a pure helper. First absent cookie sets 30-day HttpOnly, Lax, Path=/, Secure in production. Existing cookies, including empty/invalid ones, are never replaced or renewed. Dynamic landing and private/no-store middleware response avoid public caching. Actual NextRequest/NextResponse unit tests and first-touch mutation pass. | Verify real browser cookies/cache headers. |
| REF-03 | Cookie only is forwarded after existing CSRF/quota/body checks; bcrypt remains outside the transaction. PgAuthStore resolves and locks the source bot within account+session transaction. Missing/deleted/unknown bots resolve null. Unit body-forgery/login checks pass; PG rollback, concurrent email uniqueness, attribution and source-lock tests authored. | Execute PG/auth regression and browser registration. |
| REF-04 | Exported `resolveReferralBot(client, publicId, actingStudioId)` excludes trusted studio and direct child owners, regardless of studio_access. PG studio/child/unrelated/standalone cases authored. | Execute resolver tests; F13 must wire trusted studio creation. |
| REF-05 | Free cabinet button sends same-origin POST. Handler authenticates session and uses only session account. Service transaction locks existing account before intent EXISTS/INSERT for Moscow day. Unit guards/client errors pass; 20-request real-PG concurrency/session tests authored, with plan/removal/badge assertions. | Execute PG and cabinet browser checks. |
| REF-06 | Truthful landing says «Сделайте такого для своего сайта» and links to existing registration/login; button displays «Скоро: ~990 ₽/мес, оставьте заявку» after successful request. | Actual Docker browser UI at 1440/390. |
| REF-07 | Final Node22 typecheck, 78 focused units and meaningful mutation pass. Exact source/test hash snapshot captured. | Full frozen-source unit/PG/build, immutable build/source receipts and independent Astra review. |

No trusted IP means a known-bot redirect without recording a click: no artificial shared visitor and no raw IP storage.
Unknown format-valid IDs may remain first touch, but registration cannot attribute them without an existing bot.
Standalone registration from the same browser remains attributable by canonical design. SC-US-011-2 is a DB contract
here; its reachable HTTP/UI scenario belongs to F13. F13 must validate the acting studio through authentication,
pass its ID to the resolver and keep resolution and child creation in the same service transaction.
The removal-intent endpoint changes no plan or badge state and adds no payment/operator UI.

## Source and files

`tests/artifacts/badge-referral/implementation-source-hashes.json` lists exact SHA256 for all 17 changed tracked/untracked
source/test files. Snapshot: `4f6cfc242b7863ba0f586b07a46b3cdbcd24cbb0d10360895c90679c11a94dff`;
captured at `2026-10-03T00:25:12.050221+00:00`. Largest changed source/test file: 185 lines.

Product changes: two routes, middleware and referral-cookie helper; referral handler; auth service/store/handler seams;
landing/cabinet and cabinet button; shared public-ID re-export; DB referral module/export. Tests: two unit files and
`apps/web/tests/int/referral.int.test.ts` (9 real-PG cases authored, not executed here).
Manifests, locks, schema, Dockerfiles, global/toolkit files, coordinator run/events/work-record and roadmap were not
edited by this executor. No donor N6 reads, children, Docker/ports, installs/network, commits or push.

## Executed checks

Commands run from project root with `PATH=/tmp/n6b-f06-node22/bin:$PATH`; actual Node `v22.22.3`.

- Before implementation: `bash ../../scripts/complexity-router.sh apps/web/src/middleware.ts apps/web/src/server/referral.ts packages/db/src/referral.ts`: exit 0, mechanical S lower bound. Substantive L public-route risk uses accepted fresh-SPARC M exception; all mandatory gates preserved. Post-implementation actual-file ROUTE: exit 0, M.
- `npm run typecheck`: exit 0, including final restored source and authored PG tests. Final log: `/tmp/n6b-f10-implementation-final-typecheck.log`.
- `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/referral-cookie.test.ts apps/web/tests/unit/referral-handler.test.ts apps/web/tests/unit/auth-handler.test.ts apps/web/tests/unit/widget-handler.test.ts apps/web/tests/unit/ip.test.ts`: exit 0, 78 tests / 5 files. Native output start `00:20:03 UTC`, duration 2.96 seconds.
- Mutation command: `./node_modules/.bin/vitest run --config vitest.config.ts apps/web/tests/unit/referral-cookie.test.ts`. Disable `existingCookie !== undefined` guard: exit 1, fixed first-touch test expects null but receives replacement ref (1 failed, 9 passed). Restore exact original bytes and rerun unchanged test: exit 0, 10 passed. Original/restored hash `60318ba919f27fa229f242162fad4ed4a0fb50963b5dbd1e10c7c87b52f84e6d`; unchanged test hash recorded. Evidence: `tests/artifacts/badge-referral/first-touch-mutation.json`; raw logs outside Git in `/tmp/n6b-f10-first-touch-{red,green}.log`.
- `git diff --check`: exit 0. Changed source/test SHA and <500-line check: exit 0.

Structured results: `tests/artifacts/badge-referral/implementation-checks.json`.
Typecheck ran again after PG-test changes and after temporary mutation restore; successful focused suites were not
repeated without a related change.

## Coordinator gates and measurements

Exact focused PG command, inside the coordinator's prepared Node22/PG runner:
`./node_modules/.bin/vitest run --config vitest.int.config.ts apps/web/tests/int/referral.int.test.ts`.
Required environment is the existing integration harness (`TEST_DATABASE_URL_OWNER`, `TEST_TENANT_PASSWORD`,
`TEST_SERVICE_PASSWORD`); no ports or test infrastructure were started here. Execute full `npm test`,
`npm run test:int`, `npm run build` on the frozen source, then independent Astra review and actual browser checks
(badge redirect → landing cookie → registration attribution, repeat landing and cabinet intent/badge unchanged).
Perform read-only E2E preflight immediately before actual browser execution and bind receipts to source/image hashes.
These gates remain pending, not passed. Local-stage E2E preflight: not_applicable, because this work unit runs no E2E.

Profile: `compact-quality-first-v2`, substantive M, one bounded writer. Requested `gpt-6.1-sol` / high per launch;
native actual model/effort, tokens and cost unavailable here and remain null for coordinator reconciliation.
No model switch/fallback was performed by this executor. Launch start `2026-10-03T00:15:06.844898+00:00`;
source freeze after 605.205323 seconds, including reading and local checks. Final duration is bound to Finished-At in
the native terminal receipt. Active duration and time to accepted feature remain unknown; savings are not established.
Coordinator telemetry: `docs/telemetry/p-replicator/20261003T000534Z-badge-referral/`.
CLI `-o` owns the terminal `evidence/implementation-1-receipt.md`; this executor does not manually write TRACE.
