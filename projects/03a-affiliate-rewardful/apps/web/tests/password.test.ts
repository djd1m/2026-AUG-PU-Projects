import { describe, expect, it, vi } from 'vitest';
import { PasswordService, hashPassword, verifyPassword, isSupportedPasswordHash, isValidPassword } from '../src/lib/auth/password';
import { KdfAdmission } from '../src/lib/auth/kdf-admission';

describe('password primitives', () => {
  it('Argon2id salts and input bounds are enforced', async () => {
    const start = performance.now();
    const password = "eight'<>&字🙂 characters";
    const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(isSupportedPasswordHash(a)).toBe(true);
    expect(Buffer.from(a.split('$')[4]!, 'base64').length).toBeGreaterThanOrEqual(16);
    expect(Buffer.from(a.split('$')[5]!, 'base64').length).toBe(32);
    expect(await verifyPassword(a, password)).toBe(true);
    expect(await verifyPassword(a, 'wrong-password')).toBe(false);
    expect(await verifyPassword('malformed', password)).toBe(false);
    const adapter = { hash: vi.fn(async () => a), verify: vi.fn(async () => true) };
    const service = new PasswordService(new KdfAdmission(), adapter);
    for (const invalid of [null, undefined, {}, 123, '', 'a'.repeat(7), 'a'.repeat(201), '🙂'.repeat(201)]) {
      await expect(service.hashPassword(invalid)).rejects.toThrow('invalid_input');
      expect(await service.verifyPassword(a, invalid)).toBe(false);
    }
    expect(adapter.hash).not.toHaveBeenCalled();
    expect(adapter.verify).not.toHaveBeenCalled();
    expect(isValidPassword('🙂'.repeat(200))).toBe(true);
    expect(isValidPassword('a'.repeat(8))).toBe(true);
    expect(isValidPassword('a'.repeat(200))).toBe(true);
    // Recorded observations carry no credential material.
    console.info(JSON.stringify({ measurement: 'native_argon2_smoke', node: process.version,
      elapsed_ms: Math.round(performance.now() - start), max_rss_kib: process.resourceUsage().maxRSS }));
  });
  it('rejects unsupported work factors and noncanonical encodings before native verification', async () => {
    const a = await hashPassword('correct-password');
    const adapter = { hash: vi.fn(async () => a), verify: vi.fn(async () => true) };
    const service = new PasswordService(new KdfAdmission(), adapter);
    for (const bad of [a.replace('65536', '4294967295'), a.replace('v=19', 'v=16'),
      a.replace('t=3', 't=100'), a.replace('p=1', 'p=8'), a + '=', a.replace('argon2id', 'argon2i'),
      a.replace(a.split('$')[4]!, 'YQ'), 'x'.repeat(10_000)]) {
      expect(await service.verifyPassword(bad, 'correct-password')).toBe(false);
    }
    expect(adapter.verify).not.toHaveBeenCalled();
  });
  it('startup dummy initializes once and native failures deny safely', async () => {
    const encoded = await hashPassword('correct-password');
    const adapter = { hash: vi.fn(async () => encoded), verify: vi.fn(async () => { throw new Error('sensitive-native-message'); }) };
    const service = new PasswordService(new KdfAdmission(), adapter);
    expect(await Promise.all([service.initialize(), service.initialize()])).toEqual([encoded, encoded]);
    expect(adapter.hash).toHaveBeenCalledTimes(1);
    expect(await service.verifyPassword(encoded, 'correct-password')).toBe(false);
  });
});
