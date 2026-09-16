// Выбор реализации провайдера. Здесь живёт ЧЕСТНОСТЬ РЕЖИМА (`honest-configuration.md`):
// «не настроено» никогда не превращается в «работает на фейке» молча.
//
// Три состояния, и ни одно не угадывается:
//   live + ключи есть   → настоящий провайдер;
//   live + ключей нет   → ОТКАЗ СТАРТА с названием незакрытого вызова (CFG-S1);
//   fake                → фейк, и прогон на нём не является проверкой приёма денег.

import { ConfigError } from '@n4/shared';
import type { PaymentProvider } from './provider.js';
import { createFakePaymentProvider } from './fake.js';
import { createYooKassaProvider } from './yookassa.js';

export type PaymentsMode = 'fake' | 'live';

/**
 * Проверка БЕЗ построения провайдера: её зовёт `env.ts` при загрузке конфигурации, чтобы
 * ненастроенные платежи валили СТАРТ, а не первый запрос человека к оплате. Отдельная
 * функция, потому что построение клиента и проверка настроек — разные вопросы, и второй
 * обязан отвечать раньше.
 */
export function assertPaymentsEnv(env: PaymentsEnv): PaymentsMode {
  const mode = env.N4_PAYMENTS_MODE;
  // Пустая строка ОТЛИЧАЕТСЯ от отсутствия и обычно означает опечатку в .env
  // (`fail-closed-defaults.md`, правило 2): и то и другое — отказ, но об этом надо сказать.
  if (mode === undefined || mode.trim() === '') {
    throw new ConfigError('N4_PAYMENTS_MODE', mode === undefined ? 'missing' : 'empty', 'он определяет, берутся ли с людей НАСТОЯЩИЕ деньги; значения по умолчанию у него нет намеренно');
  }
  if (mode !== 'fake' && mode !== 'live') {
    throw new ConfigError('N4_PAYMENTS_MODE', 'invalid', 'неизвестный режим — это не «наверное, тестовый»: допустимо ровно два значения, fake | live', `получено «${mode}»`);
  }
  if (mode === 'fake') return 'fake';

  const provider = env.N4_PAYMENTS_PROVIDER ?? '';
  if (provider !== 'yookassa') {
    throw new ConfigError('N4_PAYMENTS_PROVIDER', 'invalid', 'в живом режиме провайдер обязан быть назван; реализован yookassa', `получено «${provider}»`);
  }
  if ((env.YOOKASSA_SHOP_ID ?? '').trim() === '' || (env.YOOKASSA_SECRET_KEY ?? '').trim() === '') {
    throw new ConfigError('YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY', 'missing', 'оба обязательны при N4_PAYMENTS_MODE=live: без них приём подписки не работает, а тихий фейк принимал бы оплату, которой нет');
  }
  if (env.YOOKASSA_TEST_MODE !== 'true' && env.YOOKASSA_TEST_MODE !== 'false') {
    // Режим магазина — часть подлинности платежа (адаптер сверяет поле `test`), поэтому
    // угадывать его нельзя: боевой платёж, принятый как тестовый, — принятые и потерянные деньги.
    throw new ConfigError('YOOKASSA_TEST_MODE', 'invalid', 'он участвует в проверке подлинности платежа и обязан быть явным true или false; боевой платёж, принятый как тестовый, — это принятые и потерянные деньги');
  }
  return 'live';
}

export interface PaymentsEnv {
  readonly N4_PAYMENTS_MODE?: string;
  readonly N4_PAYMENTS_PROVIDER?: string;
  readonly YOOKASSA_SHOP_ID?: string;
  readonly YOOKASSA_SECRET_KEY?: string;
  readonly YOOKASSA_TEST_MODE?: string;
}

export function selectPaymentProvider(env: PaymentsEnv): PaymentProvider {
  if (assertPaymentsEnv(env) === 'fake') return createFakePaymentProvider();
  return createYooKassaProvider({
    shopId: env.YOOKASSA_SHOP_ID as string,
    secretKey: env.YOOKASSA_SECRET_KEY as string,
    testMode: env.YOOKASSA_TEST_MODE === 'true',
  });
}
