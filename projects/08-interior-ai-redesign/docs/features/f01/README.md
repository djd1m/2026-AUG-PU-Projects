# F01 setup and verification

F01 implements register/login/logout/me and private photo upload/list/read/delete. Jobs, worker, payments, public sharing and result quality are unavailable. The interface follows CJM A's palette, personal-room entry and photo step; no simulated successful redesign exists.

Use Node22, PostgreSQL16 and this project's own package/lockfile. Exact pinned direct dependencies: pg8.23.0, bcrypt6.0.0, sharp0.35.4. The49-package lock closure was extracted from the existing N5 lock at baseline6b93c0e and normalized with npm's offline lock-only command; official-registry resolved URLs and integrity hashes are retained. This is not an audit pass or a claim of latest versions. Selected sharp/bcrypt versions were confirmed against official maintainer package sources. Current maintainer pg main names8.23.1; update/advisory decisions remain acceptance work.

Before heavy install/build/start, obtain the root lease described in the brief. `/tmp/n8-f01/heavy-build-approved` must exist, explicitly grant a root lease and not be expired. From the repository root, check ports:

```sh
bash scripts/check-port-conflicts.sh projects/08-interior-ai-redesign/compose.yaml
```

Inside this project, create a private ignored `.env` using `.env.example`, supplying fresh random hex DB password (at least24 characters) and session secret (at least64 hex characters). Never print or commit them. Set a unique `COMPOSE_PROJECT_NAME` and unused `WEB_PORT`, and match `APP_ORIGIN` exactly to the browser address. Loopback permits HTTP; nonlocal origins require HTTPS and Secure cookies. Provider/worker modes remain `disabled`; fixture/live modes refuse F01 startup. Compose publishes web only on127.0.0.1, never DB, uses a private network and project-owned volumes, and caps web+DB at combined2CPU. Production TLS termination is outside the local foundation.

```sh
npm ci --include=optional
npm run build
npm test
npm run test:mutation
npm audit --omit=dev
# After lease and port check:
docker compose up --build -d
```

Compose runs the transactional migration before app startup. For direct Node execution, supply validated `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, absolute `STORAGE_DIR`, `PROVIDER_MODE=disabled`, `WORKER_MODE=disabled`, and `PORT`/`HOST`. Run `npm run migrate` then `npm start`. Storage is writable outside web/ and cannot use symlinked directories. Pool10, connection wait2s, statement deadline5s. Body reading, bcrypt and decode hold no transaction connection. Bcrypt10 hashes SHA256/base64 prehashed passwords so all128 Unicode code points affect the hash; hashes are not interchangeable with un-prehashed donor hashes. Sessions store HMAC only, expire7days and revoke on logout.

For real DB integration, use only the dedicated F01 service. Tests create/drop a random schema, never substitute a fake DB, and generate solid-color local artificial images (not GPU or public-quality evidence):

```sh
docker compose run --rm -v "$PWD/tests:/app/tests:ro" -e N8_TEST_DB_OWNERSHIP=n8-f01 web sh -c 'export TEST_DATABASE_URL="$DATABASE_URL"; npm run test:integration'
docker compose run --rm -v "$PWD/tests:/app/tests:ro" -e N8_TEST_DB_OWNERSHIP=n8-f01 web sh -c 'export TEST_DATABASE_URL="$DATABASE_URL"; node scripts/mutation.js owner'
```

Mutation scripts copy this project's code into a disposable directory. The owner mutation removes read/delete owner conditions while preserving SQL parameter arity; the two-account404 assertion must fail. The Origin mutation must fail its missing/foreign-origin assertion. Original source stays unchanged. Payment/budget/fixture-quality mutations belong to later units.

Uploads accept raw image request bytes (not multipart/URLs/paths), authenticate before image work, validate matching magic, cap10MiB/20MP, reject animation, normalize orientation and encode WebP without metadata into UUID files. Reads/list/delete owner-scope SQL;404 returns no image bytes. Failed inserts remove temp/final files; cleanup errors remain opaque and await maintenance. Delete tombstones immediately and attempts unlink; sweep retries cleanup. Run `npm run sweep` hourly through an operator scheduler (not installed by F01). It scans at most10000 entries and deletes at most1000 regular UUID files older than1h, retaining active references, recent files, non-UUID files and symlinks. Without a scheduler, timely cleanup remains pending.

Required evidence: syntax build; boundary/bcrypt/decode tests; real PostgreSQL trial race, sessions/expiry/revocation/dummy hash, Origin/body/rates, two-account ownership, real DB insert failure/file cleanup, orphan age/reference retention; owner/Origin mutations; dependency audit; container build/start. Actual browser1440/390 E2E follows integrated UI phase and is not claimed by F01. attempt.json/checks.json/events.jsonl distinguish executed checks and pending work.
