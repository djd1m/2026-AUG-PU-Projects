# RoomKind — local software handoff

[Русский](ru.md) · [41 acceptance criteria](../features/f06a/acceptance-map.md) · [Operations](../features/f06a/operations.md)

Source: `8030270f023d83c9cdd597c4578517a1b58b4b35`; run `n8-20261002-1740`.
F01–F04 local software is accepted with source-bound receipts. Actual UI6 passed42 main checks at1440/390 and2 checks against a separately restarted disabled-payment server. Synthetic database and private-file restore checks passed. Real GPU quality/performance, real provider acceptance and aggregate F06/MVP remain pending; this package is not a deployment.

## Implemented behavior

Register/login uses canonical email, 12–128-character passwords, bcrypt and revocable seven-day opaque sessions. A new account receives exactly one trial credit. JPEG/PNG/WebP uploads are limited to 10 MiB and 20 million decoded pixels, normalized for orientation, stripped of EXIF and stored as UUID media outside the static root. Private rows/media are owner-scoped; wrong-owner IDs return 404.

The four styles are `warm`, `minimal`, `afrohemian`, `playful`. Job admission returns 202 with a stable job ID and reserves one credit plus a conservative attempt ticket atomically. Same key/body resumes the original job; a changed body conflicts. Queue expiry is 60 seconds, job hard deadline 360 seconds, each attempt at most 180 seconds, lease 30 seconds and heartbeat 10 seconds; at most two started attempts. Daily ceilings are platform 200/account 20, configurable downward only. Retry needs a new ticket; unused capacity is never refunded. Final failure releases the reserved credit once. Fetch failure is unknown; reload resumes by job ID.

Private gallery/comparison, keyboard controls, share/download, server composites, separate publication consent and revoke are implemented. AI label always remains; the server omits the RoomKind badge only for confirmed paid entitlement without billing hold. Native resolved sharing and delivered downloads are separate events, neither proves a social-network post. Public pages expose the comparison composite and escaped context, not private media. Ordinary fixture outputs cannot pass quality review or publish. The browser's trusted `accepted-software` seed exercises public authorization only; it is synthetic and proves no geometry.

ROOM20 is server-controlled: **20 credits for 900 RUB** (`90000` minor units). Hosted checkout puts card entry with YooKassa; this app stores no card details. Return navigation grants nothing. Provider verification, replay protection, permanent refund hold and first-conversion attribution have software evidence only; real YooKassa acceptance and actual charges are not claimed. Partner codes are operator-created; tracking requires separate unchecked consent, manual checkout code works without that cookie, aggregates create no payouts.

## Runtime and configuration

Use Node **22**, PostgreSQL **16** (Compose pins `postgres:16.10-bookworm`), existing locked npm dependencies and private storage. The Python inference dependencies are separately pinned in [worker/requirements.txt](../../worker/requirements.txt); their resolved security/runtime acceptance remains in F05.

Configure privately from [.env.example](../../.env.example); placeholders are not valid credentials. Never print connection strings, rendered secret-bearing Compose config, real env values or dumps.

