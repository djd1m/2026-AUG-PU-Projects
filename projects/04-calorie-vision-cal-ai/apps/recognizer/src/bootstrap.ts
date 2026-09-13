// Загрузка сервиса `recognizer`. Порядок тот же, что у `api`: конфигурация проверяется
// ДО первого запроса к базе и ДО выбора реализации поставщика.
// `N4_MODEL_PROVIDER=live` без ключа валит старт ЗДЕСЬ, а не на первом задании
// (DEC-A-009): отказ на старте виден сразу, отказ на первом задании — через сутки.

import { ConfigValidationError, createLogger, SERVICE_LOG_FIELDS, type RecognizerConfig } from '@n4/shared';
import { createPool, type DbPool } from '@n4/db';
import { loadRecognizerConfig, RECOGNIZER_REQUIRED_VARIABLES } from './env.js';
import { selectModelProvider } from './provider/select.js';
import { createWorker } from './worker.js';
import { createUsdaMatchIngredientPort } from './match/usda-match-port.js';
import { createRecognizerStorage } from './photo/storage.js';
import { createNormalizePhotoForModel, type PhotoLookup } from './photo/normalize.js';
import { purgeExpiredPhotos } from './photo/purge-expired.js';
import type { RecognizerStorage } from './photo/storage.js';
import type { ImageFetcher } from './provider/live.js';

/**
 * `ImageFetcher` для `LiveModelProvider` (FR-scan-pipeline-13, RV-scan-pipeline-01 —
 * блокер: `selectModelProvider` вызывался без него и `live` бросал исключение даже с
 * заданным ключом). Читает НОРМАЛИЗОВАННУЮ копию из хранилища и кодирует в base64.
 * `normalize.ts` ВСЕГДА выдаёт JPEG (`CANON.normalizedJpegQuality`), поэтому mime фиксирован.
 */
function createStorageImageFetcher(storage: RecognizerStorage): ImageFetcher {
  return {
    async fetchBase64(imageKey: string) {
      const buffer = await storage.getObject(imageKey);
      return { base64: buffer.toString('base64'), mime: 'image/jpeg' as const };
    },
  };
}

