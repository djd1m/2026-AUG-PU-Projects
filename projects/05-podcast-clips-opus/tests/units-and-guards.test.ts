import { expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

it('RV-1 STT journal writer and monitoring agree on seconds and daily threshold', () => {
  const writer = readFileSync('apps/worker/src/workers/stt.ts', 'utf8');
  const event = readFileSync('apps/worker/src/stt/spend.ts', 'utf8');
  const completion = readFileSync('docs/Completion.md', 'utf8');
  const row = completion.split('\n').find(line => /^\| .*STT в сутки/.test(line));
  expect(writer).toMatch(/unit: 'seconds', quantity: chunk\.durationSeconds/);
  expect(event).toContain("unit: 'seconds'");
  expect(row).toContain('Секунды STT');
  expect(row).toContain('unit=seconds');
  expect(row).toContain('36 000 с (600 мин)');
  expect(row).toContain('> 32 400 с');
  expect(row).toContain('phase=attempt');
  expect(row).toContain('stage=stt');
  expect(row).toContain('московские сутки');
});

it('RV-3 real runner marks filtered receipts partial and preserves total inventory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'n5-receipt-contract-'));
  try {
    for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(dir, name), {
      recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
    });
    for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'Dockerfile', 'docker-compose.yml', '.env.example']) {
      cpSync(name, join(dir, name));
    }
    mkdirSync(join(dir, 'node_modules/vitest'), { recursive: true });
    // Only the expensive test subprocess is stubbed. The actual runner selects
    // mutations, edits/restores their source and writes its real receipt.
    writeFileSync(join(dir, 'node_modules/vitest/vitest.mjs'), `
      import { writeFileSync } from 'node:fs';
      const output = process.argv.find(arg => arg.startsWith('--outputFile=')).slice(13);
      const red = output.endsWith('-red.json');
      writeFileSync(output, JSON.stringify({ numFailedTests: red ? 1 : 0, numPassedTests: red ? 0 : 1 }));
      process.exitCode = red ? 1 : 0;
    `);
    const output = join(dir, 'receipts');
    const run = (ids: string[]) => {
      const result = spawnSync(process.execPath, ['scripts/test-render-mutations.mjs', ...ids], {
        cwd: dir, encoding: 'utf8', timeout: 25_000, env: { ...process.env, N5_MUTATION_OUTPUT: output },
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return JSON.parse(readFileSync(join(output, 'results.json'), 'utf8')) as {
        requested: string[]; total: number; partial: boolean; results: { id: string; passed: boolean }[];
      };
    };
    const full = run([]);
    expect(full.requested).toEqual([]);
    expect(full.partial).toBe(false);
    expect(full.total).toBeGreaterThan(1);
    expect(full.results).toHaveLength(full.total);
    expect(full.results.every(result => result.passed)).toBe(true);
    // Reuse the output directory: even overwriting a full receipt cannot hide filtering.
    const partial = run(['default-six']);
    expect(partial.requested).toEqual(['default-six']);
    expect(partial.partial).toBe(true);
    expect(partial.total).toBe(full.total);
    expect(partial.results).toEqual([expect.objectContaining({ id: 'default-six', passed: true })]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);
