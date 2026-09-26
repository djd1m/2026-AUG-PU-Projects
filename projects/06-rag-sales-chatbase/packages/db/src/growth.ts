// События и метрики роста (фича public-page-and-summary; FR-GROWTH-001, FR-GROWTH-003, FR-GROWTH-006; Pseudocode
// RecordGrowthEvent п.1–3). Показ и клик бейджа — recordBadgeEvent (widget.ts), share_cta_shown — previews.ts,
// widget_install и first_answer — widget.ts/visitor.ts; здесь — то, чего до этой фичи не было.
import type { Pool } from 'pg';
import { isUuid } from './index-jobs.js';

const MSK_DAY = `to_char((now() AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD')`;
// Форма значения «откуда пришёл» — та же, что CHECK миграции 005 и apps/web/src/lib/arrival.ts.
export const ARRIVAL = /^(b\/[a-z0-9-]{3,60}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/;

// share_cta_click (FR-GROWTH-001 @security): не более одного клика на бота в сутки, сколько бы запросов ни пришло, и
// только если CTA этому боту действительно показывался (share_cta_shown есть) — клик без показа не пишется.
// Дедупликация — уникальный индекс (type, dedup_key): одновременные нажатия не дают двух строк.
export async function recordShareCtaClick(pool: Pool, botId: string): Promise<boolean> {
  if (!isUuid(botId)) return false;
  const result = await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, dedup_key)
    SELECT 'share_cta_click', b.id, b.account_id, 'share_cta_click:' || b.id::text || ':' || ${MSK_DAY} FROM bot b
    WHERE b.id = $1 AND EXISTS (SELECT 1 FROM growth_event g WHERE g.type = 'share_cta_shown' AND g.bot_id = b.id)
    ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [botId]);
  return result.rowCount === 1;
}

// Откуда пришёл аккаунт (FR-GROWTH-006, conv%): пишется один раз — первое значение не перезаписывается следующим
// входом с другим cookie. Непригодная форма не пишется вовсе.
export async function recordArrival(pool: Pool, accountId: string, from: string): Promise<boolean> {
  if (!isUuid(accountId) || from.length > 253 || !ARRIVAL.test(from)) return false;
  const result = await pool.query('UPDATE account SET came_from = $2 WHERE id = $1 AND came_from IS NULL', [accountId, from]);
  return result.rowCount === 1;
}

export interface GrowthMetrics {
  days: number;
  badge_impressions: number; badge_clicks: number;
  // i — клики по бейджу на 1000 показов; null при 0 показов («нет данных», не 0 — FR-GROWTH-006 @edge-case, CFG-I7).
  i_per_1000: number | null;
  // Приход по бейджу на САЙТЕ клиента (came_from — домен) и с демо-страницы (came_from — b/<slug>) — раздельно.
  arrivals_badge: number; arrivals_badge_activated: number; arrivals_demo: number; arrivals_demo_activated: number;
  // conv% канала «бейдж на сайте клиента»: пришедшие с домена хозяина и получившие первый ответ своего бота, к кликам по
  // бейджу на сайтах клиентов (клики на демо-странице — другой канал, в знаменатель не входят); null при 0 кликов.
  badge_clicks_on_sites: number;
  conv_percent: number | null;
  installs: number; public_page_views: number; share_cta_shown: number; share_cta_clicks: number;
}
// Метрики за последние `days` суток по часам БД (канон §7 «Метрика недели»). publicHost — hostname N6_PUBLIC_ORIGIN: клики
// бейджа на демо-странице пишутся с ним (from_domain) и отделяются от кликов на сайтах клиентов. conv% — приближение
// (A-N6-038 (4)): клик и регистрацию связывает только cookie прихода в том же браузере; числитель и знаменатель — ОДИН
// канал (ревью фичи 13, находка 2: иначе регистрации с демо-страницы давали conv% > 100 %).
export async function growthMetrics(pool: Pool, days: number, publicHost: string): Promise<GrowthMetrics> {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('Период метрик — целое число суток от 1 до 366');
  if (!/^[a-z0-9.-]+$/.test(publicHost)) throw new Error('publicHost — hostname N6_PUBLIC_ORIGIN (нижний регистр)');
  const row = (await pool.query<Record<string, number>>(
    `WITH p AS (SELECT now() - make_interval(days => $1) AS since),
     e AS (SELECT g.type, count(*)::int AS n FROM growth_event g, p WHERE g.created_at >= p.since GROUP BY g.type),
     a AS (SELECT a.came_from LIKE 'b/%' AS demo,
             EXISTS (SELECT 1 FROM growth_event g WHERE g.type = 'first_answer' AND g.account_id = a.id) AS activated
           FROM account a, p WHERE a.came_from IS NOT NULL AND a.created_at >= p.since)
     SELECT COALESCE((SELECT n FROM e WHERE type = 'badge_impression'), 0) AS badge_impressions,
       COALESCE((SELECT n FROM e WHERE type = 'badge_click'), 0) AS badge_clicks,
       (SELECT count(*)::int FROM growth_event g, p WHERE g.type = 'badge_click' AND g.created_at >= p.since
          AND g.from_domain IS DISTINCT FROM $2) AS badge_clicks_on_sites,
       COALESCE((SELECT n FROM e WHERE type = 'public_page_view'), 0) AS public_page_views,
       COALESCE((SELECT n FROM e WHERE type = 'share_cta_shown'), 0) AS share_cta_shown,
       COALESCE((SELECT n FROM e WHERE type = 'share_cta_click'), 0) AS share_cta_clicks,
       (SELECT count(*)::int FROM a WHERE NOT demo) AS arrivals_badge,
       (SELECT count(*)::int FROM a WHERE NOT demo AND activated) AS arrivals_badge_activated,
       (SELECT count(*)::int FROM a WHERE demo) AS arrivals_demo,
       (SELECT count(*)::int FROM a WHERE demo AND activated) AS arrivals_demo_activated,
       (SELECT count(*)::int FROM widget_install w, p WHERE w.first_answer_at >= p.since) AS installs`, [days, publicHost])).rows[0]!;
  const n = (key: string) => Number(row[key] ?? 0);
  const clicks = n('badge_clicks'), impressions = n('badge_impressions'), onSites = n('badge_clicks_on_sites');
  return {
    days, badge_impressions: impressions, badge_clicks: clicks,
    i_per_1000: impressions === 0 ? null : Math.round((clicks / impressions) * 10000) / 10,
    arrivals_badge: n('arrivals_badge'), arrivals_badge_activated: n('arrivals_badge_activated'),
    arrivals_demo: n('arrivals_demo'), arrivals_demo_activated: n('arrivals_demo_activated'),
    badge_clicks_on_sites: onSites,
    conv_percent: onSites === 0 ? null : Math.round((n('arrivals_badge_activated') / onSites) * 1000) / 10,
    installs: n('installs'), public_page_views: n('public_page_views'), share_cta_shown: n('share_cta_shown'), share_cta_clicks: n('share_cta_clicks'),
  };
}
