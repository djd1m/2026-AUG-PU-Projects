import { spawn } from 'node:child_process';
import { FFmpegError } from './exec.js';

export const MUSIC_MEASURE_TIMEOUT_MS = 120_000;

// Frame logs also contain I:. Only the final Summary belongs to the whole clip.
export function parseIntegratedLoudness(stderr: string): number {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  if (!summary.startsWith('Summary:')) return NaN;
  const value = summary.match(/\bI:\s*(-?\d+(?:\.\d+)?|-inf)\s+LUFS\b/);
  return value ? Number(value[1]) : NaN;
}
export function execLoudness(args: string[], signal?: AbortSignal, timeoutMs = MUSIC_MEASURE_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn('ffmpeg', ['-nostdin', '-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', timedOut = false;
    const abort = () => { child.kill('SIGKILL'); };
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-65536); });
    child.once('error', () => { cleanup(); reject(new FFmpegError('ffmpeg_failed')); });
    child.once('close', code => {
      cleanup();
      if (signal?.aborted) reject(signal.reason);
      else if (timedOut) reject(new FFmpegError('ffmpeg_timeout'));
      else if (code !== 0) reject(new FFmpegError('ffmpeg_failed'));
      else resolve(stderr);
    });
  });
}
export async function measureLoudness(path: string, start: number, duration: number, signal?: AbortSignal): Promise<number> {
  const stderr = await execLoudness(['-protocol_whitelist', 'file', '-ss', String(start), '-t', String(duration),
    '-i', path, '-map', '0:a:0', '-af', 'highpass=f=300,lowpass=f=3400,ebur128', '-f', 'null', '-'], signal);
  return parseIntegratedLoudness(stderr);
}
