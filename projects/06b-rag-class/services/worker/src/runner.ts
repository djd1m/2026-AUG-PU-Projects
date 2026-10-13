// Порт исполнителя задачи индексации. Фичи crawl-site, pdf-source и chunk-embed наполняют его: обход и извлечение
// вызывают ctx.progress после каждой страницы и ctx.checkpoint после каждой страницы и пакета эмбеддингов (Pseudocode
// «Worker lease loop» шаги 5–6). Цикл (loop.ts) отвечает за аренду, пульс, потолок и запись исхода — исполнитель их
// не трогает и SQL задачи не пишет.

import type { JobOutcome, LeasedJob } from './lease.js';

export interface JobContext {
  readonly job: LeasedJob;
  /** Сигнал отмены: аренда потеряна или пройден потолок — работу бросить, результат не писать. */
  readonly signal: AbortSignal;
  /** «Страниц N из M» (M неизвестно — null). Бросает JobLeaseLost, если задачу забрали. */
  progress(done: number, total: number | null): Promise<void>;
  /** Продлевает аренду и проверяет потолок 15 мин. Бросает JobLeaseLost или JobCeilingExceeded. */
  checkpoint(): Promise<void>;
}

export interface JobRunner {
  run(ctx: JobContext): Promise<JobOutcome>;
}

export class JobLeaseLost extends Error {
  constructor() { super('аренда задачи потеряна: её забрал другой исполнитель или уборщик'); this.name = 'JobLeaseLost'; }
}

export class JobCeilingExceeded extends Error {
  constructor() { super('превышено время задачи'); this.name = 'JobCeilingExceeded'; }
}

export const TEXT_NOT_CONNECTED = 'Индексация источников ещё не подключена: задача не выполнялась. '
  + 'Нажмите «Повторить», когда обработка станет доступна.';

/**
 * Заглушка до фич 4–6. Честный исход — «отказ» с причиной, а не «готово»: задача, которую никто не выполнял, не может
 * выглядеть выполненной (honest-configuration: никакого правдоподобного результата на неизвестном).
 */
export const notConnectedRunner: JobRunner = {
  async run() {
    return { state: 'failed', error: TEXT_NOT_CONNECTED };
  },
};

/** Выбор исполнителя по типу источника. Не подключённый тип — заглушка с честным отказом. */
export function dispatchRunner(runners: Partial<Record<LeasedJob['kind'], JobRunner>>): JobRunner {
  return { run: (ctx) => (runners[ctx.job.kind] ?? notConnectedRunner).run(ctx) };
}
