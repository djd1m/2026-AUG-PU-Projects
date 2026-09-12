// Усечение адреса (AC-foundation-6, Security Architecture).

import { describe, expect, it } from 'vitest';
import { clientAddressFrom, toIpPrefix } from '../../apps/api/src/session/ip-prefix.js';

describe('усечение адреса клиента', () => {
  it('адрес IPv4 усекается до /24 а IPv6 до /48', () => {
    expect(toIpPrefix('203.0.113.77')).toBe('203.0.113.0/24');
    expect(toIpPrefix('10.1.2.3')).toBe('10.1.2.0/24');
    // IPv4, приехавший по IPv6-сокету, остаётся IPv4 и усекается по правилам IPv4.
    expect(toIpPrefix('::ffff:203.0.113.77')).toBe('203.0.113.0/24');

    expect(toIpPrefix('2001:db8:1234:5678::1')).toBe('2001:db8:1234::/48');
    expect(toIpPrefix('2001:db8::1')).toBe('2001:db8:0::/48');
    expect(toIpPrefix('fe80::1%eth0')).toBe('fe80:0:0::/48');
  });

  it('неразбираемый адрес НЕ сохраняется целиком, а помечается unknown', () => {
    // «Не смогли усечь» не даёт права записать полный адрес: fail-closed.
    for (const bad of ['', '   ', 'не адрес', '999.1.1.1', '1.2.3', 'gggg::1']) {
      expect(toIpPrefix(bad), JSON.stringify(bad)).toBe('unknown');
    }
  });
});

describe('источник адреса', () => {
  it('берётся ПОСЛЕДНИЙ элемент X-Forwarded-For — его поставил наш Caddy', () => {
    // Первый элемент присылает клиент и потому доказательством не является.
    expect(clientAddressFrom('198.51.100.9, 203.0.113.77', '172.18.0.5')).toBe('203.0.113.77');
    expect(clientAddressFrom(['198.51.100.9', '203.0.113.77'], '172.18.0.5')).toBe('203.0.113.77');
  });

  it('без заголовка берётся адрес сокета', () => {
    expect(clientAddressFrom(undefined, '172.18.0.5')).toBe('172.18.0.5');
    expect(clientAddressFrom('   ', '172.18.0.5')).toBe('172.18.0.5');
  });
});
