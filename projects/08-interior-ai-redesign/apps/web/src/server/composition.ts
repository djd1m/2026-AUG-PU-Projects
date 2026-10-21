import { createPool } from '@n8/db/pool';
import { PgAuthStore, PgProjects, PgRateGate } from '@n8/db/identity';
import { AuthService } from '@n8/domain/identity';
import { systemClock } from '@n8/domain/common';
import { passwords, tokenPort } from '@n8/adapters/auth';
import { loadConfig } from './config';
let base: ReturnType<typeof createBase> | undefined;
function createBase() {
  const config = loadConfig(); const pool = createPool(config.databaseUrl); const tokens = tokenPort(config.sessionSecret);
  return { pool, config, auth: new AuthService(new PgAuthStore(pool), passwords, tokens, systemClock), projects: new PgProjects(pool),
    rate: new PgRateGate(pool), hashSubject: (subject: string) => tokens.hash(`rate:${subject}`) };
}
export function getBase() { return base ??= createBase(); }
export type Base = ReturnType<typeof getBase>;
