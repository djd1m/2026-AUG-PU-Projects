export interface RuntimeConfig {
  databaseUrl: string; sessionSecret: Buffer; identitySecret: Buffer;
  admissionSecret: Buffer; appOrigin: string;
}
function readSecret(env: Readonly<Record<string, string | undefined>>, name: string): Buffer {
  const encoded = env[name];
  if (!encoded || encoded.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error(`invalid_${name}`);
  const secret = Buffer.from(encoded, 'base64url');
  if (secret.length < 32 || secret.toString('base64url') !== encoded || secret.every((byte) => byte === secret[0])) throw new Error(`invalid_${name}`);
  return secret;
}
export function readRuntimeConfig(env: Readonly<Record<string, string | undefined>>): RuntimeConfig {
  const value = env.DATABASE_URL;
  if (!value || value.trim() !== value) throw new Error('invalid_DATABASE_URL');
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || !url.pathname.slice(1) || url.hash || url.search) {
      throw new Error('invalid');
    }
    for (const part of [url.username, url.password, url.hostname, url.pathname.slice(1)]) {
      const decoded = decodeURIComponent(part);
      if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) throw new Error('invalid');
    }
  } catch { throw new Error('invalid_DATABASE_URL'); }
  const sessionSecret = readSecret(env, 'SESSION_SECRET');
  const identitySecret = readSecret(env, 'IDENTITY_SECRET');
  const admissionSecret = readSecret(env, 'ADMISSION_SECRET');
  if (sessionSecret.equals(identitySecret) || sessionSecret.equals(admissionSecret) || identitySecret.equals(admissionSecret)) throw new Error('distinct_secrets_required');
  const appOrigin = env.APP_ORIGIN;
  try {
    if (!appOrigin) throw new Error('missing');
    const url = new URL(appOrigin);
    if (url.origin !== appOrigin || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error('invalid');
  } catch { throw new Error('invalid_APP_ORIGIN'); }
  return { databaseUrl: value, sessionSecret, identitySecret, admissionSecret, appOrigin: appOrigin! };
}
