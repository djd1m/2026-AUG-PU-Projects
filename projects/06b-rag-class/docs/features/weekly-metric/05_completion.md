# F11 bounded implementation handoff

Run `20261003T011351Z-weekly-metric`, work unit `weekly-metric-implementation`, attempt `implementation-1`.
Source revision: `d25e6141b3b43569281c85f95a6a6313f71f8c07`.
Launch SHA256: `974a808214bb7858671c4bd44acc5f20d582793de57d6c029b0fd79559445d42`.
The implementation is handed to the coordinator. Feature acceptance remains pending the gates below.

## Implemented behavior and AC binding

| AC | Implementation / focused evidence | Outstanding evidence |
| --- | --- | --- |
| MET-01 | Server page authenticates the existing session and reads the existing operator table; anonymous/ordinary users receive 404. POST repeats these gates, requires exact same-origin before acquisition/outbound, ignores body authority, returns private/no-store JSON. Next page is force-dynamic with revalidate=0. Handler unit gates pass. | Real PG gates and actual Next UI/operator/ordinary 404 checks. |
| MET-02 | Goal 15, eligible verified and raw config+question counts, canonical independent badge/signups aggregates, signups/clicks ×100, zero-click “нет данных”, exact “n < 30, K не считается” below 30. Cumulative rows, including older rows; two bots/one normalized host count separately. No K formula at/above 30. Unit count/exclusion/threshold cases pass; real PG aggregate/threshold cases authored. | Full PG execution and rendered seeded counts. |
| MET-03 | Existing createSafeHttp production adapter retains DNS/IP checks, pinned connector and TLS verification; one GET, no redirects, 15s/page and 2MiB. Successful text/html must contain a real script with resolved src exactly PUBLIC_BASE_URL/w.js and exact data-bot. Comments, inline strings, template/noscript content, wrong bot/host/path/query/hash and invalid responses fail focused tests. | Existing safe HTTP regression suite and PG verifier cases. |
| MET-04 | Acquire service transaction, advisory xact lease and select ≤5 pending rows before 202; after() awaits sequential verification and owns that same connection until commit/rollback. Deadline is issued at acquisition and every fetch uses remaining budget ≤15s within 60s. Session and operator rechecked before outbound; session/deadline rechecked before write; SQL rechecks unchanged page/public-id/host/config/question, owner and actor eligibility, and null existing verification timestamp. Busy409 does not change cursor. Scheduler exceptions roll back before503. Unit scheduling/limits/cleanup pass. | Real PG simultaneous requests, cursor and eight concurrent-change cases authored; actual Next after integration remains pending. |
| MET-05 | Reuses metricHost/excludedMetricHost in panel and batch selection. F09 config/question/ask gates, SSRF transport, AnswerQuestion and paid gateway source remain unchanged. Only aggregate counts are rendered; React escapes output. Error logs contain error class names, not page URLs/bodies/IPs/secrets. | Full F09/F10 and safe HTTP regression. |
| MET-06 | 37 focused units pass. 15 meaningful real PG cases authored. New exact-script data-bot guard mutation: unchanged fixed assertion red(exit1), exact-byte restoration, same assertion green(exit0). All 10 changed source/test files <500 lines. Source manifest below binds exact bytes. | Full units/PG/build, independent Astra review, exact images and Docker browser evidence. |

## Minimal interface decisions

- A signed, actor-bound HttpOnly cursor cookie carries a server-selected widget_install UUID. Its HMAC uses the existing SESSION_SECRET. Existing schema is sufficient; cursor input never supplies account/role authority. The response cookie advances to the last selected ID only when more eligible pending rows remain; end-of-round clears it. Invalid/tampered cursors start a new round. A busy response emits no cursor change. Another process can continue with the same cookie; fresh/no-cursor requests rediscover failed pending rows after restart. Inserts before the current keyset are discoverable on the next round.
- Selection reads canonical eligible candidate rows in UUID order, applies the shared web metric-host predicate and takes five. This deliberately retains the canonical O(n) scan for the small campaign rather than adding queue/schema machinery. The predicate is domain composition, with no production SSRF or transport bypass selector.
- The transaction holds only the advisory lease during outbound work; no row lock is held over a page fetch. PostgreSQL READ COMMITTED conditional updates reject modifications made while fetching. Timestamp comparisons use PostgreSQL text timestamps to preserve microsecond precision. Existing verification times are never rewritten.
- Transaction-local 5s statement and 75s idle-in-transaction safeguards limit stuck database work/unscheduled callbacks. Commit/rollback releases the transaction lock automatically; an errored connection is discarded. The verifier's 60s deadline governs page work; database cleanup still must complete or discard its connection.
- POST202 reports acceptance. UI says “Проверка запущена”, offers separate refresh, and reports busy/start failure without claiming successful verification. No durable background queue is promised.
- Positive verifier tests inject only SiteFetch. Production route always uses the existing safe adapter; UI acceptance must retain SSRF loopback blocking. Coordinator UI may seed truthful verified rows and exercise pending202 independently; disclose this binding in UI evidence.

