// Единственная дверь к деньгам (01_plan.md §3): резерв квоты → START журнала → вызов провайдера → исход.
// Провайдер вызывается ТОЛЬКО отсюда (страж S-9 по исходнику). Порядок — это и есть защита:
//  1. BEGIN; reserveQuota(все ключи попытки, фиксированный порядок); INSERT model_call_log 'started'; COMMIT —
//     отказ любого ключа — исключение QuotaRefused, откат ВСЕЙ транзакции, провайдер 0 раз (SC-US-016-1, -4);
//  2. вызов провайдера ВНЕ транзакции: соединение пула уже отпущено (shared-resource-verification, вопрос 1);
//  3. UPDATE … WHERE state='started' — ровно один исход. Резерв не возвращается ни при каком исходе (счёт по попыткам,
//     SC-US-016-3). Скрытых повторов нет: одна попытка — один вызов порта.
// Набор ключей дверь выводит САМА из вида вызова (08_review.md F-1): вызывающий называет канал и владельца, а не ключи
// и не пределы. Общий потолок вида (answer:global, answer:sandbox:global, embed:global) не пропустить и не подменить;
// перед резервом набор ещё раз сверяется keySetViolation. n батча не ниже ⌈Σ длин / 4⌉.
// Создаётся дверь только фабрикой createLiveGateway (live.ts) — страж S-11 (08_review.md F-2). По устройству (index-jobs
// 08_review.md F-2): конструктор требует ключ GATEWAY_KEY, который не покидает этот модуль; вход пакета отдаёт PaidGateway
// только ТИПОМ, а constructGateway — не отдаёт вовсе. Снаружи пакета дверь не построить ни `new`, ни Reflect.construct,
// ни через `gateway.constructor`: без ключа — исключение до проверки пределов.

import {
  answerKeys, assertLimits, type CallOwner, embedKeys, finishCall, keySetViolation, type Limits, type Pool,
  type QuotaKey, moscowDay, reserveQuota, type ReserveKind, sandboxKeys, startCall, visitorKey, withService,
} from '@n6b/db';
import {
  type AnswerResult, type ChatMessage, DEADLINE_MS, type EmbedResult, ModelCallFailed, type ModelProvider,
  ProviderUnavailableError,
} from './provider/port.js';

export interface PaidCallDeps {
  /** Служебный пул (n6b_app_service). */
  readonly pool: Pool;
  readonly provider: ModelProvider;
  /** Потолки из Boot config check (limitsFrom); проверяются заново при создании двери. */
  readonly limits: Limits;
  /** VISITOR_SECRET: ключ посетителя строит дверь из IP и bot_id. Без него канал visitor недоступен (воркеру не нужен). */
  readonly visitorSecret?: string;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

type Invoke<T> = (provider: ModelProvider, signal: AbortSignal) => Promise<T>;
type Usage = { tokensIn?: number | null; tokensOut?: number | null };

/** Канал попытки ответа: посетитель (виджет, демо) — по адресу и боту; песочница — по аккаунту. */
export type AnswerChannel =
  | { readonly kind: 'visitor'; readonly ip: string; readonly botId: string }
  | { readonly kind: 'sandbox'; readonly accountId: string };

/** Нижняя граница оценки токенов батча: ⌈Σ длин / 4⌉, не меньше 1. Оценка вызывающего ниже неё — отказ. */
export function minBatchTokens(texts: readonly string[]): number {
  return Math.max(1, Math.ceil(texts.reduce((sum, t) => sum + t.length, 0) / 4));
}

/** Попытка ответа: ОДИН резерв покрывает эмбеддинг вопроса и генерацию (единица — «ответ», 01_plan.md §2). */
export interface AnswerAttempt {
  embedQuestion(question: string): Promise<readonly number[]>;
  generate(messages: readonly ChatMessage[]): Promise<AnswerResult>;
}

const GATEWAY_KEY: unique symbol = Symbol('PaidGateway: создаётся только внутри пакета rag');

/** Внутренняя сборка двери (фабрика live.ts и тесты пакета по пути). Из входа пакета не экспортируется. */
export function constructGateway(deps: PaidCallDeps): PaidGateway {
  return new PaidGateway(GATEWAY_KEY, deps);
}

export class PaidGateway {
  readonly #deps: PaidCallDeps;

  constructor(key: typeof GATEWAY_KEY, deps: PaidCallDeps) {
    if (key !== GATEWAY_KEY) throw new Error('PaidGateway не создаётся снаружи пакета rag: только фабрикой живой двери');
    assertLimits(deps.limits);
    this.#deps = deps;
  }

  #answerKeys(channel: AnswerChannel): QuotaKey[] {
    const { limits, visitorSecret } = this.#deps;
    switch (channel?.kind) {
      case 'visitor':
        if (!visitorSecret) throw new Error('VISITOR_SECRET не передан двери: ключ посетителя не построить');
        return answerKeys(limits, visitorKey(visitorSecret, channel.ip, channel.botId), channel.botId);
      case 'sandbox':
        return sandboxKeys(limits, channel.accountId);
      default:
        throw new Error('неизвестный канал попытки ответа: резерв не построить');
    }
  }

  /**
   * Резерв попытки ответа и START эмбеддинга вопроса одной транзакцией. Исчерпание — QuotaRefused (вызывающий: 429 и
   * question_log 'limited'); иначе — попытка, у которой каждый из двух вызовов разрешён ровно один раз.
   */
  async beginAnswer(channel: AnswerChannel, owner: CallOwner): Promise<AnswerAttempt> {
    const firstLogId = await this.#reserve(this.#answerKeys(channel), 'embed_question', owner);
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

  /**
   * Батч эмбеддингов индексации аккаунта. tokens — оценка вызывающего (js-tiktoken); без неё — нижняя граница
   * ⌈Σ длин / 4⌉. Оценка ниже нижней границы — отказ до резерва: заниженное n обходило бы предел токенов.
   */
  async embedIndexBatch(accountId: string, owner: CallOwner, texts: readonly string[], tokens?: number): Promise<EmbedResult> {
    if (!Array.isArray(texts) || texts.length === 0) throw new Error('пустой батч: резервировать нечего');
    if (!texts.every((t) => typeof t === 'string')) throw new Error('батч не из строк: оценку токенов не построить');
    const floor = minBatchTokens(texts);
    if (tokens !== undefined && !(Number.isSafeInteger(tokens) && tokens >= floor)) {
      throw new Error(`оценка токенов батча ниже нижней границы ⌈Σ длин / 4⌉ = ${floor}: резерв не построить`);
    }
    const logId = await this.#reserve(embedKeys(this.#deps.limits, accountId, tokens ?? floor), 'embed_index', owner);
    return this.#call(logId, DEADLINE_MS.embed_index, (p, s) => p.embed(texts, s), (r) => ({ tokensIn: r.tokensIn }));
  }

  async #reserve(keys: readonly QuotaKey[], kind: ReserveKind, owner: CallOwner): Promise<string> {
    const violation = keySetViolation(kind, keys, this.#deps.limits);
    if (violation) throw new Error(`резерв отвергнут: ${violation}`);
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
