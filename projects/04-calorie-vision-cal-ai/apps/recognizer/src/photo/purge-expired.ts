// `PurgeExpiredPhotos` (FR-scan-pipeline-11, NFR-scan-pipeline-2, ADR-010). Идемпотентна:
// повторный прогон в тот же день не делает ничего — `WHERE file_state = 'present'` уже
// исключает строки прошлого прогона.

import type { DbPool } from '@n4/db';

export interface ExpiredPhotoRemover {
  removeObject(objectKey: string): Promise<void>;
}

const SELECT_EXPIRED = `
  SELECT id, object_key, normalized_object_key FROM photo
  WHERE expires_on < CURRENT_DATE AND file_state = 'present'
  ORDER BY expires_on
  LIMIT $1
`;

const MARK_PURGED = `UPDATE photo SET file_state = 'purged' WHERE id = $1`;

export interface PurgeExpiredResult {
  readonly processed: number;
}

export async function purgeExpiredPhotos(pool: DbPool, storage: ExpiredPhotoRemover, batchSize = 500): Promise<PurgeExpiredResult> {
  const rows = await pool.query<{ id: string; object_key: string; normalized_object_key: string | null }>(SELECT_EXPIRED, [batchSize]);
  for (const row of rows.rows) {
    // Отсутствие объекта — тоже успех (`removeObject` best-effort уже это гарантирует).
    await storage.removeObject(row.object_key);
    if (row.normalized_object_key !== null) await storage.removeObject(row.normalized_object_key);
    await pool.query(MARK_PURGED, [row.id]);
  }
  return { processed: rows.rowCount ?? 0 };
}
