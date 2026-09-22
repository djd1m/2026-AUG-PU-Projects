// Adapter replaces jan-clone STT strategies/BYOK; DEC-A-022 is the wire contract.
import { readFile, stat } from 'node:fs/promises';
import type { SttConfig } from '@clipmaker/shared/config';
import { parseTranscript, STT_MAX_BYTES, STT_TIMEOUT_MS, type TranscriptResult } from '@clipmaker/shared/transcript';
export interface Transcriber { transcribe(path: string, duration: number, signal: AbortSignal): Promise<TranscriptResult> }
export class ProviderError extends Error {
  constructor(public readonly retryable: boolean, public readonly outcome: 'timeout' | 'provider_error') { super('Поставщик STT не завершил запрос'); }
}
export function createTranscriber(config: SttConfig, request: typeof fetch = fetch): Transcriber {
  if (config.mode === 'fake') return { async transcribe(_path, duration, signal) {
    signal.throwIfAborted();
    return { language: 'ru', words: [{ word: 'Проверка', start: 0, end: Math.min(1, duration) }], segments: [] };
  } };
  return { async transcribe(path, duration, signal) {
    if ((await stat(path)).size > STT_MAX_BYTES) throw new Error('Чанк превышает лимит');
    const data = await readFile(path);
    if (!data.length || data.length > STT_MAX_BYTES) throw new Error('Непригодный чанк');
    const timeout = AbortSignal.timeout(STT_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);
    try {
      const response = await request(`${config.baseUrl}/audio/transcriptions`, {
        method: 'POST', signal: combined, redirect: 'error',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, input_audio: { data: data.toString('base64'), format: 'mp3' },
          response_format: 'verbose_json', timestamp_granularities: ['word', 'segment'], language: 'ru',
          provider: { only: ['Together'], allow_fallbacks: false } }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status >= 500 || response.status === 429, 'provider_error'); }
      return parseTranscript(await response.json(), duration);
    } catch (error) {
      if (combined.aborted) throw new ProviderError(true, 'timeout');
      if (error instanceof TypeError) throw new ProviderError(true, 'provider_error');
      throw error;
    }
  } };
}
