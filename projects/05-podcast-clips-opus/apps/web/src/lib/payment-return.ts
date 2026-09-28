// из N6: projects/06-rag-sales-chatbase/apps/web/src/lib/payment-return.ts — адаптировано (фича 30 payments, AC-10,
// long-running-job): ШЕСТЬ различимых состояний, а не два; план один (`paid`); `?next=` — только оформление N5.
// Молчание (сбой опроса, pending) — это «выполняется», пока не истёк предел; после — «не подтверждено», не «отказ».
export const RETURN_POLL_INTERVAL_MS = 2000;
export const RETURN_MAX_ATTEMPTS = 30;
// Предел ожидания — по ВРЕМЕНИ, а не только по числу попыток: зависший запрос не растягивает «выполняется» бесконечно
// (ревью N6, находка 5). Каждый опрос — с таймаутом.
export const RETURN_DEADLINE_MS = 60_000;
export const RETURN_FETCH_TIMEOUT_MS = 5000;

export interface CheckoutSnapshot { status?: unknown; plan_paid_until?: unknown; account_plan?: unknown }
export type ReturnState =
  | { kind: 'waiting'; attempts: number }
  | { kind: 'succeeded'; until: string | null }
  // Оплата когда-то прошла, но план сейчас НЕ действует (срок истёк или план снят оператором, ревью N6, находка 6):
  // обещать «включён» по старой ссылке нельзя.
  | { kind: 'paid_inactive' }
  | { kind: 'failed' }
  | { kind: 'unconfirmed' }
  | { kind: 'not_found' };

// snapshot null — опрос не удался (сеть, 5xx): НЕ отказ оплаты. 'not_found' — сервер ответил 404 (чужое или нет такого).
export function decideReturnState(snapshot: CheckoutSnapshot | null | 'not_found', attempts: number, elapsedMs = 0): ReturnState {
  if (snapshot === 'not_found') return { kind: 'not_found' };
  if (snapshot && snapshot.status === 'succeeded') {
    // Сравнение НА РАВЕНСТВО (ADR-004): всё, что не ровно 'paid', — план не действует.
    if (snapshot.account_plan !== 'paid') return { kind: 'paid_inactive' };
    return { kind: 'succeeded', until: typeof snapshot.plan_paid_until === 'string' ? snapshot.plan_paid_until : null };
  }
  if (snapshot && snapshot.status === 'canceled') return { kind: 'failed' };
  if (attempts >= RETURN_MAX_ATTEMPTS || elapsedMs >= RETURN_DEADLINE_MS) return { kind: 'unconfirmed' };
  return { kind: 'waiting', attempts };
}

// Экран, с которого пришли на оформление, — закрытый набор SOURCE_SCREEN (канон §4).
export const UPGRADE_FROM = ['clip_card', 'partner_dashboard', 'guest_page'] as const;
export type UpgradeFrom = typeof UPGRADE_FROM[number];
export const readUpgradeFrom = (value: unknown): UpgradeFrom | null =>
  typeof value === 'string' && (UPGRADE_FROM as readonly string[]).includes(value) ? value as UpgradeFrom : null;

// Адрес возврата после входа: ТОЛЬКО оформление тарифа и экран возврата с формы оплаты (сессия могла истечь, пока
// человек платил — ревью фичи 30, круг 1, находка 3); любой другой next игнорируется (открытый редирект).
const NEXT_ALLOWED = /^\/upgrade(\?from=(clip_card|partner_dashboard|guest_page)|\/return\?intent=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function safeNextPath(value: unknown): string | null {
  return typeof value === 'string' && NEXT_ALLOWED.test(value) ? value : null;
}
