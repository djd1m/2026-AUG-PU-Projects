// Экран возврата с формы оплаты (tariffs-and-interest, AC-9, long-running-job): ШЕСТЬ различимых состояний, а не два.
// Донор — N4 projects/04-calorie-vision-cal-ai/apps/web/app/pro/return/screen.tsx (decideFromSnapshot) — адаптировано:
// у N4 «не подтверждено за отведённое время» и «отказ» делили одно состояние failed; здесь это разные экраны, потому что
// разные действия: при отказе — оплатить снова, при «не подтверждено» — НЕ платить повторно, а подождать и проверить.
// Молчание (сбой опроса, pending) — это «выполняется», пока не истёк предел попыток; после — «не подтверждено», не «отказ».
export const RETURN_POLL_INTERVAL_MS = 2000;
export const RETURN_MAX_ATTEMPTS = 30;
// Предел ожидания — по ВРЕМЕНИ, а не только по числу попыток: зависший запрос не растягивает «выполняется» бесконечно
// (ревью фичи 14, находка 5). Каждый опрос — с таймаутом.
export const RETURN_DEADLINE_MS = 60_000;
export const RETURN_FETCH_TIMEOUT_MS = 5000;

export interface CheckoutSnapshot { status?: unknown; plan?: unknown; plan_paid_until?: unknown; account_plan?: unknown }
export type ReturnState =
  | { kind: 'waiting'; attempts: number }
  | { kind: 'succeeded'; plan: string; until: string | null }
  // Оплата когда-то прошла, но план сейчас НЕ действует (срок истёк или план снят оператором, ревью фичи 14, находка 6):
  // обещать «включён» по старой ссылке нельзя.
  | { kind: 'paid_inactive' }
  | { kind: 'failed' }
  | { kind: 'unconfirmed' }
  | { kind: 'not_found' };

// snapshot null — опрос не удался (сеть, 5xx): НЕ отказ оплаты. 'not_found' — сервер ответил 404 (чужое или нет такого).
export function decideReturnState(snapshot: CheckoutSnapshot | null | 'not_found', attempts: number, elapsedMs = 0): ReturnState {
  if (snapshot === 'not_found') return { kind: 'not_found' };
  if (snapshot && snapshot.status === 'succeeded') {
    if (snapshot.account_plan !== 'nobadge' && snapshot.account_plan !== 'studio') return { kind: 'paid_inactive' };
    return { kind: 'succeeded', plan: snapshot.account_plan, until: typeof snapshot.plan_paid_until === 'string' ? snapshot.plan_paid_until : null };
  }
  if (snapshot && snapshot.status === 'canceled') return { kind: 'failed' };
  if (attempts >= RETURN_MAX_ATTEMPTS || elapsedMs >= RETURN_DEADLINE_MS) return { kind: 'unconfirmed' };
  return { kind: 'waiting', attempts };
}

// Адрес возврата после входа: ТОЛЬКО оформление платного плана; любой другой next игнорируется (открытый редирект).
// + приём приглашения студии (partner-and-studio): ровно `/invite/<токен 43 символа>`, без запроса и фрагмента.
const NEXT_ALLOWED = /^(\/upgrade\?plan=(nobadge|studio)|\/invite\/[A-Za-z0-9_-]{43})$/;
export function safeNextPath(value: unknown): string | null {
  return typeof value === 'string' && NEXT_ALLOWED.test(value) ? value : null;
}
