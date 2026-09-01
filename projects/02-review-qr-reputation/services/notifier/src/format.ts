// Формирование сообщения владельцу.
//
// FR-007: текст гостя уходит ЦЕЛИКОМ — это требование, а не деталь оформления.
// При пределе тела 2000 он помещается в одно сообщение Telegram (потолок 4096).
// Потолок MAX первоисточником не установлен — [GAP], закрывается замером на живом канале.

export interface Feedback { body: string; rating: number | null; contact: string | null; placeName: string; }

/** Предел канала. Telegram — из документации; MAX — консервативная оценка до замера. */
export const CHANNEL_LIMIT: Record<string, number> = { telegram: 4096, max: 2000 };

export function formatMessage(f: Feedback, limit: number): { text: string; truncated: boolean } {
  const head = `Новое сообщение — ${f.placeName}`;
  const rating = f.rating === null ? '' : `\nОценка: ${f.rating} из 5`;
  const contact = f.contact === null ? '' : `\nКонтакт: ${f.contact}`;
  const envelope = `${head}${rating}${contact}\n\n`;
  const room = limit - envelope.length - 40;   // запас под пометку об усечении

  if (f.body.length <= room) return { text: envelope + f.body, truncated: false };

  // МОЛЧАЛИВОЕ УСЕЧЕНИЕ ЗАПРЕЩЕНО. Без пометки владелец прочтёт не то, что написал гость,
  // И НЕ УЗНАЕТ ОБ ЭТОМ — тот же класс, что тихий дефолт внешнего адреса: дефект дорог не
  // потерей, а тем, что выглядит нормально.
  return { text: envelope + f.body.slice(0, room) + '\n\n[показано не полностью]', truncated: true };
}
