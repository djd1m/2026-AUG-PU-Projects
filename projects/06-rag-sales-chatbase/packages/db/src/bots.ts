// Хранилище кабинета бота (фича bot-cabinet; FR-BOT-001, FR-BOT-002, FR-TARIFF-003; Pseudocode CreateBot,
// AddAllowedOrigin, CreateSource для сайта, «Повторить»). Написано заново (ADR-016: донора нет). Задача индексации —
// уже перенесённые createSourceJobTx/indexJobView (index-job-core), ответ — loadAnswerBot (rag-answer).
//
// ВЛАДЕНИЕ — ОДНО условие для всех операций кабинета (OWNED ниже): бот принадлежит аккаунту сессии, бот активен,
// аккаунт активен. Чужой, черновик, удалённый и несуществующий бот — один и тот же null → 404 (канон: «Чужой
// ресурс — 404»). bot_id приходит из адреса, account_id — ТОЛЬКО из сессии.
import type { Pool, PoolClient } from 'pg';
import { BOTS_BY_PLAN, readAccountPlan, readAccountStatus, type AccountPlan } from '@n6/rag';
import { ORIGINS_PER_BOT, readContact } from '@n6/rag/bot-settings';
import { createSourceJobTx, indexJobView, isUuid, type IndexJobRow, type IndexJobView } from './index-jobs.js';
import { loadAnswerBot, type LoadedAnswerBot } from './answers.js';
import { transaction } from './quota.js';

const OWNED = `b.id = $1 AND b.account_id = $2 AND b.status = 'active' AND a.status = 'active'`;
const pair = (botId: unknown, accountId: unknown) => isUuid(botId) && isUuid(accountId);

// Предел ботов плана (канон §7: free/nobadge 1, studio 10) — под блокировкой строки аккаунта: CreateBot и
// ClaimPreview одного аккаунта сериализуются, два одновременных сохранения не превышают предел
// (shared-resource-verification: «посчитать, потом записать» без блокировки проходит последовательный тест и
// падает на параллельном). Боты, где аккаунт — студия клиента, считаются тоже (Pseudocode CreateBot п.1).
export interface AccountBots { plan: AccountPlan; limit: number; count: number }
export async function lockAccountBots(tx: PoolClient, accountId: string): Promise<AccountBots | null> {
  const account = (await tx.query<{ plan: unknown; status: unknown }>('SELECT plan, status FROM account WHERE id = $1 FOR UPDATE', [accountId])).rows[0];
  if (!account || readAccountStatus(account.status) !== 'active') return null;
  const plan = readAccountPlan(account.plan);
  const count = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM bot
    WHERE (account_id = $1 OR studio_account_id = $1) AND status <> 'deleted'`, [accountId])).rows[0]!.n;
  return { plan, limit: BOTS_BY_PLAN[plan], count };
}

export type CreateBotResult =
  | { kind: 'created'; botId: string; publicKey: string }
  | { kind: 'plan_limit'; plan: AccountPlan; limit: number }
  | { kind: 'not_found' };
export interface CreateBotInput { accountId: string; companyName: string; contact: string | null; greeting: string; publicKey: string }
// CreateBot (SC-US-012-3): предел плана → бот active. Контакт необязателен при создании (Pseudocode п.3), но без
// него InstallSnippet и ResolveWidgetConfig отказывают.
export function createBot(pool: Pool, input: CreateBotInput): Promise<CreateBotResult> {
  if (!isUuid(input.accountId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const bots = await lockAccountBots(tx, input.accountId);
    if (!bots) return { kind: 'not_found' } as const;
    if (bots.count >= bots.limit) return { kind: 'plan_limit', plan: bots.plan, limit: bots.limit } as const;
    const row = (await tx.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact, greeting)
      VALUES ($1, 'active', $2, $3, $4, $5) RETURNING id`, [input.accountId, input.publicKey, input.companyName, input.contact, input.greeting])).rows[0]!;
    return { kind: 'created', botId: row.id, publicKey: input.publicKey } as const;
  });
}

