// Валидация входа ПО СОДЕРЖИМОМУ байтов (FR-scan-pipeline-1, FR-scan-pipeline-17).
//
// Три отдельных, ПОСЛЕДОВАТЕЛЬНЫХ проверки, каждая — дешевле следующей, каждая ДО
// занятия любого из трёх ресурсов (объект/идемпотентность/квота):
//   1) сигнатура по байтам (не `Content-Type`, не расширение) — `detectImageSignature`;
//   2) decompression bomb по ЗАЯВЛЕННЫМ в заголовке размерам, БЕЗ декодирования —
//      `readDeclaredDimensions` + `exceedsDecodeBudget`;
//   3) настоящая, но ДЕШЁВАЯ декодируемость (шаг 5 `EnqueueScanForFeature`) — в
//      `decode-check.ts`, отдельно, потому что она уже требует `sharp`.
//
// Этот файл — ЧИСТЫЕ функции над `Buffer`, без сети и без базы: юнит-тестируем без стенда.

import { CANON } from '@n4/shared';

export type ImageSignature = 'jpeg' | 'png' | 'webp' | 'heic';
export const ACCEPTED_SIGNATURES: readonly ImageSignature[] = ['jpeg', 'png', 'webp', 'heic'];

/**
 * Определяет тип ПО БАЙТАМ. `Content-Type` заголовка и расширение файла НЕ читаются нигде
 * в этой функции — иначе полиглот с `.jpg`-расширением и HTML-байтами прошёл бы валидацию.
 */
export function detectImageSignature(buffer: Uint8Array): ImageSignature | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngMagic.every((byte, index) => buffer[index] === byte)) return 'png';

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }

  // HEIC/HEIF (ISOBMFF): байты 4-8 = 'ftyp', бренд один из известных HEIC-семейства.
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = String.fromCharCode(buffer[8] ?? 0, buffer[9] ?? 0, buffer[10] ?? 0, buffer[11] ?? 0);
    const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
    if (heicBrands.includes(brand)) return 'heic';
  }

  return null;
}

export interface DeclaredDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Ширина×высота из ЗАГОЛОВКА формата, БЕЗ декодирования пиксельных данных — дешёвая
 * проверка decompression-bomb (шаг 3 `EnqueueScanForFeature`). Умышленно не использует
 * `sharp`: `sharp().metadata()` тоже дёшев, но эта функция должна работать даже когда
 * заголовок технически валиден, а тело — нет (что `sharp` уже не примет как «валиден»,
 * стирая границу между шагом 3 и шагом 5 — они обязаны быть РАЗНЫМИ проверками).
 */
export function readDeclaredDimensions(buffer: Uint8Array, signature: ImageSignature): DeclaredDimensions | null {
  try {
    if (signature === 'png') {
      // IHDR начинается на байте 16: 4 байта width, 4 байта height, big-endian.
      if (buffer.length < 24) return null;
      const width = readUInt32BE(buffer, 16);
      const height = readUInt32BE(buffer, 20);
      return { width, height };
    }

    if (signature === 'jpeg') {
      return readJpegDimensions(buffer);
    }

    if (signature === 'webp') {
      return readWebpDimensions(buffer);
    }

    // HEIC: полный разбор box-структуры ISOBMFF избыточен для ДЕШЁВОЙ проверки —
    // граница decompression-bomb для HEIC обеспечивается `limitInputPixels` шага 5
    // (`decode-check.ts`), где `sharp` уже разбирает контейнер целиком. Возврат `null`
    // здесь означает «эта дешёвая проверка не применима», а не «файл принят» — вызывающий
    // код обязан считать декодирование шага 5 обязательным для HEIC.
    return null;
  } catch {
    return null;
  }
}

function readUInt32BE(buffer: Uint8Array, offset: number): number {
  return ((buffer[offset] ?? 0) << 24) | ((buffer[offset + 1] ?? 0) << 16) | ((buffer[offset + 2] ?? 0) << 8) | (buffer[offset + 3] ?? 0);
}

