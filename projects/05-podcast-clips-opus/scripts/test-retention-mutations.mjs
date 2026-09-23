import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-erasure-mutations-'));
const selected = process.argv[2];
const output = resolve(`tests/artifacts/retention-and-erasure/mutations${selected ? '-retry-' + selected : ''}`); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    { id: 's3-objects', test: 'tests/retention-storage.test.ts', title: 'objects physically removed', file: 'packages/s3/src/erasure.ts',
      before: '  // Re-read the first page', after: '  return;\n  // Re-read the first page' },
    { id: 'guests-first', title: 'revokes guests before', file: 'apps/web/src/server/erasure.ts',
      before: "      await tx.query('UPDATE guest_pack SET revoked_at=COALESCE(revoked_at,$2) WHERE account_id=$1', [account, now]);",
      after: '      // injected: postpone guest revocation until after S3',
      secondary: { file: 'apps/web/src/server/retention.ts', before: '  await transaction(pool, async tx => {',
        after: "  await pool.query('UPDATE guest_pack SET revoked_at=$2 WHERE account_id=$1', [account, now]);\n  await transaction(pool, async tx => {" } },
    { id: 'growth-set-null', title: 'growth events survive', file: 'packages/db/migrations/001_init.sql',
      before: 'clip_id uuid REFERENCES clip(id) ON DELETE SET NULL', after: 'clip_id uuid REFERENCES clip(id) ON DELETE CASCADE' },
    { id: 'free-expiry', title: 'free clips older', file: 'apps/web/src/server/retention.ts',
      before: 'for (const key of [clip.object_key, clip.thumbnail_key]) if (key) await storage.delete(key);', after: '// injected: only delete database references' },
    { id: 'guest-expiry', title: 'expired guest packs', file: 'apps/web/src/server/retention.ts',
      before: 'UPDATE guest_pack SET revoked_at=$1 WHERE id IN', after: 'UPDATE guest_pack SET revoked_at=revoked_at WHERE id IN' },
    { id: 'confirmation', title: 'confirmation required', file: 'apps/web/src/server/erasure.ts',
      before: "if (!z.object({ confirm: z.literal(true) }).strict().safeParse(input).success)", after: 'if (false)' },
    { id: 'irreversibility', title: 'irreversibility and external', file: 'apps/web/src/app/dashboard/AccountDeletion.tsx',
      before: 'Удаление необратимо:', after: 'Удаление аккаунта:' },
  ];
  for (const mutation of mutations.filter(m => !selected || m.id === selected)) {
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    if (source.split(mutation.before).length !== 2) throw new Error(`Mutation anchor not unique: ${mutation.id}`);
    const secondaryPath = mutation.secondary ? join(directory, mutation.secondary.file) : null;
    const secondarySource = secondaryPath ? readFileSync(secondaryPath, 'utf8') : null;
    if (secondarySource !== null && secondarySource.split(mutation.secondary.before).length !== 2) throw new Error('Secondary anchor not unique');
    writeFileSync(path, source.replace(mutation.before, mutation.after));
    if (secondaryPath) writeFileSync(secondaryPath, secondarySource.replace(mutation.secondary.before, mutation.secondary.after));
    const run = phase => {
      const logfile = join(output, `${mutation.id}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
      try {
        result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', mutation.test ?? 'tests/retention.test.ts', '-t', mutation.title],
          { cwd: directory, stdio: ['ignore', fd, fd], timeout: 60000, env: { ...process.env, NO_COLOR: '1' } });
      } finally { closeSync(fd); }
      const log = readFileSync(logfile, 'utf8');
      return { code: result.error ? null : result.status, assertion: /AssertionError/.test(log), tests: /Tests\s+\d+ passed/.test(log) };
    };
    const red = run('red'); writeFileSync(path, source);
    if (secondaryPath) writeFileSync(secondaryPath, secondarySource);
    const green = run('green');
    results.push({ id: mutation.id, red: red.code, green: green.code, passed: red.code === 1 && red.assertion && green.code === 0 && green.tests });
    console.log(`${mutation.id}: defect=${red.code}, restored=${green.code}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
