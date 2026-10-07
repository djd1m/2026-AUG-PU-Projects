import { loadMasterKey } from '@grelka/secrets';
import { Plan } from '@grelka/shared';
import { openDb } from '@grelka/db';
import type { Queue } from '@grelka/queue';

export interface Config {
  db: import('@grelka/db').Db;
  queue?: Queue;
  masterKey: Buffer;
  tokenSecret: Buffer;
  accessTtlSec: number;
  refreshTtlSec: number;
  baseUrl: string;
  demoMode: boolean;
  smtpDemo: boolean;
  imapPollSec: number;
  demoPlanForNewUsers?: Plan;
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const driver = await openDb(env);
  const secretHex = env.TOKEN_SECRET ?? env.MASTER_KEY;
  if (!secretHex || secretHex.length < 32) throw new Error('TOKEN_SECRET обязателен (hex, ≥32 символов)');
  return {
    db: driver.db,
    masterKey: loadMasterKey(env),
    tokenSecret: Buffer.from(secretHex, 'hex'),
    accessTtlSec: Number(env.JWT_ACCESS_TTL ?? 900),
    refreshTtlSec: Number(env.JWT_REFRESH_TTL ?? 2592000),
    baseUrl: env.BASE_URL ?? 'http://localhost:5173',
    demoMode: env.DEMO_MODE === '1',
    smtpDemo: env.DEMO_SMTP !== '0',
    imapPollSec: Number(env.IMAP_POLL_SEC ?? 60),
    demoPlanForNewUsers: (env.DEMO_START_PLAN as Plan) || undefined,
  };
}
