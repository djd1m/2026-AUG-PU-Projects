import { expect, it } from 'vitest';
import { rateToBasisPoints } from '../src/components/onboarding/rate';
it('explicit percentage input converts decimal digits to exact integer basis points', () => {
  for (const [value, expected] of [['0.01', 1], ['28.29', 2829], ['99,99', 9999], ['100', 10000], ['1.15', 115]] as const)
    expect(rateToBasisPoints(value, 'percent')).toBe(expected);
  expect(rateToBasisPoints('2829', 'bp')).toBe(2829);
  for (const value of ['', '0', '100.01', '1.001', 'NaN', '1e2', '-1']) expect(rateToBasisPoints(value, 'percent')).toBeNull();
  expect(rateToBasisPoints('20', '')).toBeNull();
  expect(rateToBasisPoints('20.5', 'bp')).toBeNull();
});
