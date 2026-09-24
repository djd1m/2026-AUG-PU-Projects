import { spawn } from 'node:child_process';
import { FFmpegError } from './exec.js';
export class InvalidEnvelopeError extends Error {}
// Keep only one RMS value per 20 ms, never the recording's PCM in memory.
export function measureEnvelope(path: string, start?: number, duration?: number, signal?: AbortSignal): Promise<number[]> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
      ...(start === undefined ? [] : ['-ss', String(start)]), ...(duration === undefined ? [] : ['-t', String(duration)]),
      '-i', path, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const values: number[] = [];
    let pending = Buffer.alloc(0), sum = 0, count = 0, timedOut = false;
    const abort = () => { child.kill('SIGKILL'); };
    const timer = setTimeout(() => { timedOut = true; abort(); }, 120_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.stdout.on('data', (chunk: Buffer) => {
      const data = Buffer.concat([pending, chunk]);
      let i = 0;
      for (; i + 4 <= data.length; i += 4) {
        const sample = data.readFloatLE(i); sum += sample * sample; count++;
        if (count === 320) { values.push(10 * Math.log10(Math.max(sum / count, 1e-12))); sum = 0; count = 0; }
      }
      pending = Buffer.from(data.subarray(i));
    });
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => {
      cleanup();
      if (signal?.aborted) reject(signal.reason);
      else if (timedOut || code !== 0) reject(new FFmpegError(timedOut ? 'ffmpeg_timeout' : 'ffmpeg_failed'));
      else if (!values.length || values.some(v => !Number.isFinite(v))) reject(new InvalidEnvelopeError('Invalid envelope'));
      else resolve(values);
    });
  });
}
export function envelopeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  if (!sorted.length || sorted.some(v => !Number.isFinite(v))) throw new InvalidEnvelopeError('Empty or invalid envelope');
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
