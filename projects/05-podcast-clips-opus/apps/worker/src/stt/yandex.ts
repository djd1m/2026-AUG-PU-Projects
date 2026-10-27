import { readFile, stat } from 'node:fs/promises';
import { Client, credentials, Metadata, status, type ClientDuplexStream, type CallOptions } from '@grpc/grpc-js';
import { parseTranscript, TranscriptError, STT_MAX_BYTES, STT_TIMEOUT_MS, type TranscriptResult } from '@clipmaker/shared/transcript';
import { ProviderError, type Transcriber } from './client.js';
import { YANDEX_HOST, YANDEX_METHOD, yandexMethod, yandexSession } from './yandex-protocol.js';
export const YANDEX_MAX_BYTES = 10_000_000;
export const YANDEX_MAX_SECONDS = 300;
export interface YandexConnection {
  call: ClientDuplexStream<object, unknown>; close(): void;
}
export type YandexConnect = (metadata: Metadata, options: CallOptions) => YandexConnection;
const connect: YandexConnect = (metadata, options) => {
  const client = new Client(YANDEX_HOST, credentials.createSsl(), { 'grpc.enable_retries': 0 });
  try {
    return { call: client.makeBidiStreamRequest(YANDEX_METHOD, yandexMethod.requestSerialize,
      yandexMethod.responseDeserialize, metadata, options), close: () => client.close() };
  } catch { client.close(); throw new ProviderError(true, 'provider_error'); }
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TranscriptError();
  return value as Record<string, unknown>;
}
function integer(value: unknown, nonnegative = false): number {
  if (typeof value !== 'string' || !(nonnegative ? /^(0|[1-9][0-9]*)$/ : /^-?(0|[1-9][0-9]*)$/).test(value)) throw new TranscriptError();
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new TranscriptError();
  return n;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TranscriptError();
  return value;
}
function times(row: Record<string, unknown>) {
  const start = integer(row.start_time_ms) / 1000, end = integer(row.end_time_ms) / 1000;
  return { start, end };
}
export class YandexFinals {
  private channel: string | undefined;
  private finals = new Map<number, { signature: string; result: TranscriptResult }>();
  add(value: unknown): void {
    const row = record(value);
    // Only final contributes words; normalization refinements/partials never do.
    if (row.Event === undefined && !row.final && !row.partial && !row.final_refinement && !row.eou_update && !row.status_code) {
      text(record(row.session_uuid).uuid); integer(record(row.audio_cursors).final_index, true); integer(row.response_wall_time_ms); return;
    }
    if (row.Event !== 'final') {
      if (!['partial', 'final_refinement', 'eou_update', 'status_code'].includes(String(row.Event))) throw new TranscriptError();
      return;
    }
    const channel = text(row.channel_tag);
    if (this.channel !== undefined && channel !== this.channel) throw new TranscriptError();
    const index = integer(record(row.audio_cursors).final_index, true);
    const update = record(row.final);
    if (!Array.isArray(update.alternatives) || !update.alternatives.length) throw new TranscriptError();
    const alternative = record(update.alternatives[0]);
    if (!Array.isArray(alternative.words) || !Array.isArray(alternative.languages)) throw new TranscriptError();
    const languages = alternative.languages.map(value => text(record(value).language_code));
    const phraseTimes = times(alternative);
    // FULL_DATA may report a well-formed silence final. It contributes no text;
    // the complete RPC must still contain actual usable words and context.
    const silence = alternative.words.length === 0 && alternative.text === '';
    if (!alternative.words.length && !silence) throw new TranscriptError();
    const result: TranscriptResult = { language: languages[0] ?? '',
      words: alternative.words.map(value => { const word = record(value); return { word: text(word.text), ...times(word) }; }),
      segments: silence ? [] : [{ text: text(alternative.text), ...phraseTimes }] };
    const signature = JSON.stringify({ alternative, channel, index });
    const prior = this.finals.get(index);
    if (prior && prior.signature !== signature) throw new TranscriptError();
    this.channel = channel;
    if (!prior) this.finals.set(index, { signature, result });
  }
  finish(duration: number): TranscriptResult {
    const results = [...this.finals].sort(([a], [b]) => a - b).map(([, value]) => value.result);
    return parseTranscript({ language: results.find(result => result.language)?.language ?? 'ru',
      words: results.flatMap(result => result.words), segments: results.flatMap(result => result.segments) }, duration);
  }
}
function transportError(code: unknown): ProviderError {
  return new ProviderError(code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED || code === status.RESOURCE_EXHAUSTED,
    code === status.DEADLINE_EXCEEDED ? 'timeout' : 'provider_error');
}
export function createYandexTranscriber(apiKey: string, open: YandexConnect = connect): Transcriber {
  return { async transcribe(path, duration, signal) {
    signal.throwIfAborted();
    if (!Number.isFinite(duration) || duration <= 0 || duration > YANDEX_MAX_SECONDS) throw new TranscriptError();
    const size = (await stat(path)).size;
    if (!size || size > STT_MAX_BYTES || size > YANDEX_MAX_BYTES) throw new TranscriptError();
    const data = await readFile(path);
    if (!data.length || data.length > STT_MAX_BYTES || data.length > YANDEX_MAX_BYTES) throw new TranscriptError();
    signal.throwIfAborted();
    const metadata = new Metadata(); metadata.set('authorization', `Api-Key ${apiKey}`);
    const connection = open(metadata, { deadline: new Date(Date.now() + STT_TIMEOUT_MS) });
    const { call } = connection;
    return await new Promise<TranscriptResult>((resolve, reject) => {
      const finals = new YandexFinals();
      let settled = false, cancelled = false, ended = false, succeeded = false;
      let inputComplete = false;
      const cancel = () => { if (!cancelled) { cancelled = true; call.cancel(); } };
      const finish = (error?: unknown) => {
        if (settled) return;
        if (!error && !inputComplete) error = new ProviderError(false, 'provider_error');
        let result: TranscriptResult | undefined;
        if (!error) { try { result = finals.finish(duration); } catch (cause) { error = cause; } }
        settled = true;
        clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (error) cancel();
        connection.close();
        if (error) reject(error); else resolve(result!);
      };
      const abort = () => finish(new ProviderError(false, 'timeout'));
      const timer = setTimeout(() => finish(new ProviderError(true, 'timeout')), STT_TIMEOUT_MS);
      signal.addEventListener('abort', abort, { once: true });
      call.on('error', (error: { code?: number }) => finish(transportError(error.code)));
      call.on('data', value => { if (!settled) { try { finals.add(value); } catch (error) { finish(error); } } });
      // Writable finish follows grpc-js _final/halfClose after queued writes.
      call.on('finish', () => { inputComplete = true; });
      const complete = () => { if (ended && succeeded) finish(); };
      call.on('end', () => { ended = true; complete(); });
      call.on('status', result => {
        if (settled) return;
        if (result.code !== status.OK) finish(transportError(result.code));
        else { succeeded = true; complete(); }
      });
      if (signal.aborted) { abort(); return; }
      // A drain listener continues the same bounded upload; no queue of writes.
      let offset = -1;
      const upload = () => {
        try {
          while (!settled) {
            if (offset === -1) { offset = 0; if (!call.write(yandexSession)) { call.once('drain', upload); return; } }
            else if (offset < data.length) {
              const chunk = data.subarray(offset, offset + 64 * 1024); offset += chunk.length;
              if (!call.write({ chunk: { data: chunk } })) { call.once('drain', upload); return; }
            } else { call.end(); return; }
          }
        } catch { finish(new ProviderError(true, 'provider_error')); }
      };
      upload();
    });
  } };
}
