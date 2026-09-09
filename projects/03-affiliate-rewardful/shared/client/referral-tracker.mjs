const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function captureReferral(config, browser = globalThis) {
  const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
  const tenantPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const maximumLifetime = 365 * 24 * 60 * 60 * 1000;
  const location = browser?.location;
  const document = browser?.document;
  const history = browser?.history;
  const Url = browser?.URL ?? globalThis.URL;
  const now = typeof browser?.now === 'function' ? browser.now() : Date.now();
  if (!config || !tenantPattern.test(config.tenantId) || !Number.isInteger(config.windowDays)
    || config.windowDays < 1 || config.windowDays > 365 || !location || !document || !history || !Url) {
    return { status: 'invalid-config' };
  }

  let landing;
  try { landing = new Url(config.landingOrigin); } catch { return { status: 'invalid-config' }; }
  if (landing.protocol !== 'https:' || landing.origin !== config.landingOrigin || location.origin !== landing.origin) {
    return { status: 'origin-mismatch' };
  }

  let current;
  try { current = new Url(location.href); } catch { return { status: 'invalid-location' }; }
  const token = current.searchParams.get('n3_ref');
  const rawExpiry = current.searchParams.get('n3_ref_expires');
  if (current.searchParams.has('n3_ref') || current.searchParams.has('n3_ref_expires')) {
    current.searchParams.delete('n3_ref');
    current.searchParams.delete('n3_ref_expires');
    try { history.replaceState(history.state ?? null, '', `${current.pathname}${current.search}${current.hash}`); }
    catch { /* capture still remains safe when a host blocks history mutation */ }
  }

  const cookieName = `n3_ref_${config.tenantId}`;
  function readReceipt() {
    let header;
    try { header = document.cookie; } catch { return null; }
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
      const value = part.slice(separator + 1).trim();
      const dot = value.lastIndexOf('.');
      const savedToken = value.slice(0, dot);
      const savedExpiry = Number(value.slice(dot + 1));
      if (tokenPattern.test(savedToken) && Number.isSafeInteger(savedExpiry) && savedExpiry > now) {
        return { token: savedToken, expiresAt: savedExpiry };
      }
    }
    return null;
  }

  const retained = readReceipt();
  if (retained) return { status: 'retained', expiresAt: retained.expiresAt };
  if (token === null && rawExpiry === null) return { status: 'empty' };
  if (!tokenPattern.test(token ?? '') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rawExpiry ?? '')) {
    return { status: 'invalid-referral' };
  }
  const expiresAt = Date.parse(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || new Date(expiresAt).toISOString() !== rawExpiry
    || expiresAt <= now || expiresAt - now > maximumLifetime) {
    return { status: 'invalid-referral' };
  }

  const attributes = [`${cookieName}=${token}.${expiresAt}`, 'Path=/', 'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`];
  if (location.protocol === 'https:') attributes.push('Secure');
  try { document.cookie = attributes.join('; '); } catch { return { status: 'cookie-blocked' }; }
  const saved = readReceipt();
  return saved?.token === token && saved.expiresAt === expiresAt
    ? { status: 'stored', expiresAt }
    : { status: 'cookie-blocked' };
}

export function createReferralTrackerScript(config) {
  if (!config || !UUID.test(config.tenantId) || !Number.isInteger(config.windowDays)
    || config.windowDays < 1 || config.windowDays > 365) throw new TypeError('Invalid referral tracker config.');
  let origin;
  try { origin = new URL(config.landingOrigin); } catch { throw new TypeError('Invalid referral tracker config.'); }
  if (origin.protocol !== 'https:' || origin.origin !== config.landingOrigin) {
    throw new TypeError('Invalid referral tracker config.');
  }
  const safeConfig = { tenantId: config.tenantId, windowDays: config.windowDays, landingOrigin: origin.origin };
  const serialized = JSON.stringify(safeConfig).replace(/[\u2028\u2029]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `;(${captureReferral.toString()})(${serialized});\n`;
}
