// Конфигурация сервера для тестов маршрутов. Значения ЗАДАНЫ ЯВНО, а не прочитаны из
// окружения прогона: тест, берущий пороги оттуда же, откуда их берёт код, проверяет
// согласие файла с самим собой.

import type { ApiConfig, RateLimits } from '@n4/shared';

export function testApiConfig(overrides: { rateLimits?: RateLimits } = {}): ApiConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    appOrigin: 'https://tarelka.test',
    storage: { endpoint: 'http://storage:9000', bucket: 'n4-photos', accessKey: 'test-access', secretKey: 'test-secret' },
    quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 },
    rateLimits: overrides.rateLimits ?? { mutatePerMinute: 30, readPerMinute: 120 },
  };
}
