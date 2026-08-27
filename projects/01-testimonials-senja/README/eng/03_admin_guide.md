# Administrator Guide

## Stack composition

| Service | Exposed outside | Role |
|---|---|---|
| `caddy` | `${HTTP_PORT:-80}`, `${HTTPS_PORT:-443}` | The only door. TLS via Let's Encrypt |
| `web` | `expose` | Next.js: pages and API |
| `worker` | — | Video transcription queue |
| `transcribe` | — | Calls to OpenAI STT. **The only service with `OPENAI_API_KEY`** |
| `postgres` | `expose` | Data |
| `minio` | `expose` | Videos and photos |

All services are declared with `restart: unless-stopped`.

## Port rule

**A database port is never published.** Postgres, MinIO and any other storage are declared
via `expose:`, not `ports:`. Only Caddy faces outside.

This is not hygiene, it is a load-bearing security condition:

1. **No scenario needs a direct database connection from outside.** The application reaches
   the database over the internal network, migrations are run from a container, debugging goes
   through `docker compose exec postgres psql`.
2. **A published database gets broken into.** On 2026-08-26 on this machine a test Postgres,
   brought up as `-p 55432:5432` with the password `postgres`, was broken into from the internet
   in roughly an hour: `COPY … TO PROGRAM` gave command execution, and a miner worm landed in the
   container. An "unusual" port number is not a protection.
3. **`web` is not published either.** Client IP detection trusts the last element of
   `X-Forwarded-For`, because Caddy appends it. A published `web` makes it possible to bypass
   Caddy and send your own single `X-Forwarded-For` — the rate limit is reset by changing the
   header. Reproduced: 7 requests in a row against a threshold of 5.

Before any start:

```bash
bash ../../scripts/check-port-conflicts.sh .    # 0 — clean, 1 — conflict
```

## Deployment

```bash
cp .env.example .env && ${EDITOR:-nano} .env
bash ../../scripts/check-port-conflicts.sh .
docker compose up -d --build
docker compose exec web npm run migrate --workspace packages/db
bash scripts/check-cjm.sh "$BASE_URL"
```

The last step is mandatory. It walks the whole customer journey and, most importantly, **follows
the links the application itself issued**, not constructed ones. That is exactly how a
configuration inconsistency is discovered: the application works, but what it hands out does not.

### Behind an existing reverse proxy

If the machine already has its own Caddy/nginx, do not publish `80`/`443` from the project.
Attach `web` to the existing proxy's network and proxy to it. `BASE_URL` must in that case point
at the **external** address — every issued link is built from it.

The `Access-Control-Allow-Origin` header must be set by **exactly one** place. If both the proxy
and the application set it, the browser will reject CORS and the widget will stop loading on all
third-party sites. `curl` will not show this — it does not apply the browser's policy.

## Secrets

| Secret | Who receives it |
|---|---|
| `POSTGRES_PASSWORD`, `DATABASE_URL` | `web`, `worker` |
| `SESSION_SECRET` | `web` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `web`, `worker` |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | `web` |
| `OPENAI_API_KEY` | **`transcribe` only** |

Isolating the OpenAI key is a deliberate architectural decision: the key lives in a single
service which has neither access to sessions nor access to the outside.

`.env` is not committed to git. Generate passwords: `openssl rand -hex 24`.

## Database roles

| Role | Rights |
|---|---|
| schema owner | migrations |
| `app_authenticated` | under RLS; sees only the rows of its own account |
| `app_service` | `BYPASSRLS`; for anonymous paths and system operations |

`app_service` bypasses RLS **on all tables**. Isolation on anonymous paths is the
responsibility of the code: the handler resolves the slug into the project identifier itself. No
anonymous route accepts a project identifier from the client.

## Backups

```bash
# Database
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz

# Object storage
docker compose exec minio mc mirror --overwrite local/testimonial-videos /backup/videos
docker compose exec minio mc mirror --overwrite local/testimonial-photos /backup/photos
```

Videos and photos live in **different** buckets: a video is served only via a signed link with a
limited lifetime, a photo — publicly, through the application's own route. A shared policy over
both would one day make videos public as well.

Restore:

```bash
gunzip -c backup-2026-08-27.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

## Observation

```bash
docker compose ps                 # state and healthcheck
docker compose logs -f web        # application logs
docker compose logs -f worker     # transcription queue
```

The worker runs in an infinite loop and takes one job at a time via
`FOR UPDATE SKIP LOCKED` — several instances will not take the same row.

A sign that the worker is not running: testimonials with video stay with the transcription
status `pending`. First check that the container is alive (`docker compose ps`) and that the
migrations have been applied — a worker that started before the migrations crashes.

## Updating

```bash
git pull
docker compose up -d --build
docker compose exec web npm run migrate --workspace packages/db
bash scripts/check-cjm.sh "$BASE_URL"
```

## Pre-handover checks

| Command | What it checks |
|---|---|
| `bash ../../scripts/check-port-conflicts.sh .` | The database is not published, ports are free, the proxy cannot be bypassed |
| `bash scripts/check-env-wiring.sh` | Every variable the code reads actually reaches its service |
| `bash scripts/check-compose-buildable.sh` | Compose builds |
| `bash scripts/check-cjm.sh "$BASE_URL"` | The customer journey works end to end on the deployed environment |
| `npm test` | 408 checks in 35 files |
