// Вторая и третья ступени лимита — скользящее окно в БД.
//
// Почему НЕ в памяти, в отличие от грубого барьера: эти ступени обещают ЧИСЛО
// («10 отправок с адреса в час на точку»), а счётчик в памяти числа не обещает — он
// не переживает рестарт и умножается на количество реплик. Барьер обещает другое:
// что поток не доедет до дорогой работы, и потому может быть приблизительным.
//
// Разные обещания — разные механизмы. Смешать их значит либо соврать про число, либо
// платить обращением к БД за каждый мусорный запрос.

import { pool } from './db.js';

export const SCOPE_IP_PLACE = 'private_ip_place';
export const SCOPE_PLACE = 'private_place';
export const LIMIT_IP_PLACE = 10;   // с одного адреса в час НА ТОЧКУ
export const LIMIT_PLACE = 100;     // на точку в час суммарно

/**
 * Проверка и запись — ОДНИМ запросом, а не двумя.
 *
 * Раздельные COUNT и INSERT под READ COMMITTED не атомарны: сто параллельных запросов
 * все увидят count=0, все пройдут и все запишутся. Лимит обходился бы `curl --parallel`.
 * Здесь вставка происходит только если счётчик ниже порога, и решает это сама СУБД.
 */
export async function consume(scope: string, key: string, limitN: number): Promise<boolean> {
  const { rows } = await pool.query<{ allowed: boolean }>(
    `with hits as (
       select count(*) as n from rate_limit_events
        where scope = $1 and key = $2 and created_at > now() - interval '1 hour'
     ), ins as (
       insert into rate_limit_events (scope, key)
       select $1, $2 from hits where n < $3
       returning 1
     )
     select exists(select 1 from ins) as allowed`,
    [scope, key, limitN],
  );
  return rows[0]?.allowed ?? false;
}
