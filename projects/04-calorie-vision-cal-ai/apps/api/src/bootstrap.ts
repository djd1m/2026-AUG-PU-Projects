// Загрузка сервиса `api`.
//
// ПОРЯДОК — часть требования, а не стиль (FR-foundation-2):
//   1) проверка конфигурации — ДО открытия сокета и ДО первого запроса к базе;
//   2) пул — один на процесс;
//   3) сервер и только потом `listen`.
// Процесс, открывший сокет и упавший на первом запросе, выглядит здоровым для compose
// ровно столько, сколько нужно, чтобы дефект уехал дальше.

import { createLogger, ConfigValidationError } from '@n4/shared';
import { createPool } from '@n4/db';
import { API_REQUIRED_VARIABLES, loadApiConfig } from './env.js';
import { buildServer } from './server.js';

const PORT = 3000;

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

  const shutdown = (signal: string): void => {
    logger.info('shutdown_started', { signal });
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
