// Хранилище маршрутов виджета (фича widget-runtime-and-badge; FR-TARIFF-001, FR-BOT-003, FR-GROWTH-003, FR-GROWTH-006;
// Pseudocode ResolveWidgetConfig, RecordWidgetInstall, RecordGrowthEvent).
// из N1: projects/01-testimonials-senja/apps/web/src/lib/widget-config.ts, widget-install.ts — адаптировано:
// проект по slug → бот по public_key с владельцем, контактом и списком allowed_origin; установка — по ТОЧНОМУ
// origin из списка бота (у донора — любой домен из Referer), свой origin (`N6_PUBLIC_ORIGIN`) не установка;
// событие widget_install — по first_answer (FR-BOT-003), а не по первому показу; «безопасный дефолт 200 с
// бейджем» донора заменён на 404: у N6 бот без контакта для «не знаю» виджет не показывает вовсе.
// Показы и клики бейджа — growth_event с дедупликацией (visitor_session, сутки МСК), сутки считает БД (now()),
// а не часы процесса (урок ревью quota-and-spend M2).
import type { Pool } from 'pg';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

const PUBLIC_KEY = /^[A-Za-z0-9_-]{22}$/;
const MSK_DAY = `to_char((now() AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD')`;

// Сырые значения из БД: статусы, план и контакт читает fail-closed вызывающий код (виджет-хендлер), здесь — без
// толкования. План НЕ нормализуется: BadgeRequired получает ровно то, что лежит в строке аккаунта.
export interface WidgetBotRow {
  botId: string; status: unknown; companyName: string; greeting: string; contact: unknown; publicEnabled: boolean;
  plan: unknown; accountStatus: unknown; origins: string[];
  // A-N6-035: отметка владельца «Я проверил ответы бота». false — ответ модели посетителю не показывается.
  answersVerified: boolean;
}
export async function loadWidgetBot(pool: Pool, publicKey: string): Promise<WidgetBotRow | null> {
  if (!PUBLIC_KEY.test(publicKey)) return null;
  const row = (await pool.query<{ id: string; status: unknown; company_name: string; greeting: string; contact: unknown; public_enabled: boolean;
    plan: unknown; account_status: unknown; origins: string[]; verified: boolean }>(
    `SELECT b.id, b.status, b.company_name, b.greeting, b.contact, b.public_enabled, a.plan, a.status AS account_status,
       b.answers_verified_at IS NOT NULL AS verified,
       ARRAY(SELECT o.origin FROM allowed_origin o WHERE o.bot_id = b.id ORDER BY o.origin) AS origins
     FROM bot b LEFT JOIN account a ON a.id = b.account_id WHERE b.public_key = $1`, [publicKey])).rows[0];
  if (!row) return null;
  return { botId: row.id, status: row.status, companyName: row.company_name, greeting: row.greeting, contact: row.contact,
    publicEnabled: row.public_enabled, plan: row.plan, accountStatus: row.account_status, origins: row.origins, answersVerified: row.verified === true };
}

// OPTIONS не несёт бота (он в теле POST): предполётный ответ разрешён только origin, который стоит в списке
// ХОТЯ БЫ одного бота. Сам POST проверяет origin уже против списка СВОЕГО бота.
export async function originAllowedAnywhere(pool: Pool, origin: string): Promise<boolean> {
  return Boolean((await pool.query('SELECT 1 FROM allowed_origin WHERE origin = $1 LIMIT 1', [origin])).rowCount);
}

