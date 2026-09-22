import { execFile } from 'node:child_process';
export const PROBE_TIMEOUT_MS = 30_000;
export class ProbeError extends Error {
  constructor(readonly reason: 'probe_timeout') { super(reason); }
}
export interface ProbeResult { durationSec: number; hasAudio: boolean }
export function parseProbe(output: string): ProbeResult {
  try {
    const data = JSON.parse(output) as { format?: { duration?: unknown }; streams?: { codec_type?: unknown }[] };
    const durationSec = Number(data.format?.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Array.isArray(data.streams)) throw new Error();
    return { durationSec, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
  } catch { throw new ProbeError('probe_timeout'); }
}
export function probeFile(file: string, timeout = PROBE_TIMEOUT_MS, executable = 'ffprobe'): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json', file], { timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        // Missing executable/permissions are worker faults; never refund them as a file rejection.
        if (typeof error.code === 'string') reject(new Error('ffprobe не удалось запустить'));
        else reject(new ProbeError('probe_timeout'));
        return;
      }
      try { resolve(parseProbe(stdout)); } catch (cause) { reject(cause); }
    });
  });
}
export function checkFfprobe(): Promise<void> {
  return new Promise((resolve, reject) => execFile('ffprobe', ['-version'],
    { timeout: 5000, killSignal: 'SIGKILL' }, error => error ? reject(new Error('ffprobe отсутствует: worker-stt не может проверять файлы')) : resolve()));
}
