# Optional live billing runtime

Select `docker-compose.live-billing.yml` explicitly with the baseline file. Baseline
disabled/TEST billing needs no YooKassa files. Only web gets merchant secrets;
db and poll-worker keep existing secrets. DB password, AEAD keyring, hash/session
keys, network, private DB and loopback web port are preserved.

Prepare a private folder outside the repository, owned by the deployment operator:

```sh
install -d -m 700 /private/n7-billing
# Operator securely supplies shop-id (shop ID text) and secret-key (secret key text).
# Never put credential values in shell arguments, env files, logs or the repository.
export N7_YOOKASSA_SHOP_ID_FILE=/private/n7-billing/shop-id
export N7_YOOKASSA_SECRET_KEY_FILE=/private/n7-billing/secret-key
export N7_APP_ORIGIN=https://n7.194.85.249.105.sslip.io
# Set N7_TEAM_PRICE_MINOR to the owner's approved price; no default exists.
: "${N7_TEAM_PRICE_MINOR:?set the owner-approved positive integer price first}"
docker compose -f docker-compose.yml -f docker-compose.live-billing.yml config --format json
```

Local Compose file secrets retain host ownership/mode. A root-owned mode600 file
is unreadable by the image's `USER node`. The current candidate runtime identity
is UID/GID1000:1000; verify it against the exact accepted image/container before
changing ownership. Keep the operator-owned parent directory mode700. Align only
the two new merchant files with the verified runtime UID/GID and mode600 (or use
an equally restricted ACL); leave existing AEAD, session, hash and DB keys untouched.

The following operator steps require an already running, source/image-verified
N7 candidate web container. They do not start a container. Inspect its configured
user/image and verify its default UID/GID matches execution as `node`; stop if it
is not `node`, IDs differ, or the candidate is unavailable. Do not substitute an
unverified old deployment as evidence:

```sh
: "${N7_CANDIDATE_WEB_CONTAINER:?set the verified existing N7 candidate container ID}"
docker inspect --format '{{.Config.User}} {{.Image}}' "$N7_CANDIDATE_WEB_CONTAINER"
docker exec "$N7_CANDIDATE_WEB_CONTAINER" node -e 'console.log(process.getuid(), process.getgid())'
docker exec --user node "$N7_CANDIDATE_WEB_CONTAINER" node -e 'console.log(process.getuid(), process.getgid())'
# After confirming configured USER node and equal nonroot UID/GID:
N7_BILLING_UID=$(docker exec --user node "$N7_CANDIDATE_WEB_CONTAINER" node -e 'process.stdout.write(String(process.getuid()))')
N7_BILLING_GID=$(docker exec --user node "$N7_CANDIDATE_WEB_CONTAINER" node -e 'process.stdout.write(String(process.getgid()))')
chown "$N7_BILLING_UID:$N7_BILLING_GID" /private/n7-billing/shop-id /private/n7-billing/secret-key
chmod 600 /private/n7-billing/shop-id /private/n7-billing/secret-key
```

After the two merchant files are mounted in that candidate under the separately
authorized release step, run this filename-only readability preflight as image
`USER node`. It checks access permissions without reading or printing file contents:

```sh
docker exec --user node "$N7_CANDIDATE_WEB_CONTAINER" node -e '
const fs = require("node:fs");
if (process.getuid() === 0) process.exit(1);
for (const name of ["yookassa_shop_id", "yookassa_secret_key"]) {
  try { fs.accessSync("/run/secrets/" + name, fs.constants.R_OK); console.log(name + ": readable"); }
  catch { console.error(name + ": unreadable"); process.exitCode = 1; }
}'
```

Both filenames must report readable with exit0. If no verified candidate has the
mounts, record this preflight as pending; config rendering cannot prove readability.
These examples are operator instructions: this config/docs unit performs no secret
reads, ownership/mode changes, container starts or charges.

`N7_YOOKASSA_*_FILE` values are host file paths. Compose mounts their files at
`/run/secrets/yookassa_shop_id` and `/run/secrets/yookassa_secret_key`; the application
receives only these container paths as `YOOKASSA_SHOP_ID_FILE` and
`YOOKASSA_SECRET_KEY_FILE`. Compose requires nonempty inputs. Accepted application
config additionally requires HTTPS APP_ORIGIN and a canonical integer price in
1..2147483647. Price is RUB minor units for Team/30 days. No quota or monetary
fallback is added.

Before activation the coordinator must separately verify live merchant activation
and subscription/routing of the exact webhook
`https://n7.194.85.249.105.sslip.io/api/billing/webhooks/yookassa`, including verified
refund discovery. Owner price is pending. Config rendering proves no actual payment
or merchant activation. Accepted source/image, worker, TLS/proxy bindings, protected
backup/restore, container starts and actual transactions remain separate release
steps under the approved plans. Preserve existing data encryption keys; do not
generate replacements for the current database.
