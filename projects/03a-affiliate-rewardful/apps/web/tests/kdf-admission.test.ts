import { afterEach, expect, it, vi } from 'vitest';
import { KdfAdmission } from '../src/lib/auth/kdf-admission';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
afterEach(() => vi.useRealTimers());
it('KDF admission bounds active work and recovers from timeout and failure', async () => {
  vi.useFakeTimers();
  let now = 0;
  const queue = new KdfAdmission(() => now);
  const gates = Array.from({ length: 10 }, () => deferred<number>());
  const started: number[] = [];
  let peak = 0;
  const promises = gates.map((gate, i) => queue.run(async () => {
    started.push(i); peak = Math.max(peak, queue.stats.active); return gate.promise;
  }).catch((error: Error) => error.message));
  await flush();
  expect(started).toEqual([0, 1]);
  expect(queue.stats).toMatchObject({ active: 2, queued: 8 });
  await expect(queue.run(async () => 11)).rejects.toThrow('overloaded');
  gates[0]!.resolve(0); await flush();
  expect(started).toEqual([0, 1, 2]);
  gates[1]!.reject(new Error('native_failed')); await flush();
  expect(started).toEqual([0, 1, 2, 3]);
  now = 5_000;
  await vi.advanceTimersByTimeAsync(5_000);
  expect(queue.stats).toMatchObject({ active: 2, queued: 0 });
  gates[2]!.resolve(2); gates[3]!.resolve(3); await flush();
  expect(await Promise.all(promises)).toEqual([0, 'native_failed', 2, 3, ...Array(6).fill('queue_timeout')]);
  expect(started).toEqual([0, 1, 2, 3]);
  expect(peak).toBe(2);
  expect(await queue.run(async () => 99)).toBe(99);
  await flush(); expect(queue.stats.active).toBe(0);
});
it('canceled native work retains its slot until settlement and queued cancellation is removed', async () => {
  const queue = new KdfAdmission();
  const first = deferred<number>(); const second = deferred<number>();
  const activeAbort = new AbortController(); const waitingAbort = new AbortController();
  const a = queue.run(() => first.promise, activeAbort.signal).catch((e: Error) => e.message);
  const b = queue.run(() => second.promise);
  const waiting = vi.fn(async () => 3);
  const c = queue.run(waiting, waitingAbort.signal).catch((e: Error) => e.message);
  activeAbort.abort(); waitingAbort.abort(); await flush();
  expect(queue.stats).toMatchObject({ active: 2, queued: 0 });
  expect(await c).toBe('canceled'); expect(waiting).not.toHaveBeenCalled();
  let canceledSettled = false; void a.then(() => { canceledSettled = true; });
  await flush(); expect(canceledSettled).toBe(false);
  first.resolve(1); expect(await a).toBe('canceled');
  second.resolve(2); expect(await b).toBe(2); await flush();
  expect(queue.stats.active).toBe(0);
});
it('deadline comparison rejects an expired waiter even before its timer callback', async () => {
  let now = 0; const queue = new KdfAdmission(() => now);
  const a = deferred<number>(); const b = deferred<number>();
  const running = [queue.run(() => a.promise), queue.run(() => b.promise)];
  const task = vi.fn(async () => 3);
  const waiting = queue.run(task).catch((e: Error) => e.message);
  now = 5_000; a.resolve(1); b.resolve(2);
  await Promise.all(running); expect(await waiting).toBe('queue_timeout');
  expect(task).not.toHaveBeenCalled();
});
