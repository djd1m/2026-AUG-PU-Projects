import { startWorker } from '../src/runtime';
void startWorker('worker-video', { DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL,
  N5_PUBLIC_ORIGIN: process.env.N5_PUBLIC_ORIGIN, NODE_ENV: process.env.NODE_ENV }).catch(() => { console.error('Воркер не запущен: проверьте конфигурацию и зависимости'); process.exitCode = 1; });
