// Порт поставщика модели. Доменная логика не знает формы ответа чужого сервиса:
// адаптер переводит чужое в наши типы на границе (`coding-style.md`).
//
// В СХЕМЕ ОТВЕТА НЕТ ПОЛЕЙ `calories`, `kcal`, `protein`, `fat`, `carbs` — и это ADR-001,
// а не экономия. Число, которое видит пользователь, считается из базы; единственное поле
// о калорийности здесь — `modelEstimateKcal`, и у него ровно одно назначение: быть ЛЕВЫМ
// числом на экране расхождения. Оно не показывается как результат и не участвует в
// арифметике итога. Свойство стережёт `tests/unit/source-guards.test.ts`.
//
// МОДЕЛЬ ВЫБИРАЕТ ВЫЗЫВАЮЩИЙ, а не порт (DEC-A-015). Порт, решающий это сам, прячет
// эскалацию внутри адаптера: снаружи не видно, какой вызов оплачен дороже, и потолок
// эскалаций нечем сопоставить с фактом. Поэтому `model` — ПАРАМЕТР, и он же возвращается
// в ответе: «о какой модели этот ответ» обязано читаться из самого ответа, а не
// восстанавливаться по памяти вызывающего.
//
// ДЕДЛАЙН ТОЖЕ ПРИХОДИТ СНАРУЖИ. Бюджет принадлежит ОПЕРАЦИИ целиком (нормализация плюс
// вызов), а не отдельному вызову, и складывать два независимых таймаута нельзя: сумма
// молча превысит общий бюджет. Арифметика бюджета — фича `scan-pipeline`; здесь порт
// обязан лишь ЧЕСТНО отказать по названному дедлайну.

/** Идентификаторы моделей канона §6 (ADR-004). Закрытый набор живёт в КОДЕ. */
export const MODEL_IDS = ['haiku-4.5', 'sonnet-5'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

/** Кадр, отдаваемый модели: НОРМАЛИЗОВАННАЯ копия, не оригинал пользователя. */
export interface ModelImage {
  readonly scanId: string;
  /** Ключ объекта в приватном бакете. Не URL и не байты: подпись выдаётся отдельно. */
  readonly objectKey: string;
}

/**
 * Схема ответа (structured outputs). Перечислена ЦЕЛИКОМ, другого в ней нет.
 * Передаётся параметром, а не зашита в адаптер: страж ADR-001 обязан читать ОДНО место,
 * а не искать схему по всем реализациям порта.
 */
export interface ModelResponseSchema {
  readonly name: string;
  readonly fields: readonly string[];
}

export const MODEL_RESPONSE_SCHEMA: ModelResponseSchema = {
  name: 'n4_recognition_v1',
  // `items[]` (label_ru, mass_g, candidates), `confidence`, `model_estimate_kcal` — и всё.
  fields: ['items', 'confidence', 'model_estimate_kcal'],
};

export interface ModelCallOptions {
  /** Какую модель звать. Решает ВЫЗЫВАЮЩИЙ. */
  readonly model: ModelId;
  /** Сколько миллисекунд у вызова осталось. Ноль и отрицательное — уже поздно. */
  readonly deadlineMs: number;
  /**
   * ОБЩИЙ сигнал отмены операции. Обязателен: бюджет принадлежит операции целиком
   * (нормализация плюс вызов), и обрывать её надо ОДНИМ сигналом. Необязательное поле
   * означало бы, что половина вызывающих его не передаёт, и платная работа продолжается
   * после того, как ответ уже никому не нужен.
   */
  readonly signal: AbortSignal;
}

export interface RecognizedItemDraft {
  readonly labelRu: string;
  readonly massG: number;
  /** До трёх идентификаторов записей базы — КАНДИДАТЫ, а не готовый ответ. */
  readonly candidates: readonly string[];
}

export interface ModelResponse {
  /** Модель, которая ответила. Эхо `opts.model`: ответ сам говорит, чей он. */
  readonly model: ModelId;
  readonly items: readonly RecognizedItemDraft[];
  readonly confidence: number;
  readonly modelEstimateKcal: number;
}

/**
 * Дедлайн истёк. ОТКАЗ, а не пустой ответ и не «результат подешевле»: пустой ответ
 * неотличим от разбора пустой тарелки, а деградация — это предел, о котором никто не
 * узнал.
 */
export class ModelCallAborted extends Error {
  constructor() {
    super('вызов модели прерван сигналом отмены');
    // Имя стандартное: вызывающий отличает отмену от прочих отказов по `name`, как у
    // `AbortController` в платформе.
    this.name = 'AbortError';
  }
}

export class ModelDeadlineExceeded extends Error {
  readonly deadlineMs: number;
  constructor(deadlineMs: number) {
    super(`дедлайн вызова модели истёк: ${deadlineMs} мс`);
    this.name = 'ModelDeadlineExceeded';
    this.deadlineMs = deadlineMs;
  }
}

export interface ModelProvider {
  readonly kind: 'fake' | 'live';
  recognize(image: ModelImage, schema: ModelResponseSchema, opts: ModelCallOptions): Promise<ModelResponse>;
}
