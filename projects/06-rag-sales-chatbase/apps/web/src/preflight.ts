// из N5: projects/05-podcast-clips-opus/apps/web/src/preflight.ts — конфиг из @n6/rag (LoadCeilings);
// + проба ANSWER_MODEL (фича quota-and-spend).
// Отказ старта web (FR-LIMIT-004): Dockerfile запускает этот файл ДО next start; код 1 и имя переменной.
import { loadWebConfig } from '@n6/rag';
import { readEnvironment } from './server/environment';
import { answerProbe } from './answer-probe';

async function preflight(): Promise<void> {
  const config = loadWebConfig(readEnvironment());
  await answerProbe(config.models, config.spendLog);
}
preflight().catch((error: unknown) => {
  console.error(`web не запущен: ${error instanceof Error ? error.message : 'не удалось проверить конфигурацию'}`);
  process.exit(1);
});
