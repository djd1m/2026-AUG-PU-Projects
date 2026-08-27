# Quick Start

The project runs as a single Docker Compose stack: the application, the transcription
worker, the speech recognition service, Postgres, MinIO and Caddy.

## Requirements

- Docker + Docker Compose v2
- Node.js 20+ — only to run the tests from the host; the application itself builds in a container
- Free host ports (checked by a script, see step 2)

## Five commands

```bash
# 1. Configuration
cp .env.example .env
# fill in POSTGRES_PASSWORD, MINIO_ROOT_*, S3_*, SESSION_SECRET, BASE_URL, APP_DOMAIN
# generate passwords, do not invent them:  openssl rand -hex 24

# 2. Check that the required ports are free — BEFORE starting
bash ../../scripts/check-port-conflicts.sh .

# 3. Bring the stack up
docker compose up -d --build

# 4. Apply the migrations
docker compose exec web npm run migrate --workspace packages/db

# 5. Make sure the customer journey works end to end
bash scripts/check-cjm.sh "$BASE_URL"
```

## Required variables

Without them the application **starts**, but behaves incorrectly — which is why step 5 is mandatory.

| Variable | What for | What happens if you forget it |
|---|---|---|
| `BASE_URL` | **Every** externally issued link is built from it: the collection form, the Wall of Love, the widget snippet, the badge link | All links will point at `http://localhost:3000`, i.e. at the visitor's own machine |
| `SESSION_SECRET` | Session token signature | Owner sessions are invalid |
| `POSTGRES_PASSWORD` | Database password | **Do not leave it at the default.** An exposed database with the password `postgres` has already led to a server being compromised by a miner |
| `S3_*`, `MINIO_ROOT_*` | Video and photo storage | Uploads fail |
| `APP_DOMAIN`, `ACME_EMAIL` | Caddy TLS certificate issuance | HTTPS will not come up |

`PAYMENTS_STUB=true` (the default) — payments are simulated, YooKassa is never called.
Leave it as is for local development.

## Ports

Host ports are set **in `.env`**, not by editing `docker-compose.yml`:

```
WEB_PORT=3000
HTTP_PORT=80
HTTPS_PORT=443
```

Storage ports (Postgres, MinIO) are **not published at all** — they are reachable only by
neighbouring containers over the internal network. This is an architectural invariant, not a setting.

## Tests

The tests run against a **live** Postgres, so they need a separate stack:

```bash
bash scripts/init-test-env.sh          # .env.test with random passwords
set -a; . ./.env.test; set +a
docker compose -f compose.test.yml up -d
npm test
```

The test stack does publish ports, but **strictly on `127.0.0.1`** and with generated passwords.

## Next

- [User guide](02_user_guide.md) — how to use it
- [Administrator guide](03_admin_guide.md) — deployment, backups, secrets
- [Troubleshooting](06_troubleshooting.md) — if something does not add up
