import type { Environment } from './config.js';
function requireIsolatedTest(env:Environment) {
  let isolated=false;
  try {isolated=new URL(env.DATABASE_URL??'').pathname.endsWith('_test');}catch{/* Invalid URLs fail closed. */}
  if(env.NODE_ENV!=='test'||!isolated)throw new Error('Support/mail test mode requires NODE_ENV=test and isolated *_test database');
}
export function loadSupportConfig(env: Environment) {
  const mode = env.N5_SUPPORT_MODE ?? 'disabled';
  if (!['disabled', 'test', 'libredesk'].includes(mode)) throw new Error('N5_SUPPORT_MODE: invalid mode');
  const contactEmail = env.N5_SUPPORT_CONTACT_EMAIL || null;
  if (contactEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('N5_SUPPORT_CONTACT_EMAIL: invalid email');
  if (mode === 'disabled') return { mode: 'disabled' as const, baseURL: null, inboxID: null, identifiedEnabled: false, contactEmail, synthetic: false, secret: null };
  if (mode === 'test') requireIsolatedTest(env);
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
  if (!['disabled','test','smtp','resend'].includes(mode)) throw new Error('N5_MAIL_MODE: invalid mode');
  if (mode === 'disabled') return { mode: 'disabled' as const };
  if (mode === 'test') {
    requireIsolatedTest(env);
    return { mode: 'test' as const };
  }
  if (mode === 'resend') {
    const apiKey=env.N5_RESEND_API_KEY, from=env.N5_MAIL_FROM;
    const email=(value:string)=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
    const named=from && /^[^<>]+ <([^<>]+)>$/.exec(from);
    if (!apiKey || !apiKey.trim() || apiKey.length>4096 || /[\x00-\x20\x7f]/.test(apiKey) ||
      !from || from.length>320 || /[\x00-\x1f\x7f]/.test(from) || !(email(from)||(named&&email(named[1]!)))) {
      throw new Error('Resend configuration incomplete');
    }
    return {mode:'resend' as const,apiKey,from};
  }
  const host = env.N5_SMTP_HOST, user = env.N5_SMTP_USER, password = env.N5_SMTP_PASSWORD, from = env.N5_MAIL_FROM;
  const port = Number(env.N5_SMTP_PORT);
  if (!host || !user || !password || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || ![465,587].includes(port) ||
    env.N5_SMTP_SECURE !== (port === 465 ? 'true' : 'false')) throw new Error('SMTP configuration incomplete');
  return { mode: 'smtp' as const, host, port, user, password, from, secure: port === 465 };
}
