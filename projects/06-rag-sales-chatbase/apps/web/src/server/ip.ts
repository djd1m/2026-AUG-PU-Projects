// из N5: projects/05-podcast-clips-opus/apps/web/src/server/ip.ts — адаптировано: дверь N6 ЗАМЕНЯЕТ
// X-Forwarded-For одним адресом клиента (proxy/Caddyfile `header_up X-Forwarded-For {client_ip}`, урок N4),
// поэтому число доверенных звеньев не настраивается; префикс IPv6 — /48 (канон §7), а не /64 как у N5.
import { isIP } from 'node:net';

// web не опубликован мимо proxy (docker-compose.yml), значит заголовок пишет только наша дверь.
// Цепочка из нескольких адресов означает, что дверь настроена не так: отказ, а не догадка.
export function clientIp(headers: Headers): string {
  const chain = headers.get('x-forwarded-for')?.split(',');
  const candidate = chain?.length === 1 ? chain[0]?.trim() : undefined;
  if (!candidate || !isIP(candidate)) throw new Error('Адрес клиента недоступен: ограничитель не может защитить вход');
  return candidate.toLowerCase();
}
export function ipPrefix(ip: string): string {
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
  if (isIP(ip) !== 6) throw new Error('Непригодный IP: полный адрес не будет сохранён');
  // Развёртка IPv6 нужна только для первых 48 бит; хвост никогда не сохраняется.
  const [left = '', right = ''] = ip.split('::');
  const lhs = left ? left.split(':') : [];
  const rhs = right ? right.split(':') : [];
  const groups = ip.includes('::') ? [...lhs, ...Array<string>(8 - lhs.length - rhs.length).fill('0'), ...rhs] : lhs;
  return `${groups.slice(0, 3).map((g) => Number.parseInt(g, 16).toString(16)).join(':')}::/48`;
}
