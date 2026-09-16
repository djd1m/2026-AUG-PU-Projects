// OWN-012, путь плательщика: оплата поднимает ТОЛЬКО дневной потолок на пользователя.
import { describe, expect, it } from 'vitest';
import { effectiveQuotaLimits } from '../../apps/api/src/subscription/is-pro.js';

const BASE = { scanLimitUser: 20, scanLimitDay: 3000, escalationLimitDay: 600 };

describe('effectiveQuotaLimits', () => {
  it('без подписки — базовые пределы, тот же объект', () => {
    expect(effectiveQuotaLimits(BASE, 100, false)).toBe(BASE);
  });
  it('с подписью — потолок пользователя Pro; глобальный и эскалационный не меняются', () => {
    expect(effectiveQuotaLimits(BASE, 100, true)).toEqual({ scanLimitUser: 100, scanLimitDay: 3000, escalationLimitDay: 600 });
  });
});
