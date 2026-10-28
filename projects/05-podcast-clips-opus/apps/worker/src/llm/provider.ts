// One request to the selected fixed endpoint; no repair or provider fallback.
import { createCloudruTransport } from './cloudru-transport.js';
import type { LlmConfig } from '@clipmaker/shared/config';
import { FRAGMENTS_SCHEMA, SELECT_TIMEOUT_MS, FragmentSchemaError } from '@clipmaker/shared/fragments';
import type { TranscriptResult } from '@clipmaker/shared/transcript';
import { SYSTEM_PROMPT, CLOUDRU_SYSTEM_PROMPT, selectionMessage } from './prompts/selection.js';
export interface Selector { select(transcript: TranscriptResult, duration: number, signal: AbortSignal): Promise<unknown> }
const TRANSPORT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']);
function ownValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; } catch { return undefined; }
}
function transportCode(error: unknown): string | undefined {
  for (const candidate of [error, ownValue(error, 'cause')]) {
    const code = ownValue(candidate, 'code');
    if (typeof code === 'string' && TRANSPORT_CODES.has(code)) return code;
  }
  return undefined;
}
export class SelectionProviderError extends Error {
  constructor(public readonly outcome: 'timeout' | 'provider_error',
    public readonly kind: 'http' | 'transport' | 'unknown' = 'unknown',
    public readonly code?: string, public readonly status?: number) {
    super('Поставщик выделения не завершил запрос');
  }
}
const CLOUDRU_SELECT_TIMEOUT_MS = 600000;
export function createSelector(config: LlmConfig, request: typeof fetch = fetch): Selector {
  return { async select(transcript, duration, signal) {
    const cloudru = config.provider === 'cloudru';
    const combined = AbortSignal.any([signal, AbortSignal.timeout(cloudru ? CLOUDRU_SELECT_TIMEOUT_MS : SELECT_TIMEOUT_MS)]);
    const transport = cloudru ? createCloudruTransport(CLOUDRU_SELECT_TIMEOUT_MS) : undefined;
    try {
      const response = await request(cloudru ? 'https://foundation-models.api.cloud.ru/v1/chat/completions' :
        'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: combined,
        ...(transport ? { dispatcher: transport.dispatcher } : {}),
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model,
          messages: [{ role: 'system', content: cloudru ? CLOUDRU_SYSTEM_PROMPT : SYSTEM_PROMPT }, { role: 'user', content: selectionMessage(transcript, duration) }],
          ...(cloudru ? { stream: false, response_format: { type: 'json_object' } } : {
          response_format: { type: 'json_schema', json_schema: { name: 'fragments', strict: true, schema: FRAGMENTS_SCHEMA } },
          provider: { only: config.model === 'anthropic/claude-sonnet-5' ? ['Anthropic', 'Claude Platform on AWS'] : ['Google'],
            allow_fallbacks: false, require_parameters: true },
          }),
        }),
      });
      combined.throwIfAborted();
      if (!response.ok) {
        // Cancellation failure must not replace the bounded HTTP diagnostic.
        try { await response.body?.cancel(); } catch { /* transport cleanup follows */ }
        const status = response.status >= 100 && response.status <= 599 ? response.status : undefined;
        throw new SelectionProviderError('provider_error', 'http', undefined, status);
      }
      const body: unknown = await response.json();
      combined.throwIfAborted();
      if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) throw new FragmentSchemaError();
      const choice: unknown = body.choices[0];
      if (!choice || typeof choice !== 'object' || ('finish_reason' in choice && choice.finish_reason === 'length') || !('message' in choice) ||
        !choice.message || typeof choice.message !== 'object' || !('content' in choice.message) ||
        typeof choice.message.content !== 'string' || ('refusal' in choice.message && choice.message.refusal)) throw new FragmentSchemaError();
      return JSON.parse(choice.message.content) as unknown;
    } catch (error) {
      if (combined.aborted) throw new SelectionProviderError('timeout');
      if (error instanceof SyntaxError) throw new FragmentSchemaError();
      if (error instanceof FragmentSchemaError || error instanceof SelectionProviderError) throw error;
      const code = transportCode(error);
      throw new SelectionProviderError('provider_error', code ? 'transport' : 'unknown', code);
    } finally {
      await transport?.dispose();
    }
  } };
}
