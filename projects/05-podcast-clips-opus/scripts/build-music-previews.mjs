import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Read the closed catalogue; no second list of track IDs.
const catalogue = await readFile(new URL('../packages/shared/src/music-catalog.ts', import.meta.url), 'utf8');
const output = new URL('../apps/web/public/music-previews/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [, id] of catalogue.matchAll(/id: '([^']+)'/g)) {
  execFileSync('ffmpeg', ['-nostdin', '-y', '-ss', '30', '-i',
    new URL(`../apps/worker/assets/music/${id}.mp3`, import.meta.url).pathname,
    '-t', '20', '-af', 'loudnorm=I=-18:TP=-2,afade=t=in:d=0.5,afade=t=out:st=19:d=1',
    '-c:a', 'libmp3lame', '-b:a', '128k', new URL(`${id}.mp3`, output).pathname], { stdio: 'ignore' });
}
