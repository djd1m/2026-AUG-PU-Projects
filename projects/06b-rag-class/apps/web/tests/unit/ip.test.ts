import { describe, expect, it } from 'vitest';
import { addrHash, addrKey, ClientAddressUnavailable, clientIp } from '@/server/ip';

const h = (xff?: string) => new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff });

describe('адрес клиента и ключ предела входа (FR-n6b-1)', () => {
  it('берётся ПОСЛЕДНИЙ элемент X-Forwarded-For — его дописывает прокси', () => {
    expect(clientIp(h('1.1.1.1, 203.0.113.9'))).toBe('203.0.113.9');
    expect(clientIp(h('2001:DB8::1'))).toBe('2001:db8::1');
  });

  it.each([undefined, '', ' ', 'unknown', '1.1.1.1, garbage', '999.1.1.1'])(
    'нет пригодного адреса (%j) → исключение, а не вход без предела', (xff) => {
      expect(() => clientIp(h(xff))).toThrow(ClientAddressUnavailable);
    });

  it('IPv4 — адрес целиком (соседи по /24 не делят предел входа)', () => {
    expect(addrKey('203.0.113.9')).toBe('203.0.113.9');
    expect(addrKey('203.0.113.9')).not.toBe(addrKey('203.0.113.10'));
    expect(addrKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(addrKey('::ffff:cb00:7109')).toBe('203.0.113.9'); // F-6: hex-запись того же IPv4
    expect(addrKey('0:0:0:0:0:ffff:cb00:7109')).toBe('203.0.113.9');
  });

  it('SC-US-001-4: IPv6 — префикс /64; смена адреса внутри /64 ключ не меняет', () => {
    expect(addrKey('2001:db8:aa:bb::1')).toBe('2001:db8:aa:bb::/64');
    expect(addrKey('2001:db8:aa:bb:ffff:1:2:3')).toBe(addrKey('2001:db8:aa:bb::1'));
    expect(addrKey('2001:0db8:00aa:00bb:0:0:0:9')).toBe(addrKey('2001:db8:aa:bb::1'));
    expect(addrKey('2001:db8:aa:bc::1')).not.toBe(addrKey('2001:db8:aa:bb::1'));
    expect(addrKey('::1')).toBe('0:0:0:0::/64');
    expect(addrKey('64:ff9b:1:2::203.0.113.9')).toBe('64:ff9b:1:2::/64');
  });

  it('в БД уходит HMAC ключа, а не адрес; секрет меняет хэш', () => {
    const a = addrHash('x'.repeat(32), '203.0.113.9');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('203');
    expect(addrHash('y'.repeat(32), '203.0.113.9')).not.toBe(a);
    expect(addrHash('x'.repeat(32), '2001:db8:aa:bb::1')).toBe(addrHash('x'.repeat(32), '2001:db8:aa:bb::2'));
  });
});
