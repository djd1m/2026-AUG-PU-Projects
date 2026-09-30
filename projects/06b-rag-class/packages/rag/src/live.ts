// Фабрика боевой двери (08_review.md F-2). Провайдер live создаётся ТОЛЬКО здесь и сразу закрывается внутри PaidGateway
// (приватное поле): у вызывающего нет объекта с методами embed/answer, значит нет и пути к модели в обход резерва.
// OpenRouterProvider из входа пакета не экспортируется; `new OpenRouterProvider(` и `new PaidGateway(` в боевом коде
// допустимы только в этом файле, адрес OpenRouter — только в адаптере (страж S-11, packages/rag/tests/unit/guards.test.ts).
//
// Пределы и ключ фабрика берёт САМА из проверенной конфигурации (spend-ceilings 08_review.md R-1): вызывающий передаёт
// результат checkConfig, а не числа. Литерал пределов, копия через spread или значения, собранные в обход checkConfig, —
// отказ до создания двери (isVerifiedConfig). Место вызова фабрики ограничено стражем S-12.

import { ConfigError, type ConfigValues, isVerifiedConfig, limitsFrom, type Pool } from '@n6b/db';
import { PaidGateway } from './paid-call.js';
import { OpenRouterProvider } from './provider/openrouter.js';

export interface LiveGatewayOptions {
  /** Результат checkConfig процесса (web: WebConfig.all). Пределы — limitsFrom(config), ключ — OPENROUTER_API_KEY. */
  readonly config: ConfigValues;
  /** Служебный пул (n6b_app_service). */
  readonly pool: Pool;
  readonly log?: (line: string) => void;
}

export function createLiveGateway(options: LiveGatewayOptions): PaidGateway {
  if (!isVerifiedConfig(options.config)) {
    throw new ConfigError('LIMIT_*', 'пределы двери не из проверенной конфигурации (checkConfig): потолок расходов не определён');
  }
  if ('limits' in (options as object)) {
    throw new ConfigError('LIMIT_*', 'пределы двери передаются только конфигурацией: поле limits не принимается');
  }
  const { config } = options;
  const apiKey = config.OPENROUTER_API_KEY;
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new ConfigError('OPENROUTER_API_KEY', 'OPENROUTER_API_KEY не прошёл проверку конфигурации: вызовы модели невозможны');
  }
  const visitorSecret = typeof config.VISITOR_SECRET === 'string' ? config.VISITOR_SECRET : undefined;
  return new PaidGateway({ pool: options.pool, provider: new OpenRouterProvider(apiKey), limits: limitsFrom(config),
    visitorSecret, log: options.log });
}
