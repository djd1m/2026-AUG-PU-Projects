// worker-index, стадия foundation: только отказ старта (FR-LIMIT-004) и отметка жизни для healthcheck
// compose. Задачи индексации (CrawlSite, ExtractPdf, ChunkDocument, EmbedAndStore) и EmbedProbe
// приходят с фичами index-job-core, quota-and-spend и далее — этот процесс ещё НИЧЕГО не индексирует.
import { writeFileSync } from 'node:fs';
import { loadWorkerConfig } from '@n6/rag';
import { readEnvironment } from './environment';

export const HEARTBEAT_FILE = '/tmp/n6-worker-heartbeat';
export const HEARTBEAT_INTERVAL_MS = 30_000;

function main(): void {
  try {
    loadWorkerConfig(readEnvironment());
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
  console.log('worker-index: конфигурация принята; очередь индексации ещё не подключена (index-job-core)');
}
if (require.main === module) main();
