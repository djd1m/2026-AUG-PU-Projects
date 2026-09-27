// Удаление аккаунта (фича account-erasure; FR-AUTH-002, NFR-SEC-003, SC-US-015-1; решения владельца A-N6-054).
// Доноры: N4 projects/04-calorie-vision-cal-ai/apps/api/src/routes/account-delete.ts — АДАПТИРОВАНО (строка аккаунта
// блокируется ПЕРВОЙ, повтор при erasing — отказ «уже идёт», срок 72 ч; без withdraw_consent); N4 recognizer
// consent/erasure-job.ts — АДАПТИРОВАНО (аккаунт — своя единица работы, внешние объекты удаляются ДО отметки deleted);
// N5 projects/05-podcast-clips-opus/apps/web/src/server/erasure.ts и retention.ts — АДАПТИРОВАНО (запрос одной
// транзакцией с отзывом сессий; стирание — обезличивание growth_event, атрибуция клиентов удалённого партнёра →
// partner_deleted, почта → deleted:<id>; тихий период; очередь повторов; наблюдение просрочки ДО попыток).
//
// ЕДИНСТВЕННОЕ место, где аккаунт становится erasing или deleted (страж tests/account-erasure.unit.test.ts).
//
// ПОРЯДОК БЛОКИРОВОК (shared-resource-verification, ревью фич 15–16):
// - запрос: account (FOR NO KEY UPDATE) → задачи индексации ботов (FOR UPDATE, фенс) → боты. Приём приглашения и
//   создание бота тоже берут account первым; воркер держит задачу, затем бота — цикла нет.
// - стирание: намерения оплаты (DELETE) → account → остальное. Оплата берёт намерение (FOR UPDATE), затем account —
//   порядок тот же; источники — по одному, «задачи → бот», как deleteSource фичи 16.
// Решения владельца (A-N6-054): оплаченный остаток сгорает (возврат по заявке вручную); доступное партнёра ≥ 1 000 ₽
// оператор выплачивает до срока по реквизитам СБП, холд и меньшие суммы сгорают (запись forfeit), реквизиты стираются;
// записи оплат, начислений и выплат остаются 5 лет обезличенными — они ссылаются на надгробную строку account без почты;
// переданные клиентам боты студии остаются у клиентов; отменить удаление нельзя.
import { ERASE_DEADLINE_HOURS, ERASURE_PAYOUT_MARGIN_HOURS, ERASURE_QUIET_MS, PAYOUT_MINIMUM_MINOR } from '@n6/rag';
import type { Pool, PoolClient } from 'pg';
import { OWNED } from './bots.js';
import { forfeitCommissionTx } from './commission.js';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';
import { eraseSourceTx } from './sources.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Деньги партнёра на момент `at`: весь баланс и доступное (зрелые начисления + все отрицательные записи) — та же
// формула, что у кабинета партнёра (commission.ts totals).
async function partnerTotals(db: Pool | PoolClient, accountId: string, at: Date): Promise<{ entries: number; total: number; available: number }> {
  const row = (await db.query<{ n: number; total: string; available: string }>(`SELECT count(*)::int AS n, COALESCE(sum(amount_minor), 0)::bigint AS total,
      COALESCE(sum(amount_minor) FILTER (WHERE amount_minor < 0 OR available_at <= $2), 0)::bigint AS available
    FROM commission_entry WHERE partner_account_id = $1`, [accountId, at])).rows[0]!;
  return { entries: row.n, total: Number(row.total), available: Number(row.available) };
}

