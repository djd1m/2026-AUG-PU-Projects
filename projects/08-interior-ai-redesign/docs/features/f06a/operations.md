# F06a operations handoff — commands are inert

Source `8030270f023d83c9cdd597c4578517a1b58b4b35`; run `n8-20261002-1740`.
This writer executes no container, SQL, backup, restore, network or provider command. **Actual restore receipt: pending coordinator execution after the browser matrix.** Commands below target only the coordinator's already owned synthetic PostgreSQL16 fixture, never a user/production database. They are standard tools, not a new restore engine. Independent documentation completion does not complete F06/MVP.

## Local processes and boundaries

See [English](../../README/en.md) / [Russian README](../../README/ru.md) for source-checked commands and configuration names. [compose.yaml](../../../compose.yaml) contains db/web/maintenance, disabled provider/inference and total CPU2; only loopback web is published. It migrates on web startup using [scripts/migrate.js](../../../scripts/migrate.js), all six [SQL migrations](../../../db/). There is no `deployment/compose.yml`, deploy script or inference Compose service. From project cwd the port checker takes `compose.yaml` (or `scripts/ui/compose.e2e.yml` for the browser stand), not a directory that would imply `docker-compose.yml`; retain the same private interpolation environment.

Full configured source stack: privately provision Node22/locked npm dependencies, PG16 and storage outside `web/`; run migrations, normal server, maintenance and separate `scripts/worker.js` with the same database/private volume. Web keeps `WORKER_MODE=disabled`; worker explicitly selects fixture/controlnet with immutable revision/seed. Local provider fixture needs explicit nonproduction `PROVIDER_MODE=fixture`; normal server runs the payment-create loop. Base Compose fixes provider disabled, so enable the configured separate process or an operator-reviewed local override rather than assume interpolation enables payments. No override is authored here.

[Browser runbook](../f04b-fix/browser-runbook.md) and [UI Compose](../../../scripts/ui/compose.e2e.yml) own the HTTPS synthetic stand and disabled-provider restart. They require exact environment/schema/storage guards, private env file, fresh companion preflight and source/image binding. The test proxy/browser and `accepted-software` SQL seeds do not belong to a production configuration. All earlier browser failures remain evidence; actual UI6 matrix passed42main+2disabled checks; see [receipt](../../telemetry/n8-20261002-1740/n8-ui-e2e-6-receipt.md).

Private media includes normalized input UUIDs plus `outputs`, `depths`, `configs` and composites. Preserve that volume alongside DB backup for a real rollback: a DB dump alone cannot restore image bytes. Tombstoned/rejected media is denied immediately; periodic maintenance retries physical cleanup within the required hour. Do not manually purge referenced files, quality evidence, ledger, tickets or payment records.

## Owned synthetic backup/restore procedure

Run only after browser evidence is captured and the coordinator confirms it still owns the exact stand. The current stand must contain linked synthetic accounts/uploads/jobs/ledger/payment intents; no substitute empty database counts. Use local container Unix-socket authentication, never a password argument, connection URL, env dump or shell tracing. PostgreSQL tools below are the existing PG16 container tools. Keep raw dump outside Git, mode0600, never `cat`/print/archive it in receipts.

The coordinator supplies these identifiers privately from its current launch record; they are **not** derived by searching for a convenient shared container:

- `N8_PROJECT_ROOT`: exact owned N8 project directory; `N8_PG_CONTAINER`: exact owned DB container ID.
- `N8_SOURCE_DB`: `n8_ui_` plus12hex; `N8_SOURCE_SCHEMA`: `n8_ui_` plus24hex; `N8_UI_ENV_FILE`: existing own ignored mode0600 environment file.
- `N8_HEAVY_LOCK`: the coordinator's existing heavy mutex path, confirmed to be the same lock used for image/browser work. Do not invent a second lock.
- Retain existing Compose interpolation environment; do not print it. UI Compose project is exactly `n8-ui-e2e`.

Each block is sequential: any nonzero exit stops; retain command exits without raw errors that may expose configuration. Preserve failure evidence; do not turn a failed restore into PASS by deleting its record.

