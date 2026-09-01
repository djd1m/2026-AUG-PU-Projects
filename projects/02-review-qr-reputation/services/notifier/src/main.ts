import { tick } from './worker.js';
const INTERVAL = Number(process.env.NOTIFY_INTERVAL_MS ?? 5_000);
async function loop(): Promise<void> {
  try { const n = await tick(); if (n) console.log(`delivered ${n}`); }
  catch (e) { console.error('notifier_tick_failed', (e as Error).message); }
  setTimeout(() => void loop(), INTERVAL);
}
console.log('notifier started');
void loop();
