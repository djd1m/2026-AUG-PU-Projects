# I6b implementation handoff — hosted software mock

Source `1182b04232294275d7d7adb2eb0ed81bb7b53d10`; RUN_ID `n8-20261002-1740`; WORK_UNIT_ID `n8-replicate-i6b`; ATTEMPT_ID `replicate-i6b-1`. Author is the sole requested Sol6.1/high writer. Host-resolved model, usage and cost remain null pending host receipt. Approved F07 XL scope, compact-quality-first-v2; mechanical ROUTE exit1/L retained as lower bound. No delegation, other-model CLI, install, Docker, PG, browser, host listener, external request/spend, credentials, commit, push, or global configuration action occurred. No run/events edits.

## Delivered contracts

- `.env.example` contains public exact pins and commented secret/acceptance placeholders. WORKER_MODE and REPLICATE_WORKER_MODE remain disabled; cleanup has its own false opt-in. Missing config cannot start generation, and no production budget is automatically created.
- `compose.yaml` retains disabled web/maintenance and DB expose-only. Separate `replicate-worker` and `replicate-cleanup` services have explicit profiles, no restart, no listener and bounded `--once` commands. Token/pins/budget fields exist only in these optional services. Default CPU allocation remains 2; optional services each add .25, requiring WEB_CPUS=.50 for one or .25 for both to retain aggregate2. Profiles and opt-ins are separate requirements. Real activation needs separately authorized private configuration and an existing budget; this handoff executes neither.
- `web/public/ui-actions.js` extends the existing real-mode predicate to accepted replicate as well as controlnet. Accepted quality, billing hold, separate consent and server authorization guards are preserved. Hosted mock results remain unverified; the existing actual app label displays `unverified`, and DOM consent/publication stay disabled. No hosted quality acceptance is inserted.
- `fixture-driver.js` adds only an unforgeable module-local ownedPool marker and assertion. All original DB/version/marker/schema-URL/origin/storage/payment guards and legacy accepted-controlnet seed remain intact.

## Test-only helper API

`createHostedFixture(pool, config)` in `scripts/ui/replicate-fixture.js` requires a pool returned by real `ownedPool()`, exact test/fixture HTTPS origin, storage naming and limits20/200. Before any budget INSERT it checks actual current_schema equals the guarded UI_SCHEMA and a real nonsymlink private0700 storage directory. It reuses accepted `workerEnv`/`mockBoundary`, calls actual `workerConfig`, and creates one bounded TEST ONLY envelope with synthetic token/five acceptance digests. These are software inputs, never real authorization, a measured corpus or production provisioning.

`fixture.start(jobId, {gate, beforeRun, afterSend, envPatch})` returns `{done, counts, claim, cancel}`. `done` resolves `{completed,error}`; `counts()` exposes only numeric api/post/get/delivery counts. Config validation precedes actual createJobs.claim, the claimed target must match the actual browser reservation, and actual runReplicateClaim receives BOTH injected API and delivery transports and synthetic address resolution. No fallback transport is selectable. Production I1 authorize/finalAuthorize, I2 create/poll, I3 bytes/import/verification and I5a jobs.complete generate private artifacts and immutable evidence. No direct evidence INSERT or trigger bypass exists. Synthetic depth/output are512x512; prediction IDs are unique; hardware/warm/inference/billing remain null. The helper imports accepted test fixtures, so the parent must mount matching tests read-only as the existing E2E compose already does.

`responseGate()` allows at most15s, signals `entered` only inside the outgoing mock POST handler after authorization, and awaits an explicit release. Expiry rejects; finally releases/cancels and joins active work. Holds/deletion use this observation or beforeRun after a real claim, without arbitrary race sleeps.

## Browser cases and evidence

`hostedCases(...)` is additive to `scripts/ui/browser.js` at1440 and390, with separate hosted accounts and existing verified local package purchases. The legacy42 matrix, disabled-payment followup and synthetic accepted-controlnet publication remain. Account/day20 and platform/day200 are unchanged. Each hosted viewport adds five checks:

1. Actual upload/style/reservation, worker POST+GET and two private downloads, resume, comparison/gallery, verified private hashes/evidence, unverified label, DOM publication refusal and actual API404 refusal; other account receives404 for job/result.
2. Actual queued reservation with missing token and separately disabled worker config, both zeroAPI/zero delivery, no evidence/private result (404), hidden comparison and disabled publish. This is generation config proof, independent of disabled payment.
3. Hold after real claim but before send: zeroHTTP, failed DOM state and one customer release.
4. Hold observed inside authorized send: actual private completion/unverified evidence, DOM publication denial and API404 refusal while held.
5. Delete actual job/upload through app while POST response is held: no completion evidence/result, no new private artifact keys, actual local deletion cleanup, zero delivery, one credit release and second fail refused.

New screenshot names: `hosted-1440.png`, `hosted-390.png`. Existing screenshots retained. `results.json` adds `hosted_evidence` with completion hashes or named refusal/deletion scenarios and numeric mock counts; `hosted_provider_metrics:null`, `geometry_pass:null`. The existing check results remain source/build bound to preflight. New helpers and shared reservation/payment observations use actual app intent storage/DOM and fetch rather than evictable CDP response.json bodies. Existing route.fetch fixture observations are unchanged.

