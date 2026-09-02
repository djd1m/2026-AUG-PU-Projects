// Завершение привязки: getUpdates → /start <токен> → chat_id в БД.
//
// Токен сверяется ПО ХЕШУ: в БД лежит sha256, сам токен существовал только в диплинке.
//
// ОДНОРАЗОВОСТЬ ОБЕСПЕЧИВАЕТ УНИЧТОЖЕНИЕ ХЕША, А НЕ ФЛАГ bound_at. Успешный /start
// перезаписывает bind_token_hash случайными байтами, которым не соответствует ни один токен,
// — повторный /start с тем же токеном строки уже не находит.
//
// Почему не прежнее условие `bound_at is null`. Кабинет больше НЕ стирает действующую
// привязку в момент нажатия кнопки (это стоило владельцу молчаливой потери уведомлений), и
// при старом условии после первой привязки не сработал бы уже НИ ОДИН новый токен: смена
// телефона стала бы невозможной. Обе правки — кабинет и нотифаер — это одна фича; порознь
// каждая ломает то, что чинит другая. Обоснование целиком — миграция 012.

import { createHash, randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { sendTelegram } from './deliver.js';

const TIMEOUT_MS = 8_000;
let offset = 0;

interface TgUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number } };
}

export async function pollBindings(
  send: typeof sendTelegram = sendTelegram,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token) return 0;   // бот не заведён — привязка ждёт, это видно на странице кабинета

  let updates: TgUpdate[];
  try {
    const r = await fetchImpl(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return 0;
    const body = (await r.json()) as { ok: boolean; result?: TgUpdate[] };
    updates = body.result ?? [];
  } catch {
    return 0;   // сеть упала — следующий тик повторит; offset не сдвинут, ничего не потеряно
  }

  let bound = 0;
  for (const u of updates) {
    offset = Math.max(offset, u.update_id + 1);
    const text = u.message?.text ?? '';
    const m = text.match(/^\/start[ =]([A-Za-z0-9_-]{16,64})$/);
    if (!m || !u.message) continue;

    const hash = createHash('sha256').update(m[1]!).digest();
    // Одноразовость — В САМОМ UPDATE, а не проверкой перед ним: два одновременных /start с
    // одним токеном иначе прошли бы оба. Второй не найдёт хеша, потому что первый его сжёг.
    const { rows } = await pool.query<{ place_id: string }>(
      `update channel_bindings
          set chat_id = $1, bound_at = now(), bind_token_hash = $3
        where bind_token_hash = $2 and channel = 'telegram'
        returning place_id`,
      [String(u.message.chat.id), hash, randomBytes(32)]);

    // Несовпавший токен раньше проходил МОЛЧА: в журнале не оставалось ничего, и разбор
    // «почему не привязалось» упирался в пустоту. Само значение токена не пишется — только
    // факт и первые символы хеша, чтобы отличить одну попытку от другой.
    if (rows.length === 0) {
      console.error('bind_token_unknown', hash.toString('hex').slice(0, 8));
    }

    if (rows[0]) {
      bound += 1;
      await send(String(u.message.chat.id),
        'Готово. Обращения гостей будут приходить сюда — отвечайте им напрямую по контакту из сообщения.',
        token);
    } else {
      await send(String(u.message.chat.id),
        'Ссылка устарела. Откройте кабинет и нажмите «уведомления» ещё раз — придёт свежая кнопка.',
        token);
    }
  }
  return bound;
}

export function resetOffsetForTests(): void { offset = 0; }
