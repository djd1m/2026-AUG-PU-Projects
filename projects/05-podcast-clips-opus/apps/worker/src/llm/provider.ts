// Adapted from jan-clone llm-router: one OpenRouter path, no BYOK or fallback.
import type { LlmConfig } from '@clipmaker/shared/config';
import { FRAGMENTS_SCHEMA, SELECT_TIMEOUT_MS, FragmentSchemaError } from '@clipmaker/shared/fragments';
import type { TranscriptResult } from '@clipmaker/shared/transcript';
import { SYSTEM_PROMPT, selectionMessage } from './prompts/selection.js';
export interface Selector { select(transcript: TranscriptResult, duration: number, signal: AbortSignal): Promise<unknown> }
export class SelectionProviderError extends Error {
  constructor(public readonly outcome: 'timeout' | 'provider_error') { super('Поставщик выделения не завершил запрос'); }
}
export function createSelector(config: LlmConfig, request: typeof fetch = fetch): Selector {
  return { async select(transcript, duration, signal) {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(SELECT_TIMEOUT_MS)]);
    try {
      const response = await request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: selectionMessage(transcript, duration) }],
          response_format: { type: 'json_schema', json_schema: { name: 'fragments', strict: true, schema: FRAGMENTS_SCHEMA } },
          provider: { only: config.model === 'anthropic/claude-sonnet-5' ? ['Anthropic', 'Claude Platform on AWS'] : ['Google'],
            allow_fallbacks: false, require_parameters: true },
        }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new SelectionProviderError('provider_error'); }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) throw new FragmentSchemaError();
      const choice: unknown = body.choices[0];
      if (!choice || typeof choice !== 'object' || !('message' in choice) ||
        !choice.message || typeof choice.message !== 'object' || !('content' in choice.message) ||
        typeof choice.message.content !== 'string' || ('refusal' in choice.message && choice.message.refusal)) throw new FragmentSchemaError();
      return JSON.parse(choice.message.content) as unknown;
    } catch (error) {
      if (combined.aborted) throw new SelectionProviderError('timeout');
      if (error instanceof SyntaxError) throw new FragmentSchemaError();
      if (error instanceof TypeError) throw new SelectionProviderError('provider_error');
      throw error;
    }
  } };
}
