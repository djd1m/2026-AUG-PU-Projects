// Загрузка сервиса `recognizer`. Порядок тот же, что у `api`: конфигурация проверяется
// ДО первого запроса к базе и ДО выбора реализации поставщика.
// `N4_MODEL_PROVIDER=live` без ключа валит старт ЗДЕСЬ, а не на первом задании
// (DEC-A-009): отказ на старте виден сразу, отказ на первом задании — через сутки.

import { ConfigValidationError, createLogger } from '@n4/shared';
import { createPool } from '@n4/db';
import { loadRecognizerConfig, RECOGNIZER_REQUIRED_VARIABLES } from './env.js';
import { selectModelProvider } from './provider/select.js';
import { createWorker } from './worker.js';
import { runErasureJob } from './consent/erasure-job.js';
import { createMinioPhotoStore } from './storage/photo-store-minio.js';

const ERASURE_INTERVAL_MS = 60 * 60 * 1000;

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
  const provider = selectModelProvider(config);
  const worker = createWorker({ pool, provider, logger });

  // RunErasureJob (FR-consent-and-telegram-auth-10) — почасовой планировщик, как
  // `PurgeExpiredPhotos`. Отказ одного прогона не валит процесс: недоступность базы уже
  // диагностируется обработчиком события `error` пула выше.
  //
  // Настоящий клиент бакета (RV-consent-and-telegram-auth-02): `NOOP_PHOTO_STORE` в рабочем
  // процессе НЕДОПУСТИМ — объекты остались бы в бакете физически, хотя БД считает их `purged`.
  const photoStore = createMinioPhotoStore({ storage: config.storage });
  const erasureTimer = setInterval(() => {
    void runErasureJob({ pool, photoStore, logger }).catch((error: unknown) => {
      logger.error('erasure_job_failed', { message: (error as Error).message });
    });
  }, ERASURE_INTERVAL_MS);

  const shutdown = (signal: string): void => {
    logger.info('shutdown_started', { signal });
    clearInterval(erasureTimer);
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

main().catch((error: unknown) => {
  process.stderr.write(`recognizer не запущен: ${(error as Error).message}\n`);
  process.exit(1);
});
