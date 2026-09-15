// Конфигурация для тестов `scan-pipeline`, требующих НАСТОЯЩЕЕ хранилище (не мок):
// `S3_ACCESS_KEY`/`S3_SECRET_KEY` — РЕАЛЬНЫЕ учётные данные, провизионированные сервисом
// `storage-init` (см. `docker-compose.yml`) — не заглушка `testApiConfig` (`foundation`),
// у которой этих кредов НЕТ ни у одного реального пользователя MinIO.

import type { ApiConfig, RateLimits } from '@n4/shared';
import { TEST_BOT_TOKEN } from './telegram.js';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} не задан: интеграционные тесты storage запускаются в профиле test docker compose`);
  }
  return value;
}

export function testScanApiConfig(overrides: { rateLimits?: RateLimits; quota?: ApiConfig['quota'] } = {}): ApiConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    appOrigin: 'https://tarelka.test',
    storage: {
      endpoint: process.env.S3_ENDPOINT ?? 'http://storage:9000',
      bucket: process.env.S3_BUCKET ?? 'n4-photos',
      accessKey: required('S3_ACCESS_KEY'),
      secretKey: required('S3_SECRET_KEY'),
    },
    subscription: { priceMinor: 100_000, periodDays: 30, holdDays: 14, scanLimitPro: 100 },
    quota: overrides.quota ?? { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
    rateLimits: overrides.rateLimits ?? { mutatePerMinute: 1000, readPerMinute: 1000 },
    // Найдено слиянием: `telegramBotToken` стал ОБЯЗАТЕЛЬНЫМ полем `ApiConfig`
    // (`consent-and-telegram-auth`), а эта фикстура появилась в `scan-pipeline` и о нём не
    // знала. Токен — ТОТ ЖЕ, которым `tests/helpers/telegram.ts` подписывает `initData`:
    // сервер, собранный этой конфигурацией, обязан проверять вход тем же секретом, иначе
    // проверялось бы несовпадение фикстур, а не граница.
    telegramBotToken: TEST_BOT_TOKEN,
  };
}
