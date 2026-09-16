// Уведомления партнёру (пункт 4, DEC-A-059).
//
// ДВА СЛОЯ, и это решение, а не недоделка:
//
//   1. СТРОКА В БАЗЕ — источник истины. Пишется В ТОЙ ЖЕ транзакции, что и само событие о
//      деньгах: начисление без уведомления и уведомление без начисления одинаково неверны.
//   2. ДОСТАВКА В TELEGRAM — надстройка, и только для тех, у кого аккаунт связан с Telegram.
//      Выполняется ПОСЛЕ коммита и НИКОГДА не внутри транзакции: сеть внутри транзакции держит
//      соединение пула на всё время чужого ответа (`shared-resource-verification.md`), а отказ
//      чужого сервиса не имеет права откатывать деньги.
//
// Неудача доставки НЕ теряет уведомление: оно уже в базе и видно в кабинете. Причина отказа
// записывается рядом (`delivery_error`) — «пытались и не смогли» отличимо от «ещё не пытались».

import type { DbClient, DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';

export type NotificationKind = 'commission_accrued' | 'commission_clawed_back' | 'payout_recorded';

export interface NotificationRow {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly amount_minor: number | null;
  readonly created_at: Date;
  readonly read_at: Date | null;
}

const INSERT = `
  INSERT INTO notification (account_id, kind, amount_minor)
  SELECT p.account_id, $2::notification_kind, $3
  FROM partner p WHERE p.id = $1 AND p.account_id IS NOT NULL
  RETURNING id
`;

/**
 * Заводит уведомление партнёру по его `partner_id`. Партнёр без аккаунта (приглашение ещё не
 * принято) уведомления не получает — и это не ошибка: адресата физически нет. `SELECT … WHERE
 * account_id IS NOT NULL` делает это одним оператором, без предварительного чтения.
 */
export async function notifyPartner(
  // Пул ИЛИ клиент транзакции: уведомление о начислении обязано быть в одной транзакции с
  // деньгами (вебхук), а уведомление о выплате пишется отдельно — выплата уже зафиксирована.
  client: DbClient | DbPool,
  input: { readonly partnerId: string; readonly kind: NotificationKind; readonly amountMinor: number | null },
): Promise<string | null> {
  const result = await client.query<{ id: string }>(INSERT, [input.partnerId, input.kind, input.amountMinor]);
  return result.rows[0]?.id ?? null;
}

const TEXTS: Record<NotificationKind, (rubles: string) => string> = {
  commission_accrued: (r) => `Тарелка: начислено ${r} ₽ — по вашему коду оформили подписку. Деньги станут доступны к выплате через 14 дней.`,
  commission_clawed_back: (r) => `Тарелка: начисление ${r} ₽ отменено — платёж по вашему коду вернули клиенту.`,
  payout_recorded: (r) => `Тарелка: записана выплата ${r} ₽. Проверьте поступление; вопросы — владельцу приложения.`,
};

/** Копейки → рубли для текста сообщения. Формат один и тот же во всех каналах. */
export function rubles(minor: number | null): string {
  if (minor === null) return '—';
  const abs = Math.abs(minor);
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export function notificationText(kind: NotificationKind, amountMinor: number | null): string {
  return TEXTS[kind](rubles(amountMinor));
}

export interface TelegramSender {
  send(chatId: string, text: string): Promise<void>;
}

/** Отправитель поверх Bot API. Токен живёт ТОЛЬКО в `api` (`secrets-management.md`). */
export function createTelegramSender(botToken: string, fetchImpl: typeof fetch = fetch): TelegramSender {
  return {
    async send(chatId, text) {
      const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_notification: false }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { description?: string } | null;
        // Самая частая причина — человек не начинал разговор с ботом: Telegram запрещает боту
        // писать первым. Это НЕ наша ошибка и не повод повторять: пока он не напишет боту,
        // доставка невозможна в принципе.
        throw new Error(body?.description ?? `sendMessage ${response.status}`);
      }
    },
  };
}

/**
 * Пытается доставить уже созданное уведомление. Вызывается ПОСЛЕ коммита. Ничего не бросает:
 * любой исход записывается в ту же строку.
 */
export async function deliverNotification(
  pool: DbPool,
  deps: { readonly sender: TelegramSender | null; readonly logger: Logger },
  notificationId: string,
): Promise<void> {
  if (deps.sender === null) return;
  const row = await pool.query<{ kind: NotificationKind; amount_minor: number | null; telegram_user_id: string | null }>(
    `SELECT n.kind::text AS kind, n.amount_minor, a.telegram_user_id
     FROM notification n JOIN account a ON a.id = n.account_id
     WHERE n.id = $1 AND n.delivered_at IS NULL`,
    [notificationId],
  );
  const notification = row.rows[0];
  if (notification === undefined) return;
  if (notification.telegram_user_id === null) {
    await pool.query(`UPDATE notification SET delivery_error = $2 WHERE id = $1`, [notificationId, 'telegram_not_linked']);
    return;
  }
  try {
    await deps.sender.send(notification.telegram_user_id, notificationText(notification.kind, notification.amount_minor));
    await pool.query(`UPDATE notification SET delivered_at = now(), delivery_error = NULL WHERE id = $1`, [notificationId]);
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    await pool.query(`UPDATE notification SET delivery_error = $2 WHERE id = $1`, [notificationId, message]);
    // Предупреждение, не ошибка: деньги записаны, уведомление в базе, кабинет его покажет.
    deps.logger.warn('notification_delivery_failed', { message });
  }
}
