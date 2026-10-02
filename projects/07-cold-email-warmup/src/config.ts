import { readFileSync } from 'node:fs';
export interface Config { databaseUrl: string; sessionKey: Buffer; origin: string; port: number; secureCookie: boolean }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.SAFETY_POLICY_VERSION !== 'n7-safety-v1') throw new Error('invalid_safety_policy');
  const encoded = env.SESSION_HMAC_KEY_FILE ? readFileSync(env.SESSION_HMAC_KEY_FILE, 'utf8').trim() : env.SESSION_HMAC_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('invalid_session_key');
  const sessionKey = Buffer.from(encoded, 'base64');
  if (sessionKey.length < 32 || sessionKey.toString('base64') !== encoded) throw new Error('invalid_session_key');
  const databaseUrl = env.DATABASE_URL ?? (env.DATABASE_PASSWORD_FILE ? `postgresql://${encodeURIComponent(env.DATABASE_USER ?? 'n7')}:{password}@${env.DATABASE_HOST ?? 'db'}:5432/${env.DATABASE_NAME ?? 'n7'}`.replace('{password}', encodeURIComponent(readFileSync(env.DATABASE_PASSWORD_FILE, 'utf8').trim())) : undefined);
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('invalid_database_config');
  const origin = env.APP_ORIGIN;
  if (!origin) throw new Error('invalid_origin');
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_origin');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('insecure_origin');
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_port');
  return { databaseUrl, sessionKey, origin, port, secureCookie: url.protocol === 'https:' };
}
