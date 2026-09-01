// Воркер доставки.
//
// ─────────────────────────────────────────────────────────────────────────────
// ГЛАВНЫЙ РИСК ЗДЕСЬ — ДВОЙНАЯ ДОСТАВКА, и она неприятна тем, что выглядит безобидно:
// владелец получает два одинаковых сообщения и решает, что сервис глючит. Закрывается
// двумя мерами вместе:
//
//   1. FOR UPDATE SKIP LOCKED — два воркера не берут одну строку;
//   2. status='sending' ставится ДО внешнего вызова, а не после. Иначе перезапуск
//      воркера между отправкой и записью результата пошлёт сообщение ВТОРОЙ раз:
//      строка так и осталась в pending, а гость об этом не знает.
//
// Цена меры 2 названа честно: при падении ровно между отправкой и записью строка
// зависает в sending. Это ЛУЧШЕ дубля — недоставленное видно в дашборде, лишнее
// сообщение владельцу не отзовёшь.
//
// ВНЕШНИЙ ВЫЗОВ — ВНЕ ТРАНЗАКЦИИ И ВНЕ УДЕРЖАНИЯ СОЕДИНЕНИЯ. Время ответа мессенджера
// нам не принадлежит; держать на нём соединение пула значит отдать чужому сервису
// право исчерпать наш ресурс.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from './db.js';
import { CHANNEL_LIMIT, formatMessage } from './format.js';
import { sendTelegram, type SendResult } from './deliver.js';

const BATCH = 20;
const MAX_ATTEMPTS = 5;

interface Job {
  id: string; channel: string; body: string; rating: number | null;
  contact: string | null; place_name: string; chat_id: string | null;
}

/** Захват пачки. Транзакция КОРОТКАЯ: только выборка и пометка, никаких вызовов. */
export async function claimBatch(limit = BATCH): Promise<Job[]> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<Job>(
      `select n.id, n.channel, pf.body, pf.rating, pf.contact, p.name as place_name, cb.chat_id
         from notifications n
         join private_feedback pf on pf.id = n.private_feedback_id
         join places p            on p.id = pf.place_id
         left join channel_bindings cb on cb.place_id = pf.place_id and cb.channel = n.channel
        where n.status = 'pending' and n.attempts < $1
        order by n.created_at
        limit $2
        for update of n skip locked`,
      [MAX_ATTEMPTS, limit],
    );
    if (rows.length) {
      await client.query(
        `update notifications set status='sending', attempts = attempts + 1 where id = any($1)`,
        [rows.map((r) => r.id)],
      );
    }
    await client.query('commit');
    return rows;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    // Соединение освобождается ДО внешних вызовов — они идут ниже, уже без него.
    client.release();
  }
}

export async function markSent(id: string): Promise<void> {
  await pool.query(`update notifications set status='sent', sent_at=now() where id=$1`, [id]);
}

export async function markFailed(id: string, error: string, retriable: boolean): Promise<void> {
  // Ретраибельный сбой возвращается в pending: попытка уже учтена, и после MAX_ATTEMPTS
  // строка перестанет выбираться. Неретраибельный — сразу failed: повтор не поможет,
  // а очередь он засорит.
  await pool.query(
    `update notifications set status=$2, last_error=$3 where id=$1`,
    [id, retriable ? 'pending' : 'failed', error.slice(0, 500)],
  );
}

/** Один проход. Возвращает, сколько доставлено — для лога и теста. */
export async function tick(send: typeof sendTelegram = sendTelegram): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const jobs = await claimBatch();
  let sent = 0;

  for (const j of jobs) {
    if (!j.chat_id) {
      // Мессенджер не привязан — не сбой доставки, а ненастроенная точка. Ретраить нечего.
      await markFailed(j.id, 'channel_not_bound', false);
      continue;
    }
    const { text } = formatMessage(
      { body: j.body, rating: j.rating, contact: j.contact, placeName: j.place_name },
      CHANNEL_LIMIT[j.channel] ?? 2000,
    );
    const r: SendResult = await send(j.chat_id, text, token);
    if (r.ok) { await markSent(j.id); sent += 1; }
    else await markFailed(j.id, r.error ?? 'unknown', r.retriable);
  }
  return sent;
}
