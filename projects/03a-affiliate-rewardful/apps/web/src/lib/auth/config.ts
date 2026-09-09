export interface RuntimeConfig { databaseUrl: string; sessionSecret: Buffer }
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
  const encoded = env.SESSION_SECRET;
  if (!encoded || encoded.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('invalid_SESSION_SECRET');
  }
  const sessionSecret = Buffer.from(encoded, 'base64url');
  if (sessionSecret.length < 32 || sessionSecret.toString('base64url') !== encoded ||
      sessionSecret.every((byte) => byte === sessionSecret[0])) {
    throw new Error('invalid_SESSION_SECRET');
  }
  return { databaseUrl: value, sessionSecret };
}
