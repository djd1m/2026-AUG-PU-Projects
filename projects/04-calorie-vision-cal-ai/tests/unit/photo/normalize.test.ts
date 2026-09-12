// `NormalizePhotoForModel` (FR-scan-pipeline-5) — AC-scan-pipeline-9, -25, -33 (частично).
// Зависимости (`storage`, `photos`) ИНЪЕЦИРОВАНЫ фейками в памяти — не требует MinIO/базы;
// РЕАЛЬНЫЙ `sharp` делает настоящее декодирование/поворот/сжатие, поэтому проверка не мок.

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { CANON } from '@n4/shared';
import { createNormalizePhotoForModel, type PhotoLookup } from '../../../apps/recognizer/src/photo/normalize.js';
import type { RecognizerStorage } from '../../../apps/recognizer/src/photo/storage.js';
import type { RecognizeJob } from '../../../apps/recognizer/src/recognize/recognize-scan.js';

function fakeJob(photoId: string | null = 'photo-1'): RecognizeJob {
  return { id: 'scan-1', fence: 1, photoId, deviceSessionId: 'session-1', createdAt: new Date() };
}


describe('AC-scan-pipeline-25: EXIF-ориентация применяется ДО удаления метаданных', () => {
  it('результат нормализации физически повёрнут (ширина/высота переставлены) и БЕЗ EXIF', async () => {
    const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    let capturedOutput: Buffer | undefined;
    const storage: RecognizerStorage = {
      getObject: async () => original,
      putNormalized: async (_key, buffer) => {
        capturedOutput = buffer;
      },
    };
    const photos: PhotoLookup = {
      findByRecognitionId: async () => ({ objectKey: 'sess/scan-1.jpg', mime: 'image/jpeg' }),
      markNormalized: async () => {},
    };

    const normalize = createNormalizePhotoForModel(storage, photos);
    const outcome = await normalize(fakeJob(), new AbortController().signal);
    expect(outcome.ok).toBe(true);
    expect(capturedOutput).toBeDefined();

    const resultMeta = await sharp(capturedOutput!).metadata();
    // rotate() физически поворачивает пиксели по Orientation=6: исходные 800×400 (после
    // resize к normalizedMaxDimensionPx длинная сторона не меняется здесь, т.к. 800<=1568)
    // становятся 400×800 — короткая сторона исходника стала длинной.
    expect(resultMeta.width).toBe(400);
    expect(resultMeta.height).toBe(800);
    // Метаданные сняты ЦЕЛИКОМ: orientation в результате отсутствует (не «1», а именно нет тега).
    expect(resultMeta.orientation).toBeUndefined();
    expect(resultMeta.exif).toBeUndefined();
  });
});

describe('AC-scan-pipeline-9 (доказательство пайплайна на HEIF-семействе контейнера): нормализация ДО вызова модели', () => {
  it('декодирует HEIF-контейнер (AVIF/AV1 — см. примечание), приводит к JPEG ≤1568px и ≤5МБ', async () => {
    // ПРИМЕЧАНИЕ ОБ ОТКЛОНЕНИИ (честно, не молчаливая подмена): подлинный iPhone HEIC
    // кодируется HEVC/x265 — эта сборка sharp/libheif умеет ТОЛЬКО кодировать HEIF-семейство
    // кодеком AV1 (AVIF), что подтверждено пробой (`sharp.format.heif`, кодирование прошло,
    // decoded metadata format='heif'). Настоящий HEVC-HEIC этим окружением НЕ кодируется, а
    // скачивание фикстуры из сети ЗАПРЕЩЕНО правилом `replicate-pipeline.md`. AVIF — тот же
    // контейнер ISOBMFF/HEIF, другой кодек: он доказывает, что `normalize.ts` decode→rotate→
    // resize→compress НЕ завязан на конкретный кодек контейнера. Байтовая СИГНАТУРА (что
    // именно принимается как `image/heic` на приёме) — ОТДЕЛЬНАЯ, уже проверенная забота
    // `validate-content.test.ts`; здесь проверяется дальнейший шаг конвейера, получающий уже
    // ПОДТВЕРЖДЁННЫЙ `photo.mime` (не заново «заявленный», FR-scan-pipeline-5).
    const heifLike = await sharp({ create: { width: 4032, height: 3024, channels: 3, background: { r: 90, g: 90, b: 90 } } })
      .heif({ compression: 'av1', quality: 60 })
      .toBuffer();

    let capturedOutput: Buffer | undefined;
    const storage: RecognizerStorage = {
      getObject: async () => heifLike,
      putNormalized: async (_key, buffer) => {
        capturedOutput = buffer;
      },
    };
    const photos: PhotoLookup = {
      findByRecognitionId: async () => ({ objectKey: 'sess/scan-1.heic', mime: 'image/heic' }),
      markNormalized: async () => {},
    };

    const normalize = createNormalizePhotoForModel(storage, photos);
    const outcome = await normalize(fakeJob(), new AbortController().signal);

    expect(outcome.ok).toBe(true);
    expect(capturedOutput).toBeDefined();
    expect(capturedOutput!.byteLength).toBeLessThanOrEqual(CANON.normalizedMaxBytes);

    const resultMeta = await sharp(capturedOutput!).metadata();
    expect(resultMeta.format).toBe('jpeg');
    expect(Math.max(resultMeta.width ?? 0, resultMeta.height ?? 0)).toBeLessThanOrEqual(CANON.normalizedMaxDimensionPx);
  });
});

describe('нормализация: неудачная трансформация — failed(schema_violation), без вызова модели', () => {
  it('битые байты, прошедшие приёмную сигнатуру, но не декодируемые здесь — ok:false', async () => {
    const garbage = Buffer.alloc(2000, 0xff);
    const storage: RecognizerStorage = { getObject: async () => garbage, putNormalized: async () => {} };
    const photos: PhotoLookup = { findByRecognitionId: async () => ({ objectKey: 'x', mime: 'image/jpeg' }), markNormalized: async () => {} };

    const normalize = createNormalizePhotoForModel(storage, photos);
    const outcome = await normalize(fakeJob(), new AbortController().signal);
    expect(outcome.ok).toBe(false);
  });

  it('photoId отсутствует (null) — ok:false без обращения к хранилищу', async () => {
    let called = false;
    const storage: RecognizerStorage = {
      getObject: async () => {
        called = true;
        return Buffer.alloc(0);
      },
      putNormalized: async () => {},
    };
    const photos: PhotoLookup = { findByRecognitionId: async () => ({ objectKey: 'x', mime: 'image/jpeg' }), markNormalized: async () => {} };
    const normalize = createNormalizePhotoForModel(storage, photos);
    const outcome = await normalize(fakeJob(null), new AbortController().signal);
    expect(outcome.ok).toBe(false);
    expect(called).toBe(false);
  });
});
