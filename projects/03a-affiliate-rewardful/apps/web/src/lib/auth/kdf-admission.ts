export type AdmissionCode = 'overloaded' | 'queue_timeout' | 'canceled';
export class AdmissionError extends Error {
  constructor(readonly code: AdmissionCode) { super(code); this.name = 'AdmissionError'; }
}
interface Waiter {
  start(): void;
  reject(code: AdmissionCode): void;
  deadline: number;
}

/** Process-local bounded FIFO. A running caller's abort never frees native capacity. */
export class KdfAdmission {
  private active = 0;
  private readonly waiters: Waiter[] = [];
  private rejected = 0;
  constructor(private readonly now: () => number = () => performance.now()) {}
  get stats(): Readonly<{ active: number; queued: number; rejected: number }> {
    return { active: this.active, queued: this.waiters.length, rejected: this.rejected };
  }
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new AdmissionError('canceled'));
    if (this.active >= 2 && this.waiters.length >= 8) {
      this.rejected++;
      return Promise.reject(new AdmissionError('overloaded'));
    }
    return new Promise<T>((resolve, reject) => {
      let started = false;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      const deny = (code: AdmissionCode) => {
        if (settled) return;
        settled = true; cleanup(); this.rejected++;
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new AdmissionError(code));
      };
      const abort = () => { if (!started) deny('canceled'); };
      const waiter: Waiter = {
        deadline: this.now() + 5_000,
        reject: deny,
        start: () => {
          if (settled) return;
          if (signal?.aborted) { deny('canceled'); return; }
          started = true; cleanup(); this.active++;
          Promise.resolve().then(task).then(
            (value) => { settled = true; signal?.aborted ? reject(new AdmissionError('canceled')) : resolve(value); },
            (error: unknown) => { settled = true; reject(signal?.aborted ? new AdmissionError('canceled') : error); },
          ).finally(() => { this.active--; this.drain(); });
        },
      };
      if (this.active < 2 && this.waiters.length === 0) waiter.start();
      else {
        this.waiters.push(waiter);
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => deny('queue_timeout'), 5_000);
      }
    });
  }
  private drain(): void {
    while (this.active < 2 && this.waiters.length) {
      const waiter = this.waiters.shift();
      if (!waiter) return;
      if (waiter.deadline <= this.now()) waiter.reject('queue_timeout');
      else waiter.start();
    }
  }
}
export const processKdfAdmission = new KdfAdmission();
