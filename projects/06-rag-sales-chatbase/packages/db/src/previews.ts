// Хранилище предпросмотра (фича preview-flow): CreatePreview п.2–3, ClaimPreview, ReadIndexJob по cookie
// предпросмотра, серверная история диалога и share_cta_shown (FR-PREVIEW-001/002, FR-LIMIT-002, FR-GROWTH-001).
// Написано заново (ADR-016, reuse-inventory: донора нет). Квота — уже перенесённая пара операторов
// (quota.ts, ADR-008) и построитель previewCreateCharges (ceilings.ts); задача — createSourceJobTx (index-job-core).
//
// Доступ к предпросмотру — ТОЛЬКО по хэшу токена из HttpOnly cookie. Идентификатор в адресе (index_job_id) не
// секрет и доступа не даёт: чужая задача с моим токеном — то же «не найдено», что несуществующая.
import type { Pool, PoolClient } from 'pg';
import { HISTORY_TURNS, PREVIEW_TTL_HOURS, type AccountPlan, type Ceilings, type HistoryTurn } from '@n6/rag';
import { lockAccountBots } from './bots.js';
import { previewCreateCharges } from './ceilings.js';
import { createSourceJobTx, isUuid } from './index-jobs.js';
import { chargeQuota, transaction } from './quota.js';

const HASH = /^[0-9a-f]{64}$/;
const isHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);

export interface CreatePreviewInput {
  browserSession: string; ipPrefix: string; tokenHash: string; idempotencyKey: string;
  rootUrl: string; companyName: string; publicKey: string;
  budget: { pageBudget: number; embedBudget: number };
}
export type CreatePreviewResult =
  | { kind: 'created'; indexJobId: string; botId: string }
  | { kind: 'refused'; scope: string };

