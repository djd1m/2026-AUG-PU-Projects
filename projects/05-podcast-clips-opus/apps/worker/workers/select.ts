import { quotaEnvironment } from '../src/quota-environment';
import { startWorker } from '../src/runtime';
void startWorker('worker-llm', { ...quotaEnvironment(), DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL,
  NODE_ENV: process.env.NODE_ENV, N5_MODEL_PROVIDER: process.env.N5_MODEL_PROVIDER, N5_LLM_MODEL: process.env.N5_LLM_MODEL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, N5_WORK_DIR: process.env.N5_WORK_DIR,
}).catch(() => { console.error('Воркер не запущен: проверьте конфигурацию и зависимости'); process.exitCode = 1; });
