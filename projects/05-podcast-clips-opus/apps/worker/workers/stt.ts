import { quotaEnvironment } from '../src/quota-environment';
import { startPlaceholder } from '../src/wait';
startPlaceholder('worker-stt', { ...quotaEnvironment(), DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL });
