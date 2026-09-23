import { renderErrorMessage } from '../src/render/diagnostics';
import { quotaEnvironment } from '../src/quota-environment';
import { startWorker } from '../src/runtime';
void startWorker('worker-llm', { ...quotaEnvironment(), DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL,
  N5_PUBLIC_ORIGIN: process.env.N5_PUBLIC_ORIGIN, N5_SHORT_CODE_LENGTH: process.env.N5_SHORT_CODE_LENGTH,
  NODE_ENV: process.env.NODE_ENV, N5_MODEL_PROVIDER: process.env.N5_MODEL_PROVIDER, N5_LLM_MODEL: process.env.N5_LLM_MODEL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, N5_WORK_DIR: process.env.N5_WORK_DIR,
}).catch(error => { console.error('Воркер не запущен:', renderErrorMessage(error)); process.exitCode = 1; });
