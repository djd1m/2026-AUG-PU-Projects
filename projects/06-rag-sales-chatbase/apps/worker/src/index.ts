// worker-index: отказ старта (FR-LIMIT-004), затем EmbedProbe (FR-INDEX-002, фича quota-and-spend), затем
// отметка жизни для healthcheck compose. Задачи индексации (CrawlSite, ExtractPdf, ChunkDocument,
// EmbedAndStore) приходят с фичей index-job-core — этот процесс ещё НИЧЕГО не индексирует.
import { writeFileSync } from 'node:fs';
import { loadWorkerConfig } from '@n6/rag';
import { readEnvironment } from './environment';
import { embedProbe } from './embed-probe';

export const HEARTBEAT_FILE = '/tmp/n6-worker-heartbeat';
export const HEARTBEAT_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  let dimensions: number;
  try {
    const config = loadWorkerConfig(readEnvironment());
    dimensions = await embedProbe(config.models, config.spendLog);
  } catch (error) {
    console.error(`worker-index не запущен: ${error instanceof Error ? error.message : 'не удалось проверить конфигурацию'}`);
    process.exit(1);
  }
  const beat = () => writeFileSync(HEARTBEAT_FILE, String(Date.now()));
  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  const stop = () => { clearInterval(timer); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log(`worker-index: конфигурация принята; EmbedProbe: ${dimensions} измерений; очередь индексации ещё не подключена (index-job-core)`);
}
if (require.main === module) void main();
