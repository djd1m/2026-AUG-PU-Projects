// Точка входа воркера: проверка конфигурации при старте (exit 1 с именем переменной), цикл аренды задач индексации
// (loop.ts) и файл-пульс для healthcheck compose. Исполнитель источников — заглушка с честным отказом до фич crawl-site,
// pdf-source и chunk-embed: задача получает «ошибка + Повторить» с причиной, а не вечное «выполняется» и не «готово».

import { writeFileSync } from 'node:fs';
import { createPool, enforceBootConfig } from '@n6b/db';
import { loadWorkerConfig } from './config.js';
import { startWorker } from './loop.js';
import { dispatchRunner } from './runner.js';

const config = enforceBootConfig(() => loadWorkerConfig());
const pool = createPool(config.DATABASE_URL_SERVICE as string, 'DATABASE_URL_SERVICE');
const worker = startWorker({ pool, runner: dispatchRunner({}) });
console.log('worker: конфигурация принята; аренда задач запущена (исполнители источников не подключены — честный отказ)');

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
