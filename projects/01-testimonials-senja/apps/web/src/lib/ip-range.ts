// Принадлежность IP-адреса сети в нотации CIDR.
//
// Вынесено отдельным модулем, потому что это несущая часть аутентификации вебхука
// ЮKassa (D-009): провайдер не подписывает уведомления, и «адрес из списка сетей» —
// один из двух способов отличить настоящее уведомление от поддельного.
//
// Сравнение строкой по префиксу здесь недопустимо: "185.71.76.0/27" покрывает
// 185.71.76.0-31, но НЕ 185.71.76.100 — хотя строковый префикс "185.71.76." совпадает
// у обоих. Поэтому адреса разбираются в числа и маскируются.

/** IPv4 -> 32-битное число. null, если это не IPv4. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    // Ведущие нули запрещены намеренно: "010" в разных парсерах читается и как 8, и как 10.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/** IPv6 -> 128-битное число. Понимает сокращение "::" и IPv4-mapped хвост. */
function ipv6ToBigInt(ip: string): bigint | null {
  let value = ip.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  // Зона ("%eth0") к адресу не относится.
  const percent = value.indexOf('%');
  if (percent !== -1) value = value.slice(0, percent);
  if (!value.includes(':')) return null;

  // Хвост вида ::ffff:1.2.3.4 — переводим в два шестнадцатеричных слова.
  const lastColon = value.lastIndexOf(':');
  const tail = value.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    value = `${value.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const doubleColon = value.indexOf('::');
  let head: string[];
  let rest: string[];
  if (doubleColon === -1) {
    head = value.split(':');
    rest = [];
    if (head.length !== 8) return null;
  } else {
    // Второе "::" делает адрес неоднозначным.
    if (value.indexOf('::', doubleColon + 1) !== -1) return null;
    head = value.slice(0, doubleColon).split(':').filter((s) => s !== '');
    rest = value.slice(doubleColon + 2).split(':').filter((s) => s !== '');
    if (head.length + rest.length > 8) return null;
  }

  const groups = [...head, ...Array(8 - head.length - rest.length).fill('0'), ...rest];
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

/**
 * Проверяет принадлежность адреса сети. Принимает и одиночный адрес ("77.75.156.11"),
 * и CIDR ("185.71.76.0/27"). Разные семейства (IPv4 против IPv6) никогда не совпадают,
 * кроме IPv4-mapped — такой адрес сравнивается как IPv4.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [network, prefixRaw] = cidr.split('/');
  if (!network) return false;
  // Пустая маска ("1.2.3.4/") — это ОПЕЧАТКА, а не /0. Number('') равен нулю, поэтому
  // без этой проверки такая запись в списке сетей молча означала бы «пускать всех»
  // (поймано тестом). Отсутствие маски и пустая маска — разные вещи.
  if (prefixRaw !== undefined && prefixRaw.trim() === '') return false;

  // IPv4-mapped ("::ffff:1.2.3.4") — это IPv4-адрес, пришедший по IPv6-сокету.
  const normalized = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip.trim().toLowerCase());
  const candidate = normalized?.[1] ?? ip.trim();

  const netV4 = ipv4ToInt(network);
  if (netV4 !== null) {
    const addr = ipv4ToInt(candidate);
    if (addr === null) return false;
    const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    // >>> 0 — иначе сдвиг даёт знаковое число и маска для /1../8 ломается.
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return ((addr >>> 0) & mask) === ((netV4 >>> 0) & mask);
  }

  const netV6 = ipv6ToBigInt(network);
  if (netV6 === null) return false;
  const addr6 = ipv6ToBigInt(candidate);
  if (addr6 === null) return false;
  const prefix = prefixRaw === undefined ? 128 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false;
  if (prefix === 0) return true;
  const mask6 = ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return (addr6 & mask6) === (netV6 & mask6);
}

/** true, если адрес принадлежит хотя бы одной сети из списка. */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((c) => ipInCidr(ip, c));
}
