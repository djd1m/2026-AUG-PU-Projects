// Точка входа воркера: проверка конфигурации при старте (exit 1 с именем переменной), платная дверь (paid.ts; без полной
// связки пределов — exit 1), цикл аренды задач индексации (loop.ts) и файл-пульс для healthcheck compose. Исполнитель —
// createIndexRunner: извлечение по типу источника (фичи crawl-site, pdf-source; пока не подключено — честный отказ
// «ошибка + Повторить»), затем «нарезать и эмбеддить» (chunk-embed).

import { writeFileSync } from 'node:fs';
import { createPool, enforceBootConfig } from '@n6b/db';
import { createSiteExtractor } from './crawl/site.js';
import { loadWorkerConfig } from './config.js';
import { createIndexRunner } from './index-runner.js';
import { startWorker } from './loop.js';
import { createWorkerGateway } from './paid.js';

const config = enforceBootConfig(() => loadWorkerConfig());
const pool = createPool(config.DATABASE_URL_SERVICE as string, 'DATABASE_URL_SERVICE');
const gateway = enforceBootConfig(() => createWorkerGateway(pool));
const crawl = createSiteExtractor({ pool });
const indexing = createIndexRunner({ pool, gateway, extractors: { site: crawl.extract } });
const worker = startWorker({ pool, runner: { run: async (ctx) => {
  const result = await indexing.run(ctx);
  return result.state === 'succeeded' ? { ...result, note: crawl.note(ctx) } : result;
} } });
console.log('worker: конфигурация и платная дверь приняты; аренда задач и обход сайта подключены');

const pulse = process.env.N6B_WORKER_PULSE;
let beat: NodeJS.Timeout | undefined;
if (pulse) {
  const write = () => writeFileSync(pulse, new Date().toISOString());
  write();
  beat = setInterval(write, 30_000);
}

const shutdown = (signal: string) => {
  console.log(`worker: ${signal}, останавливаюсь после текущей задачи`);
  if (beat) clearInterval(beat);
  void worker.stop().then(() => pool.end()).then(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
