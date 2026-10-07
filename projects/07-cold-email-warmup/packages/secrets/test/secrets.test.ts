import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateMasterKeyHex, encryptSecret, decryptSecret, hmacSign, safeEqual, uuid, loadMasterKey } from '../src/index.ts';

const mk = Buffer.from(generateMasterKeyHex(), 'hex');

describe('envelope секретов (FR-MAILBOX-003)', () => {
  it('roundtrip возвращает plaintext', () => {
    const secret = 'app-password-sample-1';
    const env = encryptSecret(mk, secret);
    assert.equal(decryptSecret(mk, env), secret);
  });

  it('разные вызовы дают разные конверты (случайность ключей/nonce)', () => {
    const a = encryptSecret(mk, 'same');
    const b = encryptSecret(mk, 'same');
    assert.notEqual(a.equals(b), true);
  });

  it('tamper → расшифровка падает (GCM tag)', () => {
    const env = encryptSecret(mk, 'very secret app password');
    env[env.length - 1] = env[env.length - 1]! ^ 0x01;
    assert.throws(() => decryptSecret(mk, env));
  });

  it('чужой мастер-ключ не расшифровывает', () => {
    const env = encryptSecret(mk, 'x');
    const other = Buffer.from(generateMasterKeyHex(), 'hex');
    assert.throws(() => decryptSecret(other, env));
  });

  it('конверт не содержит plaintext', () => {
    const s = 'SUPER-SECRET-PLAINTEXT-42';
    const env = encryptSecret(mk, s);
    assert.equal(env.includes(Buffer.from(s.slice(0, 8))), false);
  });

  it('loadMasterKey требует 64 hex', () => {
    assert.throws(() => loadMasterKey({} as NodeJS.ProcessEnv), /MASTER_KEY/);
    assert.throws(() => loadMasterKey({ MASTER_KEY: 'zz' } as NodeJS.ProcessEnv), /MASTER_KEY/);
    assert.ok(Buffer.isBuffer(loadMasterKey({ MASTER_KEY: generateMasterKeyHex() } as NodeJS.ProcessEnv)));
  });
});

describe('auth crypto primitives (FR-AUTH-001/002)', () => {
  it('safeEqual: разные длины/содержимое не равны', () => {
    assert.equal(safeEqual('a', 'a'), true);
    assert.equal(safeEqual('a', 'ab'), false);
    assert.equal(safeEqual(Buffer.from('x1'), Buffer.from('x2')), false);
  });
});

describe('hmac-подписи токенов', () => {
  it('детерминирована и различима', () => {
    const s1 = hmacSign(mk, 'payload-body');
    const s2 = hmacSign(mk, 'payload-body');
    const s3 = hmacSign(mk, 'payload-bodY');
    assert.equal(s1.equals(s2), true);
    assert.equal(s1.equals(s3), false);
  });
});

describe('uuid', () => {
  it('v4-формат', () => {
    assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
