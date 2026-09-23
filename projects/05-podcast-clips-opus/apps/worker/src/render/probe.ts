import { execFile } from 'node:child_process';
import { renderErrorMessage } from './diagnostics.js';

// V excludes attached cover art: an MP3 cover is not a timed video track.
// Probe failure is not evidence of audio-only input; fail and retain the normal retry path.
export function videoStreamIndex(path: string, signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-select_streams', 'V:0',
      '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
    { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, signal }, (error, stdout) => {
      if (error) { reject(new Error(`Render probe failed: ${renderErrorMessage(error)}`)); return; }
      const index = stdout.trim();
      if (index === '') resolve(null);
      else if (/^\d+$/.test(index) && Number.isSafeInteger(Number(index))) resolve(Number(index));
      else reject(new Error('Render probe returned an invalid video stream index'));
    });
  });
}
