// Разрешение адреса площадки для GET /go/:slug/:platform.
//
// ТА ЖЕ ЧИСТОТА, ЧТО У СТРАНИЦЫ ВЫБОРА, и по той же причине. Роут отдаёт 3xx — а это
// ровно та форма, которой определяется гейтинг; отличает его ТОЛЬКО содержимое входа.
// Значит «вход у нас правильный» обязано быть свойством сигнатуры, а не утверждением
// в документе: два аргумента, оба из пути, Request взять неоткуда.
//
// Без этого чистота второго роута держалась бы на том, что его пока не переписали, —
// то есть на дисциплине, рядом с тремя слоями настоящей защиты на соседнем роуте.
// Атакующему-из-будущего (нам самим через полгода) хватило бы самой слабой двери.

import { pool } from './db.js';
import type { Platform } from './render.js';

export const PLATFORMS: readonly Platform[] = ['yandex_maps', 'twogis'];

export function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

/** Ровно два аргумента, оба из пути. Ветвить по ?rating, cookie или заголовку нечем. */
export async function resolvePlatformUrl(slug: string, platform: Platform): Promise<string | null> {
  const { rows } = await pool.query<{ url: string }>(
    `select pl.url from platform_links pl
       join places p on p.id = pl.place_id
      where p.slug = $1 and pl.platform = $2 and p.archived_at is null`,
    [slug, platform],
  );
  return rows[0]?.url ?? null;
}
