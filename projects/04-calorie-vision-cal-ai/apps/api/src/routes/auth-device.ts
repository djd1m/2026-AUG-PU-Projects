// `POST /api/v1/auth/device` — анонимная сессия устройства (FR-foundation-4).
//
// Ни анкеты, ни регистрации, ни экрана согласия здесь нет: съёмка обязана быть доступна
// сразу, а согласие спрашивается перед ПЕРВОЙ записью дневника (ADR-009).
//
// В ответе нет ни идентификатора сессии, ни токена: клиенту достаточно cookie, а всё
// лишнее в теле — это лишнее, что попадёт в чужой журнал.

import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { CANON, ok, type Logger } from '@n4/shared';
import { createOrReuseDeviceSession, SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';

export function registerAuthDeviceRoute(app: FastifyInstance, pool: DbPool, logger: Logger): void {
  app.post('/api/v1/auth/device', async (request, reply) => {
    const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
    const ipPrefix = toIpPrefix(address);
    const presented = request.cookies[SESSION_COOKIE_NAME];

    const outcome = await createOrReuseDeviceSession(pool, { presentedToken: presented, ipPrefix });

    if (outcome.created && outcome.issuedToken !== undefined) {
      reply.setCookie(SESSION_COOKIE_NAME, outcome.issuedToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: CANON.anonymousDiaryDays * 24 * 60 * 60,
      });
      // В журнал уходит ТОЛЬКО усечённый префикс. Ни сырого токена, ни полного адреса.
      logger.info('device_session_created', { ip_prefix: ipPrefix });
      return reply.code(201).send(ok({ status: 'created' }));
    }

    return reply.code(200).send(ok({ status: 'existing' }));
  });
}