// CreatePreview п.2–3: квота (3 scope, :answers НЕ трогается — A-N6-020) и бот-черновик + источник + задача +
// предпросмотр в ОДНОЙ транзакции; сутки — по часам БД. Отказ квоты — ни одной строки. Повтор с тем же
// (сессия, ключ), проскочивший мимо findPreviewRepeat, падает на уникальном индексе (23505) и откатывает всё,
// включая списание: вызывающий обязан повторить поиск (isUniqueViolation).
export function createPreview(pool: Pool, ceilings: Ceilings, input: CreatePreviewInput): Promise<CreatePreviewResult> {
  if (!isHash(input.tokenHash)) throw new Error('Непригодный хэш токена предпросмотра');
  if (!isUuid(input.idempotencyKey)) throw new Error('Idempotency-Key обязан быть UUID');
  return transaction(pool, async (tx) => {
    const now = (await tx.query<{ now: Date }>('SELECT now() AS now')).rows[0]!.now;
    const decision = await chargeQuota(tx, previewCreateCharges(ceilings, { browserSession: input.browserSession, ipPrefix: input.ipPrefix, now }));
    if (!decision.granted) return { kind: 'refused', scope: decision.scope };
    const bot = await tx.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, created_at)
      VALUES (NULL, 'draft', $1, $2, $3) RETURNING id`, [input.publicKey, input.companyName, now]);
    const botId = bot.rows[0]!.id;
    const job = await createSourceJobTx(tx, { botId, kind: 'site', rootUrl: input.rootUrl, idempotencyKey: input.idempotencyKey, budget: input.budget }, now);
    await tx.query(`INSERT INTO preview (token_hash, bot_id, browser_session, ip_prefix, expires_at, idempotency_key, created_at)
      VALUES ($1, $2, $3, $4::cidr, $5::timestamptz + make_interval(hours => $6), $7, $5)`,
    [input.tokenHash, botId, input.browserSession, input.ipPrefix, now, PREVIEW_TTL_HOURS, input.idempotencyKey]);
    return { kind: 'created', indexJobId: job.indexJobId, botId };
  });
}
export const isUniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

// Повтор того же запроса создания (тот же браузер, тот же Idempotency-Key): та же задача, квота не списывается.
// Токен ПЕРЕВЫПУСКАЕТСЯ: сырой токен не хранится, а первый ответ (с cookie) мог не дойти до клиента.
export async function findPreviewRepeat(pool: Pool, browserSession: string, idempotencyKey: string, newTokenHash: string): Promise<string | null> {
  if (!isUuid(idempotencyKey) || !isHash(newTokenHash)) return null;
  const result = await pool.query<{ index_job_id: string | null }>(`UPDATE preview p SET token_hash = $3
    WHERE p.browser_session = $1 AND p.idempotency_key = $2 AND p.claimed_at IS NULL AND p.expires_at > now()
    RETURNING (SELECT j.id FROM index_job j WHERE j.bot_id = p.bot_id ORDER BY j.created_at LIMIT 1) AS index_job_id`,
  [browserSession, idempotencyKey, newTokenHash]);
  return result.rows[0]?.index_job_id ?? null;
}

export interface PreviewAccess {
  previewId: string; botId: string; browserSession: string; history: HistoryTurn[]; expired: boolean; claimed: boolean;
}
// История — данные из своей же БД, но читаются fail-closed: непригодная форма — пустая история, не «как есть».
export function readHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  const turns = value.filter((t): t is HistoryTurn => typeof t === 'object' && t !== null
    && typeof (t as HistoryTurn).question === 'string' && typeof (t as HistoryTurn).answer === 'string');
  return turns.length === value.length ? turns.slice(-HISTORY_TURNS).map((t) => ({ question: t.question, answer: t.answer })) : [];
}
// Предпросмотр по токену И задаче из адреса: задача обязана принадлежать боту ЭТОГО предпросмотра.
export async function readPreviewAccess(pool: Pool, tokenHash: string, indexJobId: string): Promise<PreviewAccess | null> {
  if (!isHash(tokenHash) || !isUuid(indexJobId)) return null;
  const row = (await pool.query<{ id: string; bot_id: string; browser_session: string; history: unknown; expired: boolean; claimed: boolean }>(
    `SELECT p.id, p.bot_id, p.browser_session, p.history, p.expires_at <= now() AS expired, p.claimed_at IS NOT NULL AS claimed
     FROM preview p JOIN index_job j ON j.bot_id = p.bot_id WHERE p.token_hash = $1 AND j.id = $2`, [tokenHash, indexJobId])).rows[0];
  if (!row) return null;
  return { previewId: row.id, botId: row.bot_id, browserSession: row.browser_session, history: readHistory(row.history), expired: row.expired, claimed: row.claimed };
}
// Для GET /api/index-jobs/{id}: бот черновика живого (не истёкшего, не сохранённого) предпросмотра.
export async function readPreviewBotByToken(pool: Pool, tokenHash: string): Promise<string | null> {
  if (!isHash(tokenHash)) return null;
  const row = (await pool.query<{ bot_id: string }>(`SELECT bot_id FROM preview WHERE token_hash = $1 AND claimed_at IS NULL AND expires_at > now()`,
    [tokenHash])).rows[0];
  return row?.bot_id ?? null;
}

// Серверная история: ход дописывается атомарно, хранится ≤ 2 последних (канон §7). Клиент ходов не присылает.
export async function appendPreviewTurn(pool: Pool, previewId: string, turn: HistoryTurn): Promise<void> {
  await pool.query(`UPDATE preview SET history = CASE WHEN jsonb_array_length(history) >= $3 THEN (history - 0) || $2::jsonb ELSE history || $2::jsonb END
    WHERE id = $1 AND claimed_at IS NULL`, [previewId, JSON.stringify([{ question: turn.question, answer: turn.answer }]), HISTORY_TURNS]);
}

// FR-GROWTH-001: share_cta_shown — один раз на бота. true — это ПЕРВЫЙ answered этого бота: CTA под ним.
export async function recordShareCtaShown(pool: Pool, botId: string): Promise<boolean> {
  // Два параметра, а не $1 дважды: один параметр не может быть и uuid, и text (Postgres отвергает запрос).
  const result = await pool.query(`INSERT INTO growth_event (type, bot_id, dedup_key) VALUES ('share_cta_shown', $1::uuid, $2::text)
    ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [botId, botId]);
  return result.rowCount === 1;
}

// Макет страницы (ADR-007: не скриншот) и три подсказки-вопроса — из уже прочитанного текста, без модели.
export interface PreviewSite { host: string; title: string; h1: string; suggestions: string[] }
const TOPICS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(цен[аыуе]|стоимост|стоит|прайс|₽|руб\.)/, 'Сколько стоят ваши услуги?'],
  [/доставк/, 'Как работает доставка?'],
  [/(график|часы работы|режим работы|без выходных)/, 'Когда вы работаете?'],
  [/(запис[аьы]|бронир)/, 'Как записаться?'],
  [/(гаранти|возврат)/, 'Какие условия гарантии и возврата?'],
  [/(адрес|телефон|контакт|как добраться)/, 'Как с вами связаться?'],
];
const clip = (text: string, max: number) => { const chars = Array.from(text.trim()); return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join(''); };
export function suggestQuestions(texts: readonly string[], titles: readonly string[]): string[] {
  const corpus = texts.map((t) => t.toLowerCase());
  const found = TOPICS.filter(([pattern]) => corpus.some((t) => pattern.test(t))).map(([, question]) => question);
  for (const title of titles) {
    if (found.length >= 3) break;
    const clean = title.trim();
    if (clean) found.push(`Расскажите про «${clip(clean, 60)}»`);
  }
  return [...new Set(found)].slice(0, 3);
}
export async function readPreviewSite(pool: Pool, botId: string): Promise<PreviewSite | null> {
  if (!isUuid(botId)) return null;
  const source = (await pool.query<{ root_url: string }>(`SELECT root_url FROM source WHERE bot_id = $1 AND kind = 'site' ORDER BY created_at LIMIT 1`, [botId])).rows[0];
  if (!source) return null;
  let host = '';
  try { host = new URL(source.root_url).hostname; } catch { host = ''; }
  const pages = (await pool.query<{ title: string; path: string | null }>(`SELECT p.title,
      (SELECT c.context_path FROM chunk c WHERE c.page_id = p.id ORDER BY c.ordinal LIMIT 1) AS path
    FROM page p WHERE p.bot_id = $1 AND p.skipped_reason IS NULL ORDER BY (p.url_or_page = $2) DESC, p.created_at LIMIT 20`, [botId, source.root_url])).rows;
  const texts = (await pool.query<{ text: string }>(`SELECT text FROM chunk WHERE bot_id = $1 ORDER BY created_at LIMIT 200`, [botId])).rows.map((r) => r.text);
  const first = pages[0];
  const h1 = first?.path?.split(' › ')[1]?.trim() ?? '';
  return { host, title: clip(first?.title || host, 120), h1: clip(h1, 160), suggestions: suggestQuestions(texts, pages.slice(1).map((p) => p.title)) };
}

