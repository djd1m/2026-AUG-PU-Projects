import { isIP } from 'node:net';

export function clientIp(headers: Headers): string {
  // Только сеть compose: Caddy добавляет адрес непосредственного клиента справа.
  // Входящий X-Forwarded-For пользователя слева не является доверенным.
  const candidate = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (!candidate || !isIP(candidate)) throw new Error('Адрес клиента недоступен: ограничитель не может защитить вход');
  return candidate.toLowerCase();
}
export function ipPrefix(ip: string): string {
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
  if (isIP(ip) !== 6) throw new Error('Непригодный IP: полный адрес не будет сохранён');
  // Развёртка IPv6 нужна только для первых 24 бит; хвост никогда не сохраняется.
  const [left = '', right = ''] = ip.split('::');
  const lhs = left ? left.split(':') : [];
  const rhs = right ? right.split(':') : [];
  const groups = ip.includes('::') ? [...lhs, ...Array<string>(8 - lhs.length - rhs.length).fill('0'), ...rhs] : lhs;
  return `${Number.parseInt(groups[0] ?? '0', 16).toString(16)}:${(Number.parseInt(groups[1] ?? '0', 16) & 0xff00).toString(16)}::/24`;
}
