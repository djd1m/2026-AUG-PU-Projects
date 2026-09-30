// Единственная дверь к деньгам (01_plan.md §3): резерв квоты → START журнала → вызов провайдера → исход.
// Провайдер вызывается ТОЛЬКО отсюда (страж S-9 по исходнику). Порядок — это и есть защита:
//  1. BEGIN; reserveQuota(все ключи попытки, фиксированный порядок); INSERT model_call_log 'started'; COMMIT —
//     отказ любого ключа — исключение QuotaRefused, откат ВСЕЙ транзакции, провайдер 0 раз (SC-US-016-1, -4);
//  2. вызов провайдера ВНЕ транзакции: соединение пула уже отпущено (shared-resource-verification, вопрос 1);
//  3. UPDATE … WHERE state='started' — ровно один исход. Резерв не возвращается ни при каком исходе (счёт по попыткам,
//     SC-US-016-3). Скрытых повторов нет: одна попытка — один вызов порта.

import {
  type CallOwner, finishCall, type ModelCallKind, type Pool, type QuotaKey, moscowDay, reserveQuota, startCall,
  withService,
} from '@n6b/db';
import {
  type AnswerResult, type ChatMessage, DEADLINE_MS, type EmbedResult, ModelCallFailed, type ModelProvider,
  ProviderUnavailableError,
} from './provider/port.js';

export interface PaidCallDeps {
  /** Служебный пул (n6b_app_service). */
  readonly pool: Pool;
  readonly provider: ModelProvider;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

type Invoke<T> = (provider: ModelProvider, signal: AbortSignal) => Promise<T>;
type Usage = { tokensIn?: number | null; tokensOut?: number | null };

/** Попытка ответа: ОДИН резерв покрывает эмбеддинг вопроса и генерацию (единица — «ответ», 01_plan.md §2). */
export interface AnswerAttempt {
  embedQuestion(question: string): Promise<readonly number[]>;
  generate(messages: readonly ChatMessage[]): Promise<AnswerResult>;
}

export class PaidGateway {
  readonly #deps: PaidCallDeps;

  constructor(deps: PaidCallDeps) {
    this.#deps = deps;
  }

  /**
   * Резерв попытки ответа и START эмбеддинга вопроса одной транзакцией. Исчерпание — QuotaRefused (вызывающий: 429 и
   * question_log 'limited'); иначе — попытка, у которой каждый из двух вызовов разрешён ровно один раз.
   */
  async beginAnswer(keys: readonly QuotaKey[], owner: CallOwner): Promise<AnswerAttempt> {
    const firstLogId = await this.#reserve(keys, 'embed_question', owner);
    let embedded = false;
    let generated = false;
    return {
      embedQuestion: async (question) => {
        if (embedded) throw new Error('эмбеддинг вопроса уже вызван в этой попытке: повтор без резерва запрещён');
        embedded = true;
        const result = await this.#call(firstLogId, DEADLINE_MS.embed_question,
          (p, s) => p.embed([question], s), (r) => ({ tokensIn: r.tokensIn }));
        return result.vectors[0]!;
      },
      generate: async (messages) => {
        if (generated) throw new Error('генерация уже вызвана в этой попытке: повтор без резерва запрещён');
        generated = true;
        // START второго вызова той же попытки — отдельной короткой транзакцией, но ДО отправки.
        const logId = await withService(this.#deps.pool, (c) => startCall(c, 'answer', owner));
        return this.#call(logId, DEADLINE_MS.answer, (p, s) => p.answer(messages, s),
          (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut }));
      },
    };
  }

  /** Батч эмбеддингов индексации: keys несут n = оценку токенов батча (embedKeys). */
  async embedIndexBatch(keys: readonly QuotaKey[], owner: CallOwner, texts: readonly string[]): Promise<EmbedResult> {
    if (texts.length === 0) throw new Error('пустой батч: резервировать нечего');
    const logId = await this.#reserve(keys, 'embed_index', owner);
    return this.#call(logId, DEADLINE_MS.embed_index, (p, s) => p.embed(texts, s), (r) => ({ tokensIn: r.tokensIn }));
  }

  async #reserve(keys: readonly QuotaKey[], kind: ModelCallKind, owner: CallOwner): Promise<string> {
    const day = moscowDay(this.#deps.now?.() ?? new Date());
    try {
      return await withService(this.#deps.pool, async (c) => {
        await reserveQuota(c, keys, day);
        return startCall(c, kind, owner);
      });
    } catch (error) {
      if ((error as Error).name === 'QuotaRefused') {
        this.#deps.log?.(`paid-call: предел исчерпан (${(error as { scope: string }).scope.split(':').slice(0, 2).join(':')})`);
      }
      throw error;
    }
  }

  async #call<T>(logId: string, deadlineMs: number, invoke: Invoke<T>, usage: (r: T) => Usage): Promise<T> {
    const signal = AbortSignal.timeout(deadlineMs);
    let result: T;
    try {
      result = await invoke(this.#deps.provider, signal);
    } catch (error) {
      await this.#finish(logId, 'failed', {});
      if (error instanceof ModelCallFailed) {
        this.#deps.log?.(`paid-call: ${error.name}`);
        throw error;
      }
      // Неожиданная ошибка адаптера — тот же 503, попытка засчитана; текст не пробрасывается наружу.
      throw new ProviderUnavailableError(`неожиданная ошибка адаптера (${(error as Error).name})`);
    }
    await this.#finish(logId, 'succeeded', usage(result));
    return result;
  }

  async #finish(logId: string, outcome: 'succeeded' | 'failed', usage: Usage): Promise<void> {
    try {
      await withService(this.#deps.pool, (c) => finishCall(c, logId, outcome, usage));
    } catch (error) {
      // Деньги уже потрачены: строка остаётся 'started' = «исход неизвестен» на панели. Не маскируем результат вызова.
      this.#deps.log?.(`paid-call: исход ${outcome} не записан (${(error as Error).name}); попытка ${logId} останется started`);
    }
  }
}
