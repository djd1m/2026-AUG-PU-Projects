// Адрес клиента и ключи пределов — перенос N5 apps/web/src/server/ip.ts (#20); в foundation жил в apps/web, здесь
// вынесен в общий пакет (spend-ceilings), чтобы ключ посетителя виджета и ключ входа строила ОДНА нормализация
// (вторая копия развёртки IPv6 — дефект, coding-style.md). Адаптации:
//  * адрес — ПОСЛЕДНИЙ элемент X-Forwarded-For (Pseudocode): web доступен только через TLS-прокси машины (ADR-014);
//    нет адреса → исключение, а не запрос без предела;
//  * вход: IPv4 целиком, IPv6 /64 (FR-n6b-1); посетитель: IPv4 /24, IPv6 /64 + bot_id (model-cost-contract.md);
//  * в БД попадает только HMAC с VISITOR_SECRET — IP не хранится (NFR-n6b-4).

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export class ClientAddressUnavailable extends Error {
  constructor() {
    super('адрес клиента недоступен: предел не может защитить вызов');
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

/**
 * Префикс адреса: IPv4 — первые v4Bits бит (32 или 24), IPv6 — всегда /64. IPv4-mapped IPv6 (::ffff:0:0/96) в ЛЮБОЙ
 * записи — `::ffff:1.2.3.4`, `::ffff:102:304`, `0:0:0:0:0:ffff:0102:0304` — читается как IPv4: иначе все такие адреса
 * попадают в один /64 `0:0:0:0::/64` и делят ключ посетителя (08_review.md F-6).
 */
export function addrPrefix(ip: string, v4Bits: 32 | 24): string {
  let value = ip.toLowerCase();
  if (isIP(value) === 6) {
    const g = ipv6Groups(value);
    if (g.length === 8 && g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      value = [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff].join('.');
    }
  }
  if (isIP(value) === 4) {
    if (v4Bits === 32) return value;
    return `${value.split('.').slice(0, 3).join('.')}.0/24`;
  }
  if (isIP(value) !== 6) throw new ClientAddressUnavailable();
  return `${ipv6Groups(value).slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** Ключ адреса для предела входа: IPv4 целиком, IPv6 — /64 (смена адреса внутри /64 счётчик не обнуляет). */
export function addrKey(ip: string): string {
  return addrPrefix(ip, 32);
}

function hmac32(secret: string, value: string): string {
  if (!secret) throw new Error('VISITOR_SECRET пуст: ключ предела не построить');
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}

/** HMAC ключа адреса с VISITOR_SECRET — единственная форма адреса входа, попадающая в БД. */
export function addrHash(secret: string, ip: string): string {
  return hmac32(secret, addrKey(ip));
}

/** Ключ посетителя: HMAC(VISITOR_SECRET, префикс /24 или /64 + bot_id) — единица счёта «адрес» контракта расходов. */
export function visitorKey(secret: string, ip: string, botId: string): string {
  return hmac32(secret, `${addrPrefix(ip, 24)}|${botId.toLowerCase()}`);
}
