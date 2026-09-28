import { loadWebConfig } from '@clipmaker/shared/config';
import { createPool } from '@clipmaker/db';
import Redis from 'ioredis';
import { readEnvironment } from './environment';
import { AuthService } from './auth';
import { PgAuthStore } from './auth-store';
import { selectPaymentProvider } from './payments/config';

function createRuntime() {
  const config = loadWebConfig(readEnvironment());
  const pool = createPool(config.databaseUrl);
  // Сырые ошибки драйвера не журналируются: в них могут быть параметры соединения.
  pool.on('error', () => console.error('Соединение БД потеряно: сессии временно недоступны'));
  const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000,
    enableOfflineQueue: false, retryStrategy: () => null });
  redis.on('error', () => console.error('Redis недоступен: запросы будут отклонены ограничителем'));
  // payments: null — оплата выключена (off); иначе провайдер по уже проверенной конфигурации (фича 30).
  return { config, pool, redis, auth: new AuthService(new PgAuthStore(pool), config.sessionSecret), payments: selectPaymentProvider(config.payments) };
}
// Next может загрузить instrumentation и обработчики отдельными бандлами: кеш общий для процесса.
const runtimeGlobal = globalThis as typeof globalThis & { n5Runtime?: ReturnType<typeof createRuntime> };
export function getRuntime() {
  return runtimeGlobal.n5Runtime ??= createRuntime();
}
