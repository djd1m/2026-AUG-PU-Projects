// Хранилище кабинета бота (фича bot-cabinet; FR-BOT-001, FR-BOT-002, FR-TARIFF-003; Pseudocode CreateBot,
// AddAllowedOrigin, CreateSource для сайта, «Повторить»). Написано заново (ADR-016: донора нет). Задача индексации —
// уже перенесённые createSourceJobTx/indexJobView (index-job-core), ответ — loadAnswerBot (rag-answer).
//
// ВЛАДЕНИЕ — ОДНО условие для всех операций кабинета (OWNED ниже): бот принадлежит аккаунту сессии, бот активен,
// аккаунт активен. Чужой, черновик, удалённый и несуществующий бот — один и тот же null → 404 (канон: «Чужой
// ресурс — 404»). bot_id приходит из адреса, account_id — ТОЛЬКО из сессии.
import type { Pool, PoolClient } from 'pg';
import { BOTS_BY_PLAN, INDEX_STARTS_PER_BOT_DAY, readAccountPlan, readAccountStatus, type AccountPlan } from '@n6/rag';
import { ORIGINS_PER_BOT, readContact } from '@n6/rag/bot-settings';
import { createSourceJobTx, indexJobView, isUuid, type IndexJobRow, type IndexJobView } from './index-jobs.js';
import { loadAnswerBot, type LoadedAnswerBot } from './answers.js';
import { transaction } from './quota.js';
import { recordIndexStartTx } from './sources.js';

export const OWNED = `b.id = $1 AND b.account_id = $2 AND b.status = 'active' AND a.status = 'active'`;
export const pair = (botId: unknown, accountId: unknown) => isUuid(botId) && isUuid(accountId);

// Предел ботов плана (канон §7: free/nobadge 1, studio 10) — под блокировкой строки аккаунта: CreateBot и
// ClaimPreview одного аккаунта сериализуются, два одновременных сохранения не превышают предел
// (shared-resource-verification: «посчитать, потом записать» без блокировки проходит последовательный тест и
// падает на параллельном). Боты, где аккаунт — студия клиента, считаются тоже (Pseudocode CreateBot п.1).
export interface AccountBots { plan: AccountPlan; limit: number; count: number }
export async function lockAccountBots(tx: PoolClient, accountId: string): Promise<AccountBots | null> {
  // FOR NO KEY UPDATE, а не FOR UPDATE (ревью фичи 15, находка 2): взаимоисключение CreateBot / ClaimPreview / приёма
  // приглашения сохраняется, а проверка внешних ключей (FOR KEY SHARE) — например, запись комиссии партнёра в транзакции
  // оплаты — этой строкой не блокируется, и цикла «оплата ↔ оплата» или «приём ↔ оплата» нет.
  const account = (await tx.query<{ plan: unknown; status: unknown }>('SELECT plan, status FROM account WHERE id = $1 FOR NO KEY UPDATE', [accountId])).rows[0];
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
  source_id: string; kind: 'site' | 'pdf' | 'text'; title: string;
  // Страниц, прочитанных не целиком по пределу CHUNKS_PER_PAGE_MAX (source-lifecycle); 0 — все целиком.
  pages_truncated: number;
  // Последняя задача источника; queued отличается от running только здесь (IndexJobView их не различает).
  job: (IndexJobView & { queued: boolean }) | null;
}
export interface BotCabinet {
  bot_id: string; company_name: string; contact: string | null; greeting: string; public_key: string; plan: AccountPlan;
  origins: string[]; sources: CabinetSource[];
  // A-N6-035: владелец отметил «Я проверил ответы бота» — только тогда посетитель виджета видит ответ модели.
  answers_verified: boolean;
  // gate-onboarding (A-N6-066): отметку сняла БАЗА (триггер миграций 004/011) — когда и почему; null — не снимала или
  // владелец с тех пор сам ставил/снимал отметку. Число посетителей с заглушкой «настраивается» за 7 дней (различные сессии).
  verified_reset: { at: string; reason: VerifiedResetReason } | null;
  stub_visitors_7d: number;
  // verify-audit (A-N6-077): с какого момента стоит отметка (null — не стоит) и последние события журнала отметки (новые первыми,
  // не больше VERIFICATION_EVENTS_SHOWN). Журнал ведёт база (миграция 014) — любой путь записи отметки попадает в него.
  verified_at: string | null;
  verification_events: VerificationEvent[];
  // Ответов бота в текущем месяце МСК (quota_counter bot_month_answers; месяц — по часам БД). Предел — окружение
  // (QUOTA_BOT_MONTH_*), его сравнивает экран: баннер исчерпания (FR-TARIFF-003, SC-US-007-2).
  month_answers_used: number;
  // Демо-страница /b/{slug} (фича public-page-and-summary): слаг выдаётся при первой публикации и не меняется.
  public_page: { slug: string | null; enabled: boolean; indexable: boolean };
}
// Причина снятия отметки базой — закрытый набор миграции 011; непустое неизвестное — 'unknown' (экран говорит «снята»,
// не выдумывая причины).
export const VERIFIED_RESET_REASON = ['new_material'] as const;
export type VerifiedResetReason = typeof VERIFIED_RESET_REASON[number] | 'unknown';
const readResetReason = (value: unknown): VerifiedResetReason =>
  typeof value === 'string' && (VERIFIED_RESET_REASON as readonly string[]).includes(value) ? value as VerifiedResetReason : 'unknown';
