// Выбор реализации провайдера. Здесь живёт ЧЕСТНОСТЬ РЕЖИМА (`honest-configuration.md`):
// «не настроено» никогда не превращается в «работает на фейке» молча.
//
// Три состояния, и ни одно не угадывается:
//   live + ключи есть   → настоящий провайдер;
//   live + ключей нет   → ОТКАЗ СТАРТА с названием незакрытого вызова (CFG-S1);
//   fake                → фейк, и прогон на нём не является проверкой приёма денег.

import type { PaymentProvider } from './provider.js';
import { createFakePaymentProvider } from './fake.js';
import { createYooKassaProvider } from './yookassa.js';

export type PaymentsMode = 'fake' | 'live';

export interface PaymentsEnv {
  readonly N4_PAYMENTS_MODE?: string;
  readonly N4_PAYMENTS_PROVIDER?: string;
  readonly YOOKASSA_SHOP_ID?: string;
  readonly YOOKASSA_SECRET_KEY?: string;
  readonly YOOKASSA_TEST_MODE?: string;
}

export function selectPaymentProvider(env: PaymentsEnv): PaymentProvider {
  const mode = env.N4_PAYMENTS_MODE;
  // Пустая строка ОТЛИЧАЕТСЯ от отсутствия и обычно означает опечатку в .env
  // (`fail-closed-defaults.md`, правило 2): и то и другое — отказ, но об этом надо сказать.
  if (mode === undefined || mode.trim() === '') {
    throw new Error('N4_PAYMENTS_MODE не задан. Он определяет, берутся ли с людей НАСТОЯЩИЕ деньги; значения по умолчанию у него нет намеренно');
  }
  if (mode !== 'fake' && mode !== 'live') {
    throw new Error(`N4_PAYMENTS_MODE имеет неизвестное значение «${mode}». Допустимо ровно два: fake | live`);
  }
  if (mode === 'fake') return createFakePaymentProvider();

  const provider = env.N4_PAYMENTS_PROVIDER ?? '';
  if (provider !== 'yookassa') {
    throw new Error(`N4_PAYMENTS_PROVIDER в живом режиме обязан называть провайдера. Реализован: yookassa. Получено: «${provider}»`);
  }
  const shopId = env.YOOKASSA_SHOP_ID ?? '';
  const secretKey = env.YOOKASSA_SECRET_KEY ?? '';
  if (shopId.trim() === '' || secretKey.trim() === '') {
    throw new Error('YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY обязательны при N4_PAYMENTS_MODE=live: без них приём подписки не работает, а тихий фейк принимал бы оплату, которой нет');
  }
  const testMode = env.YOOKASSA_TEST_MODE;
  if (testMode !== 'true' && testMode !== 'false') {
    // Режим магазина — часть подлинности платежа (адаптер сверяет поле `test`), поэтому
    // угадывать его нельзя: боевой платёж, принятый как тестовый, — принятые и потерянные деньги.
    throw new Error('YOOKASSA_TEST_MODE обязан быть явным true или false: он участвует в проверке подлинности платежа');
  }
  return createYooKassaProvider({ shopId, secretKey, testMode: testMode === 'true' });
}
