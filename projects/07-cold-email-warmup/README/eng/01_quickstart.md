# 01. Local quickstart

Requires the full monorepo, Docker Compose, Bash, Python3 and OpenSSL. Port 18709
is an example and is occupied by the current N7 test stack: select a free port
and matching APP_ORIGIN. Check conflicts before container startup.

```bash
# From the monorepo root, before starting containers:
bash scripts/check-port-conflicts.sh projects/07-cold-email-warmup
cd projects/07-cold-email-warmup
export COMPOSE_PROJECT_NAME=n7local
export N7_RUNTIME_DIR=/tmp/n7-local-runtime
export N7_WEB_PORT=18709
export N7_APP_ORIGIN=http://127.0.0.1:18709
export MAIL_PROVIDER_ALLOWLIST='{"smtp.example.com":10,"imap.example.com":10}'
export N7_DISPATCH_MODE=disabled N7_POLL_MODE=disabled N7_BILLING_MODE=disabled
bash scripts/local-runtime.sh
docker compose up --build -d
curl --fail http://127.0.0.1:18709/readyz
```

The allowlist is JSON hostname → local daily ceiling, 1–30. Example hosts do not
prove provider availability. TEST verification needs approved public DNS hostnames;
there is no live SMTP/IMAP connector. Open `/signin`, register and use `/app`.
Migrations run before readiness. PostgreSQL has no published host port.

Runtime secrets are generated in a private directory without printing values.
Keep them out of Git and preserve them with existing data. To enable local TEST
flows, set the three mode variables to `local_test` and recreate web with
`docker compose up -d --force-recreate web`. No `live` mode is implemented.
See the [operator guide](03_admin_guide.md). `docker compose down` retains data;
do not add `-v` when data must survive.
