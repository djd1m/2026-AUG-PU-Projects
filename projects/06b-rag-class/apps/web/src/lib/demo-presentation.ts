import type { PublicationBot } from '@n6b/db';

export function publicationDemoPath(bot: PublicationBot): string | null {
  return bot.published && bot.demo_enabled && bot.demo_slug && /^[A-Za-z0-9_-]{12,64}$/.test(bot.demo_slug)
    ? `/b/${bot.demo_slug}` : null;
}

/** Citations are server-resolved; still refuse active schemes at the rendering boundary. */
export function citationHref(raw: string | null): string | null {
  if (!raw) return null;
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? raw : null; }
  catch { return null; }
}
