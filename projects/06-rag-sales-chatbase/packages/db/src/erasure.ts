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
// Решения владельца (A-N6-054, A-N6-061): оплаченный остаток сгорает (возврат по заявке вручную); деньги партнёра НЕ
// сгорают (27.09, «Ничего не сжигать, всё — долг»): доступное ≥ 1 000 ₽ оператор выплачивает до срока по реквизитам СБП,
// реквизиты стираются в срок, весь невыплаченный баланс (включая дозревающий холд и будущие сторно) — долг сервиса,
// списать который может только оператор явной командой (ops:erasure write-off);
// записи оплат, начислений и выплат остаются 5 лет обезличенными — они ссылаются на надгробную строку account без почты;
// переданные клиентам боты студии остаются у клиентов; отменить удаление нельзя.
import { ERASE_DEADLINE_HOURS, ERASURE_PAYOUT_MARGIN_HOURS, ERASURE_QUIET_MS, PAYOUT_MINIMUM_MINOR } from '@n6/rag';
import type { Pool, PoolClient } from 'pg';
import { OWNED } from './bots.js';
import { partnerErasureMoney, partnerTotals } from './commission.js';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';
import { eraseSourceTx } from './sources.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Причина в журналах (partner_audit, operator_action) у стираемого/стёртого аккаунта — ровно эта строка; та же — в
// триггерах миграции 010 (раздел 7). Страж по исходнику сверяет обе.
export const ERASED_REASON = 'обезличено при удалении аккаунта';

// Деньги партнёра при удалении (A-N6-061): к выплате до срока — доступное (зрелое + все отрицательные записи), если оно
// ≥ минимума и реквизиты сохранены; всё остальное из положительного баланса — долг сервиса. НИЧЕГО не сгорает, поэтому
// итог не зависит от порядка событий: поздний вебхук, сторно или выплата лишь меняют баланс, который считается одним кодом
// (partnerTotals) у живого и удалённого партнёра. Одна формула у экрана удаления и у завершения.
function erasurePayout(money: { total: number; available: number }, hasDetails: boolean): { payable: number; debt: number } {
  const payable = hasDetails && money.available >= PAYOUT_MINIMUM_MINOR ? Math.min(money.available, money.total) : 0;
  return { payable, debt: Math.max(0, money.total - payable) };
}

export interface ErasurePreview {
  bots: number;                  // боты аккаунта (включая полученные от студии) — будут удалены
  clientBots: number;            // боты, которые аккаунт-студия передал клиентам, — останутся у клиентов
  paidDaysLeft: number | null;   // оплаченные дни плана, которые сгорят; null — оплаченного остатка нет
  partner: { payoutMinor: number; debtMinor: number; hasDetails: boolean } | null;  // null — не партнёр; debtMinor — останется долгом сервиса
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
  const money = await partnerErasureMoney(pool, accountId, now);
  let partner: ErasurePreview['partner'] = null;
  if (money.entries > 0) {
    const hasDetails = Boolean((await pool.query('SELECT 1 FROM partner_payout_details WHERE account_id = $1', [accountId])).rowCount);
    const { payable, debt } = erasurePayout(money, hasDetails);
    partner = { payoutMinor: payable, debtMinor: debt, hasDetails };
  }
  return { bots: bots.own, clientBots: bots.clients, paidDaysLeft, partner };
}

// Непринятые приглашения НА почту аккаунта от чужих студий (ревью H4): бот принадлежит студии, поэтому каскад бота их
// не находит, а почта в них — ПДн клиента. Вызывается, пока почта аккаунта ещё настоящая (до надгробия).
const INVITES_TO_ACCOUNT_EMAIL = `DELETE FROM studio_invite WHERE accepted_by IS NULL
  AND lower(email) = (SELECT lower(email) FROM account WHERE id = $1)`;
