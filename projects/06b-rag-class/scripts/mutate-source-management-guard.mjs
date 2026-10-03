import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Fixed oracle and byte-exact restore; default needs coordinator's real PG env. --origin is local unit-only.
const origin = process.argv.includes('--origin');
const liveRetry = process.argv.includes('--live-retry');
if (origin && liveRetry) throw new Error('choose only one mutation mode');
const file = origin ? 'apps/web/src/server/source-management-handler.ts' : 'packages/db/src/source-management.ts';
const testFile = origin ? 'apps/web/tests/unit/source-management-handler.test.ts' : 'packages/db/tests/int/source-management.test.ts';
const oracle = origin ? 'rejects cross/missing Origin before session/effects'
  : liveRetry ? 'F15-R1 live plus failed retry returns409 without deadlock at retry lock boundary'
    : 'retry wins existing failed job lock: DELETE waits, sees queued, returns409-equivalent with no partial effects';
const needle = origin ? "if (kind !== 'stats' && request.headers.get('origin') !== origin)"
  : liveRetry ? `      const live = await c.query("SELECT id FROM index_job WHERE source_id = $1 AND state IN ('queued', 'running')", [sourceId]);
      if (live.rowCount) throw new SourceBusy();\n`
    : "if (jobs.rows.some((j) => j.state === 'queued' || j.state === 'running')) throw new SourceBusy();";
const replacement = origin ? 'if (false)' : liveRetry ? '' : 'if (false) throw new SourceBusy();';
const bytes = readFileSync(file); const source = bytes.toString('utf8');
const hash = (b) => createHash('sha256').update(b).digest('hex');
if (source.split(needle).length !== 2) throw new Error('guard match must be unique');
const command = ['node_modules/vitest/vitest.mjs', 'run', '--config', origin ? 'vitest.config.ts' : 'vitest.int.config.ts',
  testFile, '-t', oracle, '--reporter=verbose'];
const run = () => spawnSync(process.execPath, command, { encoding: 'utf8', timeout: 120000, env: process.env });
let failed = false;
try {
  const baseline = run(); process.stdout.write(`BASELINE exit=${baseline.status}\n${baseline.stdout}${baseline.stderr}`);
  if (baseline.status !== 0 || !baseline.stdout.includes('1 passed')) throw new Error('baseline oracle did not pass');
  writeFileSync(file, source.replace(needle, replacement));
  const red = run(); process.stdout.write(`RED exit=${red.status}\n${red.stdout}${red.stderr}`);
  if (red.status !== 1 || !red.stdout.includes('1 failed') || !red.stdout.includes(oracle))
    throw new Error('mutation must fail the fixed assertion, not merely infrastructure');
  if (liveRetry && (!red.stdout.includes('F15-R1 verified DELETE owns L and waits on retry-held F')
    || !/40P01|"deleteStatus": 503/.test(red.stdout + red.stderr)))
    throw new Error('R1 RED must prove the lock boundary and a deadlock/domain-wrong result');
} catch (error) { failed = true; process.stderr.write(`${error.name}: ${error.message}\n`); }
finally {
  writeFileSync(file, bytes);
  if (hash(readFileSync(file)) !== hash(bytes)) throw new Error('byte-exact restoration failed');
  process.stdout.write(`RESTORED SHA256=${hash(bytes)}\n`);
}
const green = run(); process.stdout.write(`GREEN exit=${green.status}\n${green.stdout}${green.stderr}`);
if (green.status !== 0 || !green.stdout.includes('1 passed')) failed = true;
process.exitCode = failed ? 1 : 0;