export type InstallEvent = 'first_config' | 'first_answer';
export type InstallResult = 'own_origin' | 'recorded' | 'exists' | 'installed';
// RecordWidgetInstall. Вызывающий ОБЯЗАН передать origin, уже прошедший CheckOrigin (точное совпадение со списком
// бота): здесь он только сравнивается со своим. first_config — строка установки (кабинет: «ждёт первого вопроса»);
// first_answer — первый ответ посетителю на этом origin: РОВНО одна строка вернётся из UPDATE … WHERE
// first_answer_at IS NULL даже при одновременных ответах, и только она пишет growth_event widget_install.
export function recordWidgetInstall(pool: Pool, input: { botId: string; origin: string; publicOrigin: string; event: InstallEvent }): Promise<InstallResult> {
  if (input.origin === new URL(input.publicOrigin).origin) return Promise.resolve('own_origin');
  return transaction(pool, async (tx) => {
    const inserted = await tx.query(`INSERT INTO widget_install (bot_id, origin) VALUES ($1, $2) ON CONFLICT (bot_id, origin) DO NOTHING RETURNING id`,
      [input.botId, input.origin]);
    if (input.event === 'first_config') return inserted.rowCount ? 'recorded' as const : 'exists' as const;
    const first = await tx.query(`UPDATE widget_install SET first_answer_at = now() WHERE bot_id = $1 AND origin = $2 AND first_answer_at IS NULL RETURNING id`,
      [input.botId, input.origin]);
    if (!first.rowCount) return 'exists' as const;
    await tx.query(`INSERT INTO growth_event (type, bot_id, account_id, from_domain, dedup_key)
      SELECT 'widget_install', b.id, b.account_id, $3::text, $2::text FROM bot b WHERE b.id = $1 ON CONFLICT (type, dedup_key) DO NOTHING`,
    [input.botId, `${input.botId}:${input.origin}`, new URL(input.origin).hostname]);
    return 'installed' as const;
  });
}

// Метрика недели (FR-GROWTH-006, канон §7): установки на ВНЕШНИХ доменах = строки widget_install с первым
// ответом посетителю; строки только с конфигурацией («ждёт первого вопроса») не считаются.
export async function externalInstallCount(pool: Pool, since: Date): Promise<number> {
  return (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM widget_install WHERE first_answer_at IS NOT NULL AND first_answer_at >= $1`,
    [since])).rows[0]!.n;
}

export type BadgeEventType = 'badge_impression' | 'badge_click';
export type BadgeEventResult = 'recorded' | 'duplicate' | 'foreign_session';
// RecordGrowthEvent для бейджа (Specification: «показ засчитывается один раз на visitor_session в сутки»; клик —
// так же). Сессия посетителя создаётся при первом событии и ПРИВЯЗЫВАЕТСЯ к боту и origin: id, пришедший от
// другого бота или с другого origin, — чужой (400), а не повод записать событие на чужую сессию.
export function recordBadgeEvent(pool: Pool, input: { botId: string; visitorSession: string; ipPrefix: string; origin: string; type: BadgeEventType }):
Promise<BadgeEventResult> {
  if (!isUuid(input.visitorSession) || !isUuid(input.botId)) return Promise.resolve('foreign_session');
  return transaction(pool, async (tx) => {
    await tx.query(`INSERT INTO visitor_session (id, bot_id, ip_prefix, origin) VALUES ($1, $2, $3::cidr, $4) ON CONFLICT (id) DO NOTHING`,
      [input.visitorSession, input.botId, input.ipPrefix, input.origin]);
    const session = (await tx.query<{ bot_id: string; origin: string }>('SELECT bot_id, origin FROM visitor_session WHERE id = $1', [input.visitorSession])).rows[0];
    if (!session || session.bot_id !== input.botId || session.origin !== input.origin) return 'foreign_session' as const;
    const inserted = await tx.query(`INSERT INTO growth_event (type, bot_id, account_id, visitor_session_id, from_domain, dedup_key)
      SELECT $1::text, b.id, b.account_id, $3::uuid, $4::text, $5::text || ':' || ${MSK_DAY} FROM bot b WHERE b.id = $2
      ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [input.type, input.botId, input.visitorSession, new URL(input.origin).hostname, input.visitorSession]);
    return inserted.rowCount ? 'recorded' as const : 'duplicate' as const;
  });
}
