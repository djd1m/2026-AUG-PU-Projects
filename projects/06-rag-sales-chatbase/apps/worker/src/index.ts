// worker-index: отказ старта (FR-LIMIT-004), затем EmbedProbe (FR-INDEX-002, фича quota-and-spend), затем
// очередь индексации и сторож (фича index-job-core, ADR-009), затем отметка жизни для healthcheck compose.
// Источник «сайт» — CrawlSite (фича crawler); PDF, фрагменты и эмбеддинги — фичи pdf-source/chunk-embed;
// до них PDF-задача закрывается internal (noProcessorYet), а не висит «выполняется».
// Подключение Worker BullMQ — по образцу N5 apps/worker/src/index.ts (concurrency 1: вежливость краулера).
import { writeFileSync } from 'node:fs';
import { Worker } from 'bullmq';
import { loadWorkerConfig } from '@n6/rag';
import { createPool } from '@n6/db';
import { createIndexQueue, getRedisConnection, INDEX_QUEUE, type IndexMessage } from '@n6/queue';
import { readEnvironment } from './environment';
import { embedProbe } from './embed-probe';
import { noProcessorYet, processByKind, runIndexJob } from './run-index-job';
import { createSiteProcessor } from './crawl/site-processor';
import { userAgentFor } from './crawl/limits';
import { startWatchdog, watchdogTick } from './watchdog';

export const HEARTBEAT_FILE = '/tmp/n6-worker-heartbeat';
export const HEARTBEAT_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  let dimensions: number;
  let config: ReturnType<typeof loadWorkerConfig>;
  try {
    config = loadWorkerConfig(readEnvironment());
    dimensions = await embedProbe(config.models, config.spendLog);
  } catch (error) {
    console.error(`worker-index не запущен: ${error instanceof Error ? error.message : 'не удалось проверить конфигурацию'}`);
    process.exit(1);
  }
  const pool = createPool(config.databaseUrl);
  pool.on('error', () => console.error('Соединение БД потеряно: задачи индексации временно не арендуются'));
  const queue = createIndexQueue(config);
  const site = createSiteProcessor({ pool, userAgent: userAgentFor(config.publicOrigin) });
  const deps = { pool, enqueue: queue.enqueue, process: processByKind(pool, { site, pdf: noProcessorYet }) };
  const worker = new Worker<IndexMessage>(INDEX_QUEUE, async (job) => runIndexJob(deps, job.data),
    { connection: getRedisConnection(config, true), concurrency: 1 });
  worker.on('error', () => console.error('Транспорт заданий индексации недоступен'));
  const stopWatchdog = startWatchdog(() => watchdogTick(pool, queue.enqueue));
  const beat = () => writeFileSync(HEARTBEAT_FILE, String(Date.now()));
  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  const stop = () => {
    clearInterval(timer); stopWatchdog();
    void Promise.allSettled([worker.close(), queue.close()]).then(() => pool.end()).finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log(`worker-index: конфигурация принята; EmbedProbe: ${dimensions} измерений; очередь «${INDEX_QUEUE}» и сторож запущены`);
}
if (require.main === module) void main();
