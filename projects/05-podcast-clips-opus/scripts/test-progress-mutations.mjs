import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-progress-mutations-'));
const output = resolve('tests/artifacts/progress-and-clips-screen/mutations'); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  // vitest.config.ts подключает репортёр из scripts/ — без него прогон падает ДО тестов, и red=green=1 ничего не доказывает.
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'scripts/test-skip-reporter.ts']) { mkdirSync(join(directory, name, '..'), { recursive: true }); cpSync(name, join(directory, name)); }
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    // Фича 29: вид состояний переехал в ленту (apps/web/src/lib/progress-ribbon.ts) — якорь перенесён туда.
    ['distinct-states', 'apps/web/src/lib/progress-ribbon.ts', "failure ? 'failure' : success", "failure ? 'running' : success", 'три состояния различимы'],
    ['ribbon-silence', 'apps/web/src/lib/progress-ribbon.ts', "tone === 'silent' ? 'silent' : 'running'", "'running'", 'лента: молчание пять минут'],
    ['ribbon-failed-stage', 'apps/web/src/server/screen.ts', "state === 'отказ' ? failedStageOf(row) : null", "null", 'лента: стадия отказа'],
    ['ribbon-collapse', 'apps/web/src/app/videos/[videoId]/VideoDetail.tsx', 'if (success) return', 'if (false) return', 'лента: готово — одна строка'],
    ['silence', 'apps/web/src/server/screen.ts', "state === 'выполняется' && now.getTime() - row.updated_at.getTime() > 300_000", 'false', 'молчание после пяти минут'],
    ['foreign-404', 'apps/web/src/server/clip-file.ts', 'if (!row) return missing();', 'if (!row) return new Response("Forbidden", { status: 403 });', 'чужой и отсутствующий'],
    ['unfinished-404', 'apps/web/src/server/clip-file.ts', "if (row.status !== 'done') return missing();", '/* mutant: unfinished file accepted */', 'клип не done'],
    ['explanations', 'apps/web/src/lib/screen-contract.ts', 'const explanation = z.string().trim().min(1);', 'const explanation = z.string();', 'пустое объяснение'],
  ];
  for (const [id, file, before, after, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    const run = phase => {
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/progress-screen.test.ts', '-t', title],
        { cwd: directory, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return result.status;
    };
    writeFileSync(path, source.replace(before, after)); const red = run('red');
    writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red === 1 && green === 0 }); console.log(`${id}: red=${red}, green=${green}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
