import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n5-upload-mutation-'));
const quotaPath = 'packages/db/src/quota.ts', videoPath = 'apps/web/src/server/video.ts';
const quota = fs.readFileSync(quotaPath, 'utf8'), video = fs.readFileSync(videoPath, 'utf8');
const receipt = [];
function run(name, test) {
  const outputPath = path.join(root, 'process-output');
  const fd = fs.openSync(outputPath, 'w');
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/upload-guards.test.ts', '-t', test],
    { env: { ...process.env, N5_UPLOAD_GUARD_ROOT: root }, stdio: ['ignore', fd, fd], timeout: 15000 });
  fs.closeSync(fd);
  if (result.error) throw result.error;
  receipt.push({ name, exit_code: result.status, output: fs.readFileSync(outputPath, 'utf8') });
  console.log(`${name}: exit ${result.status}`);
  return result.status;
}
function reset() {
  for (const [file, text] of [[quotaPath, quota], [videoPath, video]]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text);
  }
}
try {
  const sqlMutant = quota.replace(/    await tx.query\(`INSERT INTO quota_counter[\s\S]*?RETURNING used`, args\);/,
    `    const result = await tx.query(\`INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ($1,$2,$3,$4)
      ON CONFLICT(scope,scope_key,day) DO UPDATE SET used=quota_counter.used+$4
      WHERE quota_counter.used+$4<=$5 RETURNING used\`, args);`);
  const quotaBlock = video.match(/        const quota = await checkAndConsumeQuota[\s\S]*?        }\n/)?.[0];
  if (!quotaBlock) throw new Error('Блок квоты не найден');
  const orderMutant = video.replace(quotaBlock, '').replace('        initiated = { key: objectKey, id: uploadId };',
    '        initiated = { key: objectKey, id: uploadId };\n' + quotaBlock);
  const refundMutant = quota.replace("'too_long', 'probe_timeout'];", "'too_long', 'probe_timeout', 'refused_user_minutes'];");
  for (const [name, file, original, mutant] of [
    ['quota SQL uses two statements', quotaPath, quota, sqlMutant],
    ['upload quota precedes initiation', videoPath, video, orderMutant],
    ['refund only for file properties', quotaPath, quota, refundMutant],
  ]) {
    if (original === mutant) throw new Error(`Мутация не применилась: ${name}`);
    reset(); if (run(`clean: ${name}`, name) !== 0) throw new Error(`Чистый страж красный: ${name}`);
    fs.writeFileSync(path.join(root, file), mutant);
    if (run(`mutant: ${name}`, name) !== 1) throw new Error(`Страж не обнаружил дефект: ${name}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  fs.mkdirSync('tests/artifacts', { recursive: true });
  fs.writeFileSync('tests/artifacts/upload-mutations.json', JSON.stringify(receipt, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
}
