import { quotaEnvironment } from '../src/quota-environment';
import { startWorker } from '../src/runtime';
void startWorker('worker-llm', { ...quotaEnvironment(), DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL }).catch(() => { console.error('Воркер не запущен: проверьте конфигурацию и зависимости'); process.exitCode = 1; });
