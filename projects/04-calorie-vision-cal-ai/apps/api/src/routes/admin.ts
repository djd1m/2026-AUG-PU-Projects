// Кабинет владельца: `GET /api/v1/admin/overview`, `POST /api/v1/admin/payouts` (FR-CAB-2/3).
//
// ДОСТУП — по закрытому списку `telegram_user_id` В КОДЕ, не в окружении
// (`fail-closed-defaults.md`, правило 3): вынесенный наружу список однажды приедет пустым, а
// пустой список читается как «ограничений нет» ровно там, где он единственная защита.
//
// Чужому — `404`, а не `403`: `403` подтвердил бы, что кабинет существует, а перебор и есть
// способ это выяснить (`security.md`).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { withTransaction } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { deliverNotification, notifyPartner, type TelegramSender } from '../notifications/notify.js';

/**
 * Владельцы продукта. Пусто ЗАКОННО и означает «кабинет закрыт всем» — это самое строгое
 * состояние, а не самое разрешающее.
 */
export const OWNER_TELEGRAM_USER_IDS: readonly number[] = [];
/** OWN-012: владелец входит и по почте (PWA — первый приоритет). Тот же закрытый список В КОДЕ. */
export const OWNER_EMAILS: readonly string[] = ['jechkov.dmitry@yandex.ru'];

export interface OwnerLists {
  readonly ownerTelegramUserIds?: readonly number[];
  readonly ownerEmails?: readonly string[];
}

export interface AdminDeps extends OwnerLists {
  readonly pool: DbPool;
  readonly logger: Logger;
  /** Отправитель уведомлений наружу; `undefined` — только строка в базе. */
  readonly notificationSender?: TelegramSender;
}

/** Чистая проверка владения — по Telegram-id ИЛИ по почте; пустые списки → никто. */
export function isOwnerAccount(account: { readonly telegramUserId: string | null; readonly email: string | null }, lists: OwnerLists): boolean {
  const ids = lists.ownerTelegramUserIds ?? OWNER_TELEGRAM_USER_IDS;
  const emails = (lists.ownerEmails ?? OWNER_EMAILS).map((e) => e.toLowerCase());
  if (account.telegramUserId !== null) {
    const id = Number(account.telegramUserId);
    if (Number.isSafeInteger(id) && ids.includes(id)) return true;
  }
  if (account.email !== null && emails.includes(account.email.toLowerCase())) return true;
  return false;
}

interface PayoutBody {
  readonly partner_id?: unknown;
  readonly amount_minor?: unknown;
  readonly payout_key?: unknown;
  readonly note?: unknown;
}

