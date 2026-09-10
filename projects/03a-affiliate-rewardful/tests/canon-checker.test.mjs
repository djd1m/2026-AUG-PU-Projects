import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(new URL('..', import.meta.url).pathname);
const checker = path.join(repo, 'scripts/check-canon.mjs');
const upstream = path.resolve(repo, '../../.claude/hooks/check-canon.cjs');
const canon = '# Canon\n\n## One\ntext\n';
function fixture(plan, canonText = canon) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n3a-canon-test-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'canon.md'), canonText);
  const canonSha = crypto.createHash('sha256').update(canonText).digest('hex');
  fs.writeFileSync(path.join(dir, 'docs', 'dispatch-plan.md'), plan.replaceAll('HASH', canonSha));
  return dir;
}
function run(file, dir) { return spawnSync(process.execPath, [file, dir], { encoding: 'utf8' }); }
const base = `**Пишущий фан-аут:** да\n**Канон:** docs/canon.md\n**Хеш канона:** HASH\n**Проверка канона:** ВЫПОЛНЕНА\n\n## Единицы\n\n| Единица | Что пишет |\n|---|---|\n| web | src |\n| api | src |\n`;
test('adapted scopes units to exact section while upstream sees every table', () => {
  const plan = `| Единица | Что пишет |\n|---|---|\n| web | unrelated table |\n\n${base}`;
  const dir = fixture(plan);
  try { assert.equal(run(upstream, dir).status, 2); assert.equal(run(checker, dir).status, 0); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('duplicate actual unit is not run', () => {
  const dir = fixture(base.replace('| api | src |', '| api | src |\n| API | other |'));
  try { assert.equal(run(checker, dir).status, 2); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('wrong hash is proven defect', () => {
  const dir = fixture(base.replace('HASH', '0'.repeat(64)));
  try { assert.equal(run(checker, dir).status, 1); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('missing canon is proven defect', () => {
  const dir = fixture(base);
  fs.rmSync(path.join(dir, 'docs', 'canon.md'));
  try { assert.equal(run(checker, dir).status, 1); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('duplicate or absent units heading is unknown', () => {
  for (const plan of [base.replace('## Единицы', '## Other'), `${base}\n## Единицы\n| x | y |` , `${base}\n## Единицы\n| x | y |\n`]) {
    const dir = fixture(plan);
    try { assert.equal(run(checker, dir).status, 2); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
test('upstream checker bytes remain pinned', () => assert.equal(crypto.createHash('sha256').update(fs.readFileSync(upstream)).digest('hex'), '99e6bff9b0078eb2ec23f7df98b7ac06c894f9018eba4a8c358e8f92e5ec7b06'));
