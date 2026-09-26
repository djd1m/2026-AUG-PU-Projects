// Ревью quota-and-spend MEDIUM-1: счётчик проб старта (reserveProbe) — атомарный МЕЖДУ ПРОЦЕССАМИ. Прежняя форма
// «дописать строку, потом прочитать весь файл» — два системных вызова: одновременные старты видели чужие строки.
// Здесь N настоящих процессов node стартуют в один момент и зовут reserveProbe из ИСХОДНИКА (packages/rag/src/spend.ts,
// собранного esbuild в этот прогон, — не устаревший dist): слотов выдано РОВНО PROBE_DAILY_LIMIT, номера различны.
import { beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { PROBE_DAILY_LIMIT } from '../packages/rag/src/spend';

const dir = mkdtempSync(path.join(tmpdir(), 'n6-probe-race-'));
const bundle = path.join(dir, 'spend.cjs');
beforeAll(() => {
  buildSync({ entryPoints: [path.resolve('packages/rag/src/spend.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
});

// Дочерний процесс ждёт общий момент старта (барьер по часам), затем занимает слот.
const CHILD = `const { reserveProbe } = require(process.argv[1]);
const start = Number(process.argv[3]);
const go = () => { try { process.stdout.write('slot ' + reserveProbe(process.argv[2], 'answer', '2026-09-26')); } catch (e) { process.stdout.write(/перезапуск по кругу/.test(e.message) ? 'refused' : 'error ' + e.message); } };
const wait = () => (Date.now() >= start ? go() : setTimeout(wait, 1));
wait();`;
function child(journal: string, start: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['-e', CHILD, bundle, journal, String(start)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    p.on('error', reject);
    p.on('exit', () => resolve(out.trim()));
  });
}

describe('reserveProbe между процессами', () => {
  it(`${PROBE_DAILY_LIMIT * 2} процессов одновременно — ровно ${PROBE_DAILY_LIMIT} слотов с разными номерами, остальные — отказ с объяснением`, async () => {
    for (let round = 0; round < 3; round++) {
      const journalDir = mkdtempSync(path.join(dir, `round-${round}-`));
      const journal = path.join(journalDir, 'model-spend.jsonl');
      const start = Date.now() + 1500;
      const results = await Promise.all(Array.from({ length: PROBE_DAILY_LIMIT * 2 }, () => child(journal, start)));
      const slots = results.filter((r) => r.startsWith('slot ')).map((r) => Number(r.slice(5)));
      expect(results.filter((r) => r.startsWith('error')), `раунд ${round}`).toEqual([]);
      expect(slots.length, `раунд ${round}`).toBe(PROBE_DAILY_LIMIT);
      expect(new Set(slots).size).toBe(PROBE_DAILY_LIMIT);
      expect([...slots].sort((a, b) => a - b)).toEqual(Array.from({ length: PROBE_DAILY_LIMIT }, (_, i) => i + 1));
      expect(results.filter((r) => r === 'refused')).toHaveLength(PROBE_DAILY_LIMIT);
      expect(readdirSync(journalDir).filter((f) => f.startsWith('probe-answer-2026-09-26.'))).toHaveLength(PROBE_DAILY_LIMIT);
    }
  }, 60_000);
});
