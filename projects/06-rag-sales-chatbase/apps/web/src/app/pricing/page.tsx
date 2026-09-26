// Тарифы: ответы в сутки и месяц — потолки окружения (канон §7, QUOTA_BOT_DAY|MONTH_FREE|PAID), а не числа в разметке.
// Страница динамическая: потолки загружаются на старте web, при сборке их нет.
import { ceiling } from '@n6/db';
import { getRuntime } from '../../server/runtime';
import { Pricing } from './Pricing';
import { requestTheme } from '../theme-server';
export const dynamic = 'force-dynamic';
export default async function PricingPage() {
  const { ceilings } = getRuntime().config;
  const answers = {
    free: { day: ceiling(ceilings, 'bot_day_answers:free'), month: ceiling(ceilings, 'bot_month_answers:free') },
    paid: { day: ceiling(ceilings, 'bot_day_answers:paid'), month: ceiling(ceilings, 'bot_month_answers:paid') },
  };
  return <Pricing theme={await requestTheme()} answers={answers} />;
}
