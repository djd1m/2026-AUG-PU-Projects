// Усечение адреса клиента ДО префикса — на ВХОДЕ, а не при печати.
//
// Значения, которого нет, не утечёт и по ошибке: полный адрес не хранится ни в
// `device_session`, ни в аудите anti-fraud, ни в журнале. Квоте и anti-fraud префикса
// достаточно, а полный адрес создал бы обязательство без нужды.
//
// IPv4 → /24, IPv6 → /48 (`Architecture.md`, Security Architecture).

/**
 * Источник адреса — заголовок, поставленный НАШИМ Caddy. Caddy дописывает адрес своего
 * непосредственного клиента В КОНЕЦ `X-Forwarded-For`, поэтому берётся ПОСЛЕДНИЙ элемент.
 * Это верно ровно потому, что `api` не опубликован на хост и достижим ТОЛЬКО через прокси:
 * при прямом доступе последний элемент стал бы значением атакующего, и смена заголовка
 * обнулила бы и квоту, и ограничение частоты (`deployment-seams`).
 */
export function clientAddressFrom(forwardedFor: string | string[] | undefined, socketAddress: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  if (header !== undefined) {
    const parts = header
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
    const last = parts[parts.length - 1];
    if (last !== undefined) return last;
  }
  return socketAddress;
}

function isIPv4(address: string): boolean {
  const octets = address.split('.');
  return octets.length === 4 && octets.every((octet) => /^[0-9]{1,3}$/.test(octet) && Number(octet) <= 255);
}

/**
 * Усекает адрес до префикса сети. Неразбираемый вход — НЕ повод сохранить его целиком:
 * возвращается метка `unknown`, потому что «не смогли усечь» не даёт права записать
 * полный адрес (`fail-closed-defaults`).
 */
export function toIpPrefix(address: string): string {
  const raw = address.trim();
  if (raw === '') return 'unknown';

  // Форма `::ffff:203.0.113.7` — это IPv4, приехавший по IPv6-сокету.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  const candidate = mapped?.[1] ?? raw;

  if (isIPv4(candidate)) {
    const [a, b, c] = candidate.split('.');
    return `${a}.${b}.${c}.0/24`;
  }

  if (candidate.includes(':')) {
    const groups = expandIPv6(candidate);
    if (groups === undefined) return 'unknown';
    // /48 — это первые ТРИ группы по 16 бит.
    return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
  }

  return 'unknown';
}

function expandIPv6(address: string): string[] | undefined {
  const withoutZone = address.split('%')[0] ?? address;
  const halves = withoutZone.split('::');
  if (halves.length > 2) return undefined;
  const head = (halves[0] ?? '').split(':').filter((group) => group !== '');
  const tail = halves.length === 2 ? (halves[1] ?? '').split(':').filter((group) => group !== '') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 0) return undefined;
  if (halves.length === 1 && head.length !== 8) return undefined;
  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill('0'), ...tail] : head;
  if (groups.length !== 8) return undefined;
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return undefined;
  return groups.map((group) => group.replace(/^0+(?=.)/, '').toLowerCase());
}
