// `NormalizePhotoForModel` (FR-scan-pipeline-5, `02_pseudocode.md`). Оригинал НЕ изменяется.
// Порядок ОБЯЗАТЕЛЕН (PC-05): ориентация EXIF (`rotate()`) ДО удаления метаданных — иначе
// повёрнутое на телефоне фото остаётся повёрнутым в сохранённой копии. HEIC — риск,
// названный в `03_architecture.md`: стандартная сборка `sharp`/`libvips` может не включать
// HEIF-декодер; если так, эта функция честно возвращает `failed(normalize)` вместо падения
// процесса — см. `receipts/impl-scan-pipeline.md`, «Дефекты, найденные сборкой».

import sharp from 'sharp';
import { CANON } from '@n4/shared';
import type { RecognizerStorage } from './storage.js';
import { normalizedObjectKeyFor } from './storage.js';
import type { NormalizeOutcome, RecognizeJob } from '../recognize/recognize-scan.js';

export interface PhotoLookup {
  /** Возвращает `object_key` оригинала и ПОДТВЕРЖДЁННЫЙ по байтам `mime` (не заявленный). */
  findByRecognitionId(recognitionId: string, photoId: string): Promise<{ objectKey: string; mime: string } | undefined>;
  markNormalized(photoId: string, normalizedObjectKey: string, bytes: number): Promise<void>;
}

export function createNormalizePhotoForModel(storage: RecognizerStorage, photos: PhotoLookup) {
  return async function normalize(job: RecognizeJob, signal: AbortSignal): Promise<NormalizeOutcome> {
    if (job.photoId === null) return { ok: false, reason: 'schema_violation' };

    try {
      const photo = await photos.findByRecognitionId(job.id, job.photoId);
      if (photo === undefined) return { ok: false, reason: 'normalize' };
      if (signal.aborted) return { ok: false, reason: 'normalize' };

      const original = await storage.getObject(photo.objectKey);
      if (signal.aborted) return { ok: false, reason: 'normalize' };

      // Шаг 2: декодировать с ОБЩИМ бюджетом ≤ 50 Мпикс, РОВНО одна страница/кадр.
      let pipeline = sharp(original, { limitInputPixels: CANON.maxDecodePixels, pages: 1 });

      // Шаг 3: ориентация EXIF ПРИМЕНЯЕТСЯ ДО удаления метаданных (`rotate()`). Метаданные
      // снимаются целиком ДЕФОЛТОМ sharp: `withMetadata()` НЕ вызывается вовсе — вызов без
      // аргументов СОХРАНИЛ бы метаданные, а нам нужно обратное (комментарий пседокода
      // «withMetadata: false, дефолт sharp без явного withMetadata()»).
      pipeline = pipeline.rotate();

      // Шаг 4: длинная сторона ≤ 1568 px, не увеличивать.
      pipeline = pipeline.resize({ width: CANON.normalizedMaxDimensionPx, height: CANON.normalizedMaxDimensionPx, fit: 'inside', withoutEnlargement: true });

      // Шаг 5: сжимать итеративно до ≤ 5 МБ, с явным пределом итераций.
      let quality: number = CANON.normalizedJpegQuality;
      let output: Buffer | undefined;
      for (let iteration = 0; iteration < CANON.normalizeCompressIterations; iteration += 1) {
        if (signal.aborted) return { ok: false, reason: 'normalize' };
        output = await pipeline.clone().jpeg({ quality }).toBuffer();
        if (output.byteLength <= CANON.normalizedMaxBytes) break;
        quality = Math.max(30, quality - 15);
      }
      if (output === undefined || output.byteLength > CANON.normalizedMaxBytes) {
        return { ok: false, reason: 'schema_violation' };
      }

      const normalizedKey = normalizedObjectKeyFor(photo.objectKey);
      await storage.putNormalized(normalizedKey, output);
      await photos.markNormalized(job.photoId, normalizedKey, output.byteLength);

      return { ok: true, normalizedKey };
    } catch {
      // Любая ошибка декодирования/трансформации на конкретном файле — `schema_violation`
      // (шаг 6): редкий путь, подавляющее большинство недекодируемых файлов уже отсеяно
      // шагом 5 `EnqueueScanForFeature`.
      return { ok: false, reason: 'schema_violation' };
    }
  };
}
