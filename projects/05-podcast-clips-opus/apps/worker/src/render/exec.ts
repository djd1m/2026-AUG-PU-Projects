// Adapted from jan-clone execFFmpeg/renderClip: bounded stderr, child process, kill then await close.
import { spawn } from 'node:child_process';
export const FFMPEG_TIMEOUT_MS = 15 * 60_000;
export const RENDER_JOB_TIMEOUT_MS = 30 * 60_000;
export class FFmpegError extends Error {
  constructor(readonly reason: 'ffmpeg_failed' | 'ffmpeg_timeout') { super(reason); }
}
export async function execFFmpeg(args: string[], timeoutMs = FFMPEG_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const proc = spawn('ffmpeg', ['-nostdin', '-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false, stderr = '';
    const kill = () => { timedOut = true; proc.kill('SIGKILL'); };
    const timeout = setTimeout(kill, timeoutMs);
    signal?.addEventListener('abort', kill, { once: true });
    if (signal?.aborted) kill();
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', kill); };
    proc.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-65536); });
    proc.once('error', () => { cleanup(); reject(new FFmpegError('ffmpeg_failed')); });
    proc.once('close', code => {
      cleanup();
      if (timedOut) reject(new FFmpegError('ffmpeg_timeout'));
      else if (code !== 0) { void stderr; reject(new FFmpegError('ffmpeg_failed')); }
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
