// AC-scan-pipeline-19 (крах МЕЖДУ PUT оригинала и открытием транзакции БД не оставляет
// захватываемой строки; объект остаётся бесхозным до уборки орфанов) и AC-scan-pipeline-31
// (орфан старше 1 часа без строки `photo` удаляется; младше часа — сохраняется).
//
// Объект кладётся В РЕАЛЬНЫЙ MinIO (`createPhotoStorage`, тот же клиент, что использует
// `POST /scans`) БЕЗ единой строки `recognition`/`photo` — это И ЕСТЬ симуляция краха: PUT
// прошёл, транзакция БД так и не открылась (PC2-01). Проверка «нет строки `photo`» — против
// НАСТОЯЩЕГО Postgres. Возраст объекта симулируется через `StorageObjectLister` (MinIO не
// даёт дёшево управлять `lastModified` реального объекта) — названо явно, не скрыто.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createPhotoStorage } from '../../../apps/api/src/photo/store-original.js';
import { purgeOrphanObjects, type StorageObjectLister } from '../../../apps/api/src/photo/purge-orphans.js';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';
import { makeJpegFixture } from '../../helpers/image-fixtures.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-purge-orphans');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

/** Обёртка над РЕАЛЬНЫМ хранилищем: перечисляет ИМЕННО заданные ключи с УПРАВЛЯЕМЫМ возрастом. */
function listerFor(entries: readonly { key: string; ageMs: number }[]): StorageObjectLister {
  const storage = createPhotoStorage(testScanApiConfig().storage);
  return {
    async *listObjects() {
      for (const entry of entries) {
        yield { key: entry.key, lastModified: new Date(Date.now() - entry.ageMs) };
      }
    },
    removeObject: (key) => storage.removeObject(key),
  };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('уборка орфанов (AC-scan-pipeline-19, AC-scan-pipeline-31)', () => {
  it('AC-19/31: объект БЕЗ строки photo, СТАРШЕ часа — удаляется (симулирует крах между PUT и транзакцией)', async () => {
    const storage = createPhotoStorage(testScanApiConfig().storage);
    const objectKey = `orphan-session/${randomUUID()}.jpg`;
    const jpeg = await makeJpegFixture();

    // PUT прошёл (как в EnqueueScanForFeature шаг 8) — но транзакция БД НИКОГДА не
    // открывалась: ни recognition, ни photo не существуют.
    await storage.putOriginal(objectKey, jpeg, 'image/jpeg');
    expect(await storage.exists(objectKey)).toBe(true);

    const photoRow = await pool.query('SELECT 1 FROM photo WHERE object_key = $1', [objectKey]);
    expect(photoRow.rowCount).toBe(0); // AC-19: воркер не найдёт ни одной ссылающейся строки

    const result = await purgeOrphanObjects(pool, listerFor([{ key: objectKey, ageMs: ONE_HOUR_MS + 60_000 }]));

    expect(result.removed).toBe(1);
    expect(await storage.exists(objectKey)).toBe(false);
  }, 20_000);

  it('AC-31: объект БЕЗ строки photo, МОЛОЖЕ часа — НЕ удаляется (не мешает ещё идущей транзакции)', async () => {
    const storage = createPhotoStorage(testScanApiConfig().storage);
    const objectKey = `orphan-session/${randomUUID()}.jpg`;
    const jpeg = await makeJpegFixture();
    await storage.putOriginal(objectKey, jpeg, 'image/jpeg');

    const result = await purgeOrphanObjects(pool, listerFor([{ key: objectKey, ageMs: 5 * 60_000 }]));

    expect(result.removed).toBe(0);
    expect(await storage.exists(objectKey)).toBe(true);

    await storage.removeObject(objectKey); // уборка за собой
  }, 20_000);

  it('объект СО строкой photo — не орфан, не удаляется НЕЗАВИСИМО от возраста', async () => {
    const storage = createPhotoStorage(testScanApiConfig().storage);
    const session = await seedSession(pool, 'purge-orphans-owned');
    const objectKey = `${session.id}/${randomUUID()}.jpg`;
    const jpeg = await makeJpegFixture();
    await storage.putOriginal(objectKey, jpeg, 'image/jpeg');
    await pool.query(
      `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on, file_state)
       VALUES ($1, $2, 'image/jpeg', $3, 800, 600, (now() + interval '30 days')::date, 'present')`,
      [session.id, objectKey, jpeg.byteLength],
    );

    const result = await purgeOrphanObjects(pool, listerFor([{ key: objectKey, ageMs: ONE_HOUR_MS + 60_000 }]));

    expect(result.removed).toBe(0);
    expect(await storage.exists(objectKey)).toBe(true);

    await storage.removeObject(objectKey);
  }, 20_000);
});
