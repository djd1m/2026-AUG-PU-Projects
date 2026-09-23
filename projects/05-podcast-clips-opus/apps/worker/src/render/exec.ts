// Adapted from jan-clone execFFmpeg/renderClip: bounded stderr, child process, kill then await close.
import { spawn } from 'node:child_process';
import { safeDiagnostic } from './diagnostics.js';
export const FFMPEG_TIMEOUT_MS = 15 * 60_000;
export const RENDER_JOB_TIMEOUT_MS = 30 * 60_000;
export class FFmpegError extends Error {
  constructor(readonly reason: 'ffmpeg_failed' | 'ffmpeg_timeout') { super(reason); }
}
export async function execFFmpeg(args: string[], timeoutMs = FFMPEG_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const proc = spawn('ffmpeg', ['-nostdin', '-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false, stderr = '', truncated = false, spawnFailed = false;
    const kill = () => { timedOut = true; proc.kill('SIGKILL'); };
    const timeout = setTimeout(kill, timeoutMs);
    signal?.addEventListener('abort', kill, { once: true });
    if (signal?.aborted) kill();
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', kill); };
    const logFailure = (reason: string, code: number | null, processSignal: string | null, spawnCode?: string) => {
      // Drop the first partial line after truncation: it may be the tail of a signed URL.
      const tail = truncated ? (stderr.includes('\n') ? stderr.slice(stderr.indexOf('\n') + 1) : '') : stderr;
      console.error(JSON.stringify({ event: reason, exit_code: code, signal: processSignal,
        spawn_code: spawnCode, stderr_tail: safeDiagnostic(tail) }));
    };
    proc.stderr.on('data', (data: Buffer) => {
      const combined = stderr + data.toString();
      truncated ||= combined.length > 65536;
      stderr = combined.slice(-65536);
    });
    proc.once('error', (error: NodeJS.ErrnoException) => {
      spawnFailed = true; cleanup();
      logFailure('ffmpeg_failed', null, null, /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'UNKNOWN');
      reject(new FFmpegError('ffmpeg_failed'));
    });
    proc.once('close', (code, processSignal) => {
      cleanup();
      if (spawnFailed) return;
      if (timedOut || code !== 0) {
        const reason = timedOut ? 'ffmpeg_timeout' : 'ffmpeg_failed';
        logFailure(reason, code, processSignal);
        reject(new FFmpegError(reason));
      }
      else resolve();
    });
  });
}
export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timeOffset: number,
): Promise<void> {
  const args = [
    '-y',
    '-ss', String(timeOffset),
    '-i', videoPath,
    '-vframes', '1',
    '-vf', 'scale=360:-1',
    '-q:v', '3',
    outputPath,
  ];

  await execFFmpeg(args, 15_000);
}
