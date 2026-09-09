// Copied/adapted N1 lib/request-body.ts, SHA d13ef84a23b8832c693bec2e31d2517cf444dbb05e462335cb35af281fcf1e83.
// Keep one bounded stream reader; add a total deadline, abort handling and nonblocking cancellation.
import { HttpError } from './errors';
export const MAX_JSON_BODY = 32 * 1024;
export const BODY_DEADLINE_MS = 5_000;
export async function readBodyAtMost(request: Request, max = MAX_JSON_BODY, deadline = BODY_DEADLINE_MS): Promise<string> {
  if (!Number.isInteger(max) || max < 1 || max > MAX_JSON_BODY || deadline < 1 || deadline > BODY_DEADLINE_MS) throw new HttpError(422, 'invalid_input');
  if (request.signal.aborted) throw new HttpError(408, 'body_timeout');
  const body = request.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const end = performance.now() + deadline;
  let rejectStop!: (reason: HttpError) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = () => rejectStop(new HttpError(408, 'body_timeout'));
  const timer = setTimeout(stop, deadline);
  request.signal.addEventListener('abort', stop, { once: true });
  try {
    for (;;) {
      if (performance.now() >= end || request.signal.aborted) throw new HttpError(408, 'body_timeout');
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new HttpError(413, 'body_too_large');
      if (value.byteLength) chunks.push(value);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new HttpError(422, 'invalid_input'); }
  } catch (error) {
    // A hostile stream's cancel() may never settle. Do not await its producer.
    void reader.cancel().catch(() => {});
    throw error instanceof HttpError ? error : new HttpError(408, 'body_timeout');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', stop);
    reader.releaseLock();
  }
}
