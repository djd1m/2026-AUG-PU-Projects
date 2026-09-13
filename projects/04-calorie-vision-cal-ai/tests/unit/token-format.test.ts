// ValidateTelegramBotTokenFormat (AC-consent-and-telegram-auth-19).

import { describe, expect, it } from 'vitest';
import { isValidTelegramBotTokenFormat } from '../../apps/api/src/auth/token-format.js';

describe('ValidateTelegramBotTokenFormat', () => {
  it('принимает форму <цифры>:<35 символов A-Za-z0-9_->', () => {
    // Длина вычисляется программно — ручной подсчёт символов в строке ненадёжен.
    const thirtyFiveChars = 'AAF-'.padEnd(35, '0123456789abcdefghijklmnopqrstuvwxyz').slice(0, 35);
    expect(thirtyFiveChars.length).toBe(35);
    expect(isValidTelegramBotTokenFormat(`123456789:${thirtyFiveChars}`)).toBe(true);
  });

  it('три недопустимых формата отклоняются', () => {
    expect(isValidTelegramBotTokenFormat('not-a-real-token')).toBe(false);
    // Без двоеточия.
    expect(isValidTelegramBotTokenFormat('123456789AAF1234567890abcdefghijklmnopqrstuv')).toBe(false);
    // Хвост короче 35 символов.
    expect(isValidTelegramBotTokenFormat('123456789:short')).toBe(false);
  });
});