/** Адаптер `photo` для нормализации — прямые запросы к таблице, без отдельного репозитория. */
function createPhotoLookup(pool: DbPool): PhotoLookup {
  return {
    async findByRecognitionId(_recognitionId, photoId) {
      const result = await pool.query<{ object_key: string; mime: string }>('SELECT object_key, mime FROM photo WHERE id = $1', [photoId]);
      const row = result.rows[0];
      return row === undefined ? undefined : { objectKey: row.object_key, mime: row.mime };
    },
    async markNormalized(photoId, normalizedObjectKey, bytes) {
      await pool.query('UPDATE photo SET normalized_object_key = $2, normalized_bytes = $3 WHERE id = $1', [photoId, normalizedObjectKey, bytes]);
    },
  };
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadRecognizerConfig();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    service: 'recognizer',
    // Разрешённые поля перечислены ЗАКРЫТЫМ списком: всё, чего в нём нет, уезжает в
    // журнал меткой `[redacted]`. Чёрный список не поймал бы произвольную строку в
    // разрешённом поле — этим и был дефект RV-foundation-01.
    allowedFields: SERVICE_LOG_FIELDS,
    secrets: [config.anthropicApiKey, config.storage.secretKey, config.storage.accessKey],
  });

  logger.info('config_validated', {
    variables: RECOGNIZER_REQUIRED_VARIABLES,
    model_provider: config.modelProvider,
    scan_limit_user: config.quota.scanLimitUser,
    scan_limit_day: config.quota.scanLimitDay,
    escalation_limit_day: config.quota.escalationLimitDay,
  });

  const pool = createPool({ databaseUrl: config.databaseUrl, applicationName: 'n4-recognizer' });

  // Обрыв соединения в ПРОСТАИВАЮЩЕМ клиенте пула приходит событием 'error'. Без
  // обработчика это необработанное событие, и Node валит ПРОЦЕСС: остановка базы на 10
  // секунд убивала `api` целиком (наблюдалось на живом стенде 2026-09-12). Процесс обязан
  // пережить недоступность базы и продолжать честно отвечать 503 — падение вместо ответа
  // стирает разницу между «база недоступна» и «сервис не существует».
  pool.on('error', (error: Error) => {
    logger.error('pool_client_error', { message: error.message });
  });
  const storage = createRecognizerStorage(config.storage);
  const provider = selectModelProvider(config, createStorageImageFetcher(storage));
  const photos = createPhotoLookup(pool);
  const normalize = createNormalizePhotoForModel(storage, photos);
  const matchPort = createUsdaMatchIngredientPort(pool); // `source-and-correct`: реальная реализация за портом.

  const worker = createWorker({ pool, provider, matchPort, quotaLimits: config.quota, normalize, logger });

  // `PurgeExpiredPhotos` (FR-scan-pipeline-11) — раз в сутки, тем же процессом, не отдельным
  // сервисом (архитектура фичи явно называет это НЕ HTTP-задачей, а шагом того же процесса).
  // RV-scan-pipeline-04: батч ограничен 500 при разрешённых 3000 сканах/сутки — прогон
  // повторяет пакет, пока не вычитает ВСЕ просроченные строки этого запуска, а не один
  // батч наугад.
  const dayMs = 24 * 60 * 60 * 1000;
  const runPurgeExpired = async (): Promise<void> => {
    let processed: number;
    do {
      const result = await purgeExpiredPhotos(pool, createMinioRemover(config));
      processed = result.processed;
    } while (processed > 0);
  };
  const purgeTimer = setInterval(() => {
    runPurgeExpired().catch((error: unknown) => logger.error('purge_expired_failed', { message: (error as Error).message }));
  }, dayMs);
  purgeTimer.unref();
  // Уборка орфанов бакета (FR-scan-pipeline-14 шаг 12) — обязанность `apps/api`
  // (`purge-orphans.ts` живёт там, владеет тем же `PhotoStorage`, что и `POST /scans`);
  // здесь, в `recognizer`, НЕ дублируется — см. `apps/api/src/bootstrap.ts` (RV-scan-pipeline-03).

  const shutdown = (signal: string): void => {
    logger.info('shutdown_started', { signal });
    clearInterval(purgeTimer);
    void worker
      .stop()
      .then(() => pool.end())
      .then(() => {
        logger.info('shutdown_complete', { signal });
        process.exit(0);
      })
      .catch(() => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  worker.start();
  logger.info('worker_started', { lease_owner: worker.ownerId, provider: provider.kind });
}

async function createMinioClient(config: RecognizerConfig): Promise<InstanceType<Awaited<typeof import('minio')>['Client']>> {
  const { Client } = await import('minio');
  const url = new URL(config.storage.endpoint);
  return new Client({
    endPoint: url.hostname,
    port: url.port !== '' ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
    accessKey: config.storage.accessKey,
    secretKey: config.storage.secretKey,
  });
}

/**
 * RV-scan-pipeline-04: НЕ проглатывает ошибки — S3-совместимое DELETE идемпотентно
 * (удаление несуществующего ключа тоже резолвится успехом у MinIO), поэтому «объект уже
 * удалён» и «сбой обращения» и так различимы БЕЗ ловли исключения здесь: настоящий сбой
 * (сеть, авторизация) обязан долететь до `purgeExpiredPhotos`, которая оставит строку
 * `present` для повторной попытки, а не проглотит его молча и не пометит `purged`.
 */
function createMinioRemover(config: RecognizerConfig): { removeObject(objectKey: string): Promise<void> } {
  const clientPromise = createMinioClient(config);
  return {
    async removeObject(objectKey: string) {
      const client = await clientPromise;
      await client.removeObject(config.storage.bucket, objectKey);
    },
  };
}


main().catch((error: unknown) => {
  process.stderr.write(`recognizer не запущен: ${(error as Error).message}\n`);
  process.exit(1);
});
