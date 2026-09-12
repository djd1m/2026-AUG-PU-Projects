// Интерфейс поставщика модели. Доменная логика не знает формы ответа чужого сервиса:
// адаптер переводит чужое в наши типы на границе (`coding-style.md`).
//
// В СХЕМЕ ОТВЕТА НЕТ ПОЛЕЙ `calories`, `kcal`, `protein`, `fat`, `carbs` — и это ADR-001,
// а не экономия. Число, которое видит пользователь, считается из базы; единственное поле
// о калорийности здесь — `modelEstimateKcal`, и у него ровно одно назначение: быть ЛЕВЫМ
// числом на экране расхождения. Оно не показывается как результат и не участвует в
// арифметике итога. Свойство стережёт `tests/unit/source-guards.test.ts`.

export interface ModelRequest {
  readonly scanId: string;
  /** Ключ НОРМАЛИЗОВАННОЙ копии кадра в приватном бакете. Не URL и не байты. */
  readonly imageKey: string;
  readonly model: 'haiku-4.5' | 'sonnet-5';
}

export interface RecognizedItemDraft {
  readonly labelRu: string;
  readonly massG: number;
  /** До трёх идентификаторов записей базы — КАНДИДАТЫ, а не готовый ответ. */
  readonly candidates: readonly string[];
}

export interface ModelResponse {
  readonly items: readonly RecognizedItemDraft[];
  readonly confidence: number;
  readonly modelEstimateKcal: number;
}

export interface ModelProvider {
  readonly kind: 'fake' | 'live';
  recognize(request: ModelRequest): Promise<ModelResponse>;
}
