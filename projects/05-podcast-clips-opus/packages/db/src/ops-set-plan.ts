// из N6: projects/06-rag-sales-chatbase/packages/db/src/tariffs.ts (setPlanByOperator) — адаптировано (фича 30 payments,
// OWN-019 п.3): план из закрытого набора N5 `free | paid` вместо `nobadge | studio`; атрибуция НЕ меняется (в N5 нет
// статуса converted); снятие плана стирает оплаченный остаток (находка 3 ревью N6).
//
// Оператор — единственный путь разбора возвратов и несовпадений суммы (OWN-019 п.3): платёж needs_review → решение
// человека → эта команда с журналом «кто, зачем, было → стало».
//
//   docker compose --project-directory . --env-file .env.n5-demo exec web \
//     npm run ops:set-plan -- <почта> free|paid --by <кто> --reason "<зачем>"
import { createPool, type Pool } from './index.js';
import { transaction } from './quota.js';

export type SetPlanResult = { kind: 'updated'; before: 'free' | 'paid'; after: 'free' | 'paid' } | { kind: 'not_found' }
  | { kind: 'invalid'; field: 'plan' | 'operator' | 'reason' | 'email' };

// План из закрытого набора, оператор и причина обязательны; план + источник + срок + строка журнала — одной транзакцией.
// Это замена платежа, а не его имитация: план оператора не истекает (plan_source='operator').
export function setPlanByOperator(pool: Pool, input: { email: string; plan: string; operator: string; reason: string }): Promise<SetPlanResult> {
  if (input.plan !== 'free' && input.plan !== 'paid') return Promise.resolve({ kind: 'invalid', field: 'plan' });
  const operator = input.operator.trim(), reason = input.reason.trim(), email = input.email.trim().toLowerCase();
  if (operator.length < 1 || operator.length > 100) return Promise.resolve({ kind: 'invalid', field: 'operator' });
  if (reason.length < 3 || reason.length > 500) return Promise.resolve({ kind: 'invalid', field: 'reason' });
  if (email.length < 3 || email.length > 254 || !email.includes('@')) return Promise.resolve({ kind: 'invalid', field: 'email' });
  const plan = input.plan;
  return transaction(pool, async (tx) => {
    const account = (await tx.query<{ id: string; plan: string }>(`SELECT id, plan FROM account WHERE email = $1 AND status = 'active' FOR NO KEY UPDATE`,
      [email])).rows[0];
    if (!account) return { kind: 'not_found' } as const;
    // Снятие плана (free) стирает и оплаченный остаток: иначе следующая оплата продлила бы срок, снятый после возврата.
    await tx.query(`UPDATE account SET plan = $2, plan_source = CASE WHEN $2 = 'free' THEN 'none' ELSE 'operator' END,
      plan_paid_until = CASE WHEN $2 = 'free' THEN NULL ELSE plan_paid_until END, updated_at = now() WHERE id = $1`, [account.id, plan]);
    const before = account.plan === 'paid' ? 'paid' : 'free';
    await tx.query(`INSERT INTO operator_action (operator, reason, account_id, action, plan_before, plan_after) VALUES ($1, $2, $3, 'set_plan', $4, $5)`,
      [operator, reason, account.id, before, plan]);
    return { kind: 'updated', before, after: plan } as const;
  });
}

// Разбор аргументов командной строки: `<почта> <план> --by <кто> --reason <зачем>`. Любое отклонение — отказ без изменений.
export function parseSetPlanArgs(args: readonly string[]): { email: string; plan: string; operator: string; reason: string } | null {
  const positional: string[] = [];
  let operator: string | undefined, reason: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--by' || arg === '--reason') {
      const value = args[++i];
      if (value === undefined) return null;
      if (arg === '--by') operator = value; else reason = value;
    } else positional.push(arg);
  }
  if (positional.length !== 2 || operator === undefined || reason === undefined) return null;
  return { email: positional[0]!, plan: positional[1]!, operator, reason };
}

export async function main(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const input = parseSetPlanArgs(args);
  if (!input) { console.error('Использование: ops:set-plan -- <почта> free|paid --by <кто> --reason "<зачем>"'); return 2; }
  if (!env.DATABASE_URL?.trim()) { console.error('DATABASE_URL не задан: план НЕ изменён'); return 2; }
  const pool = createPool(env.DATABASE_URL);
  try {
    const result = await setPlanByOperator(pool, input);
    if (result.kind === 'updated') { console.log(`План изменён: ${result.before} → ${result.after}. Запись в operator_action сделана.`); return 0; }
    console.error(result.kind === 'not_found' ? 'Активный аккаунт с этой почтой не найден: план НЕ изменён' : `Отказ: непригодно поле ${result.field}; план НЕ изменён`);
    return 1;
  } catch {
    console.error('База недоступна: план НЕ изменён');
    return 2;
  } finally { await pool.end(); }
}
if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; });
}
