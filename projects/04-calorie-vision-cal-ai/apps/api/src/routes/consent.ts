// `POST /api/v1/consent` — GrantOrDeclineConsent (FR-consent-and-telegram-auth-5/6,
// маршрут 12 канона, DEC-A-019).
//
// Работает на ЛЮБОЙ сессии — анонимной или связанной с аккаунтом (маршрут НЕ требует входа):
// владелец записи — `account`, если `device_session.account_id` заполнен, иначе сама
// `device_session`.

import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { CANON, fail, ok, type Logger } from '@n4/shared';
import { grantOrDeclineConsent } from '../consent/grant-or-decline.js';
import { createOrReuseDeviceSession, SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';

interface ConsentBody {
  readonly decision?: 'grant' | 'decline';
  readonly consent_version?: string;
  readonly consent_text_hash?: string;
}

export function registerConsentRoute(app: FastifyInstance, pool: DbPool, logger: Logger): void {
  app.post<{ Body: ConsentBody }>('/api/v1/consent', async (request, reply) => {
    const body = request.body ?? {};
    if (body.decision !== 'grant' && body.decision !== 'decline') {
      return reply.code(422).send(fail('invalid_decision', 'decision обязан быть grant или decline'));
    }
    if (typeof body.consent_version !== 'string' || body.consent_version.trim() === '') {
      return reply.code(422).send(fail('unknown_consent_version', 'consent_version не указана'));
    }

    const presented = request.cookies[SESSION_COOKIE_NAME];
    const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
    const sessionOutcome = await createOrReuseDeviceSession(pool, { presentedToken: presented, ipPrefix: toIpPrefix(address) });
    const session = sessionOutcome.session;
    const ownerTable = session.account_id !== null ? ('account' as const) : ('device_session' as const);
    const ownerId = session.account_id ?? session.id;

    const result = await grantOrDeclineConsent(pool, {
      ownerTable,
      ownerId,
      decision: body.decision,
      consentVersion: body.consent_version,
      consentTextHash: body.consent_text_hash ?? '',
    });

    if (sessionOutcome.issuedToken !== undefined) {
      reply.setCookie(SESSION_COOKIE_NAME, sessionOutcome.issuedToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: CANON.anonymousDiaryDays * 24 * 60 * 60,
      });
    }

    if (result.outcome === 'refused') {
      return reply.code(422).send(fail('unknown_consent_version', 'согласие на неизвестный текст не является согласием'));
    }

    if (result.outcome === 'declined') {
      // Аудит отказа: владелец, версия текста, время — структурный журнал (`ConsentAndErasure`
      // шаг 2). `consent_at` НЕ пишется: отсутствие поля уже есть состояние «согласия нет».
      logger.info('consent_declined', { owner_table: ownerTable, consent_version: result.consentVersion });
    }

    return reply
      .code(200)
      .send(ok({ decision: result.outcome === 'granted' ? 'grant' : 'decline', consent_version: result.consentVersion, recorded_at: result.recordedAt.toISOString() }));
  });
}