// Почта удаляемого — из ВСЕХ приглашений, где она осталась (повторное ревью, находка 2): непринятые удаляются, а
// принятые — в том числе принятые ДРУГИМ аккаунтом (приём не сверяет почту) и принятые самим удаляемым — обезличиваются:
// строка нужна студии и принявшему (владение ботом), почта — нет.
// Все приглашения, которых касается аккаунт (свои как студии, на его ботов, принятые им, на его почту), — под
// блокировкой ОДНИМ запросом в порядке id ДО любых удалений (шестое ревью, находка 4): две студии, удаляющиеся
// одновременно с встречными приглашениями A→B и B→A, иначе запирали их в разном порядке и получали взаимную блокировку.
async function lockInvitesOfAccountTx(tx: PoolClient, accountId: string): Promise<void> {
  await tx.query(`SELECT i.id FROM studio_invite i WHERE i.studio_account_id = $1 OR i.accepted_by = $1
      OR i.bot_id IN (SELECT id FROM bot WHERE account_id = $1)
      OR lower(i.email) = (SELECT lower(email) FROM account WHERE id = $1)
    ORDER BY i.id FOR UPDATE OF i`, [accountId]);
}

async function clearInvitesOfAccountTx(tx: PoolClient, accountId: string): Promise<void> {
  await tx.query(INVITES_TO_ACCOUNT_EMAIL, [accountId]);
  await tx.query(`UPDATE studio_invite SET email = 'erased:' || id::text
    WHERE email NOT LIKE 'erased:%' AND (accepted_by = $1 OR lower(email) = (SELECT lower(email) FROM account WHERE id = $1))`, [accountId]);
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
    // Приглашения — ДО ботов (седьмое ревью, находка 3): единый порядок «приглашение → бот» во всех путях — стирание
    // строк студии (eraseAccountRowsTx), приём приглашения (studio.ts). Иначе удаление клиента (бот → приглашение) и
    // стирание студии, передавшей ему бота (приглашение → бот), запирали друг друга.
    await lockInvitesOfAccountTx(tx, accountId);
    const jobs = (await tx.query<{ id: string }>(`SELECT j.id FROM index_job j JOIN bot b ON b.id = j.bot_id WHERE b.account_id = $1
      ORDER BY j.id FOR UPDATE OF j`, [accountId])).rows.map((r) => r.id);
    if (jobs.length) {
      await tx.query(`UPDATE index_job SET current_fence = current_fence + 1, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND status IN ('queued', 'running')`, [jobs]);
    }
    await tx.query(`UPDATE bot SET status = 'deleted', public_enabled = false WHERE account_id = $1 AND status <> 'deleted'`, [accountId]);
    await tx.query('DELETE FROM session WHERE account_id = $1', [accountId]);
    await tx.query('DELETE FROM studio_invite WHERE studio_account_id = $1 AND accepted_by IS NULL', [accountId]);
    await tx.query(INVITES_TO_ACCOUNT_EMAIL, [accountId]);
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
  // Плюс файлы уже удалённых источников аккаунта (upload_orphan, шестое ревью, находка 2).
  return (await pool.query<{ id: string }>(`SELECT j.id FROM index_job j JOIN bot b ON b.id = j.bot_id WHERE b.account_id = $1
    UNION SELECT index_job_id FROM upload_orphan WHERE account_id = $1`, [accountId]))
    .rows.map((r) => r.id);
}
// Файлы сирот аккаунта удалены (сторож вызывает ПОСЛЕ успешного удаления каждого файла) — строки больше не нужны.
export async function forgetUploadOrphans(pool: Pool, indexJobIds: readonly string[]): Promise<void> {
  const ids = indexJobIds.filter(isUuid);
  if (ids.length) await pool.query('DELETE FROM upload_orphan WHERE index_job_id = ANY($1::uuid[])', [ids]);
}

