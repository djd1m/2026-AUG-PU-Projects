// Экран возврата с формы оплаты (tariffs-and-interest, AC-9, long-running-job): ЧЕТЫРЕ различимых состояния, а не два.
// Донор — N4 projects/04-calorie-vision-cal-ai/apps/web/app/pro/return/screen.tsx (decideFromSnapshot) — адаптировано:
// у N4 «не подтверждено за отведённое время» и «отказ» делили одно состояние failed; здесь это разные экраны, потому что
// разные действия: при отказе — оплатить снова, при «не подтверждено» — НЕ платить повторно, а подождать и проверить.
// Молчание (сбой опроса, pending) — это «выполняется», пока не истёк предел попыток; после — «не подтверждено», не «отказ».
export const RETURN_POLL_INTERVAL_MS = 2000;
export const RETURN_MAX_ATTEMPTS = 30;

export interface CheckoutSnapshot { status?: unknown; plan?: unknown; plan_paid_until?: unknown; account_plan?: unknown }
export type ReturnState =
  | { kind: 'waiting'; attempts: number }
  | { kind: 'succeeded'; plan: string; until: string | null }
  | { kind: 'failed' }
  | { kind: 'unconfirmed' }
  | { kind: 'not_found' };

// snapshot null — опрос не удался (сеть, 5xx): НЕ отказ оплаты. 'not_found' — сервер ответил 404 (чужое или нет такого).
export function decideReturnState(snapshot: CheckoutSnapshot | null | 'not_found', attempts: number): ReturnState {
  if (snapshot === 'not_found') return { kind: 'not_found' };
  if (snapshot && snapshot.status === 'succeeded') {
    const plan = snapshot.account_plan === 'nobadge' || snapshot.account_plan === 'studio' ? snapshot.account_plan : 'nobadge';
    return { kind: 'succeeded', plan, until: typeof snapshot.plan_paid_until === 'string' ? snapshot.plan_paid_until : null };
  }
  if (snapshot && snapshot.status === 'canceled') return { kind: 'failed' };
  if (attempts >= RETURN_MAX_ATTEMPTS) return { kind: 'unconfirmed' };
  return { kind: 'waiting', attempts };
}

// Адрес возврата после входа: ТОЛЬКО оформление платного плана; любой другой next игнорируется (открытый редирект).
const NEXT_ALLOWED = /^\/upgrade\?plan=(nobadge|studio)$/;
export function safeNextPath(value: unknown): string | null {
  return typeof value === 'string' && NEXT_ALLOWED.test(value) ? value : null;
}