export interface ErasurePreview {
  bots: number;                  // боты аккаунта (включая полученные от студии) — будут удалены
  clientBots: number;            // боты, которые аккаунт-студия передал клиентам, — останутся у клиентов
  paidDaysLeft: number | null;   // оплаченные дни плана, которые сгорят; null — оплаченного остатка нет
  partner: { payoutMinor: number; burnMinor: number; hasDetails: boolean } | null;  // null — не партнёр
}
// Последствия удаления для экрана подтверждения (AC-13): перечислены ДО подтверждения. Не активный — null.
export async function readErasurePreview(pool: Pool, accountId: string, now = new Date()): Promise<ErasurePreview | null> {
  if (!isUuid(accountId)) return null;
  const account = (await pool.query<{ plan_source: string; plan_paid_until: Date | null }>(`SELECT plan_source, plan_paid_until FROM account
    WHERE id = $1 AND status = 'active'`, [accountId])).rows[0];
  if (!account) return null;
  const bots = (await pool.query<{ own: number; clients: number }>(`SELECT
      count(*) FILTER (WHERE account_id = $1 AND status <> 'deleted')::int AS own,
      count(*) FILTER (WHERE studio_account_id = $1 AND account_id <> $1 AND status <> 'deleted')::int AS clients
    FROM bot WHERE account_id = $1 OR studio_account_id = $1`, [accountId])).rows[0]!;
  const paidDaysLeft = account.plan_source === 'payment' && account.plan_paid_until && account.plan_paid_until > now
    ? Math.ceil((account.plan_paid_until.getTime() - now.getTime()) / DAY_MS) : null;
  const money = await partnerTotals(pool, accountId, now);
  let partner: ErasurePreview['partner'] = null;
  if (money.entries > 0) {
    const hasDetails = Boolean((await pool.query('SELECT 1 FROM partner_payout_details WHERE account_id = $1', [accountId])).rowCount);
    const payoutMinor = hasDetails && money.available >= PAYOUT_MINIMUM_MINOR ? money.available : 0;
    partner = { payoutMinor, burnMinor: Math.max(0, money.total - payoutMinor), hasDetails };
  }
  return { bots: bots.own, clientBots: bots.clients, paidDaysLeft, partner };
}

export type RequestErasureResult = { kind: 'accepted'; eraseDeadline: string } | { kind: 'already' } | { kind: 'not_found' };
// RequestErasure: ОДНА транзакция (security.md «удаление аккаунта ↔ виджеты»): erasing + срок 72 ч, задачи индексации
// ботов — фенс (оплаченная работа не продолжается), все боты аккаунта deleted (виджеты отвечают 403 с этого коммита),
// сессии удалены, незавершённые приглашения студии аннулированы, коды партнёра заморожены, клиенты партнёра —
// partner_deleted (новые оплаты комиссии не начисляют). Пароль проверен вызывающим ДО транзакции (bcrypt вне неё).
export function requestErasure(pool: Pool, accountId: string): Promise<RequestErasureResult> {
  if (!isUuid(accountId)) return Promise.resolve({ kind: 'not_found' });
  return transaction(pool, async (tx) => {
    const account = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE', [accountId])).rows[0];
    if (!account) return { kind: 'not_found' } as const;
    if (account.status === 'erasing') return { kind: 'already' } as const;
    if (account.status !== 'active') return { kind: 'not_found' } as const;
    const jobs = (await tx.query<{ id: string }>(`SELECT j.id FROM index_job j JOIN bot b ON b.id = j.bot_id WHERE b.account_id = $1
      ORDER BY j.id FOR UPDATE OF j`, [accountId])).rows.map((r) => r.id);
    if (jobs.length) {
      await tx.query(`UPDATE index_job SET current_fence = current_fence + 1, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND status IN ('queued', 'running')`, [jobs]);
    }
    await tx.query(`UPDATE bot SET status = 'deleted', public_enabled = false WHERE account_id = $1 AND status <> 'deleted'`, [accountId]);
    await tx.query('DELETE FROM session WHERE account_id = $1', [accountId]);
    await tx.query('DELETE FROM studio_invite WHERE studio_account_id = $1 AND accepted_by IS NULL', [accountId]);
    await tx.query(`UPDATE partner_code SET frozen = true, frozen_at = COALESCE(frozen_at, now()),
      frozen_reason = CASE WHEN frozen THEN frozen_reason ELSE 'owner_erased' END WHERE owner_account_id = $1`, [accountId]);
    await tx.query(`UPDATE attribution SET status = 'partner_deleted', reject_reason = NULL
      WHERE account_id <> $1 AND status IN ('pending', 'converted')
        AND partner_code_id IN (SELECT id FROM partner_code WHERE owner_account_id = $1)`, [accountId]);
    const row = (await tx.query<{ erase_deadline: Date }>(`UPDATE account SET status = 'erasing', erase_requested_at = now(),
      erase_deadline = now() + make_interval(hours => $2), erase_attempted_at = NULL WHERE id = $1 RETURNING erase_deadline`,
    [accountId, ERASE_DEADLINE_HOURS])).rows[0]!;
    await tx.query(`INSERT INTO erasure_audit (account_id, event) VALUES ($1, 'requested')`, [accountId]);
    return { kind: 'accepted', eraseDeadline: row.erase_deadline.toISOString() } as const;
  });
}

