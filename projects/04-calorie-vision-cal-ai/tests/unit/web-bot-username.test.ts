// Имя бота Telegram — КОНФИГУРАЦИЯ, а не литерал в разметке (16.09.2026).
//
// Заслужено: `t.me/tarelka_bot` было зашито в `settings/page.tsx`, а настоящий бот проекта
// называется иначе — кнопка «Войти через Telegram» вела на ЧУЖОГО бота. Проверка по исходнику,
// а не по рендеру: литерал не должен вернуться в код ни при каком рефакторинге.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWebConfig } from '../../apps/web/env.js';

const SETTINGS_PAGE = readFileSync(new URL('../../apps/web/app/settings/page.tsx', import.meta.url), 'utf8');

const BASE_ENV = {
  API_INTERNAL_URL: 'http://api:3000',
  N4_SUBSCRIPTION_PRICE_MINOR: '100000',
  N4_SCAN_LIMIT_USER: '20',
  N4_SCAN_LIMIT_PRO: '100',
  N4_PAYMENTS_MODE: 'live',
};

describe('имя бота Telegram приходит из окружения', () => {
  it('в разметке экрана настроек нет зашитого имени бота', () => {
    expect(SETTINGS_PAGE).not.toMatch(/t\.me\/[A-Za-z0-9_]+/);
    expect(SETTINGS_PAGE).toContain('config.telegramBotUsername');
  });

  it('ИСПЫТАНИЕ (guard-must-be-able-to-fail): прежняя строка с литералом красит проверку', () => {
    const previous = '<TelegramLoginButton botDeepLink="https://t.me/tarelka_bot" />';
    expect(previous).toMatch(/t\.me\/[A-Za-z0-9_]+/);
  });

  it('имя читается и нормализуется: собачка отбрасывается', () => {
    expect(loadWebConfig({ ...BASE_ENV, TELEGRAM_BOT_USERNAME: '@calorytarelka_bot' }).telegramBotUsername).toBe('calorytarelka_bot');
  });

  it('отсутствующее и непригодное имя — ОТКАЗ, а не «наверное, тот самый бот»', () => {
    for (const bad of [undefined, '', '   ', 'йцукен_бот', 'ab', 'x'.repeat(33), 'с пробелом']) {
      expect(() => loadWebConfig({ ...BASE_ENV, TELEGRAM_BOT_USERNAME: bad }), String(bad)).toThrow(/TELEGRAM_BOT_USERNAME/);
    }
  });
});
