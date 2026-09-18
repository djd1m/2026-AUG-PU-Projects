// Загрузка сервиса `api`.
//
// ПОРЯДОК — часть требования, а не стиль (FR-foundation-2):
//   1) проверка конфигурации — ДО открытия сокета и ДО первого запроса к базе;
//   2) пул — один на процесс;
//   3) сервер и только потом `listen`.
// Процесс, открывший сокет и упавший на первом запросе, выглядит здоровым для compose
// ровно столько, сколько нужно, чтобы дефект уехал дальше.

import { ConfigValidationError, createLogger, SERVICE_LOG_FIELDS, type ApiConfig } from '@n4/shared';
import { createPool } from '@n4/db';
import { API_REQUIRED_VARIABLES, loadApiConfig } from './env.js';
import { startRenewalLoop } from './renewals/loop.js';
import { selectPaymentProvider } from './payments/select-provider.js';
import { buildServer } from './server.js';
import { createPhotoStorage } from './photo/store-original.js';
import { purgeOrphanObjects, type StorageObjectLister } from './photo/purge-orphans.js';

const PORT = 3000;

/**
 * `StorageObjectLister` на настоящем MinIO (RV-scan-pipeline-03 — high: функция уборки
 * орфанов существовала, но приложение её нигде не вызывало; производственного
 * `listObjects` не было вовсе).
 */
function createBucketLister(config: ApiConfig): StorageObjectLister {
  const clientPromise = (async () => {
    const { Client } = await import('minio');
    const url = new URL(config.storage.endpoint);
    return new Client({
      endPoint: url.hostname,
      port: url.port !== '' ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80,
      useSSL: url.protocol === 'https:',
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
    });
  })();
  const photoStorage = createPhotoStorage(config.storage);
  return {
    async *listObjects() {
      const client = await clientPromise;
      const stream = client.listObjectsV2(config.storage.bucket, '', true);
      for await (const item of stream) {
        // `BucketItem.name`/`lastModified` — `undefined` только для «префиксных» записей,
        // которых здесь нет (`recursive: true`, без `Prefix`).
        const entry = item as { name?: string; lastModified?: Date };
        if (entry.name === undefined || entry.lastModified === undefined) continue;
        yield { key: entry.name, lastModified: entry.lastModified };
      }
    },
    removeObject: (key) => photoStorage.removeObject(key),
  };
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadApiConfig();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      // Сокет не открыт, к базе не обращались. В stderr — имена переменных и последствия,
      // но НИ ОДНОГО значения.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    service: 'api',
    // Разрешённые поля перечислены ЗАКРЫТЫМ списком: всё, чего в нём нет, уезжает в
    // журнал меткой `[redacted]`. Чёрный список не поймал бы произвольную строку в
    // разрешённом поле — этим и был дефект RV-foundation-01.
    allowedFields: SERVICE_LOG_FIELDS,
    // Секреты затираются по значению, даже если попадут в чужое поле.
    secrets: [config.storage.secretKey, config.storage.accessKey],
  });

  // Событие старта печатает ИМЕНА проверенных переменных и три потолка — без значений
  // секретов и без строки подключения.
  logger.info('config_validated', {
    variables: API_REQUIRED_VARIABLES,
    scan_limit_user: config.quota.scanLimitUser,
    scan_limit_day: config.quota.scanLimitDay,
    escalation_limit_day: config.quota.escalationLimitDay,
    rate_limit_mutate_per_min: config.rateLimits.mutatePerMinute,
    rate_limit_read_per_min: config.rateLimits.readPerMinute,
    // Режим платежей печатается ИМЕНЕМ: прогон на фейке не должен выглядеть как живой приём
    // денег ни в журнале, ни в квитанции.
    payments_mode: config.payments.N4_PAYMENTS_MODE,
    subscription_price_minor: config.subscription.priceMinor,
    scan_limit_pro: config.subscription.scanLimitPro,
  });

  const pool = createPool({ databaseUrl: config.databaseUrl, applicationName: 'n4-api' });

  // Обрыв соединения в ПРОСТАИВАЮЩЕМ клиенте пула приходит событием 'error'. Без
  // обработчика это необработанное событие, и Node валит ПРОЦЕСС: остановка базы на 10
  // секунд убивала `api` целиком (наблюдалось на живом стенде 2026-09-12). Процесс обязан
  // пережить недоступность базы и продолжать честно отвечать 503 — падение вместо ответа
  // стирает разницу между «база недоступна» и «сервис не существует».
  pool.on('error', (error: Error) => {
    logger.error('pool_client_error', { message: error.message });
  });
  const app = buildServer({ config, pool, logger });

  // Цикл продлений живёт ЗДЕСЬ, а не в recognizer: ключи платёжного провайдера принадлежат
  // только `api` (`secrets-management.md`). Раз в 15 минут — продление не срочно с точностью
  // до минуты, а частый проход означал бы постоянные запросы к базе ради пустого результата.
  const renewalPayments = selectPaymentProvider(config.payments);
  const renewals = startRenewalLoop(
    {
      pool,
      payments: renewalPayments,
      priceMinor: config.subscription.priceMinor,
      appOrigin: config.appOrigin,
      leaseSeconds: 120,
      logger,
    },
    { intervalMs: 15 * 60 * 1000, batchSize: 50 },
  );

  // Уборка орфанов бакета (FR-scan-pipeline-14 шаг 12, RV-scan-pipeline-03). Раз в час —
  // порог самих орфанов уже час (`CANON.orphanObjectMaxAgeMs`); реже сироты копились бы
  // сутками до первой уборки.
  const orphanLister = createBucketLister(config);
  const hourMs = 60 * 60 * 1000;
  const orphanTimer = setInterval(() => {
    purgeOrphanObjects(pool, orphanLister)
      // Удаляющая работа ОБЯЗАНА оставлять след. Прежде она писала только про ОТКАЗ, и
      // поэтому удаление восьми карточек «поделиться» 17.09.2026 не оставило в журнале
      // ни строки: искать было нечего, и причину пришлось восстанавливать по коду.
      .then(({ scanned, removed, skippedForeign }) => logger.info('purge_orphans_done', { scanned, removed, skippedForeign }))
      .catch((error: unknown) => logger.error('purge_orphans_failed', { message: (error as Error).message }));
  }, hourMs);
  orphanTimer.unref();

  const shutdown = (signal: string): void => {
    logger.info('shutdown_started', { signal });
    clearInterval(orphanTimer);
    renewals.stop();
    void app
      .close()
      .then(() => pool.end())
      .then(() => {
        logger.info('shutdown_complete', { signal });
        process.exit(0);
      })
      .catch(() => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: PORT });
  logger.info('listening', { port: PORT });
}

main().catch((error: unknown) => {
  process.stderr.write(`api не запущен: ${(error as Error).message}\n`);
  process.exit(1);
});
