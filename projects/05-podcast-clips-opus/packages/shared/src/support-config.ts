import type { Environment } from './config.js';
export function loadSupportConfig(env: Environment) {
  const mode = env.N5_SUPPORT_MODE ?? 'disabled';
  if (!['disabled', 'test', 'libredesk'].includes(mode)) throw new Error('N5_SUPPORT_MODE: invalid mode');
  const contactEmail = env.N5_SUPPORT_CONTACT_EMAIL || null;
  if (contactEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('N5_SUPPORT_CONTACT_EMAIL: invalid email');
  if (mode === 'disabled') return { mode: 'disabled' as const, baseURL: null, inboxID: null, identifiedEnabled: false, contactEmail, synthetic: false, secret: null };
  if (mode === 'test' && env.NODE_ENV !== 'test') throw new Error('Support test mode requires NODE_ENV=test');
  const baseURL = env.N5_SUPPORT_BASE_URL;
  const inboxID = env.N5_SUPPORT_INBOX_ID;
  if (!baseURL || !inboxID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inboxID)) throw new Error('Support widget settings missing');
  const parsed = new URL(baseURL);
  if (parsed.origin !== baseURL || parsed.username || parsed.password || (mode === 'libredesk' && parsed.protocol !== 'https:') ||
    (mode === 'test' && !['localhost', '127.0.0.1', 'support.test'].includes(parsed.hostname))) throw new Error('Support origin invalid');
  const identified = env.N5_SUPPORT_IDENTIFIED ?? 'false';
  if (!['true','false'].includes(identified)) throw new Error('N5_SUPPORT_IDENTIFIED: invalid boolean');
  const secret = identified === 'true' ? env.N5_SUPPORT_JWT_SECRET : null;
  if (identified === 'true' && (!secret || Buffer.byteLength(secret) < 32)) throw new Error('Support JWT secret missing');
  return { mode: mode as 'test'|'libredesk', baseURL, inboxID, identifiedEnabled: identified === 'true', contactEmail, synthetic: mode === 'test', secret: secret ?? null };
}
export function loadMailConfig(env: Environment) {
  const mode = env.N5_MAIL_MODE ?? 'disabled';
  if (!['disabled','test','smtp'].includes(mode)) throw new Error('N5_MAIL_MODE: invalid mode');
  if (mode === 'disabled') return { mode: 'disabled' as const };
  if (mode === 'test') {
    if (env.NODE_ENV !== 'test') throw new Error('Mail test mode requires NODE_ENV=test');
    return { mode: 'test' as const };
  }
  const host = env.N5_SMTP_HOST, user = env.N5_SMTP_USER, password = env.N5_SMTP_PASSWORD, from = env.N5_MAIL_FROM;
  const port = Number(env.N5_SMTP_PORT);
  if (!host || !user || !password || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || ![465,587].includes(port) ||
    env.N5_SMTP_SECURE !== (port === 465 ? 'true' : 'false')) throw new Error('SMTP configuration incomplete');
  return { mode: 'smtp' as const, host, port, user, password, from, secure: port === 465 };
}
