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

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_KEY_RE = new RegExp(`^${UUID}/${UUID}(\\.normalized)?\\.[a-z0-9]+$`, 'i');

/**
 * Форма ключа ФОТО: `device_session_id/recognition_id[.normalized].ext`, обе части — UUID.
 *
 * Зачем отдельная проверка формы, если ниже всё равно спрашивается база. Заслужено потерей
 * данных 17–18.09.2026: уборка звалась с ПУСТЫМ префиксом (то есть по ВСЕМУ бакету) и
 * сверялась ТОЛЬКО с таблицей `photo`. Карточки «поделиться» лежат под `share-cards/…` и в
 * `photo` не значатся НИКОГДА — поэтому КАЖДАЯ карточка старше часа опознавалась сиротой и
 * удалялась. Владелец увидел это как «старые ссылки перестали работать»: строка в базе жива,
 * страница отдаёт 200, картинки нет.
 *
 * Отсюда правило, а не заплатка: **удаление необратимо, поэтому удаляется только то, что
 * ПОЛОЖИТЕЛЬНО опознано своим.** Незнакомая форма ключа — причина НЕ ТРОГАТЬ объект, а не
 * причина его удалить (`fail-closed-defaults.md`). Новый вид объектов в бакете отныне
 * переживает уборку по умолчанию, даже если автор о ней не вспомнит.
 */
export function isPhotoObjectKey(key: string): boolean {
  return PHOTO_KEY_RE.test(key);
}

export interface PurgeOrphansResult {
  readonly scanned: number;
  readonly removed: number;
  /** Объекты ЧУЖОЙ формы: не фото, значит не наше дело. Считаются, чтобы молчание было видно. */
  readonly skippedForeign: number;
}

/**
 * Проходит объекты бакета, находит те, чей `recognition_id` НЕ найден ни в одной строке
 * `photo.object_key`, и удаляет только те, что старше `orphanObjectMaxAgeMs`.
 */
export async function purgeOrphanObjects(pool: DbPool, storage: StorageObjectLister, prefix = ''): Promise<PurgeOrphansResult> {
  let scanned = 0;
  let removed = 0;
  let skippedForeign = 0;
  const cutoff = Date.now() - CANON.orphanObjectMaxAgeMs;

  for await (const object of storage.listObjects(prefix)) {
    scanned += 1;

    // ПЕРВЫМ делом — форма ключа, ДО возраста и ДО базы: объект чужой формы не становится
    // нашим оттого, что он старый (см. `isPhotoObjectKey`).
    if (!isPhotoObjectKey(object.key)) {
      skippedForeign += 1;
      continue;
    }

    if (object.lastModified.getTime() > cutoff) continue;

    // RV-scan-pipeline-03: нормализованная копия живёт ПОД ДРУГИМ ключом
    // (`normalized_object_key`, `<base>.normalized.jpg`) — проверка ТОЛЬКО по `object_key`
    // сочла бы каждую живую нормализованную копию сиротой и удалила бы её из-под воркера,
    // ещё обрабатывающего задание.
    //
    // ВТОРОЙ пояс, намеренно избыточный рядом с проверкой формы выше: спрашиваются ОБЕ
    // таблицы, владеющие объектами бакета. Избыточность здесь оправдана ценой ошибки —
    // удалённый объект не возвращается, а форма ключа может однажды измениться вместе с
    // кодом, который о существовании этой уборки не знает.
    const existing = await pool.query(
      `SELECT 1 FROM photo WHERE object_key = $1 OR normalized_object_key = $1
       UNION ALL
       SELECT 1 FROM share_card WHERE object_key = $1`,
      [object.key],
    );
    if ((existing.rowCount ?? 0) > 0) continue;

    await storage.removeObject(object.key);
    removed += 1;
  }

  return { scanned, removed, skippedForeign };
}
