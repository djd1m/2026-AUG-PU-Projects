import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-render-mutations-'));
const output = resolve('tests/artifacts/render-and-watermark/mutations'); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'Dockerfile']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['plan-fail-closed', 'apps/worker/src/render/watermark.ts', "return plan !== 'paid';", "return plan === 'free';", 'tests/render.test.ts', 'ADR-004 fails closed'],
    ['link-before-render', 'packages/db/src/selection.ts', 'await createClipLink(tx, id);', '/* mutant: link deferred until after rendering */', 'tests/render.test.ts', 'link created before'],
    ['two-line-width', 'apps/worker/src/render/watermark.ts', "const lines = ['КлипМейкер', `${url.host}/c/${code}`];", "const lines = [`КлипМейкер · ${url.host}/c/${code}`];", 'tests/render.test.ts', 'two lines fit'],
    ['font-file', 'apps/worker/src/render/watermark.ts', 'fontfile=', 'font=', 'tests/render.test.ts', 'fontfile only'],
    ['filter-order', 'apps/worker/src/render/ffmpeg.ts', 'if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));', 'if (watermark) filters.unshift(buildWatermarkDrawtext(width, height, origin, code));', 'tests/render.test.ts', 'filter order'],
    ['concurrency', 'apps/worker/src/workers/render.ts', 'concurrency: 1,', 'concurrency: Number(process.env.RENDER_CONCURRENCY),', 'tests/render.test.ts', 'ADR-006 actual registered'],
    ['disk-before-get', 'apps/worker/src/media/download.ts', 'if (await available(directory) - reserved < required) return null;', 'if (false) return null;', 'tests/render-worker.test.ts', 'disk reserve before'],
    ['conditional-publish', 'apps/worker/src/render/storage.ts', "IfNoneMatch: '*'", "IfNoneMatch: undefined", 'tests/render-storage.test.ts', 'S3 conditional publication'],
  ];
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    writeFileSync(path, source.replace(before, after));
    const run = phase => {
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title],
        { cwd: directory, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return result.status;
    };
    const red = run('red'); writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red === 1 && green === 0 });
    console.log(`${id}: red=${red}, green=${green}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
