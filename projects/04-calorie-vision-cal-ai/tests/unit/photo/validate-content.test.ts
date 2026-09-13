// FR-scan-pipeline-1/17, AC-scan-pipeline-1/2/3/4/33.

import { describe, expect, it } from 'vitest';
import {
  detectImageSignature,
  exceedsDecodeBudget,
  isValidIdempotencyKey,
  readDeclaredDimensions,
  validateContent,
} from '../../../apps/api/src/photo/validate-content.js';

/**
 * WebP VP8X-контейнер (extended format) с НАСТОЯЩИМ байтовым layout по спецификации RIFF:
 * `RIFF`(4) + fileSize(4, LE) + `WEBP`(4) + `VP8X`(4) + chunkSize(4, LE) + 1 байт флагов +
 * 3 байта резерва + 3 байта width-1 (LE) + 3 байта height-1 (LE) = смещения флагов/резерва
 * 20-23, width-1 24-26, height-1 27-29 — РОВНО те смещения, что поправлены RV-scan-pipeline-06
 * (прежде читались с 26/29, на 2 байта дальше верных 24/27). `riffSize`/`chunkSize`
 * посчитаны честно, чтобы `webpHasTrailingGarbage` не отверг фикстуру раньше проверки
 * размеров — это НАСТОЯЩИЙ валидный WebP-заголовок, не байтовый мусор с угаданными полями.
 */
function webpVp8xBuffer(width: number, height: number): Buffer {
  const flags = Buffer.from([0x00, 0x00, 0x00, 0x00]); // 1 байт флагов + 3 байта резерва
  const wMinus1 = width - 1;
  const hMinus1 = height - 1;
  const dims = Buffer.from([
    wMinus1 & 0xff, (wMinus1 >> 8) & 0xff, (wMinus1 >> 16) & 0xff,
    hMinus1 & 0xff, (hMinus1 >> 8) & 0xff, (hMinus1 >> 16) & 0xff,
  ]);
  const chunkData = Buffer.concat([flags, dims]); // 10 байт, длина чётная — паддинг не нужен
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(chunkData.length, 0);
  const vp8xChunk = Buffer.concat([Buffer.from('VP8X'), chunkSize, chunkData]);
  const riffPayload = Buffer.concat([Buffer.from('WEBP'), vp8xChunk]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(riffPayload.length, 0);
  return Buffer.concat([Buffer.from('RIFF'), riffSize, riffPayload]);
}

/**
 * RV-scan-pipeline-06: воспроизводит БУКВАЛЬНО дефект ревью — смещения 26/29 вместо 24/27
 * — на РЕАЛЬНОМ layout `webpVp8xBuffer`, а не на подставных байтах.
 */
function readWebpDimensionsWithOldBuggyOffsets(buffer: Buffer): { width: number; height: number } {
  const width = ((buffer[26] ?? 0) | ((buffer[27] ?? 0) << 8) | ((buffer[28] ?? 0) << 16)) + 1;
  const height = ((buffer[29] ?? 0) | ((buffer[30] ?? 0) << 8) | ((buffer[31] ?? 0) << 16)) + 1;
  return { width, height };
}

function jpegBuffer(width: number, height: number, extraBytes = 100): Buffer {
  // Минимальный валидный JPEG-скелет с SOF0, несущий заявленные width/height. ОБЯЗАН
  // заканчиваться EOI (0xFFD9) РОВНО на последних двух байтах — иначе `hasTrailingGarbage`
  // (RV-scan-pipeline-07) честно отверг бы собственную фикстуру теста как полиглот: она
  // теперь тоже проверяет границу конца структуры, а не только сигнатуру заголовка.
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  const dims = Buffer.alloc(4);
  dims.writeUInt16BE(height, 0);
  dims.writeUInt16BE(width, 2);
  const fillerLength = Math.max(0, extraBytes - 2);
  const filler = Buffer.alloc(fillerLength, 0xaa);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, dims, filler, eoi]);
}

function pngBuffer(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrLenType = Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(width, 0);
  dims.writeUInt32BE(height, 4);
  const rest = Buffer.alloc(20, 0);
  return Buffer.concat([sig, ihdrLenType, dims, rest]);
}

describe('detectImageSignature', () => {
  it('распознаёт JPEG/PNG/WebP/HEIC по байтам', () => {
    expect(detectImageSignature(jpegBuffer(10, 10))).toBe('jpeg');
    expect(detectImageSignature(pngBuffer(10, 10))).toBe('png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
    expect(detectImageSignature(webp)).toBe('webp');
    const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(20)]);
    expect(detectImageSignature(heic)).toBe('heic');
  });

  it('отвергает файл с байтами НЕ формата изображения (AC-scan-pipeline-1)', () => {
    expect(detectImageSignature(Buffer.from('<html><body>не изображение</body></html>'))).toBeNull();
  });

  it('полиглот: валидная JPEG-сигнатура спереди, но реальный тип определяется по СИГНАТУРЕ, не по расширению', () => {
    // Сама детекция сигнатуры видит JPEG корректно — полиглот-отказ реализован в decode-check
    // (шаг 5, настоящая декодируемость), эта функция отвечает только за первый байтовый признак.
    const jpegWithTrailer = Buffer.concat([jpegBuffer(10, 10), Buffer.from('<html>')]);
    expect(detectImageSignature(jpegWithTrailer)).toBe('jpeg');
  });
});

