// Страница `/pro`. Серверный компонент: цена и потолки приходят из окружения сервиса `web`
// (`apps/web/env.ts` — единственное место, где он читает `process.env`), а не из литералов
// в разметке. Цена, зашитая в код, однажды разойдётся с той, что списывает провайдер.

import { loadWebConfig } from '../../env.js';
import { ProScreen } from './screen.js';

export const dynamic = 'force-dynamic';

export default function ProPage() {
  const config = loadWebConfig();
  return (
    <ProScreen
      priceMinor={config.subscriptionPriceMinor}
      scanLimitFree={config.scanLimitFree}
      scanLimitPro={config.scanLimitPro}
    />
  );
}