```bash
set -euo pipefail
set +x
: "${N8_PROJECT_ROOT:?}" "${N8_PG_CONTAINER:?}" "${N8_SOURCE_DB:?}"
: "${N8_SOURCE_SCHEMA:?}" "${N8_UI_ENV_FILE:?}" "${N8_HEAVY_LOCK:?}"
[[ "$N8_SOURCE_DB" =~ ^n8_ui_[a-f0-9]{12}$ ]]
[[ "$N8_SOURCE_SCHEMA" =~ ^n8_ui_[a-f0-9]{24}$ ]]
[[ -f "$N8_HEAVY_LOCK" && ! -L "$N8_HEAVY_LOCK" ]]
[[ -f "$N8_UI_ENV_FILE" && ! -L "$N8_UI_ENV_FILE" ]]
[[ "$(stat -c %a "$N8_UI_ENV_FILE")" = 600 ]]
exec 9<"$N8_HEAVY_LOCK"
flock -x -w 60 9
cd "$N8_PROJECT_ROOT"
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$N8_PG_CONTAINER")" = n8-ui-e2e ]]
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$N8_PG_CONTAINER")" = db ]]
[[ "$(docker compose -f scripts/ui/compose.e2e.yml ps -q db)" = "$N8_PG_CONTAINER" ]]
[[ "$(docker inspect -f '{{.Config.Image}}' "$N8_PG_CONTAINER")" = postgres:16.10-bookworm ]]
[[ "$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$N8_PG_CONTAINER")" = 750000000 ]]
[[ "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$N8_PG_CONTAINER")" =~ ^(null|\{\})$ ]]
[[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$N8_PG_CONTAINER")" = n8-ui-e2e ]]
```

Validate live PG version, explicit DB comment/owner, exact schema ownership and six migration versions **before stopping or dumping anything**. A name/label alone is insufficient.

```bash
N8_OWNED_OK=$(docker exec -i "$N8_PG_CONTAINER" psql -XAtq \
  -h /var/run/postgresql -U n8_ui_owner -d "$N8_SOURCE_DB" \
  -v ON_ERROR_STOP=1 -v schema="$N8_SOURCE_SCHEMA" <<'SQL'
SELECT current_setting('server_version_num')::int BETWEEN 160000 AND 169999
 AND d.datname=current_database() AND pg_get_userbyid(d.datdba)='n8_ui_owner'
 AND shobj_description(d.oid,'pg_database')='N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE'
 AND EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname=:'schema'
   AND pg_get_userbyid(n.nspowner)='n8_ui_owner') FROM pg_database d
 WHERE d.datname=current_database();
SELECT format('SET search_path TO %I,public', :'schema') \gexec
SELECT count(*)=6 AND min(version)=1 AND max(version)=6 FROM schema_migration;
SELECT EXISTS(SELECT 1 FROM job j JOIN upload u ON u.id=j.upload_id
 JOIN account a ON a.id=j.account_id JOIN credit_ledger l ON l.account_id=a.id
 JOIN payment_intent p ON p.account_id=a.id WHERE u.account_id=a.id);
SQL
)
[[ "$N8_OWNED_OK" = $'t\nt\nt' ]]
for N8_SERVICE in web maintenance; do
  N8_SERVICE_ID=$(docker compose -f scripts/ui/compose.e2e.yml ps -q "$N8_SERVICE")
  [[ -n "$N8_SERVICE_ID" ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$N8_SERVICE_ID")" = n8-ui-e2e ]]
  [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$N8_SERVICE_ID")" = "$N8_SERVICE" ]]
done
# No independent fixture/worker/payment writer may remain; confirm coordinator
# ownership/quiescence before stopping these exact services after browser completion.
docker compose -f scripts/ui/compose.e2e.yml stop web maintenance
# Confirm both are stopped; no independent fixture/worker/payment writer may remain.
[[ -z "$(docker compose -f scripts/ui/compose.e2e.yml ps --status running -q web maintenance)" ]]
umask 077
N8_RESTORE_DIR=$(mktemp -d /tmp/n8-f06-restore-XXXXXXXX)
N8_DUMP="$N8_RESTORE_DIR/fixture.dump"
N8_RESTORE_DB="n8_restore_$(openssl rand -hex 6)"
N8_TARGET_CREATED=false
[[ "$N8_RESTORE_DB" =~ ^n8_restore_[a-f0-9]{12}$ && "$N8_RESTORE_DB" != "$N8_SOURCE_DB" ]]
```

Before `stop`, the commands verify service labels/IDs; the coordinator must also confirm quiescence including any independent worker/fixture client. The maintenance loop otherwise changes timestamps/deadlines during comparison. Acquire both normal coordinator ownership and the heavy lock; CPU≤2, no additional container or host port is needed.

Use this SQL as an inert snapshot query: save it at `$N8_RESTORE_DIR/snapshot.sql` mode0600. It returns **only table labels, counts and deterministic aggregate digests**, never row data, email, password hashes, session tokens, provider bodies or confirmation URLs. It measures the listed nonsecret relationship/state projections, not byte equality of every field. Dump/restore includes the complete selected schema, its sequences, foreign keys, functions/triggers and migration state.

