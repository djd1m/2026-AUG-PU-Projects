# 03. Local TEST operator

The operator owns process/runtime access; tenants cannot seed polling state over
HTTP. Create synthetic mailbox/campaign records, TEST verification and separate
consents first. A due job also requires a completed poll younger than 60 seconds.

```bash
# In the project directory with the same exported Compose variables:
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test
docker compose up -d --force-recreate web
# TENANT_ID and MAILBOX_ID are owned test-record UUIDs obtained from your cabinet/API.
printf '%s\n' '{"uidvalidity":"1","uidNext":1,"headers":[]}' > /tmp/n7-empty-inbox.json
docker compose cp /tmp/n7-empty-inbox.json web:/tmp/n7-empty-inbox.json
docker compose exec -T web npm run replies:operator -- seed "$TENANT_ID" "$MAILBOX_ID" /tmp/n7-empty-inbox.json
docker compose exec -T web npm run replies:operator -- poll "$TENANT_ID" "$MAILBOX_ID"
docker compose exec -T web npm run dispatch:tick
```

A dispatch tick reserves at most one job and writes to the durable local sink,
visible through the owner's `/api/dispatch/messages`. Continuous local polling:
`docker compose --profile local-poll up -d poll-worker`. Reply fixtures follow
`src/replies/input.ts`; `scripts/ui/f06-fixture.mjs` contains the exercised operator
flow. Never replace a poll with an SQL freshness update. Operator retry runs
`npm run replies:operator -- retry TENANT_ID MAILBOX_ID` inside web.

For TEST billing, the user creates checkout in the cabinet. The operator posts
`paymentId` and `status: "succeeded"` to `/api/operator/billing/simulate`, then
`intentId` to `/api/operator/billing/reconcile`. These routes require the dedicated
runtime Bearer and no cookie. Exact validation is in `src/billing/provider.ts`.
Read the key in a private operator process; never place it in shell arguments,
browser code or logs. The browser fixture demonstrates this separation.
Repeated reconciliation neither duplicates nor extends the grant. The local
fixture price is 100 minor RUB for 30 days, not a commercial price offer.

Complaints use the separate operator-only `POST /api/complaints` and rate limit.
See the [deployment checkpoint](../../docs/deployment-checkpoint.md) for later live operations.
