import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_SQL, LEASE_SQL } from '../../src/lease';
import { SWEEP_SQL } from '../../src/sweeper';

// Стражи по исходнику фичи index-jobs (слой 1; guard-must-be-able-to-fail — у каждого рядом заведомо плохой вход).
const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((item) => {
    const full = path.join(dir, item);
    if (item === 'node_modules' || item === '.next') return [];
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(item) ? [full] : [];
  });
}

/** S-13: захват — SKIP LOCKED, истёкшая аренда, ≤ 3 захвата, run_started_at только из queued. */
export function leaseViolations(sql: string): string[] {
  const out: string[] = [];
  if (!/FOR UPDATE SKIP LOCKED\s+LIMIT 1/.test(sql)) out.push('нет FOR UPDATE SKIP LOCKED LIMIT 1');
  if (!/c\.state = 'running' AND c\.leased_until < now\(\)/.test(sql)) out.push('running перезахватывается без истёкшей аренды');
  if (!/c\.attempts < \$2/.test(sql)) out.push('нет предела захватов attempts < $2');
  if (!/lease_fence = j\.lease_fence \+ 1/.test(sql)) out.push('fence не растёт при захвате');
  if (!/run_started_at = CASE WHEN j\.state = 'queued' THEN now\(\) ELSE j\.run_started_at END/.test(sql)) {
    out.push('перезахват сбрасывает run_started_at');
  }
  return out;
}

/** S-14: каждая запись исполнителя в index_job условна по номеру захвата и состоянию running. */
export function fenceViolations(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, raw] of Object.entries(sources)) {
    const text = stripComments(raw);
    for (const m of text.matchAll(/UPDATE index_job\b[\s\S]*?(?=`)/g)) {
      const stmt = m[0];
      if (/SET state = 'running'/.test(stmt) && /SKIP LOCKED/.test(stmt)) continue; // захват: fence растёт там
      if (/SET state = 'failed', finished_at = now\(\), leased_until = NULL,/.test(stmt) && /leased_until < now\(\)/.test(stmt)) continue; // уборщик
      if (!/WHERE id = \$1 AND lease_fence = \$2 AND state = 'running'/.test(stmt)) out.push(`${file}: запись без fence: ${stmt.slice(0, 60)}`);
    }
  }
  return out;
}

/** S-15: потолок считается от run_started_at и часами БД; created_at в расчёте не участвует. */
export function ceilingViolations(checkpoint: string, sweep: string): string[] {
  const out: string[] = [];
  if (!/\(now\(\) - run_started_at\) > make_interval\(mins => \$4\)/.test(checkpoint)) out.push('контрольная точка не от run_started_at');
  if (!/now\(\) - run_started_at > make_interval\(mins => \$2\)/.test(sweep)) out.push('уборщик не от run_started_at');
  if (/created_at/.test(checkpoint) || /created_at/.test(sweep)) out.push('потолок от created_at');
  return out;
}

/** S-16: ручка создания не выполняет работу — web не импортирует исполнителя и цикл воркера. */
export function handleBeforeWorkViolations(sources: Record<string, string>): string[] {
  return Object.entries(sources).filter(([, t]) => /services\/worker|from ['"][^'"]*(?:runner|loop|lease)['"]|runOnce\(/
    .test(stripComments(t))).map(([f]) => `${f}: web выполняет работу задачи или импортирует воркер`);
}

const workerSources = () => Object.fromEntries(files(path.join(ROOT, 'services/worker/src'))
  .map((f) => [path.relative(ROOT, f), readFileSync(f, 'utf8')]));
const webSources = () => Object.fromEntries(files(path.join(ROOT, 'apps/web/src'))
  .map((f) => [path.relative(ROOT, f), readFileSync(f, 'utf8')]));

describe('стражи index-jobs: боевое дерево чисто', () => {
  it('дерево прочитано (страж на пустоте не зеленеет)', () => {
    expect(Object.keys(workerSources())).toContain('services/worker/src/lease.ts');
    expect(Object.keys(webSources())).toContain('apps/web/src/server/jobs-handler.ts');
  });
  it('S-13: захват', () => expect(leaseViolations(LEASE_SQL)).toEqual([]));
  it('S-14: каждая запись исполнителя с fence (найдено ≥ 3 записи)', () => {
    const src = workerSources();
    expect(fenceViolations(src)).toEqual([]);
    expect([...stripComments(src['services/worker/src/lease.ts']!).matchAll(/lease_fence = \$2 AND state = 'running'/g)].length)
      .toBeGreaterThanOrEqual(3);
  });
  it('S-15: потолок от run_started_at', () => expect(ceilingViolations(CHECKPOINT_SQL, SWEEP_SQL)).toEqual([]));
  it('S-16: ручка до работы', () => expect(handleBeforeWorkViolations(webSources())).toEqual([]));
});

describe('стражи index-jobs умеют падать', () => {
  it('S-13 ловит снятый SKIP LOCKED, предел, fence и сброс run_started_at', () => {
    expect(leaseViolations(LEASE_SQL.replace('FOR UPDATE SKIP LOCKED', 'FOR UPDATE'))).not.toEqual([]);
    expect(leaseViolations(LEASE_SQL.replace('AND c.attempts < $2', ''))).not.toEqual([]);
    expect(leaseViolations(LEASE_SQL.replace("(c.state = 'running' AND c.leased_until < now())", "c.state = 'running'")))
      .not.toEqual([]);
    expect(leaseViolations(LEASE_SQL.replace('lease_fence = j.lease_fence + 1', 'lease_fence = j.lease_fence'))).not.toEqual([]);
    expect(leaseViolations(LEASE_SQL.replace("CASE WHEN j.state = 'queued' THEN now() ELSE j.run_started_at END", 'now()')))
      .not.toEqual([]);
  });
  it('S-14 ловит запись исхода без fence', () => {
    const lease = read('services/worker/src/lease.ts');
    const unfenced = lease.replace(/WHERE id = \$1 AND lease_fence = \$2 AND state = 'running'`,\s*\[job\.id, job\.fence, outcome/,
      "WHERE id = $1 AND state = 'running'`, [job.id, job.fence, outcome");
    expect(unfenced).not.toBe(lease); // замена сработала — иначе проверка ниже была бы проверкой исходного файла
    expect(fenceViolations({ 'x.ts': unfenced })).not.toEqual([]);
    expect(fenceViolations({ 'y.ts': "c.query(`UPDATE index_job SET progress_done = $2 WHERE id = $1`)" })).not.toEqual([]);
  });
  it('S-15 ловит потолок от created_at', () => {
    expect(ceilingViolations(CHECKPOINT_SQL.replace('now() - run_started_at', 'now() - created_at'), SWEEP_SQL)).not.toEqual([]);
    expect(ceilingViolations(CHECKPOINT_SQL, SWEEP_SQL.replace('now() - run_started_at', 'now() - created_at'))).not.toEqual([]);
  });
  it('S-16 ловит работу в ручке', () => {
    expect(handleBeforeWorkViolations({ 'apps/web/src/server/jobs-handler.ts':
      "import { runOnce } from '../../../../services/worker/src/loop';" })).not.toEqual([]);
    expect(handleBeforeWorkViolations({ 'a.ts': 'await runOnce({ pool, runner })' })).not.toEqual([]);
  });
});