// Задачи индексации аккаунта — их файлы в томе uploads воркер удаляет ДО стирания строк (ADR-018, N4 RV-02: внешние
// объекты — раньше отметки deleted; после удаления строк задач по имени файла их уже не найти).
export async function erasureUploadJobIds(pool: Pool, accountId: string): Promise<string[]> {
  if (!isUuid(accountId)) return [];
  return (await pool.query<{ id: string }>(`SELECT j.id FROM index_job j JOIN bot b ON b.id = j.bot_id WHERE b.account_id = $1`, [accountId]))
    .rows.map((r) => r.id);
}

export type EraseAccountResult = { kind: 'erased' } | { kind: 'waiting_payout'; payoutMinor: number } | { kind: 'skipped' };
// EraseAccount — один аккаунт, идемпотентно (повтор находит пустоту): источники по одному → строки ботов и аккаунта →
// деньги партнёра → надгробная строка deleted ПОСЛЕДНЕЙ. Сбой на любом шаге оставляет erasing — повтор следующим
// проходом. Выплата партнёру (ответ владельца 2): пока до срока больше запаса и оператор ещё не выплатил доступное
// ≥ минимума по сохранённым реквизитам — всё, кроме денег партнёра, уже стёрто, а завершение ждёт выплату.
export async function eraseAccount(pool: Pool, accountId: string, now = new Date()): Promise<EraseAccountResult> {
  if (!isUuid(accountId)) return { kind: 'skipped' };
  const status = (await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId])).rows[0]?.status;
  if (status !== 'erasing') return { kind: 'skipped' };
  const sources = (await pool.query<{ id: string; bot_id: string }>(`SELECT s.id, s.bot_id FROM source s JOIN bot b ON b.id = s.bot_id
    WHERE b.account_id = $1 ORDER BY s.id`, [accountId])).rows;
  for (const source of sources) await transaction(pool, (tx) => eraseSourceTx(tx, source.id, source.bot_id));
  const erased = await transaction(pool, (tx) => eraseAccountRowsTx(tx, accountId));
  if (!erased) return { kind: 'skipped' };
  return transaction(pool, (tx) => finalizeErasureTx(tx, accountId, now));
}

async function eraseAccountRowsTx(tx: PoolClient, accountId: string): Promise<boolean> {
  // Намерения оплаты — ДО блокировки аккаунта: оплата берёт намерение, затем аккаунт (тот же порядок, без цикла).
  // Принятые деньги (payment) остаются: намерение — не учёт, у платежа intent_id станет NULL (ON DELETE SET NULL).
  await tx.query('DELETE FROM payment_intent WHERE account_id = $1', [accountId]);
  const account = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE', [accountId])).rows[0];
  if (account?.status !== 'erasing') return false;
  const bots = (await tx.query<{ id: string }>('SELECT id FROM bot WHERE account_id = $1', [accountId])).rows.map((r) => r.id);
  const sessions = bots.length
    ? (await tx.query<{ id: string }>('SELECT id FROM visitor_session WHERE bot_id = ANY($1::uuid[])', [bots])).rows.map((r) => r.id) : [];
  // События роста — агрегаты остаются, связи с человеком, ботом, посетителем и доменом стираются (N5 retention.ts).
  await tx.query(`UPDATE growth_event SET account_id = NULL, bot_id = NULL, visitor_session_id = NULL, from_domain = NULL
    WHERE account_id = $1 OR bot_id = ANY($2::uuid[]) OR visitor_session_id = ANY($3::uuid[])`, [accountId, bots, sessions]);
  await tx.query('DELETE FROM quota_counter WHERE scope_key = ANY($1::text[])', [[accountId, ...bots, ...sessions]]);
  // Боты аккаунта (свои и полученные от студии): каскадом — домены, источники, страницы, фрагменты, задачи, журнал
  // вопросов, сессии посетителей, установки, предпросмотры, приглашения этих ботов, запуски индексации.
  await tx.query('DELETE FROM bot WHERE account_id = $1', [accountId]);
  // Студия: переданные клиентам боты остаются у клиентов (ответ владельца 4), у студии пропадает только чтение.
  await tx.query('UPDATE bot SET studio_account_id = NULL WHERE studio_account_id = $1', [accountId]);
  await tx.query('DELETE FROM studio_invite WHERE studio_account_id = $1', [accountId]);
  await tx.query('UPDATE studio_invite SET accepted_by = NULL, accepted_at = NULL WHERE accepted_by = $1', [accountId]);
  for (const table of ['session', 'pro_interest', 'attribution', 'partner_code_use']) {
    await tx.query(`DELETE FROM ${table} WHERE account_id = $1`, [accountId]);
  }
  await tx.query('UPDATE partner_audit SET ip_prefix = NULL WHERE account_id = $1', [accountId]);
  await tx.query('UPDATE account SET came_from = NULL, signup_ip_prefix = NULL WHERE id = $1', [accountId]);
  return true;
}

