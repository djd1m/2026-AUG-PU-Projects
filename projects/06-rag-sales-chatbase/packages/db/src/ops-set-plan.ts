// SetPlanByOperator — команда оператора (Pseudocode SetPlanByOperator, FR-TARIFF-002, tariffs-and-interest). Написано
// заново: у доноров N1/N4 план назначала только оплата. Запуск внутри контейнера web:
//   npm run ops:set-plan -- <email> <free|nobadge|studio> --by <кто> --reason "<зачем>"
// Коды: 0 — план назначен (строка журнала operator_action); 1 — отказ (аккаунт не найден, неверные аргументы, БД).
// Возврат денег и несовпадение суммы разбираются этой же командой (решение владельца 26.09): платёж помечен needs_review.
import { createPool } from './pool.js';
import { setPlanByOperator } from './tariffs.js';

export function parseSetPlanArgs(argv: readonly string[]): { email: string; plan: string; operator: string; reason: string } | null {
  const positional: string[] = [];
  let operator: string | null = null, reason: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--by' || arg === '--reason') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return null;
      if (arg === '--by') operator = value; else reason = value;
      i++;
    } else if (arg.startsWith('--')) return null;
    else positional.push(arg);
  }
  if (positional.length !== 2 || operator === null || reason === null) return null;
  return { email: positional[0]!, plan: positional[1]!, operator, reason };
}

if (require.main === module) {
  const args = parseSetPlanArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!args) {
    console.error('Использование: npm run ops:set-plan -- <email> <free|nobadge|studio> --by <кто> --reason "<зачем>"');
    process.exitCode = 1;
  } else if (!databaseUrl?.trim()) {
    console.error('DATABASE_URL не задан: план не назначен');
    process.exitCode = 1;
  } else {
    const pool = createPool(databaseUrl);
    setPlanByOperator(pool, args).then((result) => {
      if (result.kind === 'updated') console.log(`План назначен: ${result.before} → ${result.after} (журнал operator_action)`);
      else if (result.kind === 'not_found') { console.error('Активный аккаунт с такой почтой не найден: план не назначен'); process.exitCode = 1; }
      else { console.error(`Неверное значение «${result.field}»: план не назначен`); process.exitCode = 1; }
    }).catch(() => { console.error('План не назначен: БД недоступна или отказала'); process.exitCode = 1; })
      .finally(() => pool.end());
  }
}
