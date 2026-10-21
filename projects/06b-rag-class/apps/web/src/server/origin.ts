export const ORIGIN_MAX_LENGTH = 2048;
export const ORIGIN_MAX_COUNT = 20;

/** URL.origin is the single canonical representation, including IDNA and default ports. */
export function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > ORIGIN_MAX_LENGTH || /[\u0000-\u001f\u007f*]/u.test(text)
    || !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*') || url.username || url.password
      || url.origin === 'null' || url.origin.length > ORIGIN_MAX_LENGTH) return null;
    return url.origin;
  } catch { return null; }
}

export function normalizeOrigins(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > ORIGIN_MAX_COUNT) return null;
  const origins = raw.map(normalizeOrigin);
  if (origins.some((origin) => origin === null)) return null;
  return [...new Set(origins as string[])];
}

/** A proposal is never persisted until the owner submits; published empty lists stay empty. */
export function publicationOrigins(bot: { published: boolean; allowed_origins: readonly string[];
  first_site_url: string | null }): string[] {
  if (bot.published || bot.allowed_origins.length > 0) return [...bot.allowed_origins];
  const origin = normalizeOrigin(bot.first_site_url);
  return origin ? [origin] : [];
}