export interface BotListItem {
  bot_id: string; company_name: string; contact_set: boolean; sources: number; sources_ready: number; sources_failed: number; origins: number;
}
export interface AccountBotList { plan: AccountPlan; limit: number; bots: BotListItem[] }
// GET /api/bots и экран «Мои боты»: только свои активные боты. Неактивный аккаунт — null (как нет сессии).
export async function listBots(pool: Pool, accountId: string): Promise<AccountBotList | null> {
  if (!isUuid(accountId)) return null;
  const account = (await pool.query<{ plan: unknown; status: unknown }>('SELECT plan, status FROM account WHERE id = $1', [accountId])).rows[0];
  if (!account || readAccountStatus(account.status) !== 'active') return null;
  const plan = readAccountPlan(account.plan);
  const rows = (await pool.query<{ id: string; company_name: string; contact: string | null; sources: number; ready: number; failed: number; origins: number }>(
    `SELECT b.id, b.company_name, b.contact,
       (SELECT count(*)::int FROM source s WHERE s.bot_id = b.id) AS sources,
       (SELECT count(*)::int FROM source s WHERE s.bot_id = b.id AND s.status = 'ready') AS ready,
       (SELECT count(*)::int FROM source s WHERE s.bot_id = b.id AND s.status = 'failed') AS failed,
       (SELECT count(*)::int FROM allowed_origin o WHERE o.bot_id = b.id) AS origins
     FROM bot b WHERE b.account_id = $1 AND b.status = 'active' ORDER BY b.created_at, b.id`, [accountId])).rows;
  return { plan, limit: BOTS_BY_PLAN[plan], bots: rows.map((r) => ({ bot_id: r.id, company_name: r.company_name, contact_set: readContact(r.contact) !== null,
    sources: r.sources, sources_ready: r.ready, sources_failed: r.failed, origins: r.origins })) };
}

export interface CabinetSource {
  source_id: string; kind: 'site' | 'pdf'; title: string;
  // Последняя задача источника; queued отличается от running только здесь (IndexJobView их не различает).
  job: (IndexJobView & { queued: boolean }) | null;
}
export interface BotCabinet {
  bot_id: string; company_name: string; contact: string | null; greeting: string; public_key: string; plan: AccountPlan;
  origins: string[]; sources: CabinetSource[];
}
// Экран бота и экран установки: настройки, домены и источники с последней задачей. Чужой — null.
export async function readBotCabinet(pool: Pool, botId: string, accountId: string, now = new Date()): Promise<BotCabinet | null> {
  if (!pair(botId, accountId)) return null;
  const bot = (await pool.query<{ id: string; company_name: string; contact: string | null; greeting: string; public_key: string; plan: unknown }>(
    `SELECT b.id, b.company_name, b.contact, b.greeting, b.public_key, a.plan FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`,
    [botId, accountId])).rows[0];
  if (!bot) return null;
  const origins = (await pool.query<{ origin: string }>('SELECT origin FROM allowed_origin WHERE bot_id = $1 ORDER BY created_at, origin', [botId])).rows.map((r) => r.origin);
  const sources = (await pool.query<IndexJobRow & { source_id: string; kind: string; root_url: string | null; file_name: string | null; job_id: string | null }>(
    `SELECT s.id AS source_id, s.kind, s.root_url, s.file_name, j.id AS job_id, j.id, j.status, j.failure_reason, j.pages_done, j.pages_total,
       j.chunks_done, j.updated_at
     FROM source s LEFT JOIN LATERAL (SELECT * FROM index_job WHERE source_id = s.id ORDER BY created_at DESC, id LIMIT 1) j ON true
     WHERE s.bot_id = $1 ORDER BY s.created_at, s.id`, [botId])).rows;
  return {
    bot_id: bot.id, company_name: bot.company_name, contact: bot.contact, greeting: bot.greeting, public_key: bot.public_key, plan: readAccountPlan(bot.plan),
    origins,
    sources: sources.map((row) => ({
      source_id: row.source_id, kind: row.kind === 'pdf' ? 'pdf' : 'site',
      title: row.kind === 'pdf' ? (row.file_name ?? 'PDF') : (row.root_url ?? 'Сайт'),
      job: row.job_id ? { ...indexJobView(row, now), queued: row.status === 'queued' } : null,
    })),
  };
}

export interface BotSettingsPatch { companyName?: string; contact?: string; greeting?: string }
// PATCH /api/bots/{bot_id} (FR-BOT-001): поля уже проверены на границе (bot-settings.ts). Чужой — null.
export async function updateBotSettings(pool: Pool, botId: string, accountId: string, patch: BotSettingsPatch):
Promise<{ company_name: string; contact: string | null; greeting: string } | null> {
  if (!pair(botId, accountId)) return null;
  const row = (await pool.query<{ company_name: string; contact: string | null; greeting: string }>(`UPDATE bot b
    SET company_name = COALESCE($3, b.company_name), contact = COALESCE($4, b.contact), greeting = COALESCE($5, b.greeting)
    FROM account a WHERE a.id = b.account_id AND ${OWNED} RETURNING b.company_name, b.contact, b.greeting`,
  [botId, accountId, patch.companyName ?? null, patch.contact ?? null, patch.greeting ?? null])).rows[0];
  return row ?? null;
}

