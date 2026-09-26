// Связка кабинета для маршрутов: зависимости собираются ОДИН раз на процесс (как getRuntime и getPreviewDependencies).
import { createOpenRouter, spendRecorder } from '@n6/rag';
import { createCabinetDependencies } from './cabinet-deps';
import type { CabinetDependencies } from './cabinet-handler';
import { allowMutation } from './rate-limit';
import { getIndexQueue, getRuntime } from './runtime';

const cabinetGlobal = globalThis as typeof globalThis & { n6Cabinet?: CabinetDependencies };
export function getCabinetDependencies(): CabinetDependencies {
  return cabinetGlobal.n6Cabinet ??= (() => {
    const { pool, redis, auth, config } = getRuntime();
    return createCabinetDependencies({
      pool, ceilings: config.ceilings, publicOrigin: config.publicOrigin,
      client: createOpenRouter(config.models), models: config.models, spend: spendRecorder(config.spendLog),
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token),
      enqueue: (message) => getIndexQueue().enqueue(message),
    });
  })();
}