export type EraseAccountResult = { kind: 'erased' } | { kind: 'waiting_payout'; payoutMinor: number } | { kind: 'skipped' };
// EraseAccount — один аккаунт, идемпотентно (повтор находит пустоту): источники по одному → строки ботов и аккаунта →
// деньги партнёра → надгробная строка deleted ПОСЛЕДНЕЙ. Сбой на любом шаге оставляет erasing — повтор следующим
// проходом. Выплата партнёру (ответ владельца 2): пока до срока больше запаса и доступное ≥ минимума при сохранённых
// реквизитах — всё, кроме денег партнёра, уже стёрто, а завершение ждёт выплату.
// afterRowsErased — точка между транзакцией строк и транзакцией надгробия, только для теста окна гонки (повторное ревью,
// находка 3): записанное в этот промежуток обязано быть найдено завершением. Сторож её не передаёт.
export async function eraseAccount(pool: Pool, accountId: string, now = new Date(), seams: { afterRowsErased?: () => Promise<unknown> } = {}): Promise<EraseAccountResult> {
  if (!isUuid(accountId)) return { kind: 'skipped' };
  const status = (await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId])).rows[0]?.status;
  if (status !== 'erasing') return { kind: 'skipped' };
  const sources = (await pool.query<{ id: string; bot_id: string }>(`SELECT s.id, s.bot_id FROM source s JOIN bot b ON b.id = s.bot_id
    WHERE b.account_id = $1 ORDER BY s.id`, [accountId])).rows;
  for (const source of sources) await transaction(pool, (tx) => eraseSourceTx(tx, source.id, source.bot_id));
  const erased = await transaction(pool, (tx) => eraseAccountRowsTx(tx, accountId));
  if (!erased) return { kind: 'skipped' };
  if (seams.afterRowsErased) await seams.afterRowsErased();
  return transaction(pool, (tx) => finalizeErasureTx(tx, accountId, now));
}

async function eraseAccountRowsTx(tx: PoolClient, accountId: string): Promise<boolean> {
  // Намерения оплаты — ДО блокировки аккаунта: оплата берёт намерение, затем аккаунт (тот же порядок, без цикла).
  // Принятые деньги (payment) остаются: намерение — не учёт, у платежа intent_id станет NULL (ON DELETE SET NULL).
  await tx.query('DELETE FROM payment_intent WHERE account_id = $1', [accountId]);
  const account = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE', [accountId])).rows[0];
  if (account?.status !== 'erasing') return false;
  await lockInvitesOfAccountTx(tx, accountId);
  const bots = (await tx.query<{ id: string }>('SELECT id FROM bot WHERE account_id = $1', [accountId])).rows.map((r) => r.id);
  const sessions = bots.length
    ? (await tx.query<{ id: string }>('SELECT id FROM visitor_session WHERE bot_id = ANY($1::uuid[])', [bots])).rows.map((r) => r.id) : [];
  // События роста — агрегаты остаются, связи с человеком, ботом, посетителем и доменом стираются (N5 retention.ts).
  // dedup_key тоже: в нём origin установки, префикс IP показа страницы, идентификаторы бота и сессии (ревью H3);
  // замена — id события, уникальный сам по себе, пара (type, dedup_key) остаётся уникальной.
  await tx.query(`UPDATE growth_event SET account_id = NULL, bot_id = NULL, visitor_session_id = NULL, from_domain = NULL,
      dedup_key = 'erased:' || id::text
    WHERE account_id = $1 OR bot_id = ANY($2::uuid[]) OR visitor_session_id = ANY($3::uuid[])`, [accountId, bots, sessions]);
  await tx.query('DELETE FROM quota_counter WHERE scope_key = ANY($1::text[])', [[accountId, ...bots, ...sessions]]);
  // Боты аккаунта (свои и полученные от студии): каскадом — домены, источники, страницы, фрагменты, задачи, журнал
  // вопросов, сессии посетителей, установки, предпросмотры, приглашения этих ботов, запуски индексации.
  await tx.query('DELETE FROM bot WHERE account_id = $1', [accountId]);
  // Студия: переданные клиентам боты остаются у клиентов (ответ владельца 4), у студии пропадает только чтение.
  await tx.query('UPDATE bot SET studio_account_id = NULL WHERE studio_account_id = $1', [accountId]);
  await tx.query('DELETE FROM studio_invite WHERE studio_account_id = $1', [accountId]);
  await clearInvitesOfAccountTx(tx, accountId);
  await tx.query('UPDATE studio_invite SET accepted_by = NULL, accepted_at = NULL WHERE accepted_by = $1', [accountId]);
  for (const table of ['session', 'pro_interest', 'attribution', 'partner_code_use']) {
    await tx.query(`DELETE FROM ${table} WHERE account_id = $1`, [accountId]);
  }
  // Свободный текст оператора (причина) мог содержать имя или почту (шестое ревью, находка 3) — и в строках аккаунта, и в
  // строках его кодов; IP — тоже. Суммы, вид события и оператор остаются (учёт денег, 402-ФЗ).
  await tx.query(`UPDATE partner_audit SET ip_prefix = NULL, reason = CASE WHEN reason IS NULL THEN NULL ELSE 'обезличено при удалении аккаунта' END
    WHERE account_id = $1 OR partner_code_id IN (SELECT id FROM partner_code WHERE owner_account_id = $1)`, [accountId]);
  // Причина назначения плана оператором — тоже свободный текст (седьмое ревью, находка 1). Строки, вставленные после
  // запроса удаления, обезличивает триггер базы (миграция 010, раздел 7); эти записаны, пока аккаунт был активен.
  await tx.query(`UPDATE operator_action SET reason = '${ERASED_REASON}' WHERE account_id = $1`, [accountId]);
  // Метка выплаты — свободный текст оператора (восьмое ревью, находка 1): остаётся только отпечаток; новые метки после
  // запроса удаления переписывает триггер (миграция 010, раздел 8).
  await tx.query(`UPDATE commission_entry SET payout_key = 'erased:' || md5(payout_key)
    WHERE partner_account_id = $1 AND payout_key IS NOT NULL AND payout_key NOT LIKE 'erased:%'`, [accountId]);
  await tx.query('UPDATE account SET came_from = NULL, signup_ip_prefix = NULL WHERE id = $1', [accountId]);
  return true;
}

