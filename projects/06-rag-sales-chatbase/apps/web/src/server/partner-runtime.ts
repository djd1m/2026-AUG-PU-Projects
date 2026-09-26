// Связка маршрутов партнёра и студии: SQL из @n6/db. Одна функция для маршрутов и для тестов (tests/partners.integration.test.ts
// подменяет только ограничитель двери и сессию); зависимости собираются ОДИН раз на процесс, как у кабинета и оплаты.
import { acceptStudioInvite, createStudioInvite, readPartnerCabinet, readStudioCabinet, savePayoutDetails, type Pool } from '@n6/db';
import type { PartnerDependencies } from './partner-handler';
import { allowMutation } from './rate-limit';
import { getRuntime } from './runtime';

export function createPartnerDependencies(w: { pool: Pool; publicOrigin: string; allowMutation: PartnerDependencies['allowMutation'];
  authenticate: PartnerDependencies['authenticate']; log?: (line: string) => void }): PartnerDependencies {
  const { pool } = w;
  return {
    publicOrigin: w.publicOrigin, authenticate: w.authenticate, allowMutation: w.allowMutation, log: w.log,
    partnerCabinet: (accountId) => readPartnerCabinet(pool, accountId),
    savePayoutDetails: (accountId, details) => savePayoutDetails(pool, accountId, details),
    studioCabinet: (accountId) => readStudioCabinet(pool, accountId),
    createInvite: (input) => createStudioInvite(pool, input),
    acceptInvite: (input) => acceptStudioInvite(pool, input),
  };
}

const partnerGlobal = globalThis as typeof globalThis & { n6Partner?: PartnerDependencies };
export function getPartnerDependencies(): PartnerDependencies {
  return partnerGlobal.n6Partner ??= (() => {
    const { pool, redis, auth, config } = getRuntime();
    return createPartnerDependencies({ pool, publicOrigin: config.publicOrigin,
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token) });
  })();
}
