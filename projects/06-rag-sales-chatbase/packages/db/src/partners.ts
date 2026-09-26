// ApplyPartnerCode и регистрация с кодом (фича partner-and-studio; FR-PARTNER-001, FR-PARTNER-003, FR-GROWTH-002/007).
// Доноры: N4 projects/04-calorie-vision-cal-ai/apps/api/src/partner/{apply-partner-code,anti-fraud,normalize-code}.ts —
// АДАПТИРОВАНО (три источника N6 code | invite | cookie вместо explicit | deeplink | cookie; порог 20 с префикса за 10 мин
// из FR-PARTNER-003 вместо 50; партнёр — владелец partner_code, device_session нет — атрибуция на аккаунте); правило
// «явный неверный код не откатывается к cookie» — N1 projects/01-testimonials-senja/apps/web/src/lib/referral.ts
// (resolveAttribution) — ПЕРЕНЕСЕНО.
//
// БЛОКИРОВКИ: advisory-блокировка КОДА берётся ДО чтения его статуса (иначе блокировка — бутафория) и держится до конца
// транзакции: все применения одного кода сериализуются, окно анти-накрутки считает уже закоммиченные применения, и
// заморозка срабатывает ровно один раз. Под блокировкой кода пишутся строки ТОЛЬКО своего аккаунта (attribution,
// account.partner_code_id, partner_code_use) — и эту строку аккаунта транзакция либо только что вставила (регистрация,
// её не видит никто), либо уже держит сама (принятие приглашения запирает аккаунты FOR NO KEY UPDATE ДО кода). Чужие
// аккаунты — только чтение (self-referral). Поэтому держатель блокировки кода не ждёт чужих строк и цикла нет (ревью
// фичи 15: прежний комментарий «не ждёт строк аккаунтов» был неточен).
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export type AttributionSource = 'code' | 'invite' | 'cookie';
// Сила источника (FR-PARTNER-001): invite > code > cookie. Перезапись — только более сильным и только пока pending.
export const SOURCE_STRENGTH: Readonly<Record<AttributionSource, number>> = Object.freeze({ cookie: 1, code: 2, invite: 3 });
export const PARTNER_CODE_FORM = /^[A-Za-z0-9_-]{3,40}$/;
export const ANTI_FRAUD_THRESHOLD = 20;          // FR-PARTNER-003: > 20 применений с одного префикса за 10 минут
export const ANTI_FRAUD_WINDOW_MINUTES = 10;
export const SELF_REFERRAL_HOURS = 24;           // FR-PARTNER-003: аккаунт владельца кода с тем же префиксом за 24 ч

// Нормализация: только края; регистр значим (CHECK partner_code.code, форма канона). Не форма — не код.
export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  return PARTNER_CODE_FORM.test(code) ? code : null;
}

type Db = Pool | PoolClient;
export type LiveCode = { kind: 'ok'; id: string; ownerAccountId: string | null } | { kind: 'invalid' } | { kind: 'frozen' };
// Существует ли код и не заморожен ли (без блокировки: для ответа поля регистрации и для /r/{code}).
export async function findLiveCode(db: Db, raw: unknown): Promise<LiveCode> {
  const code = normalizePartnerCode(raw);
  if (!code) return { kind: 'invalid' };
  const row = (await db.query<{ id: string; owner_account_id: string | null; frozen: boolean }>(
    'SELECT id, owner_account_id, frozen FROM partner_code WHERE code = $1', [code])).rows[0];
  if (!row) return { kind: 'invalid' };
  return row.frozen ? { kind: 'frozen' } : { kind: 'ok', id: row.id, ownerAccountId: row.owner_account_id };
}

export type ApplyOutcome = 'applied' | 'kept' | 'rejected_self' | 'frozen_now' | 'invalid' | 'frozen';
export interface ApplyInput { accountId: string; code: string; source: AttributionSource; ipPrefix: string }

