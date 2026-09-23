import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-render-mutations-'));
const output = resolve(process.env.N5_MUTATION_OUTPUT ?? 'tests/artifacts/render-and-watermark/mutations'); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'Dockerfile', 'docker-compose.yml', '.env.example']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['startup-watermark', 'packages/shared/src/config.ts', 'assertWatermarkFits(origin, env.N5_SHORT_CODE_LENGTH);', '/* mutant: defer geometry rejection until rendering */', 'tests/watermark-startup.test.ts', 'startup guard rejects configuration|render retains rejection'],
    ['plan-fail-closed', 'apps/worker/src/render/watermark.ts', "return plan !== 'paid';", "return plan === 'free';", 'tests/render.test.ts', 'ADR-004 fails closed'],
    ['link-before-render', 'packages/db/src/selection.ts', 'await createClipLink(tx, id);', '/* mutant: link deferred until after rendering */', 'tests/render.test.ts', 'link created before'],
    ['one-line-width', 'packages/shared/src/watermark.ts', 'height * 73 / 1920', 'height * 75 / 1920', 'tests/render.test.ts', 'one-line worst code'],
    ['badge-contrast', 'apps/worker/src/render/watermark.ts', 'WATERMARK_OPACITY = 0.60', 'WATERMARK_OPACITY = 0.20', 'tests/render.test.ts', 'badge contrast'],
    ['badge-nonverbal', 'packages/shared/src/watermark.ts', 'КлипМейкер · ${url.host}', 'Создай клип · ${url.host}', 'tests/render.test.ts', 'badge contrast'],
    ['legacy-code', 'apps/web/src/server/short-link.ts', '(?:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}|[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10})', '[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}', 'tests/short-link.test.ts', 'six-character links'],
    ['default-six', 'packages/shared/src/clip-code.ts', "if (value === undefined || value === '6') return 6;", "if (value === undefined || value === '6') return 10;", 'tests/trust-guards.test.ts', 'generator defaults to six'],
    ['font-file', 'apps/worker/src/render/watermark.ts', 'fontfile=', 'font=', 'tests/render.test.ts', 'fontfile only'],
    ['filter-order', 'apps/worker/src/render/ffmpeg.ts', 'if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));', 'if (watermark) filters.unshift(buildWatermarkDrawtext(width, height, origin, code));', 'tests/render.test.ts', 'filter order'],
    ['concurrency', 'apps/worker/src/workers/render.ts', 'concurrency: 1,', 'concurrency: Number(process.env.RENDER_CONCURRENCY),', 'tests/render.test.ts', 'ADR-006 actual registered'],
    ['disk-before-get', 'apps/worker/src/media/download.ts', 'if (await available(directory) - reserved < required) return null;', 'if (false) return null;', 'tests/render-worker.test.ts', 'disk reserve before'],
    ['conditional-publish', 'apps/worker/src/render/storage.ts', "IfNoneMatch: '*'", "IfNoneMatch: undefined", 'tests/render-storage.test.ts', 'S3 conditional publication'],
  ];
  const requested = process.argv.slice(2);
  for (const id of requested) {
    if (!mutations.some(mutation => mutation[0] === id)) throw new Error(`Unknown mutation: ${id}`);
  }
  for (const [id, file, before, after, test, title] of mutations) {
    if (requested.length > 0 && !requested.includes(id)) continue;
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    writeFileSync(path, source.replace(before, after));
    const run = phase => {
      const receipt = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title,
        '--reporter=json', `--outputFile=${receipt}`],
        { cwd: directory, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      const report = JSON.parse(readFileSync(receipt, 'utf8'));
      return { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
    };
    const red = run('red'); writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${red.exit} (${red.failed} failed), green=${green.exit} (${green.passed} passed)`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ requested, total: mutations.length, partial: requested.length > 0, results }, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