```sql
SELECT format('SET search_path TO %I,public', :'schema') \gexec
WITH projected(tab,body) AS (
 SELECT 'account',jsonb_build_array(id,trial_granted,billing_hold,badge_free_entitlement,first_paid_payment_id)::text FROM account
 UNION ALL SELECT 'upload',jsonb_build_array(id,account_id,sha256,width,height,deleted_at)::text FROM upload
 UNION ALL SELECT 'job',jsonb_build_array(id,account_id,upload_id,style,status,fence,attempts,first_ticket_id,reserved,quality,deleted_at)::text FROM job
 UNION ALL SELECT 'credit_ledger',jsonb_build_array(id,account_id,delta,kind,reference)::text FROM credit_ledger
 UNION ALL SELECT 'payment_intent',jsonb_build_array(id,account_id,package,amount_minor,currency,status,provider_mode,partner_id)::text FROM payment_intent
 UNION ALL SELECT 'attempt_ticket',jsonb_build_array(id,job_id,attempt_number,day,consumed_at,superseded)::text FROM attempt_ticket
 UNION ALL SELECT 'attempt_budget',jsonb_build_array(bucket,owner,day,count)::text FROM attempt_budget
 UNION ALL SELECT 'first_conversion',jsonb_build_array(account_id,payment_intent_id,partner_id,amount_minor,currency,valid)::text FROM first_conversion
 UNION ALL SELECT 'schema_migration',jsonb_build_array(version)::text FROM schema_migration
 UNION ALL SELECT 'constraint',jsonb_build_array(c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid))::text
 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=:'schema'
), labels(tab) AS (VALUES ('account'),('upload'),('job'),('credit_ledger'),('payment_intent'),
 ('attempt_ticket'),('attempt_budget'),('first_conversion'),('schema_migration'),('constraint'))
SELECT l.tab,count(p.body),md5(coalesce(string_agg(md5(p.body),'' ORDER BY md5(p.body)),''))
FROM labels l LEFT JOIN projected p USING(tab) GROUP BY l.tab ORDER BY l.tab;
```

Capture source-before, dump, restore to a fresh dedicated target, source-after and restored-target using that identical query/schema. `createdb` must fail if the target already exists; never drop/overwrite a pre-existing target. Do not use `--clean` or restore into source.

```bash
docker exec -i "$N8_PG_CONTAINER" psql -XAtq -h /var/run/postgresql \
  -U n8_ui_owner -d "$N8_SOURCE_DB" -v ON_ERROR_STOP=1 -v schema="$N8_SOURCE_SCHEMA" \
  < "$N8_RESTORE_DIR/snapshot.sql" > "$N8_RESTORE_DIR/source-before.txt"
docker exec "$N8_PG_CONTAINER" pg_dump -h /var/run/postgresql -U n8_ui_owner \
  -d "$N8_SOURCE_DB" --format=custom --schema="$N8_SOURCE_SCHEMA" \
  --no-owner --no-privileges > "$N8_DUMP"
chmod 600 "$N8_DUMP"
docker exec "$N8_PG_CONTAINER" createdb -h /var/run/postgresql -U n8_ui_owner \
  --owner=n8_ui_owner --template=template0 "$N8_RESTORE_DB"
N8_TARGET_CREATED=true
# Cleanup is allowed only for this recorded fresh target.
docker exec -i "$N8_PG_CONTAINER" psql -Xq -h /var/run/postgresql -U n8_ui_owner \
  -d "$N8_RESTORE_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT format('COMMENT ON DATABASE %I IS %L',current_database(),
 'N8_F06A_OWNED_LOCAL_RESTORE_FIXTURE') \gexec
SQL
docker exec -i "$N8_PG_CONTAINER" pg_restore -h /var/run/postgresql -U n8_ui_owner \
  -d "$N8_RESTORE_DB" --exit-on-error --single-transaction --no-owner --no-privileges < "$N8_DUMP"
docker exec -i "$N8_PG_CONTAINER" psql -XAtq -h /var/run/postgresql \
  -U n8_ui_owner -d "$N8_SOURCE_DB" -v ON_ERROR_STOP=1 -v schema="$N8_SOURCE_SCHEMA" \
  < "$N8_RESTORE_DIR/snapshot.sql" > "$N8_RESTORE_DIR/source-after.txt"
docker exec -i "$N8_PG_CONTAINER" psql -XAtq -h /var/run/postgresql \
  -U n8_ui_owner -d "$N8_RESTORE_DB" -v ON_ERROR_STOP=1 -v schema="$N8_SOURCE_SCHEMA" \
  < "$N8_RESTORE_DIR/snapshot.sql" > "$N8_RESTORE_DIR/restored.txt"
cmp -s "$N8_RESTORE_DIR/source-before.txt" "$N8_RESTORE_DIR/source-after.txt"
cmp -s "$N8_RESTORE_DIR/source-before.txt" "$N8_RESTORE_DIR/restored.txt"
```

