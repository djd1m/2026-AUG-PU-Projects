// CheckAddress (Pseudocode, FR-SOURCE-002, NFR-SEC-004, ADR-010) — написано заново: донора нет (ADR-016,
// reuse-inventory §9). Краулер не сканер нашей сети: схема, учётные данные и порт проверяются ДО DNS;
// DNS разрешаем САМИ и проверяем КАЖДЫЙ адрес; соединяться вызывающий обязан именно с возвращённым IP
// (safe-get.ts), иначе второй запрос DNS (rebinding) подменит проверенный адрес непроверенным.
//
// Политика по адресам — РАЗРЕШАЮЩИЙ список для IPv6 (только глобальный юникаст 2000::/3 минус служебные
// подсети) и запрещающий для IPv4 (все частные, петлевые, link-local, CGNAT, служебные, документационные,
// мультикаст, резерв). Неразбираемое — запрещено (fail-closed).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type Resolver = (hostname: string) => Promise<string[]>;

// Отказ адреса: blocked_address (частная сеть, схема, порт, учётные данные) либо unreachable (имя не
// разрешилось). Текст — для журнала; адрес целиком в журнал не пишется.
export class AddressRefused extends Error {
  constructor(readonly reason: 'blocked_address' | 'unreachable', detail: string) {
    super(`Адрес отвергнут (${reason}): ${detail}`);
    this.name = 'AddressRefused';
  }
}

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

// [сеть, длина префикса] — IPv4.
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],        // «эта сеть», включая 0.0.0.0
  ['10.0.0.0', 8],       // частная
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // петля
  ['169.254.0.0', 16],   // link-local, в т.ч. метаданные облака 169.254.169.254
  ['172.16.0.0', 12],    // частная
  ['192.0.0.0', 24],     // служебная IETF
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.88.99.0', 24],   // 6to4 relay
  ['192.168.0.0', 16],   // частная
  ['198.18.0.0', 15],    // стенды производительности
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // мультикаст
  ['240.0.0.0', 4],      // резерв и 255.255.255.255
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = value * 256 + Number(part);
  }
  return value;
}
const inV4 = (ip: number, net: string, bits: number) => {
  const base = v4ToInt(net)!;
  const size = 2 ** (32 - bits);
  return ip >= base && ip < base + size;
};
function blockedV4(ip: string): boolean {
  const value = v4ToInt(ip);
  if (value === null) return true;
  return BLOCKED_V4.some(([net, bits]) => inV4(value, net, bits));
}

// IPv6 → 128-битное число. Зона (%eth0) — признак link-local: не разбираем, запрещаем.
function v6ToBigInt(ip: string): bigint | null {
  if (ip.includes('%')) return null;
  let text = ip.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const v4 = v4ToInt(tail[1]!);
    if (v4 === null) return null;
    text = text.slice(0, -tail[1]!.length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}
const prefix6 = (value: bigint, net: string, bits: number) => {
  const base = v6ToBigInt(net)!;
  const shift = BigInt(128 - bits);
  return (value >> shift) === (base >> shift);
};
// Внутри 2000::/3 — служебные подсети, которые наружу не ведут или несут встроенный IPv4.
const BLOCKED_V6_INSIDE_GLOBAL: ReadonlyArray<readonly [string, number]> = [
  ['2001::', 32],      // Teredo (встроенный IPv4)
  ['2001:2::', 48],    // стенды
  ['2001:10::', 28],   // ORCHID
  ['2001:20::', 28],   // ORCHIDv2
  ['2001:db8::', 32],  // документация
  ['2002::', 16],      // 6to4 (встроенный IPv4)
  ['3fff::', 20],      // документация (RFC 9637)
];
function blockedV6(ip: string): boolean {
  const value = v6ToBigInt(ip);
  if (value === null) return true;
  // ::ffff:a.b.c.d — IPv4 в одежде IPv6: решает правило IPv4.
  if ((value >> 32n) === 0xffffn) {
    const v4 = Number(value & 0xffffffffn);
    return blockedV4([v4 >>> 24, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255].join('.'));
  }
  if (!prefix6(value, '2000::', 3)) return true; // ::, ::1, fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96, 100::/64 …
  return BLOCKED_V6_INSIDE_GLOBAL.some(([net, bits]) => prefix6(value, net, bits));
}

// Адрес запрещён? Всё, что не разобралось как IPv4/IPv6, — запрещено.
export function isBlockedIp(ip: string): boolean {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  const family = isIP(bare);
  if (family === 4) return blockedV4(bare);
  if (family === 6) return blockedV6(bare);
  return true;
}

const ALLOWED_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };
// Шаг 1: форма URL. Возвращает разобранный URL; иначе AddressRefused(blocked_address).
export function checkUrlShape(input: string | URL): URL {
  let url: URL;
  try { url = new URL(String(input)); } catch { throw new AddressRefused('blocked_address', 'непригодный URL'); }
  if (!(url.protocol in ALLOWED_PORTS)) throw new AddressRefused('blocked_address', `схема ${url.protocol}`);
  if (url.username || url.password) throw new AddressRefused('blocked_address', 'учётные данные в URL');
  const port = url.port || ALLOWED_PORTS[url.protocol]!;
  if (port !== '80' && port !== '443') throw new AddressRefused('blocked_address', `порт ${port}`);
  if (!url.hostname) throw new AddressRefused('blocked_address', 'нет хоста');
  return url;
}

export interface CheckedAddress { url: URL; ip: string; family: 4 | 6; port: number }

// Шаги 1–2: форма, затем DNS и проверка КАЖДОГО адреса. Возвращает первый адрес — с ним и соединяться.
export async function checkAddress(input: string | URL, resolve: Resolver = systemResolver): Promise<CheckedAddress> {
  const url = checkUrlShape(input);
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try { addresses = await resolve(host); } catch { throw new AddressRefused('unreachable', 'имя не разрешилось'); }
  }
  if (!addresses.length) throw new AddressRefused('unreachable', 'имя без адресов');
  // ЛЮБОЙ запрещённый адрес в ответе — отказ: иначе выбор адреса ОС (или следующий запрос) уведёт внутрь.
  if (addresses.some(isBlockedIp)) throw new AddressRefused('blocked_address', 'адрес частной или служебной сети');
  const ip = addresses[0]!;
  return { url, ip, family: isIP(ip) === 6 ? 6 : 4, port: Number(url.port || ALLOWED_PORTS[url.protocol]) };
}