export async function requireOwner(request: FastifyRequest, deps: { readonly pool: DbPool; readonly owners: OwnerLists }): Promise<{ accountId: string } | null> {
  const session = await requireSession(request, deps.pool);
  if (session === null || session.accountId === null) return null;
  const account = await deps.pool.query<{ telegram_user_id: string | null; email: string | null }>(
    `SELECT telegram_user_id, email FROM account WHERE id = $1`,
    [session.accountId],
  );
  const row = account.rows[0];
  if (row === undefined) return null;
  if (!isOwnerAccount({ telegramUserId: row.telegram_user_id, email: row.email }, deps.owners)) return null;
  return { accountId: session.accountId };
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): void {
  app.get('/api/v1/admin/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps })) === null) return reply.code(404).send(fail('not_found', 'маршрут не найден'));

    const revenue = await deps.pool.query<{ gross: string | null; net: string | null; payments: string }>(
      `SELECT sum(gross_minor) gross, sum(net_minor) net, count(*) payments FROM payment WHERE status = 'succeeded'`,
    );
    const subscriptions = await deps.pool.query<{ status: string; c: string }>(
      `SELECT status::text AS status, count(*) c FROM subscription GROUP BY status`,
    );
    const partners = await deps.pool.query<{ partner_id: string; display_name: string; balance: string; available: string; has_account: boolean }>(
      `SELECT p.id AS partner_id, p.display_name, (p.account_id IS NOT NULL) AS has_account,
              coalesce(sum(ce.amount_minor), 0) AS balance,
              coalesce(sum(ce.amount_minor) FILTER (WHERE ce.amount_minor < 0 OR ce.available_at <= now()), 0) AS available
       FROM partner p LEFT JOIN commission_entry ce ON ce.partner_id = p.id
       GROUP BY p.id, p.display_name, p.account_id ORDER BY balance DESC`,
    );
    const review = await deps.pool.query<{ c: string }>(`SELECT count(*) c FROM payment WHERE needs_review`);

    return reply.code(200).send(ok({
      revenue_gross_minor: Number(revenue.rows[0]?.gross ?? 0),
      revenue_net_minor: Number(revenue.rows[0]?.net ?? 0),
      payments_count: Number(revenue.rows[0]?.payments ?? 0),
      subscriptions: Object.fromEntries(subscriptions.rows.map((r) => [r.status, Number(r.c)])),
      // Платежи, ушедшие в ручной разбор: сумма не совпала с ценой или провайдер не назвал
      // удержание. Их нельзя не показывать — иначе они тихо копятся.
      needs_review_count: Number(review.rows[0]?.c ?? 0),
      partners: partners.rows.map((r) => ({
        partner_id: r.partner_id,
        display_name: r.display_name,
        balance_minor: Number(r.balance),
        available_minor: Number(r.available),
        // OWN-012: партнёру без аккаунта владелец выписывает приглашение из кабинета.
        needs_invite: !r.has_account,
      })),
    }));
  });

  app.post('/api/v1/admin/payouts', async (request: FastifyRequest<{ Body: PayoutBody }>, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps })) === null) return reply.code(404).send(fail('not_found', 'маршрут не найден'));

    const body = request.body ?? {};
    const partnerId = typeof body.partner_id === 'string' ? body.partner_id : '';
    const amountMinor = body.amount_minor;
    const payoutKey = typeof body.payout_key === 'string' ? body.payout_key.trim() : '';
    if (partnerId === '' || payoutKey === '') {
      return reply.code(422).send(fail('invalid_payout', 'partner_id и payout_key обязательны'));
    }
    if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return reply.code(422).send(fail('invalid_amount', 'сумма выплаты обязана быть положительным целым числом копеек'));
    }

    try {
      const outcome = await withTransaction(deps.pool, async (client) => {
        // Блокируется СТРОКА ПАРТНЁРА, а не результат суммы: `FOR UPDATE` с агрегатом
        // Postgres не принимает, а блокировка строк леджера не помешала бы появиться НОВОЙ
        // записи между чтением и вставкой. Партнёр — та точка, за которую выплаты этому
        // партнёру выстраиваются в очередь.
        const locked = await client.query<{ id: string }>(`SELECT id FROM partner WHERE id = $1 FOR UPDATE`, [partnerId]);
        if (locked.rows[0] === undefined) return { kind: 'unknown_partner' as const };

        // ⚠ ПОВТОРНОСТЬ ПРОВЕРЯЕТСЯ РАНЬШЕ БАЛАНСА, и порядок здесь — не стиль. После
        // успешной выплаты доступное уменьшается на её сумму, поэтому повтор того же
        // запроса не проходит проверку баланса и получил бы «недостаточно средств» — то
        // есть отказ вместо «уже выплачено». Оператор прочитал бы это как несостоявшуюся
        // выплату и заплатил бы второй раз мимо системы.
        const already = await client.query<{ id: string }>(
          `SELECT id FROM commission_entry WHERE partner_id = $1 AND kind = 'payout' AND payout_key = $2`,
          [partnerId, payoutKey],
        );
        if (already.rows[0] !== undefined) return { kind: 'duplicate' as const };

        // Доступное считается ВНУТРИ транзакции: между чтением и записью баланс мог
        // измениться возвратом, и выплата ушла бы сверх доступного.
        const available = await client.query<{ s: string | null }>(
          `SELECT sum(amount_minor) s FROM commission_entry
           WHERE partner_id = $1 AND (amount_minor < 0 OR available_at <= now())`,
          [partnerId],
        );
        const availableMinor = Number(available.rows[0]?.s ?? 0);
        if (amountMinor > availableMinor) {
          return { kind: 'over' as const, availableMinor };
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO commission_entry (partner_id, kind, amount_minor, available_at, payout_key, note)
           VALUES ($1, 'payout', $2, now(), $3, $4)
           ON CONFLICT DO NOTHING RETURNING id`,
          [partnerId, -amountMinor, payoutKey, typeof body.note === 'string' ? body.note.slice(0, 500) : null],
        );
        // Двойной клик по кнопке не выплачивает дважды: уникальность держит БАЗА.
        if (inserted.rows[0] === undefined) return { kind: 'duplicate' as const };
        return { kind: 'recorded' as const, id: inserted.rows[0].id, availableMinor: availableMinor - amountMinor };
      });

      if (outcome.kind === 'unknown_partner') {
        // Несуществующий партнёр — `404`, как и чужой: перебор идентификаторов не должен
        // отличать «нет такого» от «есть, но не ваш».
        return reply.code(404).send(fail('not_found', 'партнёр не найден'));
      }
      if (outcome.kind === 'over') {
        // Отказ НАЗЫВАЕТ доступную сумму: «недостаточно» без числа непроверяемо.
        return reply.code(422).send(fail('over_available', `сумма превышает доступную к выплате: ${outcome.availableMinor} копеек`));
      }
      if (outcome.kind === 'duplicate') {
        return reply.code(200).send(ok({ recorded: false, reason: 'duplicate_payout_key' }));
      }
      deps.logger.info('payout_recorded', { partnerId, amountMinor });
      // Уведомление о выплате — вне транзакции записи: сама выплата уже зафиксирована, и
      // отказ уведомления не имеет права её отменять (DEC-A-059). Строка в базе создаётся
      // всегда, доставка наружу — по возможности.
      const notificationId = await notifyPartner(deps.pool, { partnerId, kind: 'payout_recorded', amountMinor });
      if (notificationId !== null) {
        await deliverNotification(deps.pool, { sender: deps.notificationSender ?? null, logger: deps.logger }, notificationId);
      }
      return reply.code(201).send(ok({ recorded: true, entry_id: outcome.id, available_after_minor: outcome.availableMinor }));
    } catch (error) {
      deps.logger.error('payout_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });
}
