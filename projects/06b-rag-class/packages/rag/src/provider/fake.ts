// Адаптер `fake` — перенос N4 apps/recognizer/src/provider/fake.ts (#16): детерминированный, без сетевого клиента,
// с управляемыми исходами и задержкой и счётчиком вызовов. Только для тестов: боевой код его не импортирует (страж S-6),
// селектора fake/live в окружении нет (01_plan.md §7).

import { createHash } from 'node:crypto';
import {
  type AnswerPayload, type AnswerResult, type ChatMessage, EMBED_DIMENSIONS, type EmbedResult, ModelDeadlineExceeded,
  type ModelProvider, ModelSchemaViolationError, ProviderUnavailableError,
} from './port.js';

export type FakeOutcome = 'ok' | 'timeout' | 'unavailable' | 'error-in-200' | 'schema' | 'hang';

export interface FakeOptions {
  /** Очередь исходов по порядку вызовов; кончилась — 'ok'. */
  readonly outcomes?: readonly FakeOutcome[];
  readonly delayMs?: number;
  readonly answer?: AnswerPayload;
}

function vectorFor(text: string): number[] {
  const seed = createHash('sha256').update(text).digest();
  return Array.from({ length: EMBED_DIMENSIONS }, (_, i) => (seed[i % seed.length]! - 128) / 128);
}

export class FakeProvider implements ModelProvider {
  readonly calls = { embed: 0, answer: 0 };
  /** Вызовы, начатые и ещё не завершённые — для теста «соединение пула не держится во время вызова». */
  inFlight = 0;
  maxInFlight = 0;
  readonly #outcomes: FakeOutcome[];

  constructor(private readonly options: FakeOptions = {}) {
    this.#outcomes = [...(options.outcomes ?? [])];
  }

  get total(): number {
    return this.calls.embed + this.calls.answer;
  }

  async #run<T>(signal: AbortSignal, ok: () => T): Promise<T> {
    const outcome = this.#outcomes.shift() ?? 'ok';
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (outcome === 'hang') {
        await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new ModelDeadlineExceeded()),
          { once: true }));
      }
      if (this.options.delayMs) await new Promise((r) => setTimeout(r, this.options.delayMs));
      if (outcome === 'timeout') throw new ModelDeadlineExceeded();
      if (outcome === 'unavailable') throw new ProviderUnavailableError('HTTP 503');
      if (outcome === 'error-in-200') throw new ProviderUnavailableError('error в теле 200');
      if (outcome === 'schema') throw new ModelSchemaViolationError('fake: нарушение схемы');
      return ok();
    } finally {
      this.inFlight -= 1;
    }
  }

  embed(texts: readonly string[], signal: AbortSignal): Promise<EmbedResult> {
    this.calls.embed += 1;
    return this.#run(signal, () => ({ vectors: texts.map(vectorFor),
      tokensIn: texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0) }));
  }

  answer(_messages: readonly ChatMessage[], signal: AbortSignal): Promise<AnswerResult> {
    this.calls.answer += 1;
    const payload = this.options.answer ?? { answer: 'fake', cited_ids: [], unknown: true };
    return this.#run(signal, () => ({ ...payload, tokensIn: 100, tokensOut: 20 }));
  }
}