async function finalizeErasureTx(tx: PoolClient, accountId: string, now: Date): Promise<EraseAccountResult> {
  const account = (await tx.query<{ status: string; erase_requested_at: Date; erase_deadline: Date }>(`SELECT status, ${REQUESTED_AT} AS erase_requested_at, erase_deadline
    FROM account WHERE id = $1 FOR NO KEY UPDATE`, [accountId])).rows[0];
  if (account?.status !== 'erasing') return { kind: 'skipped' };
  const money = await partnerTotals(tx, accountId, now);
  if (money.total > 0) {
    const hasDetails = Boolean((await tx.query('SELECT 1 FROM partner_payout_details WHERE account_id = $1', [accountId])).rowCount);
    const paidSince = Boolean((await tx.query(`SELECT 1 FROM commission_entry WHERE partner_account_id = $1 AND kind = 'payout' AND created_at >= $2`,
      [accountId, account.erase_requested_at])).rowCount);
    const beforeMargin = now.getTime() < account.erase_deadline.getTime() - ERASURE_PAYOUT_MARGIN_HOURS * HOUR_MS;
    if (hasDetails && !paidSince && money.available >= PAYOUT_MINIMUM_MINOR && beforeMargin) {
      await tx.query(`INSERT INTO erasure_audit (account_id, event, amount_minor)
        SELECT $1, 'waiting_payout', $2 WHERE NOT EXISTS (SELECT 1 FROM erasure_audit WHERE account_id = $1 AND event = 'waiting_payout')`,
      [accountId, money.available]);
      return { kind: 'waiting_payout', payoutMinor: money.available };
    }
    // Остаток сгорает явной записью: баланс надгробной строки — ноль, а не «забыт» (ответ владельца 2). Запись
    // commission_entry — только в commission.ts (страж фичи 15, AC-16).
    if (await forfeitCommissionTx(tx, accountId, money.total)) {
      await tx.query(`INSERT INTO erasure_audit (account_id, event, amount_minor) VALUES ($1, 'forfeited', $2)`, [accountId, money.total]);
    }
  }
  await tx.query('DELETE FROM partner_payout_details WHERE account_id = $1', [accountId]);
  // Текст кода мог быть именем человека: код остаётся (на него ссылаются атрибуции клиентов), текст обезличивается.
  await tx.query(`UPDATE partner_code SET code = 'erased-' || substr(md5(id::text), 1, 24) WHERE owner_account_id = $1`, [accountId]);
  await tx.query(`UPDATE account SET status = 'deleted', email = 'deleted:' || id::text, password_hash = '', plan = 'free', plan_source = 'none',
    plan_paid_until = NULL, partner_code_id = NULL, came_from = NULL, signup_ip_prefix = NULL, erase_attempted_at = NULL WHERE id = $1`, [accountId]);
  await tx.query(`INSERT INTO erasure_audit (account_id, event) VALUES ($1, 'erased')`, [accountId]);
  return { kind: 'erased' };
}

