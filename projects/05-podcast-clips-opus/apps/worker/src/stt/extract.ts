// Adapted from jan-clone/apps/worker/lib/ffmpeg.ts: extractAudio.
import { spawn } from 'node:child_process';
import { STT_JOB_TIMEOUT_MS } from '@clipmaker/shared/transcript';
export function runFfmpeg(args: string[], signal: AbortSignal, onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn('ffmpeg', ['-nostdin', '-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let pending = '';
    const abort = () => { child.kill('SIGKILL'); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data: string) => {
      pending += data;
      const lines = pending.split(/[\r\n]/); pending = lines.pop()!.slice(-4096);
      for (const line of lines) onLine?.(line);
    });
    child.once('error', error => { signal.removeEventListener('abort', abort); reject(error); });
    child.once('close', code => {
      signal.removeEventListener('abort', abort);
      if (code === 0 && !signal.aborted) resolve(); else reject(new Error('ffmpeg: извлечение или резка не завершены'));
    });
  });
}
export interface ExtractedAudio { path: string; pauses: number[] }
export async function extractAudio(input: string, output: string, duration: number,
  signal = AbortSignal.timeout(STT_JOB_TIMEOUT_MS)): Promise<ExtractedAudio> {
  const pauses: number[] = [];
  let start: number | undefined;
  // ffmpeg streams the existing source into compressed audio, never a second video/WAV.
  await runFfmpeg(['-y', '-protocol_whitelist', 'file', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000',
    '-af', 'silencedetect=noise=-35dB:d=0.35', '-acodec', 'libmp3lame', '-b:a', '64k', '-t', String(duration), output], signal, line => {
    const opening = /silence_start: ([\d.]+)/.exec(line);
    if (opening) start = Number(opening[1]);
    const closing = /silence_end: ([\d.]+)/.exec(line);
    if (closing && start !== undefined) { pauses.push((start + Number(closing[1])) / 2); start = undefined; }
  });
  return { path: output, pauses };
}
export async function checkFfmpeg(): Promise<void> { await runFfmpeg(['-version'], AbortSignal.timeout(5000)); }
