import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseMaxDemoRuns, DEFAULT_MAX_DEMO_RUNS } from '../apps/api/demo-limit.mjs';

test('N3_MAX_DEMO_RUNS: не задана → прежний дефолт 200', () => {
  assert.equal(DEFAULT_MAX_DEMO_RUNS, 200);
  assert.equal(parseMaxDemoRuns(undefined), 200);
});

test('N3_MAX_DEMO_RUNS: допустимые целые применяются как есть', () => {
  assert.equal(parseMaxDemoRuns('400'), 400);
  assert.equal(parseMaxDemoRuns('1'), 1);
  assert.equal(parseMaxDemoRuns('10000'), 10000);
});

test('N3_MAX_DEMO_RUNS: пустое, мусор, ≤0, дробь, экспонента, выше потолка → отказ, не молчаливые 200', () => {
  for (const bad of ['', ' ', 'abc', '0', '-5', '1e9', '400.5', '10001', '0400', ' 400', '400 ', '+400', '0x190', 'Infinity', 'NaN', '99999999999999999999']) {
    assert.throws(() => parseMaxDemoRuns(bad), /N3_MAX_DEMO_RUNS/, JSON.stringify(bad));
  }
});

test('server.mjs отказывает при старте на пустом N3_MAX_DEMO_RUNS до обращения к базе', () => {
  const server = fileURLToPath(new URL('../apps/api/server.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [server], { env: { PATH: process.env.PATH, N3_MODE: 'fixture', N3_MAX_DEMO_RUNS: '' }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /N3_MAX_DEMO_RUNS="" недопустим/);
});
