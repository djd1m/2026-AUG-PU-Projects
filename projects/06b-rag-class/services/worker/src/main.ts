// Точка входа воркера. В foundation: проверка конфигурации при старте (exit 1 с именем переменной) и файл-пульс для
// healthcheck compose. Цикл аренды задач (Pseudocode «Worker lease loop») — фича index-jobs; до неё воркер честно
// сообщает в журнал, что задач не берёт, а не изображает работу.

import { writeFileSync } from 'node:fs';
import { enforceBootConfig } from '@n6b/db';
import { loadWorkerConfig } from './config.js';

enforceBootConfig(() => loadWorkerConfig());

const pulse = process.env.N6B_WORKER_PULSE;
console.log('worker: конфигурация принята; аренда задач не реализована (фича index-jobs)');
if (pulse) {
  const beat = () => writeFileSync(pulse, new Date().toISOString());
  beat();
  setInterval(beat, 30_000);
}
