// Фикстуры изображений для тестов `scan-pipeline`. Генерируются `sharp` В ПАМЯТИ — скачивать
// фикстуры из сети ЗАПРЕЩЕНО правилом проекта (`replicate-pipeline.md`).

import sharp from 'sharp';

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
  // > 12 МБ: проверка размера (шаг 4 EnqueueScanForFeature) происходит ПОСЛЕ сигнатуры и
  // decompression-bomb, но ДО декодируемости (шаг 5) — валидный МАЛЕНЬКИЙ JPEG с довеском
  // байт ПОСЛЕ EOI (0xFFD9) проходит сигнатуру, не считается bomb-изображением (заявленные
  // размеры малы) и не должен декодироваться вовсе для этой проверки: она обязана
  // отработать по одной ДЛИНЕ файла, раньше декодирования.
  const small = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg({ quality: 90 }).toBuffer();
  const padding = Buffer.alloc(13_000_000, 0x00);
  return Buffer.concat([small, padding]);
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
