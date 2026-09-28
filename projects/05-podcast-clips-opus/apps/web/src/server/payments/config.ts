// из N6: projects/06-rag-sales-chatbase/apps/web/src/server/payments/config.ts — адаптировано (фича 30 payments, ADR-019):
// проверка окружения (`N5_PAYMENTS_MODE`, `YOOKASSA_*`) перенесена в `@clipmaker/shared/tariff` (`loadPaymentsConfig`) и
// выполняется в `loadWebConfig` — значит и в отдельном preflight ДО старта Next (отказ старта с именем переменной).
// Здесь — только выбор провайдера по УЖЕ проверенной конфигурации.
import type { PaymentsConfig } from '@clipmaker/shared/tariff';
import type { PaymentProvider } from './provider';
import { createFakePaymentProvider } from './fake';
import { createYooKassaProvider } from './yookassa';

// null — оплата выключена (off): маршруты оплаты отвечают 404, «снять метку» ведёт на экран интереса.
export function selectPaymentProvider(config: PaymentsConfig): PaymentProvider | null {
  if (config.mode === 'off') return null;
  if (config.mode === 'fake') return createFakePaymentProvider();
  return createYooKassaProvider({ shopId: config.shopId, secretKey: config.secretKey, testMode: config.testMode });
}
