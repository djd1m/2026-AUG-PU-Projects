// Исполнитель задачи индексации (Pseudocode «Worker lease loop» шаг 5: run(job) = Crawl site | Extract PDF, затем Chunk
// and embed). Извлечение — фичи crawl-site и pdf-source (подключаются в extractors); пока его нет для типа источника —
// честный отказ заглушки, а не «готово». После извлечения — шаг «нарезать и эмбеддить» (embed.ts).
//
// Исходы, которые видит владелец (long-job-contract: три различимых состояния, причина — текстом):
//   предел embed:* исчерпан   → failed «исчерпан суточный предел индексации, продолжение завтра» (повтор продолжит);
//   провайдер/дедлайн/схема   → failed «сервис эмбеддингов временно недоступен» (попытка засчитана дверью);
//   аренда потеряна / потолок → исключение наверх: цикл (loop.ts) сам решает, писать ли исход.

import { type Pool } from '@n6b/db';
import { ModelCallFailed, type PaidGateway } from '@n6b/rag';
import { chunkAndEmbedSource } from './embed.js';
import type { JobOutcome, LeasedJob } from './lease.js';
import { type JobContext, type JobRunner, notConnectedRunner } from './runner.js';

export const TEXT_EMBED_LIMIT = 'Исчерпан суточный предел индексации: продолжение завтра. Нажмите «Повторить» завтра — '
  + 'уже обработанные фрагменты сохранятся и не будут оплачены повторно.';
export const TEXT_EMBED_UNAVAILABLE = 'Сервис эмбеддингов временно недоступен. Нажмите «Повторить» — '
  + 'уже обработанные фрагменты сохранятся.';

/** Извлечение текста источника в document. null — извлечено, идём дальше; исход — задача закончена им (отказ). */
export type Extractor = (ctx: JobContext) => Promise<JobOutcome | null>;

export interface IndexRunnerDeps {
  readonly pool: Pool;
  readonly gateway: PaidGateway;
  readonly extractors: Partial<Record<LeasedJob['kind'], Extractor>>;
  readonly batchSize?: number;
}

export function createIndexRunner(deps: IndexRunnerDeps): JobRunner {
  return {
    async run(ctx) {
      const extract = deps.extractors[ctx.job.kind];
      if (!extract) return notConnectedRunner.run(ctx);
      const extracted = await extract(ctx);
      if (extracted) return extracted;
      try {
        await chunkAndEmbedSource(ctx, { pool: deps.pool, gateway: deps.gateway, batchSize: deps.batchSize });
      } catch (error) {
        if ((error as Error)?.name === 'QuotaRefused') return { state: 'failed', error: TEXT_EMBED_LIMIT };
        if (error instanceof ModelCallFailed) return { state: 'failed', error: TEXT_EMBED_UNAVAILABLE };
        throw error;
      }
      return { state: 'succeeded' };
    },
  };
}
