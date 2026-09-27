// Команды оператора партнёрки (фича partner-and-studio; FR-PARTNER-003, FR-GROWTH-007; решения владельца 26.09). У N6 нет
// админки — только команды внутри контейнера web. Доноры: N4 projects/04-calorie-vision-cal-ai/apps/api/src/partner/
// manual-unblock.ts, export/csv.ts — АДАПТИРОВАНО в команды (CSV: `;`, BOM, копейки через запятую — ПЕРЕНЕСЕНО; добавлена
// защита текстовых ячеек от формул Excel); выдача seed-кодов групп — FR-GROWTH-007.
//   npm run ops:partner -- issue <код> --group <seed-net|seed-studio-имя|seed-dogfood|studio|partner> [--owner <почта>] [--rate-bp 2000] --by <кто> --reason "<зачем>"
//   npm run ops:partner -- unfreeze <код> --by <кто> --reason "<зачем>"
//   npm run ops:partner -- payout <почта партнёра> --amount <рубли, напр. 1500 или 1500,50> --key <ключ выплаты> --by <кто> --reason "<зачем>"
//   npm run ops:partner -- due          # к выплате на ближайшее 5-е: почта, телефон СБП, банк, сумма (CSV в stdout)
//   npm run ops:partner -- export       # все движения денег партнёров (CSV в stdout), без данных плательщиков
// Коды: 0 — выполнено; 1 — отказ (аргументы, не найдено, правило денег, БД).
import { DEFAULT_COMMISSION_RATE_BP, payoutDateFor, previewFromTotals } from '@n6/rag';
import type { Pool } from 'pg';
import { recordPartnerPayout, type RecordPayoutResult } from './commission.js';
import { PARTNER_CODE_FORM } from './partners.js';
import { createPool } from './pool.js';
import { transaction } from './quota.js';

export interface OpsArgs { command: string; positional: string[]; flags: Record<string, string> }
const FLAGS = new Set(['--group', '--owner', '--rate-bp', '--by', '--reason', '--amount', '--key']);
export function parseOpsArgs(argv: readonly string[]): OpsArgs | null {
  const [command, ...rest] = argv;
  if (!command) return null;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const value = rest[i + 1];
      if (!FLAGS.has(arg) || value === undefined || value.startsWith('--') || arg in flags) return null;
      flags[arg] = value; i++;
    } else positional.push(arg);
  }
  return { command, positional, flags };
}
const GROUP = /^(seed-[a-z0-9-]+|studio|partner)$/;
const operatorOk = (by?: string, reason?: string) => !!by && by.trim().length >= 1 && by.trim().length <= 100 && !!reason && reason.trim().length >= 3 && reason.trim().length <= 500;

/** Рубли из аргумента («1500», «1500,50», «1500.5») → целые копейки; иначе null. Без плавающей точки. */
export function parseRubles(raw: string | undefined): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(raw?.trim() ?? '');
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

export type IssueResult = { kind: 'issued' } | { kind: 'exists' | 'owner_not_found' } | { kind: 'invalid'; field: string };
export function issuePartnerCode(pool: Pool, input: { code: string; group: string; owner?: string; rateBp?: string; by?: string; reason?: string }): Promise<IssueResult> {
  if (!PARTNER_CODE_FORM.test(input.code)) return Promise.resolve({ kind: 'invalid', field: 'code' });
  if (!GROUP.test(input.group)) return Promise.resolve({ kind: 'invalid', field: 'group' });
  const rate = input.rateBp === undefined ? DEFAULT_COMMISSION_RATE_BP : Number(input.rateBp);
  if (!Number.isInteger(rate) || rate < 0 || rate > 10_000 || (input.rateBp !== undefined && !/^\d+$/.test(input.rateBp))) return Promise.resolve({ kind: 'invalid', field: 'rate-bp' });
  if (!operatorOk(input.by, input.reason)) return Promise.resolve({ kind: 'invalid', field: 'by/reason' });
  return transaction(pool, async (tx) => {
    let owner: string | null = null;
    if (input.owner !== undefined) {
      owner = (await tx.query<{ id: string }>(`SELECT id FROM account WHERE email = lower(btrim($1)) AND status = 'active'`, [input.owner])).rows[0]?.id ?? null;
      if (!owner) return { kind: 'owner_not_found' } as const;
    }
    const inserted = (await tx.query<{ id: string }>(`INSERT INTO partner_code (code, owner_account_id, "group", commission_rate_bp) VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO NOTHING RETURNING id`, [input.code, owner, input.group, rate])).rows[0];
    if (!inserted) return { kind: 'exists' } as const;
    await tx.query(`INSERT INTO partner_audit (partner_code_id, account_id, kind, operator, reason) VALUES ($1, $2, 'code_issued', $3, $4)`,
      [inserted.id, owner, input.by!.trim(), input.reason!.trim()]);
    return { kind: 'issued' } as const;
  });
}

