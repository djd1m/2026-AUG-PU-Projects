// Адрес клиента и ключ предела — перенос N5 apps/web/src/server/ip.ts (#20), адаптирован:
//  * адрес — ПОСЛЕДНИЙ элемент X-Forwarded-For (Pseudocode «Register and login»): web доступен только через TLS-прокси
//    машины (ADR-014), последний элемент дописывает прокси; нет адреса → исключение, а не вход без предела;
//  * addrKey для предела входа: IPv4 — адрес целиком, IPv6 — префикс /64 (FR-n6b-1);
//  * в БД попадает только HMAC ключа с VISITOR_SECRET — IP не хранится (NFR-n6b-4).

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export class ClientAddressUnavailable extends Error {
  constructor() {
    super('адрес клиента недоступен: предел попыток не может защитить вход');
    this.name = 'ClientAddressUnavailable';
  }
}

export function clientIp(headers: Headers): string {
  const chain = headers.get('x-forwarded-for')?.split(',');
  const candidate = chain?.[chain.length - 1]?.trim().toLowerCase();
  if (!candidate || !isIP(candidate)) throw new ClientAddressUnavailable();
  return candidate;
}

function ipv6Groups(ip: string): number[] {
  const expandSide = (side: string): string[] => {
    if (!side) return [];
    return side.split(':').flatMap((g) => {
      if (isIP(g) !== 4) return [g];
      const [a = 0, b = 0, c = 0, d = 0] = g.split('.').map(Number);
      return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    });
  };
  const [left = '', right = ''] = ip.split('::');
  const lhs = expandSide(left);
  const rhs = expandSide(right);
  const groups = ip.includes('::') ? [...lhs, ...Array<string>(8 - lhs.length - rhs.length).fill('0'), ...rhs] : lhs;
  return groups.map((g) => Number.parseInt(g, 16));
}

/** Ключ адреса для предела входа: IPv4 целиком, IPv6 — /64 (смена адреса внутри /64 счётчик не обнуляет). */
export function addrKey(ip: string): string {
  let value = ip.toLowerCase();
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) value = value.slice(7);
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) throw new ClientAddressUnavailable();
  return `${ipv6Groups(value).slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** HMAC ключа адреса с VISITOR_SECRET — единственная форма адреса, попадающая в БД. */
export function addrHash(secret: string, ip: string): string {
  return createHmac('sha256', secret).update(addrKey(ip)).digest('hex').slice(0, 32);
}