export type AddOriginResult = { kind: 'added' | 'exists'; origin: string } | { kind: 'limit'; limit: number } | null;
// AddAllowedOrigin п.2: не более 20 доменов на бота — счёт под блокировкой строки бота (два одновременных
// добавления на 20-м не дают 21-й). Origin уже нормализован на границе.
export function addAllowedOrigin(pool: Pool, botId: string, accountId: string, origin: string): Promise<AddOriginResult> {
  if (!pair(botId, accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [botId, accountId]);
    if (!bot.rowCount) return null;
    const existing = await tx.query('SELECT 1 FROM allowed_origin WHERE bot_id = $1 AND origin = $2', [botId, origin]);
    if (existing.rowCount) return { kind: 'exists', origin } as const;
    const count = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM allowed_origin WHERE bot_id = $1', [botId])).rows[0]!.n;
    if (count >= ORIGINS_PER_BOT) return { kind: 'limit', limit: ORIGINS_PER_BOT } as const;
    await tx.query('INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, $2) ON CONFLICT (bot_id, origin) DO NOTHING', [botId, origin]);
    return { kind: 'added', origin } as const;
  });
}

export type CreateSiteSourceResult = { kind: 'created' | 'existing'; indexJobId: string } | { kind: 'not_found' };
// CreateSource для сайта (Pseudocode п.1, 4): адрес уже прошёл CheckAddress в web; источник и задача — одной
// транзакцией под блокировкой строки бота; повтор с тем же Idempotency-Key — та же задача. Предел страниц плана
// применяет воркер при обходе (site-processor.ts, PAGES_BY_PLAN).
export function createSiteSource(pool: Pool, input: { accountId: string; botId: string; rootUrl: string; idempotencyKey: string }): Promise<CreateSiteSourceResult> {
  if (!pair(input.botId, input.accountId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [input.botId, input.accountId]);
    if (!bot.rowCount) return { kind: 'not_found' } as const;
    const created = await createSourceJobTx(tx, { botId: input.botId, kind: 'site', rootUrl: input.rootUrl, idempotencyKey: input.idempotencyKey });
    return { kind: created.created ? 'created' : 'existing', indexJobId: created.indexJobId } as const;
  });
}

export type RetrySourceResult =
  | { kind: 'queued'; message: { index_job_id: string; generation: number } }
  | { kind: 'not_failed' } | { kind: 'pdf_reupload' } | null;
// «Повторить» (FR-INDEX-003, ADR-009) — POST /api/sources/{source_id}/reindex для ОТКАЗАВШЕЙ задачи: тот же
// index_job_id, новая серия, фенс +1 (опоздавший держатель прежней серии не допишет). PDF после отказа удалён
// с тома (ADR-018) — повторять нечего, нужна новая загрузка. Переиндексация готового источника — FR-INDEX-004
// (фича source-lifecycle), здесь отказ not_failed.
export function retrySource(pool: Pool, sourceId: string, accountId: string, now = new Date()): Promise<RetrySourceResult> {
  if (!pair(sourceId, accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const source = (await tx.query<{ kind: string; bot_id: string }>('SELECT kind, bot_id FROM source WHERE id = $1', [sourceId])).rows[0];
    if (!source) return null;
    const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [source.bot_id, accountId]);
    if (!bot.rowCount) return null;
    const job = (await tx.query<{ id: string; status: string }>(`SELECT id, status FROM index_job WHERE source_id = $1
      ORDER BY created_at DESC, id LIMIT 1 FOR UPDATE`, [sourceId])).rows[0];
    if (!job) return null;
    if (job.status !== 'failed') return { kind: 'not_failed' } as const;
    if (source.kind === 'pdf') return { kind: 'pdf_reupload' } as const;
    const updated = (await tx.query<{ current_fence: string }>(`UPDATE index_job SET status = 'queued', failure_reason = NULL,
      current_fence = current_fence + 1, updated_at = $2 WHERE id = $1 AND status = 'failed' RETURNING current_fence`, [job.id, now])).rows[0];
    if (!updated) return { kind: 'not_failed' } as const;
    await tx.query(`UPDATE source SET status = 'pending' WHERE id = $1`, [sourceId]);
    return { kind: 'queued', message: { index_job_id: job.id, generation: Number(updated.current_fence) } } as const;
  });
}

export async function ownsBot(pool: Pool, botId: string, accountId: string): Promise<boolean> {
  if (!pair(botId, accountId)) return false;
  return Boolean((await pool.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`, [botId, accountId])).rowCount);
}
// Тестовый чат владельца: бот — ТОЛЬКО по сессии владельца (не по телу). Чужой — null → 404.
export async function loadOwnedAnswerBot(pool: Pool, botId: string, accountId: string): Promise<LoadedAnswerBot | null> {
  return await ownsBot(pool, botId, accountId) ? loadAnswerBot(pool, botId) : null;
}

