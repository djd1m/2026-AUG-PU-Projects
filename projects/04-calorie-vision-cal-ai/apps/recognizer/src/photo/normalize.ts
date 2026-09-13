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

/** Сигнал отмены — ОТДЕЛЬНЫЙ исход от «сломанные байты»: `failed(normalize)`, не `schema_violation`. */
class NormalizeAbortedError extends Error {
  constructor() {
    super('нормализация прервана по дедлайну');
    this.name = 'NormalizeAbortedError';
  }
}

/**
 * RV-scan-pipeline-05: `sharp`/`minio-js` не принимают `AbortSignal` сами — обёртка
 * `Promise.race` ГАРАНТИРУЕТ, что ЭТА функция вернёт управление немедленно по срабатыванию
 * сигнала (вызывающий код, `recognize-scan.ts`, перестаёт ждать и пишет `failed(normalize)`
 * без задержки), даже если фоновая операция физически продолжается ещё какое-то время —
 * то же ограничение, что у `AbortController`, обёрнутого вокруг библиотеки без нативной
 * поддержки отмены, и оно называется здесь явно, а не скрывается за одним `if(aborted)`
 * ДО вызова (что ПРЕЖДЕ пропускало отмену, сработавшую ВО ВРЕМЯ операции или ПОСЛЕ нео,
 * но до записи — воспроизводимо: отмена внутри `putNormalized` завершалась `ok:true`).
 */
function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new NormalizeAbortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new NormalizeAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error as Error);
      },
    );
  });
}

export function createNormalizePhotoForModel(storage: RecognizerStorage, photos: PhotoLookup) {
  return async function normalize(job: RecognizeJob, signal: AbortSignal): Promise<NormalizeOutcome> {
    if (job.photoId === null) return { ok: false, reason: 'schema_violation' };

    try {
      const photo = await photos.findByRecognitionId(job.id, job.photoId);
      if (photo === undefined) return { ok: false, reason: 'normalize' };

      const original = await raceWithSignal(storage.getObject(photo.objectKey), signal);

      // Шаг 2: декодировать с ОБЩИМ бюджетом ≤ 50 Мпикс, РОВНО одна страница/кадр.
      let pipeline = sharp(original, { limitInputPixels: CANON.maxDecodePixels, pages: 1 });

      // Шаг 3: ориентация EXIF ПРИМЕНЯЕТСЯ ДО удаления метаданных (`rotate()`). Метаданные
      // снимаются целиком ДЕФОЛТОМ sharp: `withMetadata()` НЕ вызывается вовсе — вызов без
      // аргументов СОХРАНИЛ бы метаданные, а нам нужно обратное (комментарий пседокода
      // «withMetadata: false, дефолт sharp без явного withMetadata()»).
      pipeline = pipeline.rotate();

      // Шаг 4: длинная сторона ≤ 1568 px, не увеличивать.
      pipeline = pipeline.resize({ width: CANON.normalizedMaxDimensionPx, height: CANON.normalizedMaxDimensionPx, fit: 'inside', withoutEnlargement: true });

      // Шаг 5: сжимать итеративно до ≤ 5 МБ, с явным пределом итераций. КАЖДАЯ итерация —
      // под сигналом: цикл, ушедший за дедлайн на медленном кодировании, обязан прерваться
      // МЕЖДУ итерациями, не только один раз до цикла.
      let quality: number = CANON.normalizedJpegQuality;
      let output: Buffer | undefined;
      for (let iteration = 0; iteration < CANON.normalizeCompressIterations; iteration += 1) {
        output = await raceWithSignal(pipeline.clone().jpeg({ quality }).toBuffer(), signal);
        if (output.byteLength <= CANON.normalizedMaxBytes) break;
        quality = Math.max(30, quality - 15);
      }
      if (output === undefined || output.byteLength > CANON.normalizedMaxBytes) {
        return { ok: false, reason: 'schema_violation' };
      }

      // RV-scan-pipeline-05: сигнал проверяется И ЗДЕСЬ — ПОСЛЕ преобразования, ДО записи
      // объекта и ДО обновления БД. Прежде отмена, сработавшая в этом окне (типичный
      // случай: дедлайн истёк ровно во время `putNormalized`, самой медленной операции —
      // сетевой PUT), не проверялась вовсе, и функция детерминированно завершалась `ok:true`
      // с уже устаревшим результатом.
      const normalizedKey = normalizedObjectKeyFor(photo.objectKey);
      await raceWithSignal(storage.putNormalized(normalizedKey, output), signal);
      await raceWithSignal(photos.markNormalized(job.photoId, normalizedKey, output.byteLength), signal);

      return { ok: true, normalizedKey };
    } catch (error) {
      if (error instanceof NormalizeAbortedError) return { ok: false, reason: 'normalize' };
      // Любая ДРУГАЯ ошибка декодирования/трансформации на конкретном файле —
      // `schema_violation` (шаг 6): редкий путь, подавляющее большинство недекодируемых
      // файлов уже отсеяно шагом 5 `EnqueueScanForFeature`.
      return { ok: false, reason: 'schema_violation' };
    }
  };
}
