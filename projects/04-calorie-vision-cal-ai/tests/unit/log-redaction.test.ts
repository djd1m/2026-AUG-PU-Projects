// Гигиена журнала (AC-foundation-16, NFR-foundation-2).

import { describe, expect, it } from 'vitest';
import { createLogger, createRedactor, REDACTED } from '@n4/shared';

describe('редактор запрещённых значений', () => {
  it('секреты и полный адрес заменяются меткой redacted с сохранением поля', () => {
    const redact = createRedactor({ secrets: ['sk-ant-super-secret-value', '7654321:bot-token-value'] });

    const cleaned = redact({
      event: 'call',
      note: 'ключ sk-ant-super-secret-value уехал в поле, которое никто не ждал',
      token: '7654321:bot-token-value',
      ip: '203.0.113.77',
      cookie: 'n4_session=raw-token-value',
      ip_prefix: '203.0.113.0/24',
      nested: { authorization: 'Bearer x', ok: 'значение без секрета' },
    }) as Record<string, unknown>;

    expect(cleaned.note).toBe(`ключ ${REDACTED} уехал в поле, которое никто не ждал`);
    expect(cleaned.token).toBe(REDACTED);
    // Поле СОХРАНЕНО: исчезнувшее поле выглядит как «его и не было».
    expect(Object.keys(cleaned)).toContain('ip');
    expect(cleaned.ip).toBe(REDACTED);
    expect(cleaned.cookie).toBe(REDACTED);
    // Усечённый префикс — это НЕ полный адрес, он остаётся читаемым.
    expect(cleaned.ip_prefix).toBe('203.0.113.0/24');
    expect((cleaned.nested as Record<string, unknown>).authorization).toBe(REDACTED);
    expect((cleaned.nested as Record<string, unknown>).ok).toBe('значение без секрета');
  });

  it('слишком короткое «значение-секрет» не затирает всё подряд', () => {
    const redact = createRedactor({ secrets: ['a', '', undefined] });
    expect(redact({ text: 'banana' })).toEqual({ text: 'banana' });
  });
});

describe('журнал', () => {
  it('пишет одну строку JSON на событие и не печатает значений секретов', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'api',
      secrets: ['sk-ant-super-secret-value'],
      sink: (line) => lines.push(line),
      now: () => new Date('2026-09-12T10:00:00.000Z'),
    });

    logger.info('config_validated', { variables: ['ANTHROPIC_API_KEY'], sample: 'sk-ant-super-secret-value' });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '{}');
    expect(parsed).toMatchObject({ level: 'info', service: 'api', event: 'config_validated', time: '2026-09-12T10:00:00.000Z' });
    // В журнал уходит ИМЯ переменной, а не её значение.
    expect(parsed.variables).toEqual(['ANTHROPIC_API_KEY']);
    expect(parsed.sample).toBe(REDACTED);
    expect(lines[0]).not.toContain('sk-ant-super-secret-value');
  });
});
