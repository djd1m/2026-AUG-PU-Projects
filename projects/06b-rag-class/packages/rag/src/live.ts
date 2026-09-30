// Фабрика боевой двери (08_review.md F-2). Провайдер live создаётся ТОЛЬКО здесь и сразу закрывается внутри PaidGateway
// (приватное поле): у вызывающего нет объекта с методами embed/answer, значит нет и пути к модели в обход резерва.
// OpenRouterProvider из входа пакета не экспортируется; `new OpenRouterProvider(` в боевом коде допустим только в этом
// файле, адрес OpenRouter — только в адаптере (страж S-11, packages/rag/tests/unit/guards.test.ts).
//
// Пределы и ключ не передаются ВООБЩЕ (index-jobs 08_review.md F-2, по устройству, а не стражем): фабрика сама один раз
// читает окружение процесса (process.env), проверяет его checkConfig по закрытому списку ниже и кэширует исход — и
// успех, и отказ. Параметров пределов, ключа или конфигурации у фабрики нет: лишнее поле в опциях — ConfigError, в типе
// его нет (ошибка компиляции). Выдуманное окружение сюда не подать: loadWebConfig(env) и прочие загрузчики больше не
// кормят дверь. Остаточный риск — код в репозитории, правящий process.env до первого вызова, — принят (05_completion.md).

import { checkConfig, ConfigError, type ConfigValues, LIMIT_VARIABLES, limitsFrom, type Pool, type VarSpec } from '@n6b/db';
import { constructGateway, type PaidGateway } from './paid-call.js';
import { OpenRouterProvider } from './provider/openrouter.js';

export interface LiveGatewayOptions {
  /** Служебный пул (n6b_app_service). */
  readonly pool: Pool;
  readonly log?: (line: string) => void;
}

/** Закрытый список двери: ключ модели и все семь пределов (пары «персональный ≤ общего» сверяет limitsFrom). */
const LIVE_REQUIRED: readonly VarSpec[] = [
  { name: 'OPENROUTER_API_KEY', kind: 'secret', consequence: 'вызовы модели невозможны' },
  ...Object.values(LIMIT_VARIABLES).map((name): VarSpec => ({ name, kind: 'limit',
    consequence: 'потолок расходов платной двери не определён' })),
];
/** Нужен только каналу visitor (web). Не задан — канал недоступен; задан — проверяется так же строго. */
const VISITOR_SPEC: VarSpec = { name: 'VISITOR_SECRET', kind: 'secret', consequence: 'ключ посетителя не построить' };
const ALLOWED_OPTIONS = new Set(['pool', 'log']);

type LiveSettings = { readonly config: ConfigValues; readonly visitorSecret: string | undefined };
let cached: { readonly ok: LiveSettings } | { readonly error: unknown } | undefined;

function liveSettings(): LiveSettings {
  if (!cached) {
    try {
      const env = process.env;
      const production = env.NODE_ENV === 'production';
      const config = checkConfig(LIVE_REQUIRED, [], env, production);
      limitsFrom(config);
      const visitorSecret = env.VISITOR_SECRET === undefined ? undefined
        : checkConfig([VISITOR_SPEC], [], env, production).VISITOR_SECRET as string;
      cached = { ok: { config, visitorSecret } };
    } catch (error) {
      cached = { error };
    }
  }
  if ('error' in cached) throw cached.error;
  return cached.ok;
}

export function createLiveGateway(options: LiveGatewayOptions): PaidGateway {
  const extra = Object.keys((options ?? {}) as object).filter((k) => !ALLOWED_OPTIONS.has(k));
  if (extra.length > 0) {
    throw new ConfigError('LIMIT_*', `конфигурация двери извне не принимается (${extra.join(', ')}): пределы и ключ `
      + 'читаются только из окружения процесса');
  }
  const { config, visitorSecret } = liveSettings();
  return constructGateway({ pool: options.pool, provider: new OpenRouterProvider(config.OPENROUTER_API_KEY as string),
    limits: limitsFrom(config), visitorSecret, log: options.log });
}
