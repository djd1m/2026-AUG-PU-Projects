import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-guest-mutations-'));
const output = resolve('tests/artifacts/guest-pack/mutations'); mkdirSync(output, { recursive: true });
const service = 'apps/web/src/server/guest-pack.ts', handler = 'apps/web/src/server/guest-page.ts', fileRoute = 'apps/web/src/server/clip-file.ts';
const unit = 'tests/guest-pack.test.ts', integration = 'tests/guest-pack.integration.test.ts';
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    { id: 'consent-before-create', file: service, test: unit, title: 'ADR-008 consent undefined',
      changes: [['consent_confirmed: z.literal(true)', 'consent_confirmed: z.literal(true).optional()']] },
    { id: 'revoked-file', file: fileRoute, test: integration, title: 'revocation closes previously', db: true,
      changes: [['AND p.revoked_at IS NULL AND p.sent_at IS NOT NULL', 'AND p.sent_at IS NOT NULL']] },
    { id: 'same-404', file: service, test: unit, title: 'same 404',
      changes: [['if (!pack) throw missing();', "if (!pack) throw new UploadError('not_found', 'Expired', 410);"]] },
    { id: 'two-paths', file: fileRoute, test: integration, title: 'exactly two file paths', db: true,
      changes: [['($3::text IS NULL AND v.account_id=$2)', "($3::text IS NULL AND (v.account_id=$2 OR c.status='done'))"]] },
    { id: 'guest-opened-index', file: 'packages/db/migrations/001_init.sql', test: integration, title: '10 parallel guest openings', db: true,
      changes: [["CREATE UNIQUE INDEX growth_event_guest_opened_unique ON growth_event (guest_pack_id, ip_prefix, day) WHERE type = 'guest_opened';", '-- mutant: no guest_opened unique index']] },
    { id: 'noindex', file: handler, test: unit, title: 'noindex guest page',
      changes: [['<meta name="robots" content="noindex, nofollow">', ''], ["'X-Robots-Tag': 'noindex, nofollow',", '']] },
  ];
  for (const { id, file, test, title, db, changes } of mutations) {
    if (db && !process.env.DATABASE_URL) {
      const reason = 'DATABASE_URL unavailable: real PostgreSQL required; not run is not a pass';
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
      const logfile = join(output, `${id}-${phase}.txt`), fd = openSync(logfile, 'w');
      let result;
      try {
        result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title],
          { cwd: directory, stdio: ['ignore', fd, fd], timeout: 60000, env: { ...process.env, NO_COLOR: '1', ...(db ? {} : { DATABASE_URL: '', REDIS_URL: '' }) } });
      } finally { closeSync(fd); }
      const log = readFileSync(logfile, 'utf8');
      // Exit 1 from a tool/import failure is not evidence of a killed mutant.
      return { code: result.error ? null : result.status, assertion: /AssertionError/.test(log), tests: /Tests\s+\d+ passed/.test(log) };
    };
    writeFileSync(path, mutated); const red = run('red');
    writeFileSync(path, source); const green = run('green');
    results.push({ id, red: red.code, green: green.code, passed: red.code === 1 && red.assertion && green.code === 0 && green.tests });
    console.log(`${id}: red=${red.code}, green=${green.code}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = results.some(r => r.red === null) ? 2 : 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
