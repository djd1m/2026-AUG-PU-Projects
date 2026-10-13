# F04b authored browser harness — not executed here

Run `scripts/ui/browser.js` INSIDE the existing `codex-ui-playwright` container; it imports `/opt/browser/node_modules/playwright` and connects only `ws://127.0.0.1:9320/`. It opens fresh contexts, closes them, and does not launch a browser. Mount this exact project with its matching installed dependencies. No installs, route mocks, forged Origin, production test endpoints, mail, live payments, weights or GPU.

The coordinator owns Docker/network/listener execution and a fresh companion read-only preflight immediately before E2E. Acquire existing UI/heavy-build mutexes. Configure the app at the injected local `APP_ORIGIN`, with test runtime, fixture provider, disabled production worker, random session secret, normal budget values and private `/tmp/n8-ui-<24hex>` storage. Match the preflight source/build to this frozen candidate. `UI_PREFLIGHT` points to JSON containing status ready, source_revision, build_revision; the harness records these, while the coordinator validates full source/build/environment/input/effect bindings.

Provision a NEW dedicated PostgreSQL16 database named `n8_ui_<12hex>` with a random password≥24 characters; NEVER use any user/shared database. Its database comment must be exactly `N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE`. No database port publication; use the own network. Set `UI_FIXTURE_OWNER` to that same marker, random `UI_SCHEMA=n8_ui_<24hex>`, `NODE_ENV=test`, `PROVIDER_MODE=fixture`, and matching `DATABASE_URL`. Driver permits localhost/127.0.0.1/[::1]/n8-ui-pg only and checks live PG version and database ownership comment before any mutation. It refuses missing marker, production mode, unknown schema/storage or user DB name. Owner marker is an explicit provisioning contract, not authorization to borrow a DB.

From project cwd with Node22 and the environment above:

```sh
node scripts/ui/fixture-driver.js init
```

This creates ONLY the fresh random schema, applies the six existing migrations there, and writes a synthetic640×480 upload fixture into the owned storage. Bind the actual app PostgreSQL connection to the SAME schema, e.g. DATABASE_URL `options=-csearch_path%3Dn8_ui_<24hex>%2Cpublic` query option (or equivalent PGOPTIONS); do not put values/secrets in committed artifacts. Keep provider worker disabled during the harness; it calls normal payment fixture services directly. No inference worker: the harness calls normal reservation/claim/fenced completion/failure services through the guarded driver.

Then inside the shared browser container:

```sh
UI_SHARED_BROWSER_CONTAINER=codex-ui-playwright node scripts/ui/browser.js
```

Use a fresh nonexistent `UI_OUTPUT` or allow a unique `/tmp/n8-ui-browser-*` directory. The harness registers two isolated test accounts through actual DOM, creates a local partner via existing trusted operator service and credits via real fixture checkout/verified provider ledger. Runs1440/390 upload/four-style controls/queue/reload/resume/comparison/keyboard/focus/font/overflow, fixture publication denial, consent/manual/deny and session continuity, private gallery, native resolved/abort/error/unavailable outcomes, download, two-account404 media checks, positive publication/revoke and failed-job/delete/logout. Native WebShare functions are the ONLY browser stubs; they test injected API promise outcomes, not OS sharing or social posting. API calls and event queries remain real.

`accepted-software` is an explicitly trusted local positive-authorization seed: actual bytes/hashes bind normal fenced completion, then local test SQL inserts a matching privileged review and accepted flag. Its actor, hardware, metadata and authored public context identify synthetic software evidence. It bypasses the real corpus quality review solely to exercise public guards; NEVER count it as GPU/geometry/latency acceptance. Ordinary fixture mode stays unverified and cannot publish. No production fallback or test route is added.

Evidence: results.json with preflight source/build, named checks, injected outcomes caveat and geometry_pass:null; result1440/390 screenshots. A thrown assertion fails the run. The harness itself is syntax/unit checked only in this writer attempt. Coordinator must capture runtime failures and correction requests, not declare authored assertions passed.

Additional coordinator cases still needed for full browser acceptance: repeated unknown POST response/reload end-to-end; delayed response during logout and account switch; actual gallery51/pagination; disabled provider configuration; expiry-cookie POST in browser; hold/insufficient-credit/budget/timeout screens and delete during pending share. These have local service/guard coverage but are not all executed by this bounded harness. GPU12×3 geometry and ≥30warm p95 remain separate pending F05 gates. Cleanup only the owned schema/database/stack/storage after preserving evidence; no shared browser/container shutdown.