export type UnfreezeResult = { kind: 'unfrozen' | 'not_frozen' | 'not_found' } | { kind: 'invalid'; field: string };
// Разморозка «до ручной проверки» (FR-PARTNER-003): только оператором, с журналом. Засчитанные до заморозки — не трогаются.
export function unfreezePartnerCode(pool: Pool, input: { code: string; by?: string; reason?: string }): Promise<UnfreezeResult> {
  if (!operatorOk(input.by, input.reason)) return Promise.resolve({ kind: 'invalid', field: 'by/reason' });
  return transaction(pool, async (tx) => {
    const code = (await tx.query<{ id: string; frozen: boolean }>('SELECT id, frozen FROM partner_code WHERE code = $1', [input.code])).rows[0];
    if (!code) return { kind: 'not_found' } as const;
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_code:${code.id}`]);
    const updated = await tx.query(`UPDATE partner_code SET frozen = false, frozen_at = NULL, frozen_reason = NULL WHERE id = $1 AND frozen`, [code.id]);
    if (updated.rowCount !== 1) return { kind: 'not_frozen' } as const;
    await tx.query(`INSERT INTO partner_audit (partner_code_id, kind, operator, reason) VALUES ($1, 'unfrozen', $2, $3)`, [code.id, input.by!.trim(), input.reason!.trim()]);
    return { kind: 'unfrozen' } as const;
  });
}

const CSV_BOM = '﻿';
/** Текст: RFC 4180 для `;` + защита от формул (= + - @ в начале ячейки исполнились бы в Excel). */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/** Копейки → «478,65»; отрицательные со знаком. Ячейка числа не экранируется от формул: это число. */
export function rublesCell(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
const dateCell = (value: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);

// К выплате: зрелое на ТЕКУЩИЙ момент и ≥ минимума (решение владельца 26.09) — ровно то, что примет команда payout; дата —
// сегодняшнее 5-е или ближайшее (ревью фичи 15, находка 3). Телефон — полностью: оператор платит по нему.
export async function payoutsDueCsv(pool: Pool, now = new Date()): Promise<string> {
  const payoutDate = payoutDateFor(now);
  const rows = (await pool.query<{ email: string; phone: string | null; bank: string | null; total: string; available: string }>(`SELECT a.email, d.phone, d.bank,
      sum(e.amount_minor)::bigint AS total, COALESCE(sum(e.amount_minor) FILTER (WHERE e.amount_minor < 0 OR e.available_at <= $1), 0)::bigint AS available
    FROM commission_entry e JOIN account a ON a.id = e.partner_account_id LEFT JOIN partner_payout_details d ON d.account_id = a.id
    GROUP BY a.email, d.phone, d.bank ORDER BY a.email`, [now])).rows;
  const lines = ['почта;телефон СБП;банк;к выплате, ₽;дата выплаты'];
  for (const row of rows) {
    const due = previewFromTotals(Number(row.total), Number(row.available), payoutDate).dueMinor;
    if (due > 0) lines.push([csvText(row.email), csvText(row.phone ?? 'НЕТ РЕКВИЗИТОВ'), csvText(row.bank), rublesCell(due), dateCell(payoutDate)].join(';'));
  }
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

// Все движения денег партнёров — без плательщиков (ни почты, ни id клиента: только код, сумма и даты).
export async function commissionExportCsv(pool: Pool): Promise<string> {
  const rows = (await pool.query<{ email: string; code: string | null; kind: string; amount_minor: string; created_at: Date; available_at: Date }>(
    `SELECT a.email, pc.code, e.kind, e.amount_minor, e.created_at, e.available_at FROM commission_entry e
     JOIN account a ON a.id = e.partner_account_id LEFT JOIN partner_code pc ON pc.id = e.partner_code_id ORDER BY e.created_at, e.id`)).rows;
  const kinds: Record<string, string> = { accrual: 'начисление', clawback: 'сторно', payout: 'выплата', forfeit: 'сгорело при удалении аккаунта' };
  const lines = ['партнёр;код;движение;сумма, ₽;дата;доступно с'];
  for (const r of rows) lines.push([csvText(r.email), csvText(r.code), kinds[r.kind] ?? r.kind, rublesCell(Number(r.amount_minor)), dateCell(r.created_at), dateCell(r.available_at)].join(';'));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

const PAYOUT_TEXT: Record<Exclude<RecordPayoutResult['kind'], 'recorded' | 'duplicate'>, string> = {
  not_found: 'Активный аккаунт партнёра с такой почтой не найден', no_details: 'У партнёра нет реквизитов СБП: выплату не записать',
  key_conflict: 'Этот ключ выплаты уже использован с ДРУГОЙ суммой', below_minimum: 'Сумма меньше минимальной выплаты 1 000 ₽',
  exceeds_available: 'Сумма больше доступного к выплате',
};
export async function runOps(pool: Pool, args: OpsArgs, out: (line: string) => void): Promise<boolean> {
  const f = args.flags;
  if (args.command === 'issue' && args.positional.length === 1 && f['--group']) {
    const r = await issuePartnerCode(pool, { code: args.positional[0]!, group: f['--group'], owner: f['--owner'], rateBp: f['--rate-bp'], by: f['--by'], reason: f['--reason'] });
    out(r.kind === 'issued' ? 'Код выдан (журнал partner_audit)' : r.kind === 'invalid' ? `Неверное значение «${r.field}»: код не выдан` : r.kind === 'exists' ? 'Такой код уже есть' : 'Владелец не найден');
    return r.kind === 'issued';
  }
  if (args.command === 'unfreeze' && args.positional.length === 1) {
    const r = await unfreezePartnerCode(pool, { code: args.positional[0]!, by: f['--by'], reason: f['--reason'] });
    out(r.kind === 'unfrozen' ? 'Код разморожен (журнал partner_audit)' : r.kind === 'invalid' ? `Неверное значение «${r.field}»` : r.kind === 'not_frozen' ? 'Код не заморожен' : 'Код не найден');
    return r.kind === 'unfrozen';
  }
  if (args.command === 'payout' && args.positional.length === 1) {
    const amount = parseRubles(f['--amount']);
    const key = f['--key']?.trim();
    if (amount === null || amount <= 0 || !key || key.length > 100 || !operatorOk(f['--by'], f['--reason'])) { out('Нужны --amount (рубли), --key, --by, --reason'); return false; }
    const r = await recordPartnerPayout(pool, { email: args.positional[0]!, amountMinor: amount, key, operator: f['--by']!.trim(), reason: f['--reason']!.trim() });
    if (r.kind === 'recorded' || r.kind === 'duplicate') { out(`${r.kind === 'recorded' ? 'Выплата записана' : 'Выплата с этим ключом уже была'}: ${rublesCell(r.amountMinor)} ₽; баланс после: ${rublesCell(r.balanceAfterMinor)} ₽`); return true; }
    out(PAYOUT_TEXT[r.kind] + (r.kind === 'exceeds_available' ? ` (доступно ${rublesCell(r.availableMinor)} ₽)` : ''));
    return false;
  }
  if (args.command === 'due' && args.positional.length === 0) { out(await payoutsDueCsv(pool)); return true; }
  if (args.command === 'export' && args.positional.length === 0) { out(await commissionExportCsv(pool)); return true; }
  out('Команды: issue | unfreeze | payout | due | export (см. шапку packages/db/src/ops-partners.ts)');
  return false;
}

if (require.main === module) {
  const args = parseOpsArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!args) { console.error('Неверные аргументы: см. шапку packages/db/src/ops-partners.ts'); process.exitCode = 1; }
  else if (!databaseUrl?.trim()) { console.error('DATABASE_URL не задан: команда не выполнена'); process.exitCode = 1; }
  else {
    const pool = createPool(databaseUrl);
    runOps(pool, args, (line) => process.stdout.write(`${line}\n`)).then((ok) => { if (!ok) process.exitCode = 1; })
      .catch(() => { console.error('Команда не выполнена: БД недоступна или отказала'); process.exitCode = 1; })
      .finally(() => pool.end());
  }
}