## Author checks and history

Final focused Node22 run:43 pass,0 fail,0 skip. First run:39 pass/3 failures in the newly authored UI test harness because the DOM onsubmit returns void; corrected the harness to capture its guard promise. Original failing log is retained. Two command path mistakes (root/project cwd mismatch) are recorded in checks.json; one prevented a log redirection, not a test failure, and was rerun from the correct project cwd. No prior historical failures/logs were edited.

Meaningful mutation changes accepted-quality equality to anything-except-rejected in a disposable module, runs the unchanged semantic UI test and fails at `HOSTED-UNVERIFIED must disable consent`. Baseline exit0, mutant exit1, restored exit0; production bytes never changed. Production/mutant/oracle hashes and logs are retained. Final scripts/check.js syntax/static build exit0; YAML parser guards pass for profiles/secrets/default CPU/DB noports. Actual Compose-engine/build/start/PG/browser validation is pending parent and is not inferred from YAML parsing. Protected accepted-HEAD hashes, scope/line limits and git diff --check are recorded in the frozen snapshot/check receipts.

Exact author commands, run from PROJECT_ROOT with existing Node22 and read-only node_modules:

```sh
/tmp/n8-node22 --test tests/ui-replicate-fixture.test.js tests/ui-replicate-publication.test.js tests/ui-payment-fixture.test.js tests/ui-state.test.js tests/ui-app-races.test.js tests/ui-auth-order.test.js tests/ui-upload.test.js tests/replicate-worker-config.test.js
/tmp/n8-node22 scripts/check.js
```

## Parent-only invocation and pending proof

Parent owns fresh independent Astra review, I7 canonical/full mandatory checks, and I8 actual shared-browser/PG16 proof. Companion preflight for this author is not_applicable (runtime expressly forbidden). Immediately before I8, parent must obtain the UI/heavy-build mutexes, bind the frozen snapshot to the actual image/mounted scripts/tests/UI asset bytes, and produce a fresh ready source/build/environment/input/effects preflight. This is not a runnable author background task.

Reuse `docs/features/f04b-fix/browser-runbook.md` for the existing owned app-client/shared-browser topology, replacing its historical six-migration statement with current eight migrations and its source/build pins with this frozen candidate. Do not launch a new browser or pass private app/DB environment or mounts into the shared browser container. Copy only the existing Playwright1.63 client packages into the owned app container using the established parent procedure; no install. Owned test environment (privately stored, no values logged):

```text
NODE_ENV=test
PROVIDER_MODE=fixture
WORKER_MODE=disabled
REPLICATE_CLEANUP_ENABLED=false
APP_ORIGIN=https://n8-ui.test
HOST=0.0.0.0 PORT=8080
PLATFORM_DAILY_LIMIT=200 ACCOUNT_DAILY_LIMIT=20
UI_FIXTURE_OWNER=N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE
UI_SCHEMA=n8_ui_<24hex>
STORAGE_DIR=/tmp/n8-ui-<24hex>
DATABASE_URL=<owned n8_ui_owner / n8-ui-pg / n8_ui_12hex URL, random password>=24; exact options=-c search_path=UI_SCHEMA,public>
SESSION_SECRET=<random hex>=64
UI_SHARED_BROWSER_CONTAINER=codex-ui-playwright
UI_PREFLIGHT=<owned mounted fresh ready preflight file>
UI_OUTPUT=<fresh nonexistent owned output directory>
```

Parent prepares the existing compose interpolation fields UI_WEB_IMAGE, UI_PROJECT_ROOT, UI_DB_NAME, TEST_DB_PASSWORD and UI_ENV_FILE privately; guards require the owned PG16 database comment and exact URL options. No hosted token, five acceptance env fields or live provider configuration is needed for the software browser run: the guarded helper builds synthetic test-only config. Exact browser invocation, from PROJECT_ROOT, after parent-only build/ownership/HTTPS/client/source preflight:

```sh
docker compose -f scripts/ui/compose.e2e.yml exec -T web timeout 1200 node scripts/ui/browser.js
```

Also execute unchanged `scripts/ui/browser-disabled.js` using the existing disabled-payment followup procedure. Retain original and new failures, stdout/exit, results.json and screenshots. Expected browser matrix is legacy42 plus10 hosted checks, subject to actual execution;43 author unit tests are not a browser count. No separately skipped PG test was added: actual owned PG is a hard requirement of this exact browser runner. Remaining acceptance risks are actual SQL/runtime/gate timing/DOM/layout integration and Compose-engine behavior, all assigned to the parent. Mock results establish software contracts only; GPU quality, provider latency/performance and actual provider cost remain unmeasured.

Frozen artifacts: `docs/telemetry/n8-20261002-1740/replicate-i6b-snapshot.json`; check history/log bindings: `replicate-i6b-checks.json`; unique terminal author receipt: `replicate-i6b-receipt.md`. Delivery is implementation evidence, not final F07/runtime acceptance.