## Checks performed

All commands ran in the selected project with reused dependencies; Node22 came from `/tmp/n6b-f06-node22/bin`.

| Command | Final exit / result | Artifact |
| --- | --- | --- |
| `bash ../../scripts/complexity-router.sh apps/web/src/app/admin/metrics/page.tsx apps/web/src/app/admin/metrics/verify/route.ts apps/web/src/server/metrics-handler.ts apps/web/src/server/metrics-verifier.ts packages/db/src/metrics.ts` | 0, mechanical S lower bound; substantive M under the accepted fresh-SPARC exception to L | This report and implementation-checks.json |
| `PATH=/tmp/n6b-f06-node22/bin:$PATH npm run typecheck` | 0 | `tests/artifacts/weekly-metric/implementation-typecheck.txt` |
| `PATH=/tmp/n6b-f06-node22/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/metrics-verifier.test.ts apps/web/tests/unit/metrics-handler.test.ts` | 0, 37 passed | `tests/artifacts/weekly-metric/implementation-focused-tests.txt` |
| `/tmp/n6b-f06-node22/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts apps/web/tests/unit/metrics-verifier.test.ts -t 'fixed guard assertion: a wrong bot script never verifies'` with data-bot predicate temporarily removed | 1, fixed assertion expected false but received true | `tests/artifacts/weekly-metric/exact-script-guard-red.txt` |
| Same exact fixed assertion after exact byte restoration | 0, 1 passed (27 intentionally unselected) | `tests/artifacts/weekly-metric/exact-script-guard-restored-green.txt` |
| `git diff --check` | 0 | `tests/artifacts/weekly-metric/implementation-diff-check.txt` |
| Exact-byte SHA256 capture and source/test line-bound assertions | 0, 10 files <500 lines | `tests/artifacts/weekly-metric/implementation-source-hashes.json` |

Initial type checks found two typing defects, and the initial parser suite found an inert-template false positive. Those specific findings were corrected. Final type/unit checks above cover the frozen source. The guard mutation was rerun on the final verifier after the deadline revalidation fix; exact restoration SHA matches the frozen manifest. The old unchanged SSRF mutation was not rerun.

Canonical map digest: `64b0dfee0301396933be83924350d54ca9287f4a5e682f42c1a226198b066800`.
The digest is SHA256 of the sorted project-relative file→SHA256 map serialized as UTF-8 compact JSON with separators comma/colon. It includes all changed tracked/untracked production and test source files.

## Coordinator gates and handoff

Pending commands/gates (not executed in this attempt): full unit regression including safe HTTP; all real PostgreSQL integration suites including `apps/web/tests/int/metrics.int.test.ts`; production builds; independent fresh Astra review; exact source/build/image receipts; Docker UI at1440/390 with real operator page, ordinary404, POST202 and refreshed seeded counts. Fresh project-work-companion preflight belongs immediately before that UI run. This attempt records E2E preflight `not_applicable` because no E2E/build execution was authorized here.

The coordinator retains ownership of the run/events/work-record, roadmap and final acceptance. No child agents, Docker/ports/builds, network/installs, shared manifests/lock/schema/Dockerfile/toolkit/global edits, donor N6 reads, commits or pushes were performed. Pre-existing coordinator changes were left intact.

Profile: `compact-quality-first-v2`; requested executor `gpt-6.1-sol`, effort high. Native actual model and usage metadata are unavailable to this executor; coordinator reconciliation is required. No model switch or fallback was performed. Tokens, cost and active time are null, not estimates. Savings are not established.

Launch began `2026-10-03T01:19:39.797532+00:00`; source snapshot at `2026-10-03T01:34:49.051582+00:00`, measured elapsed909.254s including reading, checks and corrections. Final receipt supplies the later finish time; total attempt must remain within1500s. Measurement gaps: actual model/effort, token usage, billed cost, active versus waiting time. No fabricated usage counts.

Telemetry path: `docs/telemetry/p-replicator/20261003T011351Z-weekly-metric/`.
The CLI must capture the substantive final answer to the fresh absolute receipt path from implementation-1-launch.json. This worker does not manually write that TRACE file.

## Уточнение координатора после независимого ревью

Утверждение авторского handoff «only the advisory lease during outbound work; no row lock is held over a page fetch» неточно для следующих страниц группы. Успешный UPDATE удерживает row lock до batch COMMIT/ROLLBACK, включая последующие fetch. Первая сеть до первого UPDATE не держит такой row lock. Это ограниченная до60сек группа; исходники не изменялись. Ревью ACCEPT_WITH_CAVEATS не считает это нарушением текущих AC, но отчёт не должен обещать отсутствие row locks на всём протяжении группы. Обязательные runtime проверки ещё pending.

## Coordinator full regression

Final frozen 10-file snapshot verified against immutable runner: typecheck, 569 unit, 240 real PostgreSQL tests and production build passed. Production web and migration images built successfully. Browser acceptance remains pending. See final-checks-summary.json and tested-source-final.json.
