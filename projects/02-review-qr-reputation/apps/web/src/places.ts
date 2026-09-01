// Точки и ссылки площадок. Все запросы — через withAccount: без контекста RLS вернёт
// пустоту, и это отказ, а не обход.

import type { PoolClient } from 'pg';
import { withAccount } from './db.js';
import { slugCandidate } from './slug.js';

// Финальная страховка ПОСЛЕ генератора: 3–40, края без дефиса. Первая правка этого
// regex сама содержала дефект (пропускала두 символа) — необязательная средняя группа.
// Средняя часть обязательна: минимум 3 символа гарантирован структурой.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export type Platform = 'yandex_maps' | 'twogis';

/**
 * Валидация ссылки площадки. Диплинка на форму отзыва НЕ СУЩЕСТВУЕТ — владелец вставляет
 * то, что дал кабинет площадки, и мы честно фиксируем, ЧТО это: форма или карточка.
 * Проверяется хост, а не путь: пути площадки меняют без предупреждения.
 */
const PLATFORM_HOSTS: Record<Platform, RegExp> = {
  yandex_maps: /(^|\.)yandex\.(ru|com)$|(^|\.)ya\.ru$/,
  twogis: /(^|\.)2gis\.(ru|com)$/,
};

export function validatePlatformUrl(platform: Platform, raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, error: 'это не ссылка' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'нужна ссылка https' };
  if (!PLATFORM_HOSTS[platform].test(u.hostname)) {
    return { ok: false, error: platform === 'yandex_maps' ? 'ссылка должна вести на yandex.ru' : 'ссылка должна вести на 2gis.ru' };
  }
  return { ok: true, url: u.toString() };
}

export interface PlaceSummary {
  id: string; slug: string; name: string;
  links: { platform: Platform; url: string }[];
  feedback_count: number; scan_count: number;
}

export async function createPlace(accountId: string, name: string):
  Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  if (!name.trim() || name.length > 200) return { ok: false, error: 'название: 1–200 символов' };
  return withAccount(accountId, async (c) => {
    // Адрес генерируется из названия; КОЛЛИЗИЯ РАЗРЕШАЕТСЯ МОЛЧА случайным хвостом —
    // «занято» не показывается никогда: гость сканирует, а не набирает, и красота
    // адреса не стоит отказа в лицо новичку. Занятость ловится ограничением БД,
    // а не проверкой перед вставкой: параллельные создания иначе прошли бы оба.
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = slugCandidate(name, attempt > 0);
      if (!SLUG_RE.test(slug)) continue;
      // SAVEPOINT НА КАЖДУЮ ПОПЫТКУ. Ошибка ограничения отравляет транзакцию целиком:
      // без отката к точке сохранения вторая попытка падает с «current transaction is
      // aborted» — цикл повторов внутри одной транзакции без savepoint не работает
      // в принципе. Найдено прогоном.
      await c.query('savepoint create_place');
      try {
        const { rows } = await c.query<{ id: string }>(
          'insert into places (account_id, slug, name) values ($1,$2,$3) returning id',
          [accountId, slug, name.trim()]);
        return { ok: true as const, id: rows[0]!.id, slug };
      } catch (e) {
        await c.query('rollback to savepoint create_place');
        if ((e as { code?: string }).code === '23505') continue;   // хвост в следующей попытке
        throw e;
      }
    }
    return { ok: false as const, error: 'не удалось подобрать адрес — попробуйте ещё раз' };
  });
}

export async function setPlatformLink(accountId: string, placeId: string, platform: Platform, rawUrl: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validatePlatformUrl(platform, rawUrl);
  if (!v.ok) return v;
  return withAccount(accountId, async (c) => {
    // UPSERT по уникальной паре: повторная вставка — замена, а не дубль.
    try {
      const { rowCount } = await c.query(
        `insert into platform_links (place_id, platform, url, link_kind)
         values ($1, $2, $3, 'card')
         on conflict (place_id, platform) do update set url = excluded.url`,
        [placeId, platform, v.url]);
      return rowCount ? { ok: true as const } : { ok: false as const, error: 'точка не найдена' };
    } catch (e) {
      // Нарушение WITH CHECK при вставке — ИСКЛЮЧЕНИЕ 42501, а не пустой rowCount:
      // RLS отказывает ошибкой, и для клиента это тот же ответ, что «точки нет».
      // Чужая и несуществующая точка обязаны быть неотличимы.
      if ((e as { code?: string }).code === '42501') return { ok: false as const, error: 'точка не найдена' };
      throw e;
    }
  });
}

export async function listPlaces(accountId: string): Promise<PlaceSummary[]> {
  return withAccount(accountId, async (c: PoolClient) => {
    const { rows } = await c.query<PlaceSummary & { links: never }>(
      `select p.id, p.slug, p.name,
              coalesce(fb.n, 0)::int as feedback_count,
              coalesce(ev.n, 0)::int as scan_count
         from places p
         left join lateral (select count(*) n from private_feedback f where f.place_id = p.id) fb on true
         left join lateral (select count(distinct device_hash) n from guest_events e
                             where e.place_id = p.id and e.kind = 'scan') ev on true
        where p.archived_at is null
        order by p.created_at`);
    const links = await c.query<{ place_id: string; platform: Platform; url: string }>(
      `select place_id, platform, url from platform_links`);
    return rows.map((p) => ({
      ...p,
      links: links.rows.filter((l) => l.place_id === p.id).map(({ platform, url }) => ({ platform, url })),
    }));
  });
}

export interface FeedbackItem { id: string; body: string; rating: number | null; contact: string | null; created_at: string; }

export async function listFeedback(accountId: string, placeId: string): Promise<FeedbackItem[]> {
  return withAccount(accountId, (c) =>
    c.query<FeedbackItem>(
      `select id, body, rating, contact, created_at from private_feedback
        where place_id = $1 order by created_at desc limit 100`, [placeId])
      .then((r) => r.rows));
}
