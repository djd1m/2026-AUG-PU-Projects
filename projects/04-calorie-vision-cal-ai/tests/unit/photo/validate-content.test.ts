// FR-scan-pipeline-1/17, AC-scan-pipeline-1/2/3/4/33.

import { describe, expect, it } from 'vitest';
import {
  detectImageSignature,
  exceedsDecodeBudget,
  isValidIdempotencyKey,
  readDeclaredDimensions,
  validateContent,
} from '../../../apps/api/src/photo/validate-content.js';

function jpegBuffer(width: number, height: number, extraBytes = 100): Buffer {
  // Минимальный валидный JPEG-скелет с SOF0, несущий заявленные width/height.
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  const dims = Buffer.alloc(4);
  dims.writeUInt16BE(height, 0);
  dims.writeUInt16BE(width, 2);
  const rest = Buffer.alloc(extraBytes, 0xaa);
  return Buffer.concat([header, dims, rest]);
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
