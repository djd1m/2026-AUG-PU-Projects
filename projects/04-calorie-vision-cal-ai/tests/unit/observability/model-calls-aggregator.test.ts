// FR-scan-pipeline-21, AC-scan-pipeline-34.

import { describe, expect, it } from 'vitest';
// Require CJS-модуля из ESM-теста — тот же механизм, что использует сам скрипт при
// `require.main === module`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { aggregate } = require('../../../scripts/telemetry/model-calls.cjs') as {
  aggregate: (lines: string[], graceMs: number, nowMs: number) => Array<{ reason: string; outcome: string; model: string; count: number; sumMs: number }>;
};

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('AggregateModelCallLog (AC-scan-pipeline-34)', () => {
  it('считает попытки по (reason, outcome, model) и суммарное ms', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z');
    const lines: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      lines.push(line({ event: 'model_call', phase: 'START', attempt_id: `ok-${i}`, model: 'haiku-4.5', time: new Date(now).toISOString() }));
      lines.push(line({ event: 'model_call', phase: 'OUTCOME', attempt_id: `ok-${i}`, outcome: 'ok', ms: 1000 }));
    }
    for (let i = 0; i < 2; i += 1) {
      lines.push(line({ event: 'model_call', phase: 'START', attempt_id: `failed-${i}`, model: 'haiku-4.5', time: new Date(now).toISOString() }));
      lines.push(line({ event: 'model_call', phase: 'OUTCOME', attempt_id: `failed-${i}`, outcome: 'failed', ms: 500 }));
    }
    lines.push(line({ event: 'model_call', phase: 'START', attempt_id: 'timeout-0', model: 'haiku-4.5', time: new Date(now).toISOString() }));
    lines.push(line({ event: 'model_call', phase: 'OUTCOME', attempt_id: 'timeout-0', outcome: 'timeout', ms: 25000 }));
    for (let i = 0; i < 2; i += 1) {
      lines.push(line({ event: 'model_call', phase: 'START', attempt_id: `esc-${i}`, model: 'sonnet-5', time: new Date(now).toISOString() }));
      lines.push(line({ event: 'model_call', phase: 'OUTCOME', attempt_id: `esc-${i}`, outcome: 'ok', ms: 2000 }));
    }

    const groups = aggregate(lines, 2 * 60 * 1000, now);
    const find = (reason: string, outcome: string) => groups.find((g) => g.reason === reason && g.outcome === outcome);

    expect(find('primary', 'ok')?.count).toBe(7);
    expect(find('primary', 'failed')?.count).toBe(2);
    expect(find('primary', 'timeout')?.count).toBe(1);
    expect(find('escalation', 'ok')?.count).toBe(2);
    expect(find('escalation', 'ok')?.sumMs).toBe(4000);
  });

  it('непарный START старше грейс-периода учитывается как unknown, свежий — не учитывается вовсе', () => {
    const now = Date.parse('2026-09-12T12:10:00.000Z');
    const stale = new Date(now - 5 * 60 * 1000).toISOString(); // 5 минут назад — старше грейс-периода 2 минуты
    const fresh = new Date(now - 30 * 1000).toISOString(); // 30 секунд назад — в пределах грейса

    const lines = [
      line({ event: 'model_call', phase: 'START', attempt_id: 'stale-1', model: 'haiku-4.5', time: stale }),
      line({ event: 'model_call', phase: 'START', attempt_id: 'fresh-1', model: 'haiku-4.5', time: fresh }),
    ];

    const groups = aggregate(lines, 2 * 60 * 1000, now);
    expect(groups.find((g) => g.outcome === 'unknown')?.count).toBe(1);
    expect(groups.length).toBe(1);
  });

  it('поздний ответ (late) перезаписывает исход того же attempt_id — учитывается только ОДНА запись', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z');
    const lines = [
      line({ event: 'model_call', phase: 'START', attempt_id: 'late-1', model: 'haiku-4.5', time: new Date(now).toISOString() }),
      line({ event: 'model_call', phase: 'OUTCOME', attempt_id: 'late-1', outcome: 'timeout', ms: 25000 }),
      // Поздний ответ провайдера обновляет ТОТ ЖЕ attempt_id на 'late' — вторая строка в
      // журнале с тем же ключом, последняя по времени запись побеждает (Map перезаписывает).
      line({ event: 'model_call', phase: 'OUTCOME', attempt_id: 'late-1', outcome: 'late', ms: 26000 }),
    ];
    const groups = aggregate(lines, 2 * 60 * 1000, now);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.outcome).toBe('late');
  });
});
