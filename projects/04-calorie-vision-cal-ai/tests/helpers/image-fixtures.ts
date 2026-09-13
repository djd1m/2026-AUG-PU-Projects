// Фикстуры изображений для тестов `scan-pipeline`. Генерируются `sharp` В ПАМЯТИ — скачивать
// фикстуры из сети ЗАПРЕЩЕНО правилом проекта (`replicate-pipeline.md`).

import sharp from 'sharp';
import { randomBytes } from 'node:crypto';

export async function makeJpegFixture(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 180, b: 90 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function makePngFixture(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .png()
    .toBuffer();
}

export async function makeWebpFixture(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 210 } } })
    .webp({ quality: 90 })
    .toBuffer();
}

export async function makeOversizedJpegFixture(): Promise<Buffer> {
  // > 12 МБ: проверка размера (шаг 4 EnqueueScanForFeature) происходит ПОСЛЕ сигнатуры,
  // decompression-bomb и полиглот-проверки хвоста (RV-scan-pipeline-07), но ДО
  // декодируемости (шаг 5). ОТКЛОНЕНИЕ от прежней версии: раньше довесок ПОСЛЕ EOI давал
  // байтовый объём дёшево, но теперь ровно такой хвост и есть полиглот — страж
  // `hasTrailingGarbage` отверг бы файл 422 РАНЬШЕ проверки размера, и тест доказывал бы не
  // то, что заявлен. Вместо довеска — НАСТОЯЩИЙ большой JPEG из случайного шума (шум почти
  // не сжимается DCT, в отличие от гладких изображений): валиден целиком, EOI на самом
  // конце, декодируем, и превышает порог БЕЗ единого постороннего байта.
  const noise = randomBytes(3500 * 3500 * 3);
  return sharp(noise, { raw: { width: 3500, height: 3500, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

export async function makeTooSmallJpegFixture(): Promise<Buffer> {
  return makeJpegFixture(250, 250);
}

export function corruptedHeicLikeFixture(): Buffer {
  // Правдоподобная сигнатура HEIC (ftyp+heic бренд), но битый битстрим после заголовка —
  // AC-scan-pipeline-24: недекодируемый файл с валидной сигнатурой контейнера.
  const header = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic')]);
  const garbage = Buffer.alloc(2000, 0xff);
  return Buffer.concat([header, garbage]);
}
