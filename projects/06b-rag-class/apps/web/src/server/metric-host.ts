import { isIP } from 'node:net';

/** Shared by page, Origin and ask attribution. Only http(s) URLs yield a metric host. */
export function metricHost(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

const PREVIEW_SUFFIXES = ['vercel.app', 'netlify.app', 'github.io', 'tilda.ws', 'pages.dev'] as const;
export function excludedMetricHost(host: string, publicBaseUrl: string): boolean {
  return host === metricHost(publicBaseUrl) || host === 'localhost' || host.endsWith('.localhost')
    || host.endsWith('.local') || isIP(host.replace(/^\[|\]$/g, '')) !== 0
    || PREVIEW_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