function readUInt16BE(buffer: Uint8Array, offset: number): number {
  return ((buffer[offset] ?? 0) << 8) | (buffer[offset + 1] ?? 0);
}

/** Ищет маркер SOFn (Start Of Frame) — там лежат высота/ширина JPEG. */
function readJpegDimensions(buffer: Uint8Array): DeclaredDimensions | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 несут размеры; SOI/EOI/RST — нет.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = readUInt16BE(buffer, offset + 5);
      const width = readUInt16BE(buffer, offset + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const segmentLength = readUInt16BE(buffer, offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function readWebpDimensions(buffer: Uint8Array): DeclaredDimensions | null {
  if (buffer.length < 30) return null;
  const chunk = String.fromCharCode(buffer[12] ?? 0, buffer[13] ?? 0, buffer[14] ?? 0, buffer[15] ?? 0);
  if (chunk === 'VP8X') {
    // 24 бита width-1, 24 бита height-1, little-endian, начиная с байта 24.
    const width = ((buffer[26] ?? 0) | ((buffer[27] ?? 0) << 8) | ((buffer[28] ?? 0) << 16)) + 1;
    const height = ((buffer[29] ?? 0) | ((buffer[30] ?? 0) << 8) | ((buffer[31] ?? 0) << 16)) + 1;
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    // Простой (lossy) формат: ширина/высота — 14 бит каждая, little-endian, offset 26/28.
    const w = ((buffer[27] ?? 0) << 8) | (buffer[26] ?? 0);
    const h = ((buffer[29] ?? 0) << 8) | (buffer[28] ?? 0);
    return { width: w & 0x3fff, height: h & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Lossless: 1 байт сигнатура 0x2F, затем 14+14 бит размеров-1.
    const b0 = buffer[25] ?? 0;
    const b1 = buffer[26] ?? 0;
    const b2 = buffer[27] ?? 0;
    const b3 = buffer[28] ?? 0;
    const width = (1 + (((b1 & 0x3f) << 8) | b0)) & 0x3fff;
    const height = (1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))) & 0xffffff;
    return { width, height };
  }
  return null;
}

/** `true`, если заявленное разрешение даёт распаковку сверх бюджета (AC-scan-pipeline-2). */
export function exceedsDecodeBudget(dimensions: DeclaredDimensions): boolean {
  return dimensions.width * dimensions.height > CANON.maxDecodePixels;
}

export type ContentRejectionCode =
  | 'invalid_image'
  | 'decompression_bomb'
  | 'file_too_large'
  | 'image_too_small'
  | 'idempotency_key_required';

export interface ContentValidationResult {
  readonly ok: boolean;
  readonly signature?: ImageSignature;
  readonly code?: ContentRejectionCode;
  readonly httpStatus?: 413 | 422;
}

/**
 * Шаги 2–4 `EnqueueScanForFeature`: сигнатура → decompression bomb → размер файла и
 * минимальное разрешение. Шаг 5 (декодируемость) — отдельно, в `decode-check.ts`.
 */
export function validateContent(buffer: Uint8Array): ContentValidationResult {
  const signature = detectImageSignature(buffer);
  if (signature === null) return { ok: false, code: 'invalid_image', httpStatus: 422 };

  const declared = readDeclaredDimensions(buffer, signature);
  if (declared !== null && exceedsDecodeBudget(declared)) {
    return { ok: false, code: 'decompression_bomb', httpStatus: 422 };
  }

  if (buffer.length <= 0 || buffer.length > CANON.maxInputBytes) {
    return { ok: false, code: 'file_too_large', httpStatus: 413 };
  }

  if (declared !== null && (declared.width < CANON.minInputDimensionPx || declared.height < CANON.minInputDimensionPx)) {
    return { ok: false, code: 'image_too_small', httpStatus: 422 };
  }

  return { ok: true, signature };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Заявка ключа повторности ФОРМАТОМ (FR-scan-pipeline-2) — проверка ДО загрузки. */
export function isValidIdempotencyKey(value: string | string[] | undefined): value is string {
  if (typeof value !== 'string') return false;
  return UUID_RE.test(value.trim());
}
