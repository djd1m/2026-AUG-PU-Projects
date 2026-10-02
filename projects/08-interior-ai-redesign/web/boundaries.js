export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function requireUuid(id) {
  if (!UUID.test(id)) throw new HttpError(400, 'invalid_id');
  return id;
}
export function credentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.email !== 'string' || typeof body.password !== 'string') throw new HttpError(400, 'invalid_credentials');
  const email = body.email.trim().toLowerCase();
  const length = [...body.password].length;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || length < 12 || length > 128) throw new HttpError(400, 'invalid_credentials');
  return { email, password: body.password };
}
export function requireOrigin(req, origin) {
  if (req.headers.origin !== origin) throw new HttpError(403, 'origin_denied');
}
export async function readBody(req, limit) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new HttpError(415, 'encoding_denied');
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new HttpError(413, 'body_too_large');
  const chunks = []; let size = 0;
  const timeout = setTimeout(() => req.destroy(), 10000);
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, 'body_too_large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timeout); }
}
export async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'json_required');
  const bytes = await readBody(req, 16384);
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new HttpError(400, 'invalid_json'); }
}
export class RateLimiter {
  constructor() { this.windows = new Map(); }
  take(key, limit, duration, now = Date.now()) {
    if (this.windows.size >= 10000) {
      for (const [name, entry] of this.windows) if (entry.until <= now) this.windows.delete(name);
      if (!this.windows.has(key) && this.windows.size >= 10000) throw new HttpError(429, 'rate_limited');
    }
    let entry = this.windows.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + duration }; this.windows.set(key, entry); }
    if (++entry.count > limit) throw new HttpError(429, 'rate_limited');
  }
}
export class Capacity {
  constructor(max) { this.max = max; this.active = 0; }
  async run(action) {
    if (this.active >= this.max) throw new HttpError(503, 'busy');
    this.active++;
    try { return await action(); } finally { this.active--; }
  }
}
