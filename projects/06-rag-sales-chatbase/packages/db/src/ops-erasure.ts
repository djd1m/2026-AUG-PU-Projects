// Команда оператора удаления аккаунтов (фича account-erasure, A-N6-054). Написано заново: у N6 операторские команды — ops:*.
// Запуск внутри контейнера web:
//   npm run ops:erasure -- list       # аккаунты в удалении: срок, просрочка, ожидаемая выплата партнёру (почта — для payout)
//   npm run ops:erasure -- overdue    # только просроченные (срок 72 ч прошёл) — сигнал оператору
//   npm run ops:erasure -- owed       # долги удалённым партнёрам: положительный баланс учёта сейчас (ничего не сгорает, A-N6-061)
//   npm run ops:erasure -- write-off <id аккаунта> --by <кто> --reason "<зачем>"   # списать долг удалённому — ТОЛЬКО так
// Выплату партнёру оператор записывает обычной командой: npm run ops:partner -- payout <почта> --amount … ; удалённому —
// по обезличенной почте из списка owed (deleted:<id>), без минимума и без реквизитов в системе.
// Коды: 0 — выведено (в том числе пустой список); 1 — неверные аргументы или БД недоступна.
import type { Pool } from 'pg';
import { writeOffErasedPartnerDebt } from './commission.js';
import { listErasingAccounts, listOwedPayouts, type ErasureRow, type OwedRow } from './erasure.js';
import { createPool } from './pool.js';

const rubles = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');
const moscow = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
export function erasureLines(rows: readonly ErasureRow[]): string[] {
  if (!rows.length) return ['Аккаунтов в удалении нет'];
  return rows.map((r) => [r.account_id, r.email, `запрошено ${moscow(r.requested_at)} МСК`, `срок ${moscow(r.deadline)} МСК`,
    r.overdue ? 'ПРОСРОЧЕНО' : 'в срок', r.waiting_payout_minor === null ? 'выплаты не ждёт' : `ждёт выплату ${rubles(r.waiting_payout_minor)} ₽`].join(' · '));
}
export function owedLines(rows: readonly OwedRow[]): string[] {
  if (!rows.length) return ['Долгов удалённым партнёрам нет'];
  return rows.map((r) => [r.account_id, r.payout_email, r.erased_at ? `стёрт ${moscow(r.erased_at)} МСК` : 'стёрт',
    `долг ${rubles(r.owed_minor)} ₽`, `из них созрело ${rubles(r.available_minor)} ₽`].join(' · '));
}
export async function runErasureOps(pool: Pool, argv: readonly string[], out: (line: string) => void): Promise<boolean> {
  if (argv[0] === 'write-off') {
    const id = argv[1]; const flags: Record<string, string> = {};
    for (let i = 2; i + 1 < argv.length; i += 2) flags[argv[i]!] = argv[i + 1]!;
    if (!id || argv.length !== 6 || !flags['--by']?.trim() || !flags['--reason']?.trim()) { out('Нужно: write-off <id аккаунта> --by <кто> --reason "<зачем>"'); return false; }
    const r = await writeOffErasedPartnerDebt(pool, { accountId: id, operator: flags['--by'], reason: flags['--reason'] });
    out(r.kind === 'written_off' ? `Долг списан: ${rubles(r.amountMinor)} ₽ (журнал partner_audit)` : r.kind === 'nothing_owed' ? 'Долга нет — списывать нечего'
      : r.kind === 'not_found' ? 'Удалённый аккаунт с таким id не найден' : 'Неверный id или пустые --by/--reason');
    return r.kind === 'written_off';
  }
  if (argv.length !== 1 || !['list', 'overdue', 'owed'].includes(argv[0]!)) { out('Команды: list | overdue | owed | write-off <id> --by … --reason …'); return false; }
  if (argv[0] === 'owed') { for (const line of owedLines(await listOwedPayouts(pool))) out(line); return true; }
  const rows = await listErasingAccounts(pool);
  for (const line of erasureLines(argv[0] === 'overdue' ? rows.filter((r) => r.overdue) : rows)) out(line);
  return true;
}

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) { console.error('DATABASE_URL не задан: команда не выполнена'); process.exitCode = 1; }
  else {
    const pool = createPool(databaseUrl);
    runErasureOps(pool, process.argv.slice(2), (line) => console.log(line))
      .then((ok) => { if (!ok) process.exitCode = 1; })
      .catch(() => { console.error('БД недоступна: команда не выполнена'); process.exitCode = 1; })
      .finally(() => { void pool.end(); });
  }
}