async function finalizeErasureTx(tx: PoolClient, accountId: string, now: Date): Promise<EraseAccountResult> {
  const account = (await tx.query<{ status: string; erase_deadline: Date }>(`SELECT status, erase_deadline
    FROM account WHERE id = $1 FOR NO KEY UPDATE`, [accountId])).rows[0];
  if (account?.status !== 'erasing') return { kind: 'skipped' };
  // Файлы удалённых источников ещё в томе — надгробие не ставится (шестое ревью, находка 2): сторож удаляет файл и лишь
  // затем строку upload_orphan; исключение — неудачная попытка, повтор следующим проходом.
  if ((await tx.query('SELECT 1 FROM upload_orphan WHERE account_id = $1 LIMIT 1', [accountId])).rowCount) {
    throw new Error('Стирание аккаунта: в томе остались файлы удалённых источников — завершение откладывается');
  }
  // Та же блокировка, что у recordPartnerPayout (ревью H2): выплата и завершение не читают баланс одновременно —
  // иначе выплата по старому балансу ложится поверх стирания реквизитов. Порядок: account → замок
  // выплаты; выплата строку account не блокирует, цикла нет.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_payout:${accountId}`]);
  const money = await partnerErasureMoney(tx, accountId, now);
  if (money.entries > 0) {
    const hasDetails = Boolean((await tx.query('SELECT 1 FROM partner_payout_details WHERE account_id = $1', [accountId])).rowCount);
    // К выплате — доступное ≥ минимума при реквизитах (ответ владельца 2), в том числе остаток после частичной выплаты.
    const { payable } = erasurePayout(money, hasDetails);
    const beforeMargin = now.getTime() < account.erase_deadline.getTime() - ERASURE_PAYOUT_MARGIN_HOURS * HOUR_MS;
    if (payable > 0 && beforeMargin) {
      await tx.query(`INSERT INTO erasure_audit (account_id, event, amount_minor)
        SELECT $1, 'waiting_payout', $2 WHERE NOT EXISTS (SELECT 1 FROM erasure_audit WHERE account_id = $1 AND event = 'waiting_payout' AND amount_minor = $2)`,
      [accountId, payable]);
      // Ожидающий уходит в конец очереди (ревью M5): 50 ожидающих не занимают каждый проход сторожа.
      await tx.query('UPDATE account SET erase_attempted_at = $2 WHERE id = $1', [accountId, now]);
      return { kind: 'waiting_payout', payoutMinor: payable };
    }
    // Ничего не сгорает (A-N6-061): учёт надгробной строки остаётся как есть, положительный баланс — долг сервиса.
    // payout_owed — сигнал оператору со снимком суммы на момент стирания; текущий долг считается живым расчётом
    // (listOwedPayouts), а не этим снимком.
    if (money.total > 0) {
      await tx.query(`INSERT INTO erasure_audit (account_id, event, amount_minor) VALUES ($1, 'payout_owed', $2)`, [accountId, money.total]);
    }
  }
  await tx.query('DELETE FROM partner_payout_details WHERE account_id = $1', [accountId]);
  // Выплата, записанная, пока стирание ждало, добавила строку журнала с причиной — обезличивается и она.
  await tx.query(`UPDATE partner_audit SET ip_prefix = NULL, reason = CASE WHEN reason IS NULL THEN NULL ELSE 'обезличено при удалении аккаунта' END
    WHERE account_id = $1 OR partner_code_id IN (SELECT id FROM partner_code WHERE owner_account_id = $1)`, [accountId]);
  await lockInvitesOfAccountTx(tx, accountId);
  // Приглашения на почту удаляемого — ещё раз, в транзакции надгробия под блокировкой строки аккаунта (повторное ревью,
  // находка 3): студия могла записать приглашение между проходом стирания строк и завершением. Создание приглашения
  // берёт строку адресата FOR SHARE (studio.ts createStudioInvite), поэтому оно либо закоммичено до этой очистки и
  // найдено ею, либо ждёт надгробия — и тогда почта аккаунта уже deleted:<id>, привязки к стёртому человеку нет.
  await clearInvitesOfAccountTx(tx, accountId);
  // Текст кода мог быть именем человека: код остаётся (на него ссылаются атрибуции клиентов), текст обезличивается.
  // Группа `seed-…` — свободный хвост, туда кладут имя студии (шестое ревью, находка 3): известные классы остаются для
  // когорт, остальное обезличивается с сохранением класса.
  await tx.query(`UPDATE partner_code SET code = 'erased-' || substr(md5(id::text), 1, 24),
      "group" = CASE WHEN "group" IN ('studio', 'partner', 'seed-net', 'seed-dogfood') THEN "group"
        WHEN "group" LIKE 'seed-studio-%' THEN 'seed-studio-erased' ELSE 'seed-erased' END
    WHERE owner_account_id = $1`, [accountId]);
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

export interface OwedRow { account_id: string; payout_email: string; owed_minor: number; available_minor: number; erased_at: string | null }
// Долги удалённым партнёрам (A-N6-061): стёртые аккаунты с ПОЛОЖИТЕЛЬНЫМ балансом учёта сейчас — тем же расчётом (partnerTotals),
// что у живого партнёра, поэтому поздний вебхук, сторно, выплата и списание отражаются сразу и в любом порядке.
// payout_email — обезличенная почта deleted:<id> для команды выплаты; available — сколько из долга уже созрело.
export async function listOwedPayouts(pool: Pool, now = new Date()): Promise<OwedRow[]> {
  const rows = (await pool.query<{ id: string; email: string; erased_at: Date | null }>(`SELECT a.id, a.email,
      (SELECT max(e.created_at) FROM erasure_audit e WHERE e.account_id = a.id AND e.event = 'erased') AS erased_at
    FROM account a WHERE a.status = 'deleted' AND EXISTS (SELECT 1 FROM commission_entry c WHERE c.partner_account_id = a.id)
    ORDER BY a.id`)).rows;
  const out: OwedRow[] = [];
  for (const row of rows) {
    const { total, available } = await partnerTotals(pool, row.id, now);
    if (total > 0) out.push({ account_id: row.id, payout_email: row.email, owed_minor: total, available_minor: Math.max(0, Math.min(available, total)),
      erased_at: row.erased_at ? row.erased_at.toISOString() : null });
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