Receipt must include exact source/image/Compose digest, ownership/version/quiescence checks, dump mode0600, exits, row counts/projection digests, source-before=after and restored=source, constraint preservation, durations and cleanup outcome. Keep dump bytes, raw rows, passwords and full env out of logs/Git. This proves the bounded synthetic DB procedure only, not production media recovery, old-schema migration/rollback, provider acceptance or a GPU result.

Cleanup **only the newly created target** after rechecking exact DB name, owner and `N8_F06A_OWNED_LOCAL_RESTORE_FIXTURE` comment with psql (as in the source ownership query). If identity is ambiguous, stop without dropping anything. Also recheck container labels. Never drop source/schema or use Compose down/volume deletion as part of this restore check. On failure preserve redacted evidence and still clean the proven own target/dump; do not resume application writers until source comparison is recorded.

```bash
# Recheck container project/service/ID as above before cleanup.
[[ "$N8_TARGET_CREATED" = true ]]
N8_TARGET_OK=$(docker exec -i "$N8_PG_CONTAINER" psql -XAtq \
  -h /var/run/postgresql -U n8_ui_owner -d "$N8_RESTORE_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_get_userbyid(datdba)='n8_ui_owner'
 AND shobj_description(oid,'pg_database')='N8_F06A_OWNED_LOCAL_RESTORE_FIXTURE'
 FROM pg_database WHERE datname=current_database();
SQL
)
[[ "$N8_TARGET_OK" = t ]]
[[ "$N8_RESTORE_DB" =~ ^n8_restore_[a-f0-9]{12}$ && "$N8_RESTORE_DB" != "$N8_SOURCE_DB" ]]
docker exec "$N8_PG_CONTAINER" dropdb -h /var/run/postgresql -U n8_ui_owner "$N8_RESTORE_DB"
# Remove only this run's dump; retain safe snapshot/count/digest evidence for receipt.
[[ "$N8_DUMP" = "$N8_RESTORE_DIR/fixture.dump" && -f "$N8_DUMP" && ! -L "$N8_DUMP" ]]
rm -- "$N8_DUMP"
flock -u 9
```

## Rollback and release gates

Stop new admissions/writers under operator control; retain DB/private media and let active fenced work finish or time out. Roll back only a compatible image/source revision; inspect migration compatibility rather than run a destructive down migration. All six migrations are versioned by `schema_migration`; no down-migration CLI exists. Never rewrite ledger/payment history, clear permanent hold, recycle attempt tickets or edit historical receipts. Monetary discrepancies need operator review, not automatic money movement.

ControlNet pins are enforced by [worker/manifest.py](../../../worker/manifest.py): SD `451f4fe16113bff5a5d2269ed5ad43b0592e9a14`, ControlNet `539f99181d33db39cf1af2e517cd8056785f0a87`, depth `11eaf7a1cf4bd70740697dbc216f98980c0aeb03`. Provision verified safe files/licenses offline; Intel DPT safe weights and resolved dependency/security compatibility still require F05 evidence. New results stay unverified. Operator review requires actor/time/hash-bound actual corpus and unchanged image bytes. Ordinary account/fixture has no acceptance path.

Before aggregate delivery: actual complete 1440/390 browser plus disabled-provider restart, synthetic restore receipt, dependency/security closure, real12×3 corpus and ≥30 warm GPU p95≤25s. Real provider test-mode verification remains a separate provider gate with external authorization; fixture is not YooKassa acceptance. Deployment/spend/GPU rental/mail/live payments remain unauthorized. Draft PR may target existing `claude/install-npm-packages-n7l3m5` with pending gates listed; do not create main, merge or deploy. [Completion](../../Completion.md) retains deployment authority and monitoring limits.

## Later measured restore evidence

[Coordinator receipt](../../telemetry/n8-20261002-1740/n8-f06-restore-1-receipt.md) records actual standard pg_dump/pg_restore into distinct owned DB:21tables/451rows, full-row aggregate digests and constraints match, source unchanged,16.145s. Separate quiescent synthetic media tar recovery:10files/8243bytes,127ms. Rawdump/archives/restoretarget removed; original temporary UI stack removed only after this independent check. No restored-pair application restart, live DB/media recovery, old-schema rollback or production RPO/RTO is claimed. Commands above remain inert documentation; measured coordinator orchestration used all-table aggregate digests rather than the illustrative nonsecret projection query.