// Очередь сторожа: erasing старше тихого часа (задачи, начатые до запроса, успели упереться в фенс — N5 ERASURE_QUIET_MS);
// сначала не пробовавшиеся, затем давно упавшие (справедливость: сбой одного не держит остальных — N5, N4 RV-07).
// Время запроса пустое (строка erasing записана напрямую) — считается от срока минус 72 ч: стирается, а не висит вечно.
const REQUESTED_AT = `COALESCE(erase_requested_at, erase_deadline - make_interval(hours => ${ERASE_DEADLINE_HOURS}))`;
export async function listErasableAccounts(pool: Pool, now: Date, batch: number): Promise<string[]> {
  return (await pool.query<{ id: string }>(`SELECT id FROM account WHERE status = 'erasing' AND ${REQUESTED_AT} <= $1
    ORDER BY erase_attempted_at NULLS FIRST, ${REQUESTED_AT}, id LIMIT $2`, [new Date(now.getTime() - ERASURE_QUIET_MS), batch])).rows.map((r) => r.id);
}
export async function markErasureAttemptFailed(pool: Pool, accountId: string, now: Date): Promise<void> {
  await pool.query(`UPDATE account SET erase_attempted_at = $2 WHERE id = $1 AND status = 'erasing'`, [accountId, now]);
  await pool.query(`INSERT INTO erasure_audit (account_id, event) VALUES ($1, 'failed')`, [accountId]);
}
// Наблюдение срока — ДО попыток (N5): поздний успешный проход не должен прятать пропущенный срок. Одна строка
// overdue на аккаунт (уникальный индекс); возвращает число просроченных сейчас.
export async function observeErasureOverdue(pool: Pool, now: Date): Promise<number> {
  const overdue = (await pool.query<{ id: string }>(`SELECT id FROM account WHERE status = 'erasing' AND erase_deadline < $1`, [now])).rows;
  for (const { id } of overdue) {
    await pool.query(`INSERT INTO erasure_audit (account_id, event) VALUES ($1, 'overdue') ON CONFLICT DO NOTHING`, [id]);
  }
  return overdue.length;
}

export interface ErasureRow { account_id: string; email: string; requested_at: string; deadline: string; overdue: boolean; waiting_payout_minor: number | null }
// Для оператора (ops:erasure): аккаунты в удалении — срок и ожидаемая выплата партнёру. Почта нужна оператору для
// команды выплаты и видна только до завершения (после — deleted:<id>).
export async function listErasingAccounts(pool: Pool, now = new Date()): Promise<ErasureRow[]> {
  const rows = (await pool.query<{ id: string; email: string; erase_requested_at: Date; erase_deadline: Date }>(`SELECT id, email, erase_requested_at, erase_deadline
    FROM account WHERE status = 'erasing' ORDER BY erase_deadline, id`)).rows;
  const out: ErasureRow[] = [];
  for (const row of rows) {
    const waiting = (await pool.query<{ amount_minor: string }>(`SELECT amount_minor FROM erasure_audit WHERE account_id = $1 AND event = 'waiting_payout'
      ORDER BY created_at DESC LIMIT 1`, [row.id])).rows[0];
    out.push({ account_id: row.id, email: row.email, requested_at: row.erase_requested_at.toISOString(), deadline: row.erase_deadline.toISOString(),
      overdue: row.erase_deadline < now, waiting_payout_minor: waiting ? Number(waiting.amount_minor) : null });
  }
  return out;
}

// FR-AUTH-002, вторая фраза: владелец бота стирает журнал вопросов своего бота отдельно, без удаления аккаунта.
// Вместе с журналом — серверная история посетителей (там тоже тексты вопросов). Чужой, удалённый бот — null.
export function eraseBotQuestionLog(pool: Pool, botId: string, accountId: string): Promise<{ erased: number } | null> {
  if (!isUuid(botId) || !isUuid(accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const owned = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [botId, accountId]);
    if (!owned.rowCount) return null;
    const removed = await tx.query('DELETE FROM question_log WHERE bot_id = $1', [botId]);
    await tx.query(`UPDATE visitor_session SET history = '[]'::jsonb, history_at = NULL WHERE bot_id = $1`, [botId]);
    return { erased: removed.rowCount ?? 0 };
  });
}
