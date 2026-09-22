import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, getRedisConnection, jobId } from '../packages/queue/src';
import { withSource } from '../apps/worker/src/media/download';
import { ProbeError, parseProbe, probeFile } from '../apps/worker/src/media/probe';
import { fileFailure } from '../apps/worker/src/workers/stt';
import { assertRetryable } from '../apps/web/src/server/video-retry';
import { startWatchdog } from '../apps/web/src/server/watchdog';

const dirs: string[] = [];
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'n5-probe-test-')); dirs.push(dir); return dir; }
afterEach(async () => { vi.useRealTimers(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
describe('Queue and probe contracts', () => {
  it('exactly three queues; BullMQ never owns retries; retention bounded', () => {
    expect(QUEUE_NAMES).toEqual(['stt', 'select', 'render']);
    expect(DEFAULT_JOB_OPTIONS).toEqual({ attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 });
    const id = randomUUID(); expect(jobId({ stage: 'stt', video_id: id, fence: 1 })).toBe(`stt:${id}:1`);
  });
  it('Redis password mandatory and worker has maxRetriesPerRequest null', () => {
    for (const redisUrl of ['', 'redis://localhost', 'http://:secret@localhost', 'redis://:secret@localhost/x']) {
      expect(() => getRedisConnection({ redisUrl })).toThrow();
    }
    expect(getRedisConnection({ redisUrl: 'rediss://user:pa%3Ass@redis:6380/2' })).toMatchObject({
      host: 'redis', port: 6380, username: 'user', password: 'pa:ss', db: 2, maxRetriesPerRequest: null, tls: {},
    });
  });
  it('ADR-006: no disk means zero GETs and no work directory', async () => {
    const dir = await temp(), download = vi.fn(), work = vi.fn();
    expect(await withSource(dir, 'object', 100n, download, work, async () => 299n)).toEqual({ deferred: true });
    expect(download).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled(); expect(await readdir(dir)).toEqual([]);
  });
  it('exact 3x boundary downloads once; callback uses same source; finally cleans', async () => {
    const dir = await temp();
    const download = vi.fn(async (_key, file: string) => { await writeFile(file, 'source'); });
    expect(await withSource(dir, 'object', 100n, download, file => readFile(file, 'utf8'), async () => 300n))
      .toEqual({ deferred: false, value: 'source' });
    expect(download).toHaveBeenCalledTimes(1); expect(await readdir(dir)).toEqual([]);
    await expect(withSource(dir, 'object', 100n, download, async () => { throw new Error('probe failed'); }, async () => 300n)).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
  it('concurrent worker downloads cannot reserve the same available bytes', async () => {
    const dir = await temp(); let release!: () => void, started!: () => void;
    const begun = new Promise<void>(r => { started = r; });
    const pending = new Promise<void>(r => { release = r; });
    const first = withSource(dir, 'a', 100n, async () => { started(); await pending; }, async () => 1, async () => 300n);
    await begun;
    const download = vi.fn();
    expect(await withSource(dir, 'b', 100n, download, async () => 2, async () => 300n)).toEqual({ deferred: true });
    expect(download).not.toHaveBeenCalled(); release(); await first;
  });
  it.each([[119.9, 'too_short'], [120, null], [5400, null], [5400.1, 'too_long']] as const)('duration %s => %s', (durationSec, reason) => {
    expect(fileFailure({ durationSec, hasAudio: true })).toBe(reason);
  });
  it('ffprobe verifies audio and rejects malformed/nonfinite output', () => {
    expect(parseProbe('{"format":{"duration":"120.5"},"streams":[{"codec_type":"audio"}]}')).toEqual({ durationSec: 120.5, hasAudio: true });
    expect(fileFailure(parseProbe('{"format":{"duration":"120"},"streams":[{"codec_type":"video"}]}'))).toBe('no_audio');
    for (const input of ['{}', '{', '{"format":{"duration":"NaN"},"streams":[]}']) expect(() => parseProbe(input)).toThrow(ProbeError);
  });
  it('hung child is killed and reports probe_timeout without blocking event loop', async () => {
    const dir = await temp(), executable = join(dir, 'hung');
    await writeFile(executable, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n'); await chmod(executable, 0o700);
    let ticked = false; const timer = setTimeout(() => { ticked = true; }, 10);
    await expect(probeFile('/unused', 150, executable)).rejects.toMatchObject({ reason: 'probe_timeout' });
    clearTimeout(timer); expect(ticked).toBe(true);
  });
  it('missing ffprobe executable is a retryable operational error, not a file refund', async () => {
    await expect(probeFile('/unused', 100, '/nonexistent/n5-ffprobe')).rejects.not.toBeInstanceOf(ProbeError);
  });
  it('RetryVideo rejects a missing original, accepts quota refusals only with uploaded file', () => {
    const row = { status: 'failed', failure_reason: 'refused_user_minutes' as const, object_key: 'source', actual_bytes: '1' };
    expect(() => assertRetryable(row)).not.toThrow();
    expect(() => assertRetryable({ ...row, object_key: null })).toThrow('Загрузка не завершилась');
    expect(() => assertRetryable({ ...row, actual_bytes: null })).toThrow('Загрузка не завершилась');
    expect(() => assertRetryable({ ...row, failure_reason: 'too_long' })).toThrow('другой файл');
    expect(() => assertRetryable({ ...row, status: 'queued' })).toThrow('Повторять нечего');
  });
  it('watchdog ticks once a minute and never overlaps a slow tick', async () => {
    vi.useFakeTimers(); let finish!: () => void;
    const tick = vi.fn(() => new Promise<void>(r => { finish = r; }));
    const stop = startWatchdog(tick);
    await vi.advanceTimersByTimeAsync(180_000); expect(tick).toHaveBeenCalledTimes(1);
    finish(); await vi.advanceTimersByTimeAsync(60_000); expect(tick).toHaveBeenCalledTimes(2);
    stop(); finish(); await vi.advanceTimersByTimeAsync(120_000); expect(tick).toHaveBeenCalledTimes(2);
  });
});