// ApplyPartnerCode ВНУТРИ транзакции вызывающего (регистрация, принятие приглашения). Исходы:
//   invalid / frozen — кода нет или он заморожен: для явного кода вызывающий откатывает ВСЮ регистрацию (ошибка поля);
//   rejected_self    — self-referral: атрибуция rejected(self_referral), если своей ещё не было; счётчик не растёт;
//   frozen_now       — это применение превысило порог: код заморожен (коммит обязан сохранить заморозку), само НЕ засчитано;
//   applied / kept   — атрибуция записана или сохранена прежняя (равный/более слабый источник, либо уже не pending).
export async function applyPartnerCodeTx(tx: PoolClient, input: ApplyInput): Promise<ApplyOutcome> {
  const code = normalizePartnerCode(input.code);
  if (!code || !isUuid(input.accountId)) return 'invalid';
  const found = (await tx.query<{ id: string }>('SELECT id FROM partner_code WHERE code = $1', [code])).rows[0];
  if (!found) return 'invalid';
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_code:${found.id}`]);
  // Статус — ПОСЛЕ блокировки: значение, прочитанное до неё, могло устареть, пока блокировка ждала очереди.
  const row = (await tx.query<{ owner_account_id: string | null; frozen: boolean }>(
    'SELECT owner_account_id, frozen FROM partner_code WHERE id = $1', [found.id])).rows[0]!;
  if (row.frozen) return 'frozen';

  if (row.owner_account_id !== null && await isSelfReferral(tx, row.owner_account_id, input.accountId, input.ipPrefix)) {
    await tx.query(`INSERT INTO attribution (account_id, partner_code_id, source, status, reject_reason) VALUES ($1, $2, $3, 'rejected', 'self_referral')
      ON CONFLICT (account_id) DO NOTHING`, [input.accountId, found.id, input.source]);
    return 'rejected_self';
  }

  // Анти-накрутка — под той же блокировкой: count каждого следующего в очереди уже учитывает предыдущие.
  const recent = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM partner_code_use
    WHERE partner_code_id = $1 AND ip_prefix = $2::cidr AND created_at > now() - make_interval(mins => $3)`,
  [found.id, input.ipPrefix, ANTI_FRAUD_WINDOW_MINUTES])).rows[0]!.n;
  if (recent >= ANTI_FRAUD_THRESHOLD) {
    const frozen = await tx.query(`UPDATE partner_code SET frozen = true, frozen_at = now(), frozen_reason = 'antifraud_ip_burst'
      WHERE id = $1 AND frozen = false`, [found.id]);
    if (frozen.rowCount === 1) {
      await tx.query(`INSERT INTO partner_audit (partner_code_id, account_id, kind, ip_prefix) VALUES ($1, $2, 'frozen_antifraud', $3::cidr)`,
        [found.id, input.accountId, input.ipPrefix]);
    }
    return 'frozen_now';
  }

  const existing = (await tx.query<{ source: AttributionSource; status: string }>(
    'SELECT source, status FROM attribution WHERE account_id = $1 FOR UPDATE', [input.accountId])).rows[0];
  if (existing && !(existing.status === 'pending' && SOURCE_STRENGTH[input.source] > SOURCE_STRENGTH[existing.source])) return 'kept';
  if (existing) {
    await tx.query(`UPDATE attribution SET partner_code_id = $2, source = $3 WHERE account_id = $1 AND status = 'pending'`,
      [input.accountId, found.id, input.source]);
  } else {
    await tx.query(`INSERT INTO attribution (account_id, partner_code_id, source) VALUES ($1, $2, $3)`, [input.accountId, found.id, input.source]);
  }
  // Группа сидирования считается по коду аккаунта (FR-GROWTH-007): без кода — «без кода», а не seed-net.
  await tx.query('UPDATE account SET partner_code_id = $2 WHERE id = $1', [input.accountId, found.id]);
  await tx.query(`INSERT INTO partner_code_use (partner_code_id, account_id, source, ip_prefix) VALUES ($1, $2, $3, $4::cidr)`,
    [found.id, input.accountId, input.source, input.ipPrefix]);
  return 'applied';
}

// Self-referral (FR-PARTNER-003): код принадлежит самому аккаунту ИЛИ владелец кода был с того же префикса IP за 24 ч
// (регистрация или любая сессия). NAT офиса даёт ложное срабатывание — это правило спецификации, риск назван в квитанции.
async function isSelfReferral(tx: PoolClient, ownerAccountId: string, accountId: string, ipPrefix: string): Promise<boolean> {
  if (ownerAccountId === accountId) return true;
  const hit = await tx.query(`SELECT 1 FROM account o WHERE o.id = $1 AND (
      (o.signup_ip_prefix = $2::cidr AND o.created_at > now() - make_interval(hours => $3))
      OR EXISTS (SELECT 1 FROM session s WHERE s.account_id = o.id AND s.ip_prefix = $2::cidr AND s.created_at > now() - make_interval(hours => $3)))`,
  [ownerAccountId, ipPrefix, SELF_REFERRAL_HOURS]);
  return (hit.rowCount ?? 0) > 0;
}

export interface RegistrationInput {
  email: string; passwordHash: string;
  session: { hash: string; ipPrefix: string; expiresAt: Date };
  // explicit — код из поля формы; cookie — код из подписанной cookie /r/{code} (подпись проверил web).
  partner?: { explicit: string | null; cookie: string | null };
}
export type RegistrationResult = 'ok' | 'invalid_code';
class InvalidExplicitCode extends Error {}

// Регистрация (Pseudocode AuthRegisterAndLogin + ApplyPartnerCode): явный код проверяется ДО вставки аккаунта и
// независимо от того, занят ли адрес (иначе ответ выдавал бы занятость почты); затем одна транзакция: аккаунт →
// сессия → ApplyPartnerCode. Явный неверный/замороженный код — откат всей регистрации, к cookie не откатываемся.
// Занятый адрес — «ok» без записи (случайная cookie-пустышка, как в foundation): перечисление почт невозможно.
export async function registerAccount(pool: Pool, input: RegistrationInput): Promise<RegistrationResult> {
  const explicit = input.partner?.explicit ?? null;
  if (explicit !== null && (await findLiveCode(pool, explicit)).kind !== 'ok') return 'invalid_code';
  try {
    return await transaction(pool, async (tx) => {
      const account = (await tx.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan, status, signup_ip_prefix)
        VALUES ($1, $2, 'free', 'active', $3::cidr) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [input.email, input.passwordHash, input.session.ipPrefix])).rows[0];
      if (!account) return 'ok' as const;
      await tx.query(`INSERT INTO session (account_id, token_hash, ip_prefix, expires_at) VALUES ($1, $2, $3::cidr, $4)`,
        [account.id, input.session.hash, input.session.ipPrefix, input.session.expiresAt]);
      const code = explicit ?? input.partner?.cookie ?? null;
      if (code !== null) {
        const outcome = await applyPartnerCodeTx(tx, { accountId: account.id, code, source: explicit !== null ? 'code' : 'cookie', ipPrefix: input.session.ipPrefix });
        // Код заморозили или удалили между проверкой и блокировкой: явный — та же ошибка поля; cookie — молча без атрибуции.
        if (explicit !== null && (outcome === 'invalid' || outcome === 'frozen')) throw new InvalidExplicitCode();
      }
      return 'ok' as const;
    });
  } catch (error) {
    if (error instanceof InvalidExplicitCode) return 'invalid_code';
    throw error;
  }
}
