import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ROOT = fileURLToPath(new URL('./public/', import.meta.url));
export function readConfig(env = process.env) {
  const fail = () => { throw new Error('Invalid server configuration'); };
  if (!['development', 'test', 'production'].includes(env.NODE_ENV)) fail();
  if (!/^[a-f0-9]{64,}$/i.test(env.SESSION_SECRET ?? '') || /^(.)\1+$/.test(env.SESSION_SECRET)) fail();
  let db, origin;
  try { db = new URL(env.DATABASE_URL); origin = new URL(env.APP_ORIGIN); } catch { fail(); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname || !db.pathname.slice(1) ||
      decodeURIComponent(db.password).length < 24 || /^(.)\1+$/.test(decodeURIComponent(db.password)) || /^(postgres|password|changeme|replace)/i.test(decodeURIComponent(db.password))) fail();
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.APP_ORIGIN ||
      origin.username || origin.password || (!local && origin.protocol !== 'https:')) fail();
  if (!isAbsolute(env.STORAGE_DIR ?? '')) fail();
  const storageDir = resolve(env.STORAGE_DIR);
  const webRoot = resolve(PUBLIC_ROOT, '..');
  if (storageDir === webRoot || storageDir.startsWith(webRoot + sep) || storageDir === '/') fail();
  if (env.PROVIDER_MODE !== 'disabled' || env.WORKER_MODE !== 'disabled') fail();
  const platformDailyLimit = Number(env.PLATFORM_DAILY_LIMIT);
  const accountDailyLimit = Number(env.ACCOUNT_DAILY_LIMIT);
  for (const [raw,value,max] of [[env.PLATFORM_DAILY_LIMIT,platformDailyLimit,200],[env.ACCOUNT_DAILY_LIMIT,accountDailyLimit,20]]) {
    if (!/^[1-9][0-9]*$/.test(raw ?? '') || !Number.isSafeInteger(value) || value>max) fail();
  }
  if (accountDailyLimit>platformDailyLimit) fail();
  const port = Number(env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail();
  return { databaseUrl: env.DATABASE_URL, secret: env.SESSION_SECRET, origin: origin.origin,
    storageDir, runtime:env.NODE_ENV, platformDailyLimit, accountDailyLimit, secureCookie: !local, port, host: env.HOST ?? '127.0.0.1' };
}
