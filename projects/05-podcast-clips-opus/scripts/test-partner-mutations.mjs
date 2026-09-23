import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-partner-mutations-'));
const output = resolve('tests/artifacts/partner-codes-and-dashboard/mutations'); mkdirSync(output, { recursive: true });
const service = 'apps/web/src/server/partner.ts', unit = 'tests/partner.test.ts', integration = 'tests/partner.integration.test.ts';
const results = [];
const weakerSql = "(($3='explicit' AND source IN ('cookie','guest_link')) OR ($3='guest_link' AND source='cookie')) RETURNING *";
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    { id: 'invalid-no-fallback', title: 'invalid code returns 422', changes: [[
      'if (!code) throw invalid();', "if (!code) { const fallback = await tx.query<Attribution>('SELECT * FROM attribution WHERE account_id=$1 FOR UPDATE', [account]); await tx.query('COMMIT'); return fallback.rows[0]!; }",
    ]] },
    { id: 'explicit-immutable', title: 'explicit to any returns 409', changes: [[
      "if (existing.source === 'explicit') return false;", "if (existing.source === 'explicit') return true;",
    ], [weakerSql, 'true RETURNING *']] },
    { id: 'guest-over-cookie', title: 'guest_link to cookie returns 409', changes: [[
      "if (existing.source === 'guest_link' && source === 'cookie') return false;", "if (existing.source === 'guest_link' && source === 'cookie') return true;",
    ], [weakerSql, 'true RETURNING *']] },
    { id: 'explicit-replaces-cookie', title: 'cookie to explicit returns', changes: [[
      "if (existing.source === 'cookie' && source === 'explicit') return true;", "if (existing.source === 'cookie' && source === 'explicit') return false;",
    ]] },
    { id: 'burst-50', title: '50 attempts block code', changes: [['if (count >= 50)', 'if (count >= 51)']] },
    { id: 'self-referral', title: 'self referral is rejected', changes: [['const self = code.account_id === account;', 'const self = false;']] },
    { id: 'dashboard-403', title: 'foreign partner code returns 403', changes: [["'Нет доступа к этому партнёрскому коду', 403", "'Нет доступа к этому партнёрскому коду', 404"]] },
  ];
  for (const { id, title, changes } of mutations) {
    const path = join(directory, service), source = readFileSync(path, 'utf8'); let mutated = source;
    for (const [before, after] of changes) {
      if (mutated.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
      mutated = mutated.replace(before, after);
    }
    for (const [kind, test] of [['unit', unit], ['integration', integration]]) {
      if (kind === 'integration' && !process.env.DATABASE_URL) {
        for (const phase of ['red', 'green']) writeFileSync(join(output, `${id}-${kind}-${phase}.txt`), 'NOT RUN: real PostgreSQL DATABASE_URL unavailable\n');
        results.push({ id, kind, red: null, green: null, passed: false, reason: 'Real PostgreSQL unavailable' }); continue;
      }
      const run = phase => {
        const logfile = join(output, `${id}-${kind}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
        try {
          result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title],
            { cwd: directory, stdio: ['ignore', fd, fd], timeout: 60000, env: { ...process.env, NO_COLOR: '1' } });
        } finally { closeSync(fd); }
        const log = readFileSync(logfile, 'utf8');
        return { code: result.error ? null : result.status, assertion: /AssertionError/.test(log), tests: /Tests\s+\d+ passed/.test(log) };
      };
      writeFileSync(path, mutated); const red = run('red');
      writeFileSync(path, source); const green = run('green');
      results.push({ id, kind, red: red.code, green: green.code, passed: red.code === 1 && red.assertion && green.code === 0 && green.tests });
      console.log(`${id} ${kind}: red=${red.code}, green=${green.code}`);
    }
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = results.some(r => r.red === null) ? 2 : 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
