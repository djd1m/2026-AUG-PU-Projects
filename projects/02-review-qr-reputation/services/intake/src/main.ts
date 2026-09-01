import { server, barrier } from './server.js';
const PORT = Number(process.env.PORT ?? 3000);
// Периодический сброс агрегата — ОДНОЙ строкой за интервал, а не на каждый отказ.
setInterval(() => {
  const s = barrier.drain();
  if (s.rejected || s.evicted) console.log('rate_limit_coarse_window', s);
}, 60_000).unref();
server.listen(PORT, () => console.log(`intake listening on ${PORT}`));
