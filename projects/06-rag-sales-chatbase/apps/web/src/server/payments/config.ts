// из N4: projects/04-calorie-vision-cal-ai/apps/api/src/payments/select-provider.ts — адаптировано (фича tariffs-and-interest,
// A-N6-040): третий режим `off` (оплата не настроена → экран интереса), фейк запрещён в production, ошибки — обычные
// Error с именем переменной (у N6 нет ConfigError @n4/shared, ср. packages/rag/src/config.ts `required`).
//
// ЧЕСТНОСТЬ РЕЖИМА (honest-configuration): «не настроено» никогда не превращается в «работает на фейке» молча.
//   N6_PAYMENTS_MODE не задан   → off: денег не принимаем, кнопка ведёт на экран интереса (самое строгое, а не «примем»);
//   пусто / неизвестное значение → ОТКАЗ СТАРТА (CFG-I2, CFG-I3): опечатка в .env не выбирает режим за человека;
//   fake                        → фейк N4; при NODE_ENV=production — ОТКАЗ СТАРТА (фейк «подтверждает» любую оплату);
//   live                        → ЮKassa; без магазина, ключа или явного режима test — ОТКАЗ СТАРТА (CFG-S1).
import type { PaymentProvider } from './provider';
import { createFakePaymentProvider } from './fake';
import { createYooKassaProvider } from './yookassa';

export const PAYMENTS_MODES = ['off', 'fake', 'live'] as const;
export type PaymentsMode = typeof PAYMENTS_MODES[number];

export interface PaymentsEnv {
  readonly NODE_ENV?: string;
  readonly N6_PAYMENTS_MODE?: string;
  readonly YOOKASSA_SHOP_ID?: string;
  readonly YOOKASSA_SECRET_KEY?: string;
  readonly YOOKASSA_TEST_MODE?: string;
}

const refuse = (name: string, why: string) => new Error(`${name} непригодна: ${why}`);

export function assertPaymentsEnv(env: PaymentsEnv): PaymentsMode {
  const mode = env.N6_PAYMENTS_MODE;
  if (mode === undefined) return 'off';
  if (mode.trim() === '') throw refuse('N6_PAYMENTS_MODE', 'пустая строка — не «выключено»: она определяет, берутся ли с людей настоящие деньги; уберите переменную или задайте off | fake | live');
  if (!(PAYMENTS_MODES as readonly string[]).includes(mode)) throw refuse('N6_PAYMENTS_MODE', `неизвестный режим «${mode.slice(0, 20)}»; допустимо ровно off | fake | live`);
  if (mode === 'off') return 'off';
  if (mode === 'fake') {
    if (env.NODE_ENV === 'production') throw refuse('N6_PAYMENTS_MODE', 'fake в production выдал бы платный план без денег: фейк «подтверждает» любую оплату');
    return 'fake';
  }
  if (!/^[0-9]{1,64}$/.test(env.YOOKASSA_SHOP_ID ?? '')) throw refuse('YOOKASSA_SHOP_ID', 'при N6_PAYMENTS_MODE=live обязателен десятичный идентификатор магазина: без него платёж не создать и уведомление не сверить');
  const secret = env.YOOKASSA_SECRET_KEY ?? '';
  if (secret.trim() === '' || secret !== secret.trim() || secret.length > 512) throw refuse('YOOKASSA_SECRET_KEY', 'при N6_PAYMENTS_MODE=live обязателен секретный ключ магазина без краевых пробелов');
  // Режим магазина участвует в проверке подлинности платежа (поле test): угадывать его нельзя — боевой платёж,
  // принятый как тестовый, это принятые и потерянные деньги (донор N4).
  if (env.YOOKASSA_TEST_MODE !== 'true' && env.YOOKASSA_TEST_MODE !== 'false') throw refuse('YOOKASSA_TEST_MODE', 'обязан быть явным true или false: он участвует в проверке подлинности платежа');
  return 'live';
}

// null — оплата выключена (off): маршрут вебхука отвечает 404, оформление — экраном интереса.
export function selectPaymentProvider(env: PaymentsEnv): PaymentProvider | null {
  const mode = assertPaymentsEnv(env);
  if (mode === 'off') return null;
  if (mode === 'fake') return createFakePaymentProvider();
  return createYooKassaProvider({ shopId: env.YOOKASSA_SHOP_ID as string, secretKey: env.YOOKASSA_SECRET_KEY as string, testMode: env.YOOKASSA_TEST_MODE === 'true' });
}
