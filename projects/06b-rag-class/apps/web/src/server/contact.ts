import { z } from 'zod';

export const CONTACT_MAX_LENGTH = 512;
const email = z.string().email().max(254);

export function normalizeContact(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > CONTACT_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(text)) return null;
  if (email.safeParse(text).success || /^\+[1-9]\d{1,14}$/.test(text)) return text;
  if (!/^https:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hostname.includes('*')) return null;
    return url.href.length <= CONTACT_MAX_LENGTH ? url.href : null;
  } catch { return null; }
}
