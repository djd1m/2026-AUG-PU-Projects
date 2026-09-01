import { tick } from './worker.js';
import { pollBindings } from './binder.js';
import { expireSubscriptions } from './expire.js';
const INTERVAL = Number(process.env.NOTIFY_INTERVAL_MS ?? 5_000);
const EXPIRE_EVERY_MS = 60 * 60 * 1000;   // истечение — раз в час, точность до часа достаточна
let lastExpire = 0;
async function loop(): Promise<void> {
  try {
    const b = await pollBindings();
    if (b) console.log(`bound ${b}`);
    const n = await tick();
    if (n) console.log(`delivered ${n}`);
    if (Date.now() - lastExpire > EXPIRE_EVERY_MS) {
      lastExpire = Date.now();
      const s = await expireSubscriptions();
      if (s.length) console.log(`expired plans, branding restored: ${s.join(', ')}`);
    }
  } catch (e) { console.error('notifier_tick_failed', (e as Error).message); }
  setTimeout(() => void loop(), INTERVAL);
}
console.log('notifier started');
void loop();
