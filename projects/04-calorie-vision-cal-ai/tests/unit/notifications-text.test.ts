// Пункт 4: тексты уведомлений и формат сумм. Текст — то, что человек прочитает в Telegram и в
// кабинете; пустой или неверный он хуже отсутствия уведомления.
import { describe, expect, it } from 'vitest';
import { notificationText, rubles, type NotificationKind } from '../../apps/api/src/notifications/notify.js';

describe('суммы в тексте', () => {
  it('копейки → рубли с запятой, как в кабинете и выгрузке', () => {
    expect(rubles(47865)).toBe('478,65');
    expect(rubles(5)).toBe('0,05');
  });
  it('возврат назван суммой БЕЗ минуса: знак несёт слово «отменено», а не число', () => {
    expect(rubles(-47865)).toBe('478,65');
  });
  it('отсутствующая сумма — прочерк, а не «null»', () => {
    expect(rubles(null)).toBe('—');
  });
});

describe('тексты трёх видов уведомлений', () => {
  const kinds: NotificationKind[] = ['commission_accrued', 'commission_clawed_back', 'payout_recorded'];
  it('каждый вид даёт непустой текст с суммой и с указанием, что делать дальше', () => {
    for (const kind of kinds) {
      const text = notificationText(kind, 47865);
      expect(text.length, kind).toBeGreaterThan(30);
      expect(text, kind).toContain('478,65');
      expect(text, kind).toContain('Тарелка');
    }
  });
  it('начисление называет СРОК доступности — иначе партнёр ждёт денег сегодня', () => {
    expect(notificationText('commission_accrued', 47865)).toMatch(/14 дней/);
  });
  it('три вида различаются между собой', () => {
    const texts = new Set(kinds.map((k) => notificationText(k, 100)));
    expect(texts.size).toBe(3);
  });
});
