// RV-scan-pipeline-02 — blocker-adjacent high: `worker.ts` не передавал `ipPrefix`, и
// `recognizeScan` списывал ВСЕ повторные попытки/эскалации ВСЕХ пользователей в один
// общий ключ `scope='user', scope_key='unknown/0'` — предел ОДНОГО посетителя обходил
// исходный IP-счётчик и мог заблокировать ВСЕХ остальных. Исправлено: `lookupIpPrefix`
// по умолчанию читает РЕАЛЬНЫЙ `device_session.ip_prefix` (то же значение, что записал
// `POST /scans`). Проверяется на настоящем Postgres — свойство именно про РАЗДЕЛЯЕМЫЙ
// ресурс (счётчик), значит и здесь нужна настоящая база, не мок.

import { randomUUID } from 'node:crypto';
import { openSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { recognizeScan, type RecognizeScanDeps, type RecognizeJob } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import { recordResult } from '../../../apps/recognizer/src/lease.js';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import type { ModelProvider, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-ip-prefix-quota');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function seedSessionWithIp(marker: string, ipPrefix: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
    [`hash-${marker}`, ipPrefix],
  );
  return result.rows[0]!.id;
}

function fixedResponse(): ModelResponse {
  return { items: [{ labelRu: 'борщ', massG: 200, candidates: [] }], confidence: 0.9, modelEstimateKcal: 300, model: 'haiku-4.5' };
}

async function runRecognizeWithRetryCharge(deviceSessionId: string, recognitionId: string): Promise<void> {
  // `fence = 2` — единственный путь, реально СПИСЫВАЮЩИЙ ipPrefix-ключ квоты (шаг 3:
  // fence=1 в тот же день уже оплачен POSTом и не списывает повторно).
  await pool.query(
    `INSERT INTO recognition (id, device_session_id, status, idempotency_key, lease_fence) VALUES ($1, $2, 'queued', $3, 2)`,
    [recognitionId, deviceSessionId, randomUUID()],
  );
  const job: RecognizeJob = { id: recognitionId, fence: 2, photoId: null, deviceSessionId, createdAt: new Date() };
  const deps: RecognizeScanDeps = {
    pool,
    quotaLimits: { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 },
    provider: { kind: 'fake', recognize: async (): Promise<ModelResponse> => fixedResponse() } satisfies ModelProvider,
    matchPort: createNullMatchIngredientPort(),
    normalize: async () => ({ ok: true, normalizedKey: 'stub-key' }),
    recordResult: (target, record) => recordResult(pool, target, record),
    logger: createLogger({ service: 'test', sink: () => {} }),
    modelCallLogFd: openSync('/dev/null', 'w'),
    // БЕЗ lookupIpPrefix — используется ДЕФОЛТ (реальный SELECT ip_prefix FROM device_session).
  };
  await recognizeScan(job, deps);
}

describe('реальный ip_prefix в квоте (RV-scan-pipeline-02)', () => {
  it('две независимые сессии с РАЗНЫМИ адресами получают РАЗНЫЕ ключи scope=user — не unknown/0', async () => {
    const sessionA = await seedSessionWithIp('ip-a', '198.51.100.0/24');
    const sessionB = await seedSessionWithIp('ip-b', '203.0.113.0/24');

    await runRecognizeWithRetryCharge(sessionA, randomUUID());
    await runRecognizeWithRetryCharge(sessionB, randomUUID());

    const rows = await pool.query<{ scope_key: string; used: number }>(
      "SELECT scope_key, used FROM scan_quota_counter WHERE scope = 'user' ORDER BY scope_key",
    );
    const scopeKeys = rows.rows.map((row) => row.scope_key);

    // НИ ОДИН ключ не унифицирован в 'unknown/0' — реальный дефект, воспроизведённый ревью.
    expect(scopeKeys).not.toContain('unknown/0');
    // Ключи включают ОБА реальных префикса — сессии не делят один счётчик.
    expect(scopeKeys).toContain('198.51.100.0/24');
    expect(scopeKeys).toContain('203.0.113.0/24');

    for (const row of rows.rows) expect(row.used).toBe(1); // каждый счётчик списан РОВНО своей попыткой
  }, 20_000);

  it('20 попыток одной сессии НЕ блокируют попытку другой сессии через общий ключ unknown/0', async () => {
    const busySession = await seedSessionWithIp('ip-busy', '198.51.100.0/24');
    const otherSession = await seedSessionWithIp('ip-other', '203.0.113.0/24');

    for (let i = 0; i < 10; i += 1) {
      await runRecognizeWithRetryCharge(busySession, randomUUID());
    }
    // Десятая попытка BUSY исчерпала бы ОБЩИЙ ключ 'unknown/0' при старом дефекте — сейчас
    // это СВОЙ ключ '198.51.100.0/24', и OTHER на своём '203.0.113.0/24' не пострадал.
    await runRecognizeWithRetryCharge(otherSession, randomUUID());

    const otherCounter = await pool.query<{ used: number }>(
      "SELECT used FROM scan_quota_counter WHERE scope = 'user' AND scope_key = '203.0.113.0/24'",
    );
    expect(otherCounter.rows[0]?.used).toBe(1); // НЕ заблокирован чужой активностью
  }, 30_000);
});