export type ClaimOutcome =
  | { status: 'claimed'; botId: string }
  | { status: 'already_claimed' }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'plan_limit'; plan: AccountPlan; limit: number };
// ClaimPreview (Pseudocode): одноразовый UPDATE … WHERE claimed_at IS NULL AND expires_at > now, затем предел плана
// и перевод бота в active того же аккаунта — ОДНОЙ транзакцией. Фрагменты и задача не трогаются (не пересчитываются).
// Различение отказов — только для держателя токена: свой повторный claim → 409, истёкший → «создайте заново»,
// сохранённый чужим, несуществующий, не тот index_job → 404 без раскрытия.
export function claimPreview(pool: Pool, input: { tokenHash: string; accountId: string; indexJobId?: string }): Promise<ClaimOutcome> {
  if (!isHash(input.tokenHash) || !isUuid(input.accountId) || (input.indexJobId !== undefined && !isUuid(input.indexJobId))) {
    return Promise.resolve({ status: 'not_found' });
  }
  return transaction(pool, async (tx) => claimPreviewTx(tx, input));
}
async function claimPreviewTx(tx: PoolClient, input: { tokenHash: string; accountId: string; indexJobId?: string }): Promise<ClaimOutcome> {
  // Строка аккаунта под блокировкой (lockAccountBots, общий с CreateBot): два одновременных claim/создания одного
  // аккаунта не превысят предел ботов плана.
  const bots = await lockAccountBots(tx, input.accountId);
  if (!bots) return { status: 'not_found' };
  const preview = (await tx.query<{ id: string; bot_id: string; claimed: boolean; expired: boolean; owner: string | null }>(
    `SELECT p.id, p.bot_id, p.claimed_at IS NOT NULL AS claimed, p.expires_at <= now() AS expired, b.account_id AS owner
     FROM preview p JOIN bot b ON b.id = p.bot_id
     WHERE p.token_hash = $1 AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM index_job j WHERE j.id = $2::uuid AND j.bot_id = p.bot_id))
     FOR UPDATE OF p`, [input.tokenHash, input.indexJobId ?? null])).rows[0];
  if (!preview) return { status: 'not_found' };
  if (preview.claimed) return preview.owner === input.accountId ? { status: 'already_claimed' } : { status: 'not_found' };
  if (preview.expired) return { status: 'expired' };
  if (bots.count >= bots.limit) return { status: 'plan_limit', plan: bots.plan, limit: bots.limit };
  const claimed = await tx.query<{ bot_id: string }>(`UPDATE preview SET claimed_at = now(), history = '[]'::jsonb
    WHERE id = $1 AND claimed_at IS NULL AND expires_at > now() RETURNING bot_id`, [preview.id]);
  if (!claimed.rowCount) return { status: 'not_found' };
  const bot = await tx.query(`UPDATE bot SET account_id = $2, status = 'active' WHERE id = $1 AND status = 'draft' AND account_id IS NULL RETURNING id`,
    [preview.bot_id, input.accountId]);
  // Черновик уже не черновик — непоследовательное состояние: откат ВСЕГО claim, а не полусохранение.
  if (!bot.rowCount) throw new Error('Бот предпросмотра не в состоянии draft: сохранение отменено');
  return { status: 'claimed', botId: preview.bot_id };
}

// Сколько вопросов предпросмотра осталось сегодня этому браузеру (для экрана «Осталось N из 10»).
export async function previewAnswersUsed(pool: Pool, browserSession: string): Promise<number> {
  const row = (await pool.query<{ used: number }>(`SELECT COALESCE(sum(used), 0)::int AS used FROM quota_counter
    WHERE scope = 'preview_session' AND scope_key = $1 AND period = to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD')`,
  [`${browserSession}:answers`])).rows[0];
  return row?.used ?? 0;
}
