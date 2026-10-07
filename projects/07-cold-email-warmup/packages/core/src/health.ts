import { SPAM_RATE_LIMIT, POOL_CRITICAL_MASS, UNSUB_SLA_HOURS } from '@grelka/shared';

export interface DomainStats {
  spf: 'ok' | 'warn' | 'fail' | 'unknown';
  dkim: 'ok' | 'warn' | 'fail' | 'unknown';
  dmarc: 'ok' | 'warn' | 'fail' | 'unknown';
  sent: number;
  bounced: number;
  complained: number;
}

export interface HealthScore {
  score: number;
  deliveredPct: number;
  spamRate: number;
  warmupActive: boolean;
  label: string;
}

export function computeScore(stats: DomainStats, poolMembers: number): HealthScore {
  const authOk = (['ok'] as const).includes(stats.spf as 'ok') ? 10 : 0;
  const authDkim = stats.dkim === 'ok' ? 15 : stats.dkim === 'warn' ? 5 : 0;
  const authDmarc = stats.dmarc === 'ok' ? 5 : stats.dmarc === 'warn' ? 2 : 0;
  const deliveredRate = stats.sent > 0 ? 1 - stats.bounced / stats.sent : 0.8;
  const delivered = Math.round(40 * deliveredRate);
  const spamRate = stats.sent > 0 ? stats.complained / stats.sent : 0;
  const clean = spamRate === 0 ? 25 : spamRate < SPAM_RATE_LIMIT ? 15 : 0;
  const ramp = poolMembers >= 2 ? 5 : 0;
  const warmupActive = poolMembers >= POOL_CRITICAL_MASS;
  return {
    score: authOk + authDkim + authDmarc + delivered + clean + ramp,
    deliveredPct: Math.round(deliveredRate * 10000) / 100,
    spamRate: Math.round(spamRate * 100000) / 100000,
    warmupActive,
    label:
      stats.sent === 0
        ? 'нет отправок: здоровье считается по авторизации'
        : warmupActive
          ? 'сеть в рабочей массе'
          : `сеть разогревается: ${poolMembers} участников (критмасса ${POOL_CRITICAL_MASS})`,
  };
}

export function unsubscribeDueAt(nowMs: number): Date {
  return new Date(nowMs + UNSUB_SLA_HOURS * 3600_000);
}
