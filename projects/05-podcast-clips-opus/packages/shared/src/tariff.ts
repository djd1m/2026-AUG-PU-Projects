// Тариф `paid` и режим оплаты (фича 30 payments, OWN-019, ADR-019). Числа — решение владельца 28.09.2026:
// 990 ₽ за 30 дней, разовая оплата без автопродления; повторная продлевает от большего из (срок, сейчас).
// Цена и срок — КОНСТАНТЫ КОДА, не окружения: цена, приехавшая пустой или с опечаткой, стала бы чужими деньгами
// (fail-closed-defaults, правило 3). Режим оплаты — окружение, но только выбор из закрытого набора (CFG-I8).
import type { Environment } from './config.js';
import { isShowcaseClip } from './showcase.js';

export const PAID_PRICE_MINOR = 99_000;
export const PAID_PLAN_DAYS = 30;
export const PAID_PLAN_TITLE = 'Pro';

/** Копейки → «990 ₽». Только целые рубли показываются без копеек. */
export function formatRubles(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('Сумма обязана быть положительным целым числом копеек');
  const rub = Math.floor(minor / 100), kop = minor % 100;
  return `${rub.toLocaleString('ru-RU')}${kop ? `,${String(kop).padStart(2, '0')}` : ''} ₽`;
}

/**
 * Действующий план (FR-TARIFF-001, AC-11). Оплаченный план истекает по `plan_paid_until` ДО прохода сторожа:
 * читатель не ждёт, пока сторож поменяет строку. Сравнение НА РАВЕНСТВО (ADR-004): всё, что не ровно `paid`,
 * и любой неизвестный источник — `free`. Зеркало SQL — `effectivePlanSql` в `@clipmaker/db`.
 */
export function effectivePlan(plan: unknown, source: unknown, paidUntil: Date | string | null | undefined, now: Date): 'free' | 'paid' {
  if (plan !== 'paid') return 'free';
  if (source === 'none' || source === 'operator') return 'paid';
  if (source !== 'payment' || paidUntil === null || paidUntil === undefined) return 'free';
  const until = paidUntil instanceof Date ? paidUntil.getTime() : Date.parse(paidUntil);
  return Number.isFinite(until) && until > now.getTime() ? 'paid' : 'free';
}

/** Срок хранения клипа бесплатного тарифа — 72 ч (FR-TARIFF-003). Единственное место числа: SQL-зеркало — `clipAliveSql` (@clipmaker/db). */
export const FREE_RETENTION_MS = 3 * 86_400_000;
export interface ClipExpiryInput {
  /** clip.id — по нему витрина лендинга (ADR-018) исключается из срока бесплатного тарифа. */
  clipId: unknown; expiresAt: Date | null | undefined; plan: unknown; retentionFrom: Date | null | undefined;
}
/**
 * Срок клипа — ЕДИНСТВЕННОЕ правило для экрана, /c/, файла, смены музыки и призыва (ретенция — `clipAliveSql`):
 *   явный `expires_at` соблюдается всегда (и у витрины);
 *   иначе у не-`paid` — 72 ч от `retention_from` (готовность записи, но не раньше конца оплаченного срока, AC-12);
 *   клип витрины (`SHOWCASE_CLIPS`) срока бесплатного тарифа не имеет: ретенция его не стирает, и чтения не
 *   объявляют его истёкшим — иначе смена призыва/музыки у записи витрины молча не пересобирала бы клип лендинга.
 * План — ДЕЙСТВУЮЩИЙ (`effectivePlanSql`), сравнение на равенство: всё, что не ровно `paid`, — срок есть.
 */
export function clipExpiry(clip: ClipExpiryInput): Date | null {
  if (clip.expiresAt) return clip.expiresAt;
  if (clip.plan === 'paid' || !clip.retentionFrom || isShowcaseClip(clip.clipId)) return null;
  return new Date(clip.retentionFrom.getTime() + FREE_RETENTION_MS);
}

export const PAYMENTS_MODES =['off', 'fake', 'live'] as const;
export type PaymentsMode = typeof PAYMENTS_MODES[number];
export type PaymentsConfig =
  | { readonly mode: 'off' } | { readonly mode: 'fake' }
  | { readonly mode: 'live'; readonly shopId: string; readonly secretKey: string; readonly testMode: boolean };

const refuse = (name: string, why: string) => new Error(`${name} непригодна: ${why}`);

/**
 * ЧЕСТНОСТЬ РЕЖИМА (honest-configuration, адаптировано из N6 payments/config.ts):
 *   N5_PAYMENTS_MODE не задан    → off: денег не принимаем, «снять метку» ведёт на экран интереса (самое строгое);
 *   пусто / неизвестное значение → ОТКАЗ СТАРТА (CFG-I2, CFG-I3): опечатка не выбирает режим за человека;
 *   fake                         → фейк; при NODE_ENV=production — ОТКАЗ (фейк «подтверждает» любую оплату);
 *   live                         → ЮKassa; без магазина, ключа или явного YOOKASSA_TEST_MODE — ОТКАЗ СТАРТА (CFG-S1).
 */
export function loadPaymentsConfig(env: Environment): PaymentsConfig {
  const mode = env.N5_PAYMENTS_MODE;
  if (mode === undefined) return Object.freeze({ mode: 'off' as const });
  if (mode.trim() === '') throw refuse('N5_PAYMENTS_MODE', 'пустая строка — не «выключено»: она определяет, берутся ли с людей деньги; уберите переменную или задайте off | fake | live');
  if (!(PAYMENTS_MODES as readonly string[]).includes(mode)) throw refuse('N5_PAYMENTS_MODE', `неизвестный режим «${mode.slice(0, 20)}»; допустимо ровно off | fake | live`);
  if (mode === 'off') return Object.freeze({ mode: 'off' as const });
  if (mode === 'fake') {
    if (env.NODE_ENV === 'production') throw refuse('N5_PAYMENTS_MODE', 'fake в production выдал бы платный план без денег: фейк «подтверждает» любую оплату');
    return Object.freeze({ mode: 'fake' as const });
  }
  const shopId = env.YOOKASSA_SHOP_ID ?? '';
  if (!/^[0-9]{1,64}$/.test(shopId)) throw refuse('YOOKASSA_SHOP_ID', 'при N5_PAYMENTS_MODE=live обязателен десятичный идентификатор магазина: без него платёж не создать и уведомление не сверить');
  const secretKey = env.YOOKASSA_SECRET_KEY ?? '';
  if (secretKey.trim() === '' || secretKey !== secretKey.trim() || secretKey.length > 512) throw refuse('YOOKASSA_SECRET_KEY', 'при N5_PAYMENTS_MODE=live обязателен секретный ключ магазина без краевых пробелов');
  // Режим магазина участвует в проверке подлинности платежа (поле test): угадывать его нельзя (донор N4).
  if (env.YOOKASSA_TEST_MODE !== 'true' && env.YOOKASSA_TEST_MODE !== 'false') throw refuse('YOOKASSA_TEST_MODE', 'обязан быть явным true или false: он участвует в проверке подлинности платежа');
  return Object.freeze({ mode: 'live' as const, shopId, secretKey, testMode: env.YOOKASSA_TEST_MODE === 'true' });
}
