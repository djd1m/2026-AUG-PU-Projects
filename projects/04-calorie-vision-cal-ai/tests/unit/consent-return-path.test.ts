// `resolveDecisionTarget`/`isSafeReturnPath`/`buildConsentUrl` (задача N4): экран согласия
// уводит назад на путь, который экран результата положил в `?return=`. Открытый query-параметр
// — потенциальная открытая дверь редиректа, проверяется строго (`honest-configuration`, CFG-I3).

import { describe, expect, it } from 'vitest';
import { buildConsentUrl, isSafeReturnPath, resolveDecisionTarget } from '../../apps/web/app/consent/return-path';

describe('isSafeReturnPath', () => {
  it('принимает обычный относительный путь', () => {
    expect(isSafeReturnPath('/result/abc?intent=diary')).toBe(true);
  });

  it('отвергает протокол-независимый адрес //evil.example (чужой хост)', () => {
    expect(isSafeReturnPath('//evil.example')).toBe(false);
  });

  it('отвергает абсолютный чужой адрес', () => {
    expect(isSafeReturnPath('https://evil.example')).toBe(false);
  });

  it('отвергает null и пустую строку', () => {
    expect(isSafeReturnPath(null)).toBe(false);
    expect(isSafeReturnPath('')).toBe(false);
  });
});

describe('resolveDecisionTarget', () => {
  it('grant дописывает consent=granted через ?, если у пути ещё нет query', () => {
    expect(resolveDecisionTarget('grant', '/result/abc')).toBe('/result/abc?consent=granted');
  });

  it('grant дописывает consent=granted через &, если query уже есть', () => {
    expect(resolveDecisionTarget('grant', '/result/abc?intent=share')).toBe('/result/abc?intent=share&consent=granted');
  });

  it('decline возвращает путь БЕЗ consent=granted — повторять нечего', () => {
    expect(resolveDecisionTarget('decline', '/result/abc?intent=diary')).toBe('/result/abc?intent=diary');
  });

  it('небезопасный или отсутствующий returnTo -> null (запасной переход router.back())', () => {
    expect(resolveDecisionTarget('grant', null)).toBeNull();
    expect(resolveDecisionTarget('grant', '//evil.example')).toBeNull();
  });
});

describe('buildConsentUrl', () => {
  it('кодирует returnTo в query-параметр return', () => {
    expect(buildConsentUrl('/result/abc?intent=share')).toBe('/consent?return=%2Fresult%2Fabc%3Fintent%3Dshare');
  });
});