describe('readDeclaredDimensions + exceedsDecodeBudget (AC-scan-pipeline-2, decompression bomb)', () => {
  it('вычисляет заявленные размеры JPEG и PNG', () => {
    expect(readDeclaredDimensions(jpegBuffer(800, 600), 'jpeg')).toEqual({ width: 800, height: 600 });
    expect(readDeclaredDimensions(pngBuffer(1920, 1080), 'png')).toEqual({ width: 1920, height: 1080 });
  });

  it('свыше 100 Мпикс — decompression bomb', () => {
    // 20000 x 20000 = 400 Мпикс, значительно выше бюджета 50 Мпикс.
    expect(exceedsDecodeBudget({ width: 20000, height: 20000 })).toBe(true);
    expect(exceedsDecodeBudget({ width: 1000, height: 1000 })).toBe(false);
  });

  it('validateContent отвергает decompression-bomb ДО декодирования', () => {
    const bomb = jpegBuffer(20000, 20000);
    const result = validateContent(bomb);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('decompression_bomb');
    expect(result.httpStatus).toBe(422);
  });

  it('RV-scan-pipeline-06: readDeclaredDimensions читает VP8X 800×600 ВЕРНО (не 153345×4409601)', () => {
    const webp = webpVp8xBuffer(800, 600);
    expect(detectImageSignature(webp)).toBe('webp');
    expect(readDeclaredDimensions(webp, 'webp')).toEqual({ width: 800, height: 600 });
  });

  it('RV-scan-pipeline-06: валидный WebP 800×600 с VP8X-метаданными НЕ отвергается как decompression_bomb', () => {
    const webp = webpVp8xBuffer(800, 600);
    const result = validateContent(webp);
    expect(result.ok).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it('RV-scan-pipeline-06: испытание стража мутацией — СТАРЫЕ смещения 26/29 воспроизводят РОВНО дефект ревью', () => {
    // guard-must-be-able-to-fail: страж, ни разу не показавший красное, стражем не является.
    // Мутация — функция-двойник СО СТАРЫМ кодом (файл на диске не трогается), доказывающая,
    // что ИМЕННО прежние смещения давали ложный decompression_bomb на 800×600, а не что-то
    // другое совпало. Дописан ОДИН правдоподобный следующий чанк (как в настоящем
    // multi-chunk WebP) — иначе байты 30/31 попадают ЗА пределы буфера и старый дефект
    // молча схлопывается в height=1 вместо реально наблюдавшегося огромного числа.
    const webp = Buffer.concat([webpVp8xBuffer(800, 600), Buffer.from('ALPH')]);
    const buggy = readWebpDimensionsWithOldBuggyOffsets(webp);
    expect(buggy).not.toEqual({ width: 800, height: 600 });
    expect(buggy.width).toBe(153345); // РОВНО число из воспроизведения ревью
    expect(exceedsDecodeBudget(buggy)).toBe(true); // старый код ложно классифицировал бы это как bomb
    // Контроль: ИСПРАВЛЕННЫЙ путь (через реальный readDeclaredDimensions) НЕ считает это bomb.
    const fixed = readDeclaredDimensions(webp, 'webp');
    expect(fixed).toEqual({ width: 800, height: 600 });
    expect(exceedsDecodeBudget(fixed!)).toBe(false);
  });

  it('RV-scan-pipeline-06: VP8X с ДЕЙСТВИТЕЛЬНО огромными заявленными размерами всё ещё отвергается как bomb', () => {
    // Отрицательный контроль — исправление смещений не должно превратить проверку в
    // тождественно пропускающую: настоящий bomb (20000×20000) обязан остаться bomb.
    const webp = webpVp8xBuffer(20000, 20000);
    const result = validateContent(webp);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('decompression_bomb');
  });
});

describe('validateContent (AC-scan-pipeline-3, литералы канона)', () => {
  it('файл РОВНО на границе 12 582 912 байт принимается (AC-scan-pipeline-33)', () => {
    const buffer = jpegBuffer(800, 600, 12_582_912 - 11);
    expect(buffer.byteLength).toBe(12_582_912);
    const result = validateContent(buffer);
    expect(result.ok).toBe(true);
  });

  it('файл сверх 12 МБ отвергается 413', () => {
    const buffer = jpegBuffer(800, 600, 12_582_912 - 10);
    const result = validateContent(buffer);
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(413);
    expect(result.code).toBe('file_too_large');
  });

  it('разрешение меньше 320×320 отвергается 422', () => {
    const result = validateContent(jpegBuffer(250, 250));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('image_too_small');
    expect(result.httpStatus).toBe(422);
  });

  it('невалидная сигнатура отвергается 422 invalid_image', () => {
    const result = validateContent(Buffer.from('not an image at all, just text bytes'));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_image');
    expect(result.httpStatus).toBe(422);
  });
});

describe('isValidIdempotencyKey (FR-scan-pipeline-2, AC-scan-pipeline-4)', () => {
  it('принимает валидный UUID', () => {
    expect(isValidIdempotencyKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('отвергает отсутствие заголовка', () => {
    expect(isValidIdempotencyKey(undefined)).toBe(false);
  });

  it('отвергает непригодную форму "not-a-uuid"', () => {
    expect(isValidIdempotencyKey('not-a-uuid')).toBe(false);
  });

  it('отвергает массив значений заголовка (дублированный заголовок)', () => {
    expect(isValidIdempotencyKey(['550e8400-e29b-41d4-a716-446655440000', 'x'])).toBe(false);
  });
});
