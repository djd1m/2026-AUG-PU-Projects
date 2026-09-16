// Заведение партнёра и его кода владельцем (пункт 2 из пяти пробелов, 16.09.2026).
//
// До этого маршрута строка `partner` и её `partner_code` вставлялись SQL-запросом в базу
// руками: кнопка «пригласить» в кабинете работала только для УЖЕ существующего партнёра, а
// откуда он там берётся — не отвечал никто. Владелец не обязан открывать psql, чтобы завести
// блогера.
//
// `POST /api/v1/admin/partners` — расширение закрытого списка маршрутов канона; записано в
// `docs/decisions-autonomous.md` (DEC-A-057), а не добавлено молча.
//
// Доступ — тот же `requireOwner`, что и у остальных маршрутов кабинета: посторонний получает
// `404`, а не `403`, и не узнаёт, что маршрут существует.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withTransaction, type DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireOwner, type OwnerLists } from './admin.js';

export interface AdminPartnersDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  readonly owners: OwnerLists;
}

interface CreatePartnerBody {
  readonly display_name?: unknown;
  readonly contact?: unknown;
  readonly code?: unknown;
  readonly commission_rate_bp?: unknown;
}

/** Тот же формат, что CHECK в схеме: 4–12 знаков, заглавная латиница и цифры. */
const CODE_RE = /^[A-Z0-9]{4,12}$/;
const NAME_MAX = 100;
const DEFAULT_RATE_BP = 5000;

class CodeTakenError extends Error {}

/** Строка обязательна, не пуста после обрезки и не длиннее предела. */
function requireText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

export function registerAdminPartnersRoutes(app: FastifyInstance, deps: AdminPartnersDeps): void {
  app.post('/api/v1/admin/partners', async (request: FastifyRequest<{ Body: CreatePartnerBody }>, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps.owners })) === null) {
      return reply.code(404).send(fail('not_found', 'маршрут не найден'));
    }

    const body = request.body ?? {};
    const displayName = requireText(body.display_name, NAME_MAX);
    if (displayName === null) return reply.code(422).send(fail('invalid_display_name', `имя партнёра обязательно и не длиннее ${NAME_MAX} знаков`));
    const contact = requireText(body.contact, NAME_MAX);
    if (contact === null) return reply.code(422).send(fail('invalid_contact', `контакт обязателен и не длиннее ${NAME_MAX} знаков`));

    // Код приводится к верхнему регистру ЗДЕСЬ: «bloger1» и «BLOGER1» — один и тот же код для
    // человека, и различать их значило бы выдавать два кода на одного блогера.
    const rawCode = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_RE.test(rawCode)) return reply.code(422).send(fail('invalid_code', 'код — от 4 до 12 знаков: заглавная латиница и цифры'));

    // Ставка — необязательна; отсутствие означает КАНОНИЧЕСКИЕ 50 %, а не ноль. Значение вне
    // 0…10000 базисных пунктов отвергается: «сто процентов и ещё немного» — это не договор.
    const rateRaw = body.commission_rate_bp;
    let rateBp = DEFAULT_RATE_BP;
    if (rateRaw !== undefined && rateRaw !== null && rateRaw !== '') {
      if (typeof rateRaw !== 'number' || !Number.isSafeInteger(rateRaw) || rateRaw < 0 || rateRaw > 10_000) {
        return reply.code(422).send(fail('invalid_rate', 'ставка — целое число базисных пунктов от 0 до 10000 (5000 = 50 %)'));
      }
      rateBp = rateRaw;
    }

    try {
      const created = await withTransaction(deps.pool, async (client) => {
        const partner = await client.query<{ id: string }>(
          `INSERT INTO partner (display_name, contact, commission_rate_bp) VALUES ($1, $2, $3) RETURNING id`,
          [displayName, contact, rateBp],
        );
        const partnerId = partner.rows[0]!.id;
        // Код и партнёр создаются ОДНОЙ транзакцией: партнёр без кода бесполезен, а занятый
        // код обязан откатить и создание партнёра, иначе в базе копятся пустышки.
        const code = await client.query<{ id: string }>(
          `INSERT INTO partner_code (partner_id, code) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING id`,
          [partnerId, rawCode],
        );
        if (code.rows[0] === undefined) throw new CodeTakenError();
        return { partnerId, code: rawCode };
      });
      deps.logger.info('partner_created', { partner_id: created.partnerId });
      return reply.code(201).send(ok({ partner_id: created.partnerId, code: created.code, commission_rate_bp: rateBp }));
    } catch (error) {
      if (error instanceof CodeTakenError) return reply.code(409).send(fail('code_taken', 'такой код уже занят — придумайте другой'));
      deps.logger.error('partner_create_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });
}
