// Боевая связка маршрутов виджета: SQL из @n6/db (packages/db/src/widget.ts). Одна функция для маршрутов и для
// tests/widget-config.integration.test.ts — тест подменяет только ограничитель двери.
import { loadWidgetBot, originAllowedAnywhere, recordBadgeEvent, recordWidgetInstall, type Pool } from '@n6/db';
import type { WidgetDependencies } from './widget-handler';

export function createWidgetDependencies(w: { pool: Pool; publicOrigin: string; secret: string; allowMutation: (ip: string) => Promise<boolean>; log?: (line: string) => void }): WidgetDependencies {
  const { pool, publicOrigin } = w;
  return {
    publicOrigin, secret: w.secret, allowMutation: w.allowMutation, log: w.log,
    loadBot: (key) => loadWidgetBot(pool, key),
    originAllowedAnywhere: (origin) => originAllowedAnywhere(pool, origin),
    recordInstall: (input) => recordWidgetInstall(pool, { ...input, publicOrigin }),
    recordBadgeEvent: (input) => recordBadgeEvent(pool, input),
  };
}
