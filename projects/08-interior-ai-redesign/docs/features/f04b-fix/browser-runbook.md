# Coordinator execution handoff — authored, not browser executed

RUN_ID=n8-20261002-1740; WORK_UNIT_ID=n8-f04b-fix; ATTEMPT_ID=n8-f04b-fix-2.
Use this candidate's source-snapshot.json build digest and the unchanged HEAD source revision. Acquire existing UI/heavy-build locks. Fresh Astra review and companion read-only source/build/environment/input/effect preflight remain coordinator gates immediately before runtime/browser execution. No writer runtime claim is made.

The Node client runs in the owned N8 web container, with its project, locked dependencies and private test environment. The shared codex-ui-playwright container receives ONLY the temporary N8 internal network attachment: no project mount, environment, DB credentials, new browser or shared proxy change. Browser contexts connect to ws://codex-ui-playwright:9320/, never launch Chromium. Copy the two EXISTING Playwright 1.63.x client packages from /opt/browser/node_modules/playwright and playwright-core into owned-container /opt/n8-browser-client/node_modules. Do not install packages. Record their actual versions and file hashes in runtime evidence; those files are unavailable to this writer, and their runtime hashes remain null here.

Use scripts/ui/compose.e2e.yml and Caddyfile. The owned proxy serves https://n8-ui.test with internal TLS, upstream web:8080. Production readConfig stays unchanged; fixtureConfig accepts only this exact origin and secureCookie=true. ignoreHTTPSErrors applies only to test browser contexts. No host ports. The internal n8-ui-e2e network connects only owned services and the temporarily attached shared browser. Live services use CPU db .75 + web .75 + maintenance .25 + proxy .25 = 2; init .75 completes before web/maintenance/proxy start. App/init/maintenance use node UID and no extra capabilities. The private named volume mounts /tmp, inheriting its writable sticky directory; the node process creates only its strict /tmp/n8-ui-<24hex> child with mode0700. Never use a privileged or root app container to fix permissions.

Privately prepare UI_ENV_FILE (mode0600, ignored/uncommitted); never print it or rendered compose secrets. Required values:

- NODE_ENV=test, PROVIDER_MODE=fixture, WORKER_MODE=disabled.
- APP_ORIGIN=https://n8-ui.test, HOST=0.0.0.0, PORT=8080.
- Random SESSION_SECRET hex>=64; PLATFORM_DAILY_LIMIT=200, ACCOUNT_DAILY_LIMIT=20.
- UI_FIXTURE_OWNER=N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE.
- UI_SCHEMA=n8_ui_<24 random hex>; STORAGE_DIR=/tmp/n8-ui-<24 random hex>.
- DATABASE_URL for n8_ui_owner at n8-ui-pg, database n8_ui_<12 random hex>, password random hex>=24. URL query parameter options must decode EXACTLY to `-c search_path=<UI_SCHEMA>,public`. Encode it using URL/URLSearchParams, not hand-built shell escaping. The SAME DATABASE_URL is passed to init, web, maintenance and client.
- UI_SHARED_BROWSER_CONTAINER=codex-ui-playwright. UI_PREFLIGHT names an owned mounted /tmp file with ready/source_revision/build_revision plus coordinator-validated full preflight. UI_OUTPUT is a fresh nonexistent owned /tmp output directory.

Compose interpolation additionally requires UI_WEB_IMAGE (new frozen source image with existing locked dependencies), UI_PROJECT_ROOT (exact N8 project path), UI_DB_NAME matching the URL, TEST_DB_PASSWORD matching its random password, and UI_ENV_FILE. Build the image under the coordinator's existing frozen/offline locked-dependency procedure; no dependency/manifest edits, pull or install is authorized by this runbook. Dockerfile excludes tests, so compose mounts this exact project's tests read-only into owned containers. The DB init script validates its random database name and writes its explicit ownership comment. Driver checks PG16 and that comment before mutations. Strict schema identifier and exact URL search_path checks precede CREATE SCHEMA; existing migrate(pool) creates schema_migration and applies all six migrations. Normal web/server.js startup reads that table on the same schema.

