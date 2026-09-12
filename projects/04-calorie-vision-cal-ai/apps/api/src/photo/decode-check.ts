// Ограниченная проверка декодируемости (FR-scan-pipeline-17, шаг 5 `EnqueueScanForFeature`,
// PC-04). ОТДЕЛЬНАЯ, более дешёвая проверка от полной нормализации (`recognizer`): не
// конвертирует и не сжимает — только доказывает, что байты, прошедшие сигнатуру, ещё и
// декодируются ЭТИМ ЖЕ кодеком, до трёх ресурсов (объект, идемпотентность, квота).

import sharp from 'sharp';
import { CANON } from '@n4/shared';

/**
 * `true`, если файл декодируется. Исключение (испорченный кодек, усечённый файл,
 * неподдерживаемый вариант контейнера) трактуется как «не декодируется», а не
 * прокидывается наружу — вызывающий код обязан вернуть `422 invalid_image`.
 */
export async function isDecodable(buffer: Uint8Array): Promise<boolean> {
  try {
    const image = sharp(buffer, { limitInputPixels: CANON.maxDecodePixels, pages: 1 });
    await image.metadata();
    // Метаданные могут пройти на усечённом файле; декодирование ЦЕЛИКОМ — настоящая проверка.
    await image.clone().raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}
