// Завершение привязки: long-poll getUpdates → /start <токен> → chat_id в БД.
//
// Токен сверяется ПО ХЕШУ: в БД лежит sha256, сам токен существовал только в диплинке.
// Токен ОДНОРАЗОВЫЙ: сработавшая привязка ставит bound_at, и повторный /start с тем же
// токеном не находит строки (условие bound_at is null в UPDATE). Перегенерация в кабинете
// перезаписывает хеш — старый диплинк умирает.

import { createHash } from 'node:crypto';
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
    // Одноразовость — условием в UPDATE, а не проверкой перед ним: два одновременных
    // /start с одним токеном иначе прошли бы оба.
    const { rows } = await pool.query<{ place_id: string }>(
      `update channel_bindings
          set chat_id = $1, bound_at = now()
        where bind_token_hash = $2 and channel = 'telegram' and bound_at is null
        returning place_id`,
      [String(u.message.chat.id), hash]);

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
