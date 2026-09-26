// Связка виджета для маршрутов: собирается ОДИН раз на процесс (как getCabinetDependencies).
import { createOpenRouter, spendRecorder } from '@n6/rag';
import { allowMutation } from './rate-limit';
import { getRuntime } from './runtime';
import { createWidgetAskDependencies } from './widget-ask-deps';
import type { WidgetAskDependencies } from './widget-ask-handler';

// Маршруты config/event/ask получают одну и ту же связку: у вопроса она шире (ядро ответа), у остальных — её часть.
const widgetGlobal = globalThis as typeof globalThis & { n6WidgetAsk?: WidgetAskDependencies };
export function getWidgetDependencies(): WidgetAskDependencies {
  return widgetGlobal.n6WidgetAsk ??= (() => {
    const { pool, redis, config } = getRuntime();
    return createWidgetAskDependencies({
      pool, ceilings: config.ceilings, publicOrigin: config.publicOrigin, secret: config.sessionSecret,
      client: createOpenRouter(config.models), models: config.models, spend: spendRecorder(config.spendLog),
      allowMutation: (ip) => allowMutation(redis, ip, config.sessionSecret),
    });
  })();
}
