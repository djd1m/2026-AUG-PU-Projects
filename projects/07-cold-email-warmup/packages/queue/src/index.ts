export interface Job<T> {
  id: string;
  name: string;
  data: T;
  runAtMs: number;
  attempts: number;
}

export interface Queue {
  add(name: string, data: unknown, delayMs?: number): Promise<void>;
  register(name: string, handler: (data: unknown) => Promise<void>): void
  tick(): Promise<void>;
}

export class InProcessQueue implements Queue {
  private jobs: Job<unknown>[] = [];
  private handlers = new Map<string, (data: unknown) => Promise<void>>();
  private seq = 0;
  private maxAttempts: number;
  private running = false;

  constructor(maxAttempts = 5) {
    this.maxAttempts = maxAttempts;
  }

  async add(name: string, data: unknown, delayMs = 0): Promise<void> {
    this.seq++;
    this.jobs.push({
      id: `j${this.seq}-${name}`,
      name,
      data,
      runAtMs: Date.now() + delayMs,
      attempts: 0,
    });
    this.jobs.sort((a, b) => a.runAtMs - b.runAtMs);
  }

  register(name: string, handler: (data: unknown) => Promise<void>): void {
    this.handlers.set(name, handler);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const due = this.jobs.filter((j) => j.runAtMs <= now);
      this.jobs = this.jobs.filter((j) => j.runAtMs > now);
      for (const job of due) {
        const h = this.handlers.get(job.name);
        if (!h) {
          job.attempts++;
          if (job.attempts >= this.maxAttempts) continue;
          this.jobs.push(job);
          continue;
        }
        try {
          await h(job.data);
        } catch (e) {
          job.attempts++;
          if (job.attempts < this.maxAttempts) {
            const backoffMs = Math.min(60000, 500 * 2 ** (job.attempts - 1));
            this.jobs.push({ ...job, runAtMs: Date.now() + backoffMs });
          }
        }
      }
      this.jobs.sort((a, b) => a.runAtMs - b.runAtMs);
    } finally {
      this.running = false;
    }
  }

  get pendingCount(): number {
    return this.jobs.length;
  }
}

export interface LockStore {
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export class InProcessLocks implements LockStore {
  private held = new Set<string>();

  async acquire(key: string): Promise<boolean> {
    if (this.held.has(key)) return false;
    this.held.add(key);
    return true;
  }

  async release(key: string): Promise<void> {
    this.held.delete(key);
  }
}

export function makeQueue(redisUrl?: string): Queue {
  if (redisUrl) {
    try {
      const bull = require('bullmq');
      require('ioredis');
      void bull;
    } catch {
      /* proceed to in-process */
    }
  }
  return new InProcessQueue();
}
