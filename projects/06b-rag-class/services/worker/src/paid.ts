// Платная дверь процесса worker (страж S-12: единственное место createLiveGateway в воркере). Фабрика сама читает ключ и
// ВСЕ семь пределов из окружения процесса (index-jobs F-2) — поэтому конфигурация воркера требует полную связку
// (config.ts), и без неё процесс не стартует, а не падает на первой задаче. Эмбеддинги индексации идут только через
// gateway.embedIndexBatch: резерв embed:account и embed:global ДО вызова.

import type { Pool } from '@n6b/db';
import { createLiveGateway, type PaidGateway } from '@n6b/rag';

export function createWorkerGateway(servicePool: Pool): PaidGateway {
  return createLiveGateway({ pool: servicePool, log: (line) => console.warn(line) });
}
