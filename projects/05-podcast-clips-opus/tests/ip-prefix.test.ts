import { expect, it } from 'vitest';
import { ipPrefix } from '../apps/web/src/server/ip';
it('DEC-A-019: разные IPv6 /64 не разделяют квоту ограничителя', () => {
  expect(ipPrefix('2001:db8:1234::1')).not.toBe(ipPrefix('2001:db8:9999:abcd::5'));
  expect(ipPrefix('2001:db8:1234:5678::1')).toBe(ipPrefix('2001:db8:1234:5678:ffff::9'));
});
