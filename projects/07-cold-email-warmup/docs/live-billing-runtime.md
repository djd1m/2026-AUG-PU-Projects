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
chmod 600 /private/n7-billing/shop-id /private/n7-billing/secret-key
export N7_YOOKASSA_SHOP_ID_FILE=/private/n7-billing/shop-id
export N7_YOOKASSA_SECRET_KEY_FILE=/private/n7-billing/secret-key
export N7_APP_ORIGIN=https://n7.194.85.249.105.sslip.io
# Set N7_TEAM_PRICE_MINOR to the owner's approved price; no default exists.
: "${N7_TEAM_PRICE_MINOR:?set the owner-approved positive integer price first}"
docker compose -f docker-compose.yml -f docker-compose.live-billing.yml config --format json
```

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
