// Интерфейс поставщика модели. Доменная логика не знает формы ответа чужого сервиса:
// адаптер переводит чужое в наши типы на границе (`coding-style.md`).
//
// В СХЕМЕ ОТВЕТА НЕТ ПОЛЕЙ `calories`, `kcal`, `protein`, `fat`, `carbs` — и это ADR-001,
// а не экономия. Число, которое видит пользователь, считается из базы; единственное поле
// о калорийности здесь — `modelEstimateKcal`, и у него ровно одно назначение: быть ЛЕВЫМ
// числом на экране расхождения. Оно не показывается как результат и не участвует в
// арифметике итога. Свойство стережёт `tests/unit/source-guards.test.ts`.

// РАСШИРЕНИЕ фичи `scan-pipeline` (FR-scan-pipeline-6, PC-09/PC2-02): `model` и
// `deadlineMs`/`signal` переданы ВЫЗЫВАЮЩИМ кодом явно, а не выбираются интерфейсом.
// Статус: внесено в план `foundation` координатором 2026-09-12 20:33 (см.
// `03_architecture.md` «Зависимости от foundation»); в ЭТОМ worktree реализовано ЗДЕСЬ,
// т.к. `lease.ts`/`fake.ts` foundation ещё не несли расширенную сигнатуру на момент
// исполнения этой квитанции — координатор сверяет при слиянии (см. `receipts/impl-scan-pipeline.md`).
export interface ModelRequest {
  readonly scanId: string;
  /** Ключ НОРМАЛИЗОВАННОЙ копии кадра в приватном бакете. Не URL и не байты. */
  readonly imageKey: string;
  readonly model: 'haiku-4.5' | 'sonnet-5';
  /** Дедлайн ЭТОГО вызова, мс — `min(25_000, remaining)` (FR-scan-pipeline-20). */
  readonly deadlineMs: number;
  /** Обрывает HTTP-вызов немедленно по истечении бюджета (PC2-02). */
  readonly signal: AbortSignal;
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
  /**
   * МОДЕЛЬ, с которой БЫЛ сделан этот вызов — эхо запроса, не выбор ответа
   * (AC-scan-pipeline-29). Без этого поля фейк формы ответа не способен доказать, что
   * эскалация ушла именно с `N4_MODEL_ESCALATION`, а не повторно с `N4_MODEL_PRIMARY`.
   */
  readonly model: 'haiku-4.5' | 'sonnet-5';
}

export interface ModelProvider {
  readonly kind: 'fake' | 'live';
  recognize(request: ModelRequest): Promise<ModelResponse>;
}

/**
 * Сигнал ЛЮБОЙ реализации `ModelProvider`: ответ пришёл, но не соответствует схеме
 * (RV-scan-pipeline-08) — ОТДЕЛЬНЫЙ от `ProviderUnavailableError`/сетевого сбоя случай.
 * Живёт здесь, а не в `provider/live.ts`, чтобы `recognize-scan.ts` (доменная логика,
 * не знающая формы ответа конкретного провайдера) могла классифицировать его как
 * `failed(schema_violation)`, а не как `failed(provider_unavailable)`, не завися от
 * конкретной реализации порта.
 */
export class ModelSchemaViolationError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`ответ провайдера не соответствует схеме: ${field}`);
    this.name = 'ModelSchemaViolationError';
    this.field = field;
  }
}