| Names | Purpose |
|---|---|
| `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `STORAGE_DIR` | Validated runtime, DB connection, random secret, exact origin and absolute private storage |
| `PORT`, `HOST`, `PROVIDER_MODE`, `WORKER_MODE` | Direct web listener; web requires worker disabled; provider disabled/fixture/live |
| `PLATFORM_DAILY_LIMIT`, `ACCOUNT_DAILY_LIMIT` | Required positive ceilings ≤200/20, account ≤platform |
| `DB_PASSWORD`, `WEB_PORT`, `COMPOSE_PROJECT_NAME` | Compose interpolation; loopback web publication, internal DB |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | Server-only live provider configuration; missing keys refuse checkout |
| `WORKER_SOURCE_REVISION`, `WORKER_SEED`, `WORKER_PYTHON`, `MODEL_ROOT` | Separate inference CLI; immutable source, explicit seed, Python, offline model manifest |
| `QUALITY_OPERATOR_ID`, `QUALITY_CORPUS_REPORT`, `QUALITY_CORPUS_SHA256` | Trusted quality CLI identity and independently measured report binding |

No browser secret is used. Startup validates credentials/configuration; provider fixture and inference fixture are forbidden in production. Nonlocal origins require HTTPS. The sample's direct database URL does not imply a published Compose database port.

## Existing commands

Commands below are operator instructions; none were executed in this docs attempt. Run from the project directory after private environment/dependency provisioning. Node's `--env-file` loads the prepared file; `npm` does not load it automatically.

```sh
node --env-file=/private/roomkind-web.env scripts/migrate.js
node --env-file=/private/roomkind-web.env web/server.js
node --env-file=/private/roomkind-web.env scripts/maintenance.js
node --env-file=/private/roomkind-web.env scripts/queue-status.js
```

`npm run migrate`, `npm start`, `npm run sweep`, `npm run lint`, `npm run build`, `npm test`, `npm run test:integration`, `npm run test:boundaries`, `npm run test:mutation` exist in [package.json](../../package.json). `build`/`lint` are syntax/static checks; `npm test` runs foundation boundaries/media only, not the complete later PG/browser/GPU matrix. See accepted receipts and [test scenarios](../test-scenarios.md) for those gates.

[compose.yaml](../../compose.yaml) is the local db/web/maintenance stack, with payments and inference fixed to disabled, total configured CPU 2, internal DB and loopback web. It has no inference service. After checking port conflicts and acquiring the coordinator's existing heavy mutex:

Prepare the ignored project `.env` privately for these Compose commands and the port checker; it contains the same selected `WEB_PORT` and interpolation variables. The checker accepts the actual Compose file path (a directory argument would look for a nonexistent `docker-compose.yml`). Do not print `.env`.

```sh
bash ../../scripts/check-port-conflicts.sh compose.yaml
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml up -d --build
```

The source-configured worker is a separate process sharing the same private storage/database; privately give its env `WORKER_MODE=fixture` or explicitly `controlnet`, source revision and seed. Keep the web env's worker mode disabled. Fixture uses Python/Pillow and creates visibly marked demonstrations; it does not infer room geometry. ControlNet requires CUDA and operator-provisioned pinned local weights/manifest, safetensors, licenses and file hashes; no download or CPU/fixture fallback. Current GPU provisioning/security/corpus/latency are blocked.

```sh
node --env-file=/private/roomkind-worker.env scripts/worker.js --once
node --env-file=/private/roomkind-web.env scripts/partner.js create ACCOUNT_UUID
node --env-file=/private/roomkind-web.env scripts/partner.js activate PARTNER_UUID true
node --env-file=/private/roomkind-web.env scripts/partner.js aggregate PARTNER_UUID
node --env-file=/private/roomkind-fixture.env scripts/payment-fixture.js INTENT_UUID success
node --env-file=/private/roomkind-quality.env scripts/quality.js JOB_UUID accepted 'Operator review reason'
```

Payment fixture supports `success`, `cancel`, `refund` only in explicit nonproduction fixture mode after asynchronous intent creation. Quality acceptance needs an actual valid measured corpus; this command cannot create evidence. The payment worker starts inside the normal web server; `scripts/payment-worker.js` is not a standalone daemon entry point. To operate a full local fixture flow or a configured ControlNet/provider stack, supply the separate process environments manually; the base Compose file does not enable them. Live provider/deployment/spend need separate authorization.

The actual HTTPS browser fixture uses [scripts/ui/compose.e2e.yml](../../scripts/ui/compose.e2e.yml) and the [F04b correction browser runbook](../features/f04b-fix/browser-runbook.md), including owned PG/schema/private storage, init, remote shared browser and disabled-provider restart. It is a test stand, not a production topology. Preserve failed attempts 1–5; no screenshots or partial results establish a full matrix pass.

## API and remaining handoff

Exact routes are in [web/app.js](../../web/app.js): register/login/logout; `GET /api/me`; upload bytes through `POST /api/uploads`, list/read/delete uploads; `POST /api/jobs`, paginated `GET /api/jobs`, job read/delete/result; `POST /api/payments`, payment config/status and independently verified webhook. Job share-attempt/share-outcome/publication routes and `GET /api/jobs/:id/composite/:mode/:event_key` serve exports. Public surfaces are `/s/:token`, `/s/:token/composite`, `/api/publications`, `/examples`. UI reads attribution with exact-Origin `POST /api/attribution/state` and `{}`; consent/manual actions use `POST /api/attribution`. Authenticated writes require the configured exact Origin.

[Operations](../features/f06a/operations.md) provides inert owned synthetic PG backup/restore, private-volume/rollback and gate instructions. Full GPU acceptance needs ≥12 licensed rooms ×3 styles with zero added/removed openings and anchor shift ≤2% diagonal, plus ≥30 actual warm jobs with p95 inference ≤25 seconds and queue time separate. Draft PR base is `claude/install-npm-packages-n7l3m5`; no main creation, merge or deployment is authorized. [Completion](../Completion.md) keeps acceptance/deployment authority and pending gates explicit.

Latest coordinator evidence: [F04 acceptance](../features/f04b/acceptance.md), [actual browser receipt](../telemetry/n8-20261002-1740/n8-ui-e2e-6-receipt.md), [owned restore receipt](../telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md). Historical failures1–5 and author validation remain unchanged.
