// Демо-страница бота /b/{slug} (фича public-page-and-summary; FR-GROWTH-005, SC-US-013-1/2/3; Pseudocode
// PublishPublicPage). Строка reuse ADR-013 «публичная страница по слагу» (N1 wall.ts) — написано заново: у N1 стена
// отзывов рендерила свои данные, здесь страница — оболочка с тем же виджетом, что на сайте клиента (A-N6-038 (1)).
//
// Слаг — транслит имени компании + 4 случайных символа [a-z0-9]; однажды выданный слаг сохраняется при снятии и
// повторной публикации (ссылка в канале владельца не ломается). Публикует и снимает только владелец (OWNED).
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { readAccountStatus, readBotStatus } from '@n6/rag';
import { readContact } from '@n6/rag/bot-settings';
import { OWNED, pair } from './bots.js';
import { isUniqueViolation } from './previews.js';
import { transaction } from './quota.js';

export const PUBLIC_SLUG = /^[a-z0-9-]{3,60}$/;
const MSK_DAY = `to_char((now() AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD')`;
const TRANSLIT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Основа слага: транслит, всё прочее — дефис, не длиннее 50 (плюс «-xxxx» ≤ 55 < 60). Короче двух символов — «bot».
export function slugBase(companyName: string): string {
  const latin = [...companyName.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');
  const base = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
  return base.length >= 2 ? base : 'bot';
}
export function newPublicSlug(companyName: string, random: (n: number) => Buffer = randomBytes): string {
  const tail = [...random(4)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${slugBase(companyName)}-${tail}`;
}

export interface PublicPageState { slug: string | null; enabled: boolean; indexable: boolean }
export type PublishResult = { kind: 'saved'; slug: string; enabled: boolean; indexable: boolean } | { kind: 'contact_required' } | null;
// PublishPublicPage: под блокировкой строки бота. Опубликовать бота без контакта для «не знаю» нельзя — виджет такого
// бота не показывает (usableBot), страница была бы пустой оболочкой. Коллизия слага — новая попытка (до 3).
export async function publishPublicPage(pool: Pool, botId: string, accountId: string, input: { enabled: boolean; indexable: boolean },
  makeSlug: (companyName: string) => string = (name) => newPublicSlug(name)): Promise<PublishResult> {
  if (!pair(botId, accountId)) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction(pool, async (tx) => {
        const bot = (await tx.query<{ company_name: string; contact: string | null; public_slug: string | null }>(
          `SELECT b.company_name, b.contact, b.public_slug FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`,
          [botId, accountId])).rows[0];
        if (!bot) return null;
        if (input.enabled && !readContact(bot.contact)) return { kind: 'contact_required' } as const;
        const slug = bot.public_slug ?? makeSlug(bot.company_name);
        await tx.query('UPDATE bot SET public_slug = $2, public_enabled = $3, public_indexable = $4 WHERE id = $1',
          [botId, slug, input.enabled, input.indexable]);
        return { kind: 'saved', slug, enabled: input.enabled, indexable: input.indexable } as const;
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 3) throw error;
    }
  }
}

export interface PublicPage { botId: string; slug: string; companyName: string; greeting: string; publicKey: string; plan: unknown; indexable: boolean }
// Страница показывается, только если публикация включена, бот и владелец активны и контакт годен (иначе виджет
// всё равно отказал бы). Любое иное состояние — null → 404, одинаково с несуществующим слагом (SC-US-013-3).
export async function loadPublicPage(pool: Pool, slug: string): Promise<PublicPage | null> {
  if (!PUBLIC_SLUG.test(slug)) return null;
  const row = (await pool.query<{ id: string; status: unknown; account_status: unknown; company_name: string; greeting: string; public_key: string;
    plan: unknown; contact: unknown; public_indexable: boolean }>(
    `SELECT b.id, b.status, a.status AS account_status, b.company_name, b.greeting, b.public_key, a.plan, b.contact, b.public_indexable
     FROM bot b JOIN account a ON a.id = b.account_id WHERE b.public_slug = $1 AND b.public_enabled`, [slug])).rows[0];
  if (!row || readBotStatus(row.status) !== 'active' || readAccountStatus(row.account_status) !== 'active' || !readContact(row.contact)) return null;
  return { botId: row.id, slug, companyName: row.company_name, greeting: row.greeting, publicKey: row.public_key, plan: row.plan,
    indexable: row.public_indexable === true };
}

// public_page_view (FR-GROWTH-005): одна строка на (бот, префикс /24|/48, сутки МСК) — перезагрузки и боты с одного
// префикса не раздувают просмотры. true — строка новая.
export async function recordPublicPageView(pool: Pool, botId: string, ipPrefix: string): Promise<boolean> {
  const result = await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, dedup_key)
    SELECT 'public_page_view', b.id, b.account_id, 'public_page_view:' || b.id::text || ':' || $2::text || ':' || ${MSK_DAY} FROM bot b WHERE b.id = $1
    ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [botId, ipPrefix]);
  return result.rowCount === 1;
}
