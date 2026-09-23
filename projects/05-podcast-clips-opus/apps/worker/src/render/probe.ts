import { execFile } from 'node:child_process';
import { renderErrorMessage } from './diagnostics.js';

// V excludes attached cover art: an MP3 cover is not a timed video track.
// Probe failure is not evidence of audio-only input; fail and retain the normal retry path.
export interface VideoStream { index: number; width: number; height: number }
export async function videoStreamIndex(path: string, signal?: AbortSignal): Promise<number | null> {
  return (await probeVideoStream(path, signal))?.index ?? null;
}
export function probeVideoStream(path: string, signal?: AbortSignal): Promise<VideoStream | null> {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-select_streams', 'V:0',
      '-show_entries', 'stream=index,width,height:stream_tags=rotate:stream_side_data_list', '-of', 'json', path],
    { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, signal }, (error, stdout) => {
      if (error) { reject(new Error(`Render probe failed: ${renderErrorMessage(error)}`)); return; }
      try {
        const result = JSON.parse(stdout);
        if (!Array.isArray(result.streams)) throw new Error('Missing streams');
        if (result.streams.length === 0) { resolve(null); return; }
        const stream = result.streams[0];
        const { index } = stream;
        let { width, height } = stream;
        if (!Number.isSafeInteger(index) || index < 0 ||
          ![width, height].every(n => Number.isSafeInteger(n) && n >= 2)) throw new Error('Invalid dimensions/index');
        // ffmpeg autorotates before filtering; crop coordinates must use the same orientation.
        const rotation = Number(stream.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0);
        if (!Number.isFinite(rotation) || rotation % 90 !== 0) throw new Error('Invalid rotation');
        if (Math.abs(rotation % 180) === 90) [width, height] = [height, width];
        resolve({ index, width, height });
      } catch { reject(new Error('Render probe returned invalid video stream geometry')); }
    });
  });
}
