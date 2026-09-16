// Конфигурация сервиса `web` (`apps/web/env.ts`) — единственное место, где он читает
// окружение. Слой unit: это решения о значениях, ни база, ни рендер для них не нужны.

import { describe, expect, it } from 'vitest';
import { loadWebConfig } from '../../apps/web/env.js';

const FULL: Record<string, string | undefined> = {
  API_INTERNAL_URL: 'http://api:3000',
  // OWN-012 / 16.09.2026: имя бота — обязательная конфигурация `web`; без него кнопка входа
  // повела бы на чужого бота (см. `web-bot-username.test.ts`).
  TELEGRAM_BOT_USERNAME: 'calorytarelka_bot',
  N4_SUBSCRIPTION_PRICE_MINOR: '100000',
  N4_SCAN_LIMIT_USER: '10',
  N4_SCAN_LIMIT_PRO: '100',
  N4_PAYMENTS_MODE: 'live',
};

describe('loadWebConfig', () => {
  it('полное окружение принимается, числа берутся из него', () => {
    const config = loadWebConfig(FULL);
    expect(config.subscriptionPriceMinor).toBe(100_000);
    expect(config.scanLimitFree).toBe(10);
    expect(config.scanLimitPro).toBe(100);
    expect(config.paymentsMode).toBe('live');
  });

  it('каждая обязательная переменная проверяется ОТДЕЛЬНЫМ прогоном', () => {
    for (const name of ['API_INTERNAL_URL', 'N4_SUBSCRIPTION_PRICE_MINOR', 'N4_SCAN_LIMIT_USER', 'N4_SCAN_LIMIT_PRO', 'TELEGRAM_BOT_USERNAME']) {
      expect(() => loadWebConfig({ ...FULL, [name]: undefined }), name).toThrow(new RegExp(name));
      expect(() => loadWebConfig({ ...FULL, [name]: '  ' }), `${name} пустой`).toThrow(new RegExp(name));
    }
  });

  it('непригодная цена отвергается, а не округляется: ноль, дробь и текст', () => {
    for (const bad of ['0', '-1', '99.5', 'тысяча']) {
      expect(() => loadWebConfig({ ...FULL, N4_SUBSCRIPTION_PRICE_MINOR: bad }), bad).toThrow(/N4_SUBSCRIPTION_PRICE_MINOR/);
    }
  });

  it('режим платежей: ЖИВЫМ считается только точное «live», всё остальное — демо', () => {
    // Fail-closed в пользу честности: подписать «деньги списываются» под кнопкой, которая
    // их не списывает, — обман; обратная ошибка безобиднее.
    for (const raw of [undefined, '', 'LIVE', 'prod', 'fake', 'true']) {
      expect(loadWebConfig({ ...FULL, N4_PAYMENTS_MODE: raw }).paymentsMode, String(raw)).toBe('fake');
    }
    expect(loadWebConfig({ ...FULL, N4_PAYMENTS_MODE: 'live' }).paymentsMode).toBe('live');
  });
});
