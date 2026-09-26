// Связка предпросмотра для маршрутов: зависимости собираются ОДИН раз на процесс (как getRuntime).
import { createOpenRouter, spendRecorder } from '@n6/rag';
import { PREVIEW_JOB_BUDGET } from '@n6/queue';
import { createPreviewDependencies } from './preview-deps';
import type { PreviewDependencies } from './preview-handler';
import { allowMutation } from './rate-limit';
import { getIndexQueue, getRuntime } from './runtime';

const previewGlobal = globalThis as typeof globalThis & { n6Preview?: PreviewDependencies };
export function getPreviewDependencies(): PreviewDependencies {
  return previewGlobal.n6Preview ??= (() => {
    const { pool, redis, auth, config } = getRuntime();
    return createPreviewDependencies({
      pool, ceilings: config.ceilings, secret: config.sessionSecret, publicOrigin: config.publicOrigin, budget: PREVIEW_JOB_BUDGET,
      client: createOpenRouter(config.models), models: config.models, spend: spendRecorder(config.spendLog),
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token),
      enqueue: (message) => getIndexQueue().enqueue(message),
    });
  })();
}
