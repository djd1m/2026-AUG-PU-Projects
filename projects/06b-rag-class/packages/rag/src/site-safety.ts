import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalizeSiteUrl } from '@n6b/db';

export type SiteResolver = (hostname: string) => Promise<readonly { address: string; family: number }[]>;
export const resolveSite: SiteResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });
export class UnsafeSite extends Error {
  constructor() { super('Адрес сайта не разрешён или DNS недоступен'); this.name = 'UnsafeSite'; }
}

/** Разрешающий список глобального unicast; специальные диапазоны исключены до соединения. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number) as [number, number, number];
    return !(address === '168.63.129.16' || a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  const first = parseInt(canonical.split(':')[0]!, 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
  // IETF special assignments (Teredo, benchmarking, ORCHID), documentation and 6to4.
  if (canonical.startsWith('2001:') && parseInt(canonical.split(':')[1] || '0', 16) <= 0x1ff) return false;
  return !canonical.startsWith('2001:db8:') && !canonical.startsWith('2002:') && !canonical.startsWith('3fff:');
}

export async function validateSite(raw: unknown, resolver: SiteResolver = resolveSite): Promise<{ url: URL; address: string; family: number }> {
  const normalized = normalizeSiteUrl(raw);
  if (!normalized) throw new UnsafeSite();
  const url = new URL(normalized);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: readonly { address: string; family: number }[];
  try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host); }
  catch { throw new UnsafeSite(); }
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address))) throw new UnsafeSite();
  return { url, ...addresses[0]! };
}
