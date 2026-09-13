// Уборка бесхозных объектов (FR-scan-pipeline-14 шаг 12): сеть безопасности для краха
// процесса МЕЖДУ `PUT` оригинала и `COMMIT` транзакции (AC-scan-pipeline-19/31). Порог
// возраста — 1 час (`CANON.orphanObjectMaxAgeMs`), НЕ 30 дней: best-effort-удаление шагов
// 9.1/9.3 покрывает подавляющее большинство случаев синхронно; это — редкий путь.

import { CANON } from '@n4/shared';
import type { DbPool } from '@n4/db';

export interface StorageObjectLister {
  /** Перечисляет объекты бакета по префиксу с их временем создания. */
  listObjects(prefix: string): AsyncIterable<{ readonly key: string; readonly lastModified: Date }>;
  removeObject(key: string): Promise<void>;
}

/** `recognition_id` из ключа `device_session_id/recognition_id.ext`. */
export function recognitionIdFromObjectKey(key: string): string | null {
  const match = /\/([0-9a-f-]{36})\.[a-z0-9]+$/i.exec(key);
  return match?.[1] ?? null;
}

export interface PurgeOrphansResult {
  readonly scanned: number;
  readonly removed: number;
}

/**
 * Проходит объекты бакета, находит те, чей `recognition_id` НЕ найден ни в одной строке
 * `photo.object_key`, и удаляет только те, что старше `orphanObjectMaxAgeMs`.
 */
export async function purgeOrphanObjects(pool: DbPool, storage: StorageObjectLister, prefix = ''): Promise<PurgeOrphansResult> {
  let scanned = 0;
  let removed = 0;
  const cutoff = Date.now() - CANON.orphanObjectMaxAgeMs;

  for await (const object of storage.listObjects(prefix)) {
    scanned += 1;
    if (object.lastModified.getTime() > cutoff) continue;

    // RV-scan-pipeline-03: нормализованная копия живёт ПОД ДРУГИМ ключом
    // (`normalized_object_key`, `<base>.normalized.jpg`) — проверка ТОЛЬКО по `object_key`
    // сочла бы каждую живую нормализованную копию сиротой и удалила бы её из-под воркера,
    // ещё обрабатывающего задание.
    const existing = await pool.query('SELECT 1 FROM photo WHERE object_key = $1 OR normalized_object_key = $1', [object.key]);
    if ((existing.rowCount ?? 0) > 0) continue;

    await storage.removeObject(object.key);
    removed += 1;
  }

  return { scanned, removed };
}
