import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environment } from './fixtures/environment';
import { startWorker } from '../apps/worker/src/runtime';

const state = vi.hoisted(() => ({ handlers: new Map<string, (job: unknown) => Promise<void>>() }));
vi.mock('bullmq', () => ({
  DelayedError: class extends Error {},
  Worker: class {
    constructor(name: string, handler: (job: unknown) => Promise<void>) { state.handlers.set(name, handler); }
    on() {} async close() {}
  },
}));
vi.mock('@clipmaker/queue', () => ({ DEFER_DELAY_MS: 1000, getRedisConnection: () => ({}),
  createQueues: () => ({ enqueue: async () => {}, close: async () => {} }) }));
vi.mock('@clipmaker/s3', () => ({ createS3Client: () => ({ destroy() {} }) }));
vi.mock('@clipmaker/db', () => ({
  createPool: () => ({ on() {}, end: async () => {}, query: async (_sql: string, args: unknown[]) => ({ rows: [{
    video_id: String(args[0]), fence: 1, stage: args[2], series_no: 1, attempt_no: 1, status: 'running', clip_id: null,
  }] }) }),
  transcriptionDeadline: async () => Date.now() + 60_000,
  authorizeSttCall: async () => 1,
  acceptTranscript: async () => null,
  failTranscription: async () => { throw new Error('unexpected transcription failure'); },
  authorizeSelection: async () => ({ duration: 360, transcript: { language: 'ru', segments: [],
    words: Array.from({ length: 360 }, (_, i) => ({ word: 'слово', start: i, end: i + 1 })) } }),
  acceptSelection: async () => [], failSelection: async () => {},
}));
vi.mock('../apps/worker/src/workers/stt', async importOriginal => ({
  ...await importOriginal<typeof import('../apps/worker/src/workers/stt')>(),
  probeSource: async (attempt: unknown, deps: { directory: string;
    continueTranscription: (file: string, duration: number, attempt: unknown) => Promise<void> }) => {
    await deps.continueTranscription(join(deps.directory, 'source'), 120, attempt); return 'continued';
  },
}));
vi.mock('../apps/worker/src/media/probe', () => ({
  checkFfprobe: async () => {}, ProbeError: class extends Error {}, PROBE_TIMEOUT_MS: 1000,
  probeFile: async () => ({ durationSec: 120, hasAudio: true }),
}));
vi.mock('../apps/worker/src/stt/extract', () => ({ checkFfmpeg: async () => {},
  extractAudio: async () => ({ path: 'audio', pauses: [] }) }));
vi.mock('../apps/worker/src/stt/chunker', () => ({
  splitAudio: async function* (_audio: unknown, directory: string) {
    const path = join(directory, 'chunk'); await writeFile(path, 'fake audio');
    yield { path, offsetSeconds: 0, durationSeconds: 120, hardCut: false, index: 0 };
  },
}));
vi.mock('../apps/worker/src/stt/client', () => ({ ProviderError: class extends Error {},
  createTranscriber: () => ({ transcribe: async () => ({ language: 'ru', segments: [], words: [{ word: 'Привет', start: 1, end: 2 }] }) }) }));

const stops: (() => Promise<void>)[] = [], dirs: string[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()));
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  state.handlers.clear();
});

it('RM-003 runtime STT and LLM attempts reach ONE file through the actual compose mounts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'n5-money-mounts-')); dirs.push(root);
  const compose = await readFile('docker-compose.yml', 'utf8');
  const workdirs: string[] = [];
  // Model the declared local named-volume mounts with symlinks. Real runtime,
  // stage handlers and fsync writers execute; DB, queue and providers are offline.
  for (const role of ['worker-stt', 'worker-llm'] as const) {
    const block = compose.match(new RegExp(`^  ${role}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|^volumes:)`, 'm'))?.[1];
    expect(block, `${role} service exists`).toBeTruthy();
    const workdir = block!.match(/^      N5_WORK_DIR: (\/\S+)$/m)?.[1];
    expect(workdir).toBe('/work');
    const mounts = [...block!.matchAll(/^      - ([\w-]+):(\/\S+)$/gm)].map(match => {
      const volume = match[1], target = match[2];
      if (!volume || !target) throw new Error('Unreadable mount');
      return { volume, target };
    });
    expect(mounts.length).toBeGreaterThan(0);
    const container = join(root, role); await mkdir(container);
    for (const { volume, target } of mounts.sort((a, b) => a.target.length - b.target.length)) {
      expect(compose.slice(compose.lastIndexOf('\nvolumes:'))).toContain(`\n  ${volume}:`);
      const backing = join(root, 'volumes', volume); await mkdir(backing, { recursive: true });
      await symlink(backing, join(container, target));
    }
    const directory = join(container, workdir!); workdirs.push(directory);
    stops.push((await startWorker(role, { ...environment(), N5_WORK_DIR: directory })).stop);
  }
  await Promise.all(['stt', 'select'].map(stage => state.handlers.get(stage)!({ data: { video_id: `video-${stage}`, fence: 1 } })));
  for (const directory of workdirs) {
    const rows = (await readFile(join(directory, 'spend/model-spend.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(rows.filter(row => row.phase === 'attempt').map(row => row.stage).sort()).toEqual(['select', 'stt']);
    expect(rows.filter(row => row.phase === 'outcome')).toHaveLength(2);
  }
});
