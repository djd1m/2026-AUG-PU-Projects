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
  /** Строки, ДЕЙСТВИТЕЛЬНО помеченные `purged` в этом прогоне. */
  readonly processed: number;
  /** Строки, оставленные `present` из-за сбоя удаления — подхватит СЛЕДУЮЩИЙ прогон. */
  readonly failed: number;
}

/**
 * RV-scan-pipeline-04: ПРЕЖНЯЯ версия проглатывала ЛЮБУЮ ошибку `removeObject` (включая
 * сетевую/авторизационную) и БЕЗУСЛОВНО помечала строку `purged` — при сбое MinIO объект
 * оставался в бакете НАВСЕГДА: строка больше не попадает в `WHERE file_state = 'present'`,
 * и повторная уборка её не находит. Теперь `purged` пишется ТОЛЬКО при успешном
 * `removeObject` (реализация обязана considерировать «объекта уже нет» успехом сама —
 * S3-совместимое DELETE идемпотентно на несуществующий ключ; здесь различается «объекта
 * нет» от «сбой обращения», а не полагается на угадывание кода ошибки).
 */
export async function purgeExpiredPhotos(pool: DbPool, storage: ExpiredPhotoRemover, batchSize = 500): Promise<PurgeExpiredResult> {
  const rows = await pool.query<{ id: string; object_key: string; normalized_object_key: string | null }>(SELECT_EXPIRED, [batchSize]);
  let processed = 0;
  let failed = 0;
  for (const row of rows.rows) {
    try {
      await storage.removeObject(row.object_key);
      if (row.normalized_object_key !== null) await storage.removeObject(row.normalized_object_key);
      await pool.query(MARK_PURGED, [row.id]);
      processed += 1;
    } catch {
      // Сбой ЭТОЙ строки не прерывает батч и не помечает её purged — следующий прогон
      // (или следующая итерация вызывающего цикла) повторит попытку именно для неё.
      failed += 1;
    }
  }
  return { processed, failed };
}
