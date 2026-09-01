// Журнал гостевых событий — ЕДИНСТВЕННЫЙ модуль, видящий запрос.
//
// У него НЕТ возвращаемого значения. Это вторая половина инварианта: у рендера нет
// входного канала для контекста, у журнала нет выходного. Пути от запроса к ответу
// не существует ни в одну сторону — значит контекст не может повлиять на разметку,
// как бы ни хотелось автору будущей правки.
//
// Отказ записи НЕ ВИДЕН гостю: аналитика не смеет быть входом в решение о переходе.
// Сорвать гостю путь ради счётчика — цена, которой мы платить не готовы. Стережёт T14.

import { createHmac } from 'node:crypto';
import { pool } from './db.js';
import type { Platform } from './render.js';

export type EventKind = 'scan' | 'public_door_click' | 'private_door_click';

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((+t - +y0) / 86400000 + 1) / 7)}`;
}

/**
 * Хэш устройства. `place_id` В СООБЩЕНИИ ОБЯЗАТЕЛЕН.
 *
 * Без него один телефон даёт ОДИНАКОВЫЙ хэш в двух разных заведениях — то есть сквозной
 * идентификатор между точками, прямо запрещённый требованием. И поймать это данными
 * нельзя: числа метрики остались бы ПРАВДОПОДОБНЫМИ, ошибка не в величине, а в смысле.
 * Поэтому стережёт страж по исходнику (T12), а не проверка результата.
 *
 * Соль привязана к неделе: связать устройство между неделями тоже нельзя.
 * Сырые IP и User-Agent никуда не пишутся.
 */
export function deviceHash(secret: string, placeId: string, ip: string, ua: string): Buffer {
  return createHmac('sha256', `${secret}|${isoWeek(new Date())}`)
    .update(`${placeId}|${ip}|${ua}`)
    .digest()
    .subarray(0, 16);
}

export function recordGuestEvent(
  placeId: string,
  kind: EventKind,
  platform: Platform | null,
  ip: string,
  ua: string,
): void {
  const secret = process.env.SESSION_SECRET ?? '';
  const hash = deviceHash(secret, placeId, ip, ua);
  // «Отправил и забыл»: результат не ожидается и на ответ не влияет.
  // INSERT ... RETURNING здесь НЕВОЗМОЖЕН — RETURNING требует SELECT-привилегии,
  // которой у роли нет по замыслу. Граница на грантах настоящая, а не декоративная.
  void pool
    .query('insert into guest_events (place_id, kind, platform, device_hash) values ($1,$2,$3,$4)',
      [placeId, kind, platform, hash])
    .catch((e: unknown) => {
      // Проглатывается НАМЕРЕННО и с логом: отказ журнала не должен менять ответ гостю.
      console.error('guest_event_failed', { kind, reason: (e as Error).message });
    });
}
