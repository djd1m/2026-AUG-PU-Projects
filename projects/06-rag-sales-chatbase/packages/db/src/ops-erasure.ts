// Команда оператора удаления аккаунтов (фича account-erasure, A-N6-054). Написано заново: у N6 операторские команды — ops:*.
// Запуск внутри контейнера web:
//   npm run ops:erasure -- list       # аккаунты в удалении: срок, просрочка, ожидаемая выплата партнёру (почта — для payout)
//   npm run ops:erasure -- overdue    # только просроченные (срок 72 ч прошёл) — сигнал оператору
// Выплату партнёру до срока оператор записывает обычной командой: npm run ops:partner -- payout <почта> --amount … .
// Коды: 0 — выведено (в том числе пустой список); 1 — неверные аргументы или БД недоступна.
import type { Pool } from 'pg';
import { listErasingAccounts, type ErasureRow } from './erasure.js';
import { createPool } from './pool.js';

const rubles = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');
const moscow = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
export function erasureLines(rows: readonly ErasureRow[]): string[] {
  if (!rows.length) return ['Аккаунтов в удалении нет'];
  return rows.map((r) => [r.account_id, r.email, `запрошено ${moscow(r.requested_at)} МСК`, `срок ${moscow(r.deadline)} МСК`,
    r.overdue ? 'ПРОСРОЧЕНО' : 'в срок', r.waiting_payout_minor === null ? 'выплаты не ждёт' : `ждёт выплату ${rubles(r.waiting_payout_minor)} ₽`].join(' · '));
}
export async function runErasureOps(pool: Pool, argv: readonly string[], out: (line: string) => void): Promise<boolean> {
  if (argv.length !== 1 || !['list', 'overdue'].includes(argv[0]!)) { out('Команды: list | overdue'); return false; }
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
