# I4b-R1 bounded correction

Run n8-20261002-1740; work n8-replicate-i4b-r1; attempt replicate-i4b-r1-1.
Source d70d2474f9bcff0d4f15bc86475a662e952f7aac; launch SHA256 dd484fcfe52b14e47e37c1ca397f73d2f6c6a4dbbfd3addc9512773f16055f03; approved F07 spec SHA256 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad (inherited parent binding, not a new Specification.md digest).
Profile compact-quality-first-v2; approved substantive XL retained, mechanical M/exit0. Explicit sole gpt-6.1-sol/high corrector; actual model/effort/usage/cost null pending host evidence. No delegation or model fallback.

Before: $3 became uuid through job.output_key, then JSON ->> comparisons required text=uuid. The caught PostgreSQL query failure made false/throw completion uncertain and prevented confidently unreferenced cleanup.
After: job.output_key=$3::uuid; BOTH JSON comparisons use (($3::uuid)::text). Only these three casts changed production. Global/evidence references, winner predicate, fail-closed catch, completion API, disposal guard and all other modules stay byte-identical.

## Additive acceptance coverage

- Real stale-fence jobs.complete returns literal false without attachment; worker queries the real database, guards deletion of output/depth/config files, calls fenced jobs.fail exactly once, and produces exactly one customer release even after repeat fail. Original private input, ticket/capacity/spend rows remain unchanged; no evidence is inserted.
- Global and evidence-only cases run actual worker/import/jobs.complete, generating real immutable evidence and private bytes, then simulate a lost false completion response. The reference lookup executes the verbatim production SQL on real PostgreSQL with an unrelated legally reserved queued job as lookup scope, proving has_evidence=false/status=queued cannot mask the reference guard. Evidence-only adds a read-only CTE projecting job output keys as NULL. The actual query must return referenced=true, the worker must return false without fail, and original completion evidence/file hashes/accounting must survive.
- Limitation: global/evidence isolation is an explicit test query-scope projection, not a naturally occurring cross-job or evidence-only orphan lifecycle. Persisted jobs/evidence are untouched; no direct evidence insertion, schema modification, disabled trigger, mocked reference booleans or new production API. Standalone naturally arising evidence-only lifecycle construction remains unproven. Parent must execute these scenarios on real PG before acceptance.
- Existing false/throw winner and unavailable-reference cases, and every other original integration byte, are preserved. All existing unit fixtures are unchanged.

## Exact-source checks

Affected worker/config units: 24 pass, 0 fail, 0 skip (exit0). scripts/check.js final exit0; new PG suite syntax exit0; git diff --check exit0. Final static rerun followed the last additive test assertion; unchanged successful unit tests were not rerun. Scope check verifies 103 protected hashes, six untouched current I4b files, only two product/test paths changed, exactly three production casts and original integration bytes. Worker135/test212 lines.

No actual PG, provider/network, credentials, installs, Docker, host listener, global configuration, run-events, commits or push executed. No new mutation was run: original old-SQL actual-PG failure remains recorded history, and these SQL guards require parent PG execution for meaningful new-test/mutation proof. Prior authority16/lifecycle18/evidence16 green evidence remains historical, not rerun here. No acceptance or hosted-quality claim.

From PROJECT_ROOT, commands executed as local checks:

```sh
/tmp/n8-node22 --import ./tests/replicate-generation-fixtures.js --test --test-concurrency=1 tests/replicate-generation.test.js tests/replicate-worker-config.test.js
/tmp/n8-node22 scripts/check.js
/tmp/n8-node22 --check tests/replicate-generation.integration.test.js
```

Parent next: exact frozen Node22/PG16 worker suite with these additive cases, unchanged original false/throw/unavailable oracles, then fresh Astra narrow closure. Parent owns I4c afterward; no I4c work performed. I6/I7/I8 and separately authorized paid/quality gates remain outside this correction. No background continuation is claimed.

Companion preparation/handoff applied; E2E not_applicable for offline correction. Parent owns real-PG readiness and independent review. Forecast insufficient_data; this bounded attempt uses the supplied600s budget, not a completion forecast. Trace and snapshot under docs/telemetry/n8-20261002-1740/replicate-i4b-r1-*. Observed elapsed at freeze 526446ms; launch-to-freeze 539468ms; accepted-result duration pending parent. Usage/cost unavailable; savings not established.

Frozen files:

| Path | SHA256 |
| --- | --- |
| web/replicate-generation.js | 0211a672d57c02d7915745a70eef3ec80fa764c6226d0e7528c2797ec322df44 |
| tests/replicate-generation.integration.test.js | 1752e806fa279a901a66cfe0421a1f717289c6715288dadba8c08738f594fced |
