// GuardExternalTransferWithoutConsent (AC-consent-and-telegram-auth-18).

import { describe, expect, it } from 'vitest';
import { guardExternalTransferWithoutConsent, type ConsentAuditEntry } from '@n4/shared';

describe('GuardExternalTransferWithoutConsent', () => {
  it('AC-18: без согласия — отказ и запись в аудит с причиной no_consent, без содержимого', async () => {
    const recorded: ConsentAuditEntry[] = [];
    const source = { hasActiveConsent: async () => false };
    const audit = { record: (entry: ConsentAuditEntry) => recorded.push(entry) };

    const decision = await guardExternalTransferWithoutConsent(source, audit, {
      ownerId: 'owner-1',
      attemptedChannel: 'digest',
      now: () => new Date('2026-09-12T00:00:00Z'),
    });

    expect(decision).toEqual({ outcome: 'refused', reason: 'no_consent' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual({ owner: 'owner-1', attemptedChannel: 'digest', reason: 'no_consent', at: new Date('2026-09-12T00:00:00Z') });
  });

  it('недоступность источника истины (ошибка чтения) трактуется КАК отсутствие согласия', async () => {
    const recorded: ConsentAuditEntry[] = [];
    const source = { hasActiveConsent: async () => { throw new Error('база недоступна'); } };
    const audit = { record: (entry: ConsentAuditEntry) => recorded.push(entry) };

    const decision = await guardExternalTransferWithoutConsent(source, audit, { ownerId: 'owner-2', attemptedChannel: 'publish' });

    expect(decision).toEqual({ outcome: 'refused', reason: 'no_consent' });
    expect(recorded).toHaveLength(1);
  });

  it('с действующим согласием — granted, аудит не пишется', async () => {
    const recorded: ConsentAuditEntry[] = [];
    const source = { hasActiveConsent: async () => true };
    const audit = { record: (entry: ConsentAuditEntry) => recorded.push(entry) };

    const decision = await guardExternalTransferWithoutConsent(source, audit, { ownerId: 'owner-3', attemptedChannel: 'export' });

    expect(decision).toEqual({ outcome: 'granted' });
    expect(recorded).toHaveLength(0);
  });
});
