import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-render-fix-mutations-'));
const output = resolve('tests/artifacts/render-audio-fix/mutations-verified'); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['audio-source', 'apps/worker/src/render/ffmpeg.ts',
      'const source = video === null ? `color=c=0x181818:s=${width}x${height}:r=25:d=${duration},` : `[0:${video}]`;',
      'const source = `[0:v:0]`;', 'tests/render-audio.test.ts', 'real MP3'],
    ['stderr-log', 'apps/worker/src/render/exec.ts',
      'stderr_tail: safeDiagnostic(tail)', 'stderr_tail: ""', 'tests/render-diagnostics.test.ts', 'logs exit code'],
    ['signed-url', 'apps/worker/src/render/exec.ts',
      'stderr_tail: safeDiagnostic(tail)', 'stderr_tail: tail', 'tests/render-diagnostics.test.ts', 'signed URLs and credentials'],
    ['second-pass', 'apps/worker/src/render/ffmpeg.ts',
      'const video = await videoStreamIndex', 'await execFFmpeg([]);\n    const video = await videoStreamIndex',
      'tests/render-audio.test.ts', 'source guard'],
    ['subtitles-pixels', 'apps/worker/src/render/ffmpeg.ts',
      'if (assFilePath !== null) filters.push', 'if (false) filters.push', 'tests/render-audio.test.ts', 'real MP3'],
    ['worker-log', 'apps/worker/src/workers/render.ts',
      "console.error(JSON.stringify({ event: 'render_attempt_failed', video_id: attempt.video_id,\n      clip_id: attempt.clip_id, fence: attempt.fence, message: renderErrorMessage(error) }));",
      '/* diagnostics suppressed */', 'tests/render-worker.test.ts', 'RD-002 worker logs'],
  ];
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    writeFileSync(path, source.replace(before, after));
    const run = phase => {
      const reportPath = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title,
        '--reporter=json', `--outputFile=${reportPath}`],
        { cwd: directory, encoding: 'utf8', timeout: 180000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const measured = { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
      writeFileSync(join(output, `${id}-${phase}.txt`), JSON.stringify(measured) + '\n' + `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return measured;
    };
    const red = run('red'); writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${JSON.stringify(red)}, green=${JSON.stringify(green)}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
