// `LiveModelProvider` — вторая реализация `ModelProvider` поверх Anthropic Messages API
// (vision + structured outputs), FR-scan-pipeline-13. Ключа на этой машине нет (DEC-A-009):
// «живое распознавание не выполнено: нет ключа» — состояние, а не пропуск. Живой режим НЕ
// является предметом тестов этой фичи.
//
// Схема ответа НЕ несёт `calories`/`kcal`/`protein`/`fat`/`carbs` (ADR-001) — только
// `items[]` (label_ru, mass_g, candidates ≤ 3), `confidence`, `model_estimate_kcal`.
// Скрытые повторы SDK отключены явно (`maxRetries: 0`, FR-scan-pipeline-6): единственный
// законный источник второго вызова на попытку — эскалация, не библиотека.

import Anthropic from '@anthropic-ai/sdk';
import type { ModelProvider, ModelRequest, ModelResponse } from './types.js';

// Без `as const`: SDK ожидает МУТАБЕЛЬНЫЙ `Tool.InputSchema` (обычные `string[]`, не
// readonly-кортежи) — форма схемы от этого не меняется, только тип объявления в TS.
const RESPONSE_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          label_ru: { type: 'string' },
          mass_g: { type: 'number' },
          candidates: { type: 'array', maxItems: 3, items: { type: 'string' } },
        },
        required: ['label_ru', 'mass_g', 'candidates'],
      },
    },
    confidence: { type: 'number' },
    model_estimate_kcal: { type: 'number' },
  },
  required: ['items', 'confidence', 'model_estimate_kcal'],
};

export class ProviderUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`провайдер недоступен: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'ProviderUnavailableError';
  }
}

export class SchemaViolationError extends Error {
  constructor(field: string) {
    super(`ответ провайдера не соответствует схеме: ${field}`);
    this.name = 'SchemaViolationError';
  }
}

export interface ImageFetcher {
  /** Загружает нормализованную копию по ключу и возвращает base64 + mime. */
  fetchBase64(imageKey: string): Promise<{ base64: string; mime: 'image/jpeg' }>;
}

export function createLiveModelProvider(apiKey: string, images: ImageFetcher): ModelProvider {
  // `maxRetries: 0` — FR-scan-pipeline-6: единственный второй вызов на попытку — эскалация.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  return {
    kind: 'live',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      const image = await images.fetchBase64(request.imageKey);

      let raw: string;
      try {
        const response = await client.messages.create(
          {
            model: request.model === 'sonnet-5' ? 'claude-sonnet-5' : 'claude-haiku-4-5',
            max_tokens: 1024,
            tools: [
              {
                name: 'report_ingredients',
                description: 'Сообщить распознанные ингредиенты по строгой схеме',
                input_schema: RESPONSE_SCHEMA,
              },
            ],
            tool_choice: { type: 'tool', name: 'report_ingredients' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
                  {
                    type: 'text',
                    text: 'Определи ингредиенты и массу порции на фото. Не оценивай калорийность как результат — только как model_estimate_kcal.',
                  },
                ],
              },
            ],
          },
          { signal: request.signal, timeout: request.deadlineMs },
        );
        const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
        if (toolUse === undefined) throw new SchemaViolationError('нет structured-output блока в ответе');
        raw = JSON.stringify(toolUse.input);
      } catch (error) {
        if (error instanceof SchemaViolationError) throw error;
        throw new ProviderUnavailableError(error);
      }

      const parsed = JSON.parse(raw) as {
        items: Array<{ label_ru: string; mass_g: number; candidates: string[] }>;
        confidence: number;
        model_estimate_kcal: number;
      };

      return {
        items: parsed.items.map((item) => ({ labelRu: item.label_ru, massG: item.mass_g, candidates: item.candidates })),
        confidence: parsed.confidence,
        modelEstimateKcal: parsed.model_estimate_kcal,
        model: request.model,
      };
    },
  };
}
