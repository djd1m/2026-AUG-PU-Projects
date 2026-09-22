import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-short-link-mutations-'));
const output = resolve('tests/artifacts/short-link/mutations'); mkdirSync(output, { recursive: true });
const service = 'apps/web/src/server/short-link.ts', handler = 'apps/web/src/server/short-link-handler.ts';
const unit = 'tests/short-link.test.ts', integration = 'tests/short-link.integration.test.ts';
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    { id: 'database-uniqueness', file: service, test: integration, title: '20 parallel visits', db: true,
      changes: [
        ['const inserted = await tx.query(', `const existing = await tx.query("SELECT 1 FROM growth_event WHERE type='link_view' AND clip_link_id=$1 AND ip_prefix=$2::cidr AND day=$3::date", [link.id, prefix, moscowDay(this.clock())]);
      if (existing.rowCount) { await tx.query('COMMIT'); return; }
      await tx.query('SELECT pg_sleep(0.2)');
      const inserted = await tx.query(`],
        [' ON CONFLICT DO NOTHING RETURNING id', ' RETURNING id'],
      ] },
    { id: 'transaction', file: service, test: integration, title: 'counter failure rolls event back', db: true,
      changes: [["await tx.query('BEGIN');", "await tx.query('SELECT 1');"]] },
    { id: 'expired-landing', file: handler, test: unit, title: 'expired landing survives',
      changes: [["const preview = state === 'ready'", "if (state === 'expired') return new Response('expired', { status: 404 });\n      const preview = state === 'ready'"]] },
    { id: 'same-404', file: service, test: unit, title: 'query filters revoked links',
      changes: [['if (!row) throw missing();', "if (!row) throw new UploadError('not_found', 'Gone', 410);"]] },
    { id: 'self-view', file: service, test: unit, title: 'owner self-visit never',
      changes: [['if (account === link.account_id) return;', '/* mutant: count owner too */']] },
    { id: 'explicit-day', file: service, test: 'tests/growth-day.test.ts', title: 'каждая вставка growth_event',
      changes: [['(type, clip_link_id, ip_prefix, day)', '(type, clip_link_id, ip_prefix, created_at)']] },
  ];
  for (const { id, file, test, title, db, changes } of mutations) {
    if (db && !process.env.DATABASE_URL) {
      const reason = 'DATABASE_URL unavailable: real PostgreSQL is mandatory; no skipped test is a pass';
      for (const phase of ['red', 'green']) writeFileSync(join(output, `${id}-${phase}.txt`), `NOT RUN: ${reason}\n`);
      results.push({ id, red: null, green: null, passed: false, reason });
      console.log(`${id}: red=NOT RUN, green=NOT RUN`); continue;
    }
    const path = join(directory, file), source = readFileSync(path, 'utf8'); let mutated = source;
    for (const [before, after] of changes) {
      if (mutated.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
      mutated = mutated.replace(before, after);
    }
    const run = phase => {
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title],
        { cwd: directory, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...(db ? {} : { DATABASE_URL: '', REDIS_URL: '' }) } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return result.status;
    };
    writeFileSync(path, mutated); const red = run('red');
    writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red === 1 && green === 0 }); console.log(`${id}: red=${red}, green=${green}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = results.some(r => r.red === null) ? 2 : 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
