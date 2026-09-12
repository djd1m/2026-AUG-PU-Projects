// GrantOrDeclineConsent (AC-consent-and-telegram-auth-9/10).
//
// Юнит-слой: неизвестная версия и несовпавший хэш возвращаются ДО обращения к базе — тест
// подставляет исполнителя, который бросает при любом `query`, чтобы доказать, что запрос НЕ
// выполняется в отказных ветках.

import { describe, expect, it, vi } from 'vitest';
import { grantOrDeclineConsent } from '../../apps/api/src/consent/grant-or-decline.js';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';

function neverQueryExecutor() {
  return { query: vi.fn().mockRejectedValue(new Error('запрос к базе не должен выполняться в этой ветке')) };
}

describe('GrantOrDeclineConsent', () => {
  it('AC-10: неизвестная версия текста отклоняется 422-эквивалентом без обращения к базе', async () => {
    const executor = neverQueryExecutor();

    const result = await grantOrDeclineConsent(executor as never, {
      ownerTable: 'account',
      ownerId: 'owner-1',
      decision: 'grant',
      consentVersion: 'v99-does-not-exist',
      consentTextHash: 'irrelevant',
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'unknown_consent_version' });
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('AC-10: известная версия, но несовпавший хэш — тот же отказ, что неизвестная версия', async () => {
    const executor = neverQueryExecutor();

    const result = await grantOrDeclineConsent(executor as never, {
      ownerTable: 'account',
      ownerId: 'owner-1',
      decision: 'grant',
      consentVersion: '2026-09-v1',
      consentTextHash: 'подставной-хэш-не-от-канонического-текста',
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'unknown_consent_version' });
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('AC-9: decline не пишет в базу и не блокирует последующее чтение — только фиксирует факт', async () => {
    const executor = neverQueryExecutor();

    const result = await grantOrDeclineConsent(executor as never, {
      ownerTable: 'device_session',
      ownerId: 'session-1',
      decision: 'decline',
      consentVersion: '2026-09-v1',
      consentTextHash: computeConsentTextHash('2026-09-v1') ?? '',
    });

    expect(result.outcome).toBe('declined');
    expect(executor.query).not.toHaveBeenCalled();
  });
});