// Журнал отметки (миграция 014): закрытый набор; неизвестное значение строкой не показывается (не выдумываем, кто снял).
export const VERIFICATION_EVENT_KIND = ['set', 'unset_owner', 'unset_new_material'] as const;
export type VerificationEventKind = typeof VERIFICATION_EVENT_KIND[number];
export interface VerificationEvent { kind: VerificationEventKind; at: string }
export const VERIFICATION_EVENTS_SHOWN = 5;
const isEventKind = (value: unknown): value is VerificationEventKind =>
  typeof value === 'string' && (VERIFICATION_EVENT_KIND as readonly string[]).includes(value);
// Окно счёта заглушек в баннере — то же, что у сводки (SUMMARY_DAYS в summary.ts; импорт оттуда дал бы цикл модулей).
const STUB_WINDOW_DAYS = 7;
// Экран бота и экран установки: настройки, домены и источники с последней задачей. Чужой — null.
export async function readBotCabinet(pool: Pool, botId: string, accountId: string, now = new Date()): Promise<BotCabinet | null> {
  if (!pair(botId, accountId)) return null;
  const bot = (await pool.query<{ id: string; company_name: string; contact: string | null; greeting: string; public_key: string; plan: unknown;
    verified: boolean; verified_at: Date | null; month_used: number; public_slug: string | null; public_enabled: boolean; public_indexable: boolean;
    reset_at: Date | null; reset_reason: string | null; stub_visitors: number }>(
    `SELECT b.id, b.company_name, b.contact, b.greeting, b.public_key, a.plan, b.answers_verified_at IS NOT NULL AS verified,
       b.answers_verified_at AS verified_at, b.public_slug, b.public_enabled, b.public_indexable, b.answers_verified_reset_at AS reset_at, b.answers_verified_reset_reason AS reset_reason,
       (SELECT count(DISTINCT q.visitor_session_id)::int FROM question_log q WHERE q.bot_id = b.id AND q.outcome = 'not_verified'
         AND q.visitor_session_id IS NOT NULL AND q.created_at > now() - make_interval(days => $3)) AS stub_visitors,
       COALESCE((SELECT q.used FROM quota_counter q WHERE q.scope = 'bot_month_answers' AND q.scope_key = b.id::text
         AND q.period = to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM')), 0) AS month_used
     FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`,
    [botId, accountId, STUB_WINDOW_DAYS])).rows[0];
  if (!bot) return null;
  // Порядок переходов — по id, а не по created_at (ревью круга 1): now() — время НАЧАЛА транзакции, а переходы одного бота
  // сериализованы блокировкой его строки, так что позже изменивший отметку получает больший id, даже начав раньше.
  const events = (await pool.query<{ kind: unknown; created_at: Date }>(`SELECT kind, created_at FROM bot_verification_event WHERE bot_id = $1
    ORDER BY id DESC LIMIT $2`, [botId, VERIFICATION_EVENTS_SHOWN])).rows;
  const origins = (await pool.query<{ origin: string }>('SELECT origin FROM allowed_origin WHERE bot_id = $1 ORDER BY created_at, origin', [botId])).rows.map((r) => r.origin);
  const sources = (await pool.query<IndexJobRow & { source_id: string; kind: string; root_url: string | null; file_name: string | null; job_id: string | null;
    truncated: number }>(
    `SELECT s.id AS source_id, s.kind, s.root_url, s.file_name, j.id AS job_id, j.id, j.status, j.failure_reason, j.pages_done, j.pages_total,
       j.chunks_done, j.updated_at, j.truncated_by, j.unread_sample, (SELECT count(*)::int FROM page p WHERE p.source_id = s.id AND p.chunks_dropped > 0) AS truncated
     FROM source s LEFT JOIN LATERAL (SELECT * FROM index_job WHERE source_id = s.id ORDER BY created_at DESC, id LIMIT 1) j ON true
     WHERE s.bot_id = $1 ORDER BY s.created_at, s.id`, [botId])).rows;
  return {
    bot_id: bot.id, company_name: bot.company_name, contact: bot.contact, greeting: bot.greeting, public_key: bot.public_key, plan: readAccountPlan(bot.plan),
    origins, answers_verified: bot.verified === true,
    verified_reset: bot.verified !== true && bot.reset_at ? { at: bot.reset_at.toISOString(), reason: readResetReason(bot.reset_reason) } : null,
    stub_visitors_7d: Number(bot.stub_visitors) || 0,
    verified_at: bot.verified === true && bot.verified_at ? bot.verified_at.toISOString() : null,
    verification_events: events.filter((e) => isEventKind(e.kind)).map((e) => ({ kind: e.kind as VerificationEventKind, at: e.created_at.toISOString() })), month_answers_used: Number(bot.month_used),
    public_page: { slug: bot.public_slug, enabled: bot.public_enabled === true, indexable: bot.public_indexable === true },
    sources: sources.map((row) => ({
      source_id: row.source_id, kind: row.kind === 'pdf' ? 'pdf' : row.kind === 'text' ? 'text' : 'site',
      title: row.kind === 'pdf' ? (row.file_name ?? 'PDF') : (row.root_url ?? (row.kind === 'text' ? 'Текстовый файл' : 'Сайт')),
      pages_truncated: Number(row.truncated) || 0,
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

// A-N6-035: отметка «Я проверил ответы бота» ставится и снимается только владельцем (OWNED). Чужой — null.
// Поставить отметку нельзя, пока у бота есть задача индексации queued/running ('indexing'): владелец проверил бы
// ответы по материалу, который ещё дописывается. Снимается отметка базой при любом новом фрагменте
// (миграция 004, ревью фичи 12, находка 1) и оставляет пометку «когда и почему» (миграция 011); любое действие владельца
// с отметкой пометку стирает — она описывает только снятие базой, иначе ручное «Снять отметку» показало бы старую дату.
// verify-audit (A-N6-077): повторная установка стоящей отметки дату не сдвигает (COALESCE) — «стоит с» есть дата установки;
// событие журнала пишет триггер миграции 014 на переходе, в этой же транзакции. Подтверждение снятия требует маршрут.
export type SetAnswersVerifiedResult = { answers_verified: boolean } | { kind: 'indexing' } | null;
export function setAnswersVerified(pool: Pool, botId: string, accountId: string, verified: boolean): Promise<SetAnswersVerifiedResult> {
  if (!pair(botId, accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [botId, accountId]);
    if (!bot.rowCount) return null;
    if (verified) {
      const busy = await tx.query(`SELECT 1 FROM index_job WHERE bot_id = $1 AND status IN ('queued', 'running') LIMIT 1`, [botId]);
      if (busy.rowCount) return { kind: 'indexing' } as const;
    }
    const row = (await tx.query<{ verified: boolean }>(`UPDATE bot SET answers_verified_at = CASE WHEN $2::boolean THEN COALESCE(answers_verified_at, now()) ELSE NULL END,
        answers_verified_reset_at = NULL, answers_verified_reset_reason = NULL
      WHERE id = $1 RETURNING answers_verified_at IS NOT NULL AS verified`, [botId, verified])).rows[0]!;
    return { answers_verified: row.verified };
  });
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

export type CreateSiteSourceResult = { kind: 'created' | 'existing'; indexJobId: string } | { kind: 'not_found' } | { kind: 'daily_limit'; limit: number };
// CreateSource для сайта (Pseudocode п.1, 4): адрес уже прошёл CheckAddress в web; источник и задача — одной
// транзакцией под блокировкой строки бота; повтор с тем же Idempotency-Key — та же задача. Предел страниц плана
// применяет воркер при обходе (site-processor.ts, PAGES_BY_PLAN).
// text-source (A-N6-080): тот же путь для текстового файла по адресу (kind: 'text') — адрес уже прошёл CheckAddress в web.
export function createSiteSource(pool: Pool, input: { accountId: string; botId: string; rootUrl: string; idempotencyKey: string; kind?: 'site' | 'text' }): Promise<CreateSiteSourceResult> {
  const kind = input.kind ?? 'site';
  if (!pair(input.botId, input.accountId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [input.botId, input.accountId]);
    if (!bot.rowCount) return { kind: 'not_found' } as const;
    // Повтор с тем же Idempotency-Key — та же задача и НЕ новый запуск (предел не тратится).
    const existing = await tx.query<{ id: string }>('SELECT id FROM index_job WHERE bot_id = $1 AND idempotency_key = $2', [input.botId, input.idempotencyKey]);
    if (existing.rowCount) return { kind: 'existing', indexJobId: existing.rows[0]!.id } as const;
    // source-lifecycle: суточный предел запусков бота (под той же блокировкой строки бота).
    if (!(await recordIndexStartTx(tx, input.botId, kind))) return { kind: 'daily_limit', limit: INDEX_STARTS_PER_BOT_DAY } as const;
    const created = await createSourceJobTx(tx, { botId: input.botId, kind, rootUrl: input.rootUrl, idempotencyKey: input.idempotencyKey });
    return { kind: created.created ? 'created' : 'existing', indexJobId: created.indexJobId } as const;
  });
}

// «Повторить» и «Обновить» источника — reindexSource (sources.ts, фича source-lifecycle).

export async function ownsBot(pool: Pool, botId: string, accountId: string): Promise<boolean> {
  if (!pair(botId, accountId)) return false;
  return Boolean((await pool.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`, [botId, accountId])).rowCount);
}
// Тестовый чат владельца: бот — ТОЛЬКО по сессии владельца (не по телу). Чужой — null → 404.
export async function loadOwnedAnswerBot(pool: Pool, botId: string, accountId: string): Promise<LoadedAnswerBot | null> {
  return await ownsBot(pool, botId, accountId) ? loadAnswerBot(pool, botId) : null;
}

