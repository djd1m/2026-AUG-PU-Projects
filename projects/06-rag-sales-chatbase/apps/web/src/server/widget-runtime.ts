// Связка виджета для маршрутов: собирается ОДИН раз на процесс (как getCabinetDependencies).
import { allowMutation } from './rate-limit';
import { getRuntime } from './runtime';
import { createWidgetDependencies } from './widget-deps';
import type { WidgetDependencies } from './widget-handler';

const widgetGlobal = globalThis as typeof globalThis & { n6Widget?: WidgetDependencies };
export function getWidgetDependencies(): WidgetDependencies {
  return widgetGlobal.n6Widget ??= (() => {
    const { pool, redis, config } = getRuntime();
    return createWidgetDependencies({ pool, publicOrigin: config.publicOrigin, allowMutation: (ip) => allowMutation(redis, ip, config.sessionSecret) });
  })();
}