Coordinator commands below are inert handoff data; none were run by this writer. From the project directory with private environment prepared:

```sh
bash ../../scripts/check-port-conflicts.sh projects/08-interior-ai-redesign
# Capture compose validation privately; do not print its secret-expanded configuration.
docker compose -f scripts/ui/compose.e2e.yml config --quiet
docker compose -f scripts/ui/compose.e2e.yml up -d db init web maintenance proxy
```

Capture init exit0, SELECT current_schema()/six schema_migration versions, normal-server roomkind_ready and HTTPS GET200. Check schema/DB/storage ownership before any SQL seed. Copy existing client package directories via coordinator docker cp into own web container; this requires readable files, not a root process inside the app. Attach shared browser temporarily with network alias codex-ui-playwright after confirming no conflicting attachment. Validate copied versions/hashes and new-image/source identity. Copy the freshly validated preflight to the owned /tmp path; then:

```sh
docker network connect --alias codex-ui-playwright n8-ui-e2e codex-ui-playwright
docker compose -f scripts/ui/compose.e2e.yml exec -T web node scripts/ui/browser.js
```

Do not run fixture initialization again on restart. For disabled-payment coverage, preserve the same owned DB/schema/storage, set UI_PROVIDER_MODE=disabled, and recreate ONLY web. Record a fresh preflight with the changed server environment and a fresh UI_DISABLED_OUTPUT file path, copy those inputs to the owned web container, then:

```sh
UI_PROVIDER_MODE=disabled docker compose -f scripts/ui/compose.e2e.yml up -d --no-deps --force-recreate web
# Recopy the existing Playwright clients into the recreated owned web container.
docker compose -f scripts/ui/compose.e2e.yml exec -T web node scripts/ui/browser-disabled.js
```

The second harness requires actual server PROVIDER_MODE=disabled; it asserts both DOM disabled purchase and real config/POST503 at1440/390. It never forges client configuration. Use one fresh complete stack per matrix run: main harness creates exactly five accounts, respecting unchanged registration5/hour/IP. Browser API requests are paced750ms globally across contexts to respect unchanged120/min/IP limits; faults forward actual requests and preserve real responses before delaying/dropping them. No forged Origin or business mocks. Normal fixture checkout/verified success/refund and fenced claim/completion remain real services.

Required matrix at1440/390 includes existing upload/four styles/queue/reload/compare/keyboard/focus/font/overflow/gallery/payment; native resolved/abort/error/unavailable API-promise injection plus actual share events/download; fixture-publication denial, explicitly synthetic accepted-software publication/revoke, two-account private404; uncertain actual POST dropped AFTER reservation with same body/key/reload recovery; delayed A while B selection/submission is blocked, then independent B job; delayed job-detail rendering after selection changes; delayed actual401 across logout/login; delayed logout with login disabled until cookie-clearing response settles; gallery51 historical rows and actual continuation/no duplicates; attribution-cookie expiry and POST cleanup; insufficient credit, unchanged account budget20, verified-refund hold; queue/hard timeout screens; deletion while actual share preparation response is held. Only WebShare outcomes are browser API stubs. Gallery/timeouts and attribution expiry use explicit trusted owned SQL seeds; no production budget edits or GPU quality claims.

Preserve results.json/screenshots and disabled results, stdout/stderr, command exits/timing, image IDs, compose digest, copied client hashes and preflight/environment bindings BEFORE cleanup. A thrown assertion fails the run. Harness output is synthetic software evidence; geometry_pass=null. Actual GPU12x3 geometry and30warm latency gates stay separate. Disconnect only the temporary shared browser attachment, then remove only this owned stack/volume/DB. Never stop the shared browser or edit donors/shared proxy. Preserve prior F04b logs.
