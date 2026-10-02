import { describe, expect, it } from 'vitest';
import { normalizeContact } from '@/server/contact';
import { normalizeOrigin, normalizeOrigins, publicationOrigins } from '@/server/origin';

describe('PUB-02 contact format and bounds', () => {
  it.each(['owner@example.test', '+79991234567', '+12', 'https://example.test/contact?from=bot'])('accepts %s', (contact) => {
    expect(normalizeContact(` ${contact} `)).toBe(contact);
  });
  it.each([null, undefined, 0, {}, [], '', '  ', 'owner', 'x@', 'x@example', 'a'.repeat(513),
    '+0123', '+1', '+1234567890123456', '+7 9991234567', 'tel:+79991234567', 'http://example.test',
    'mailto:owner@example.test', 'javascript:alert(1)', 'https://user:pass@example.test/contact',
    'https://user@example.test', 'https://*.test', 'https://example.test/a\nb', 'https:example.test'])('rejects %j', (raw) => {
    expect(normalizeContact(raw)).toBeNull();
  });
  it('bounds normalized URL and email as well as raw contact', () => {
    expect(normalizeContact('https://example.test/' + 'я'.repeat(90))).toBeNull();
    expect(normalizeContact('x'.repeat(250) + '@example.test')).toBeNull();
  });
});

describe('PUB-03 / SC-US-007-3 canonical origin allowlist', () => {
  it.each([
    [' HTTPS://EXAMPLE.test:443/a?q=1#hash ', 'https://example.test'],
    ['http://Example.test:80/a', 'http://example.test'],
    ['https://example.test:444/a', 'https://example.test:444'],
    ['http://example.test:443', 'http://example.test:443'],
    ['https://ПРИМЕР.РФ/path', 'https://xn--e1afmkfd.xn--p1ai'],
    ['http://[::1]:8080/a', 'http://[::1]:8080'],
  ])('normalizes %s', (raw, expected) => { expect(normalizeOrigin(raw)).toBe(expected); });
  it.each([null, undefined, false, [], {}, '', 'null', '*', 'https://*.example.test',
    'https://example.test/*', 'https://＊.example.test', 'file:///tmp/file', 'data:text/plain,x', 'blob:https://example.test/id',
    'ftp://example.test', 'https://', 'example.test', 'https:example.test', 'https://user@example.test',
    'https://user:pass@example.test', 'https://example.test/a\nb', 'https://example.test/' + 'x'.repeat(2048)])(
    'rejects %j', (raw) => { expect(normalizeOrigin(raw)).toBeNull(); });
  it('deduplicates IDNA/default ports, keeping schemes and nondefault ports distinct', () => {
    expect(normalizeOrigins(['https://ПРИМЕР.РФ', 'https://xn--e1afmkfd.xn--p1ai:443/a',
      'http://xn--e1afmkfd.xn--p1ai:80', 'https://xn--e1afmkfd.xn--p1ai:444'])).toEqual([
      'https://xn--e1afmkfd.xn--p1ai', 'http://xn--e1afmkfd.xn--p1ai', 'https://xn--e1afmkfd.xn--p1ai:444']);
    expect(normalizeOrigins([])).toEqual([]);
    expect(normalizeOrigins(Array(21).fill('https://example.test'))).toBeNull();
    expect(normalizeOrigins(['https://example.test', 'null'])).toBeNull();
    expect(normalizeOrigins('https://example.test')).toBeNull();
  });
});

describe('PUB-04 / SC-US-007-2 first site proposal', () => {
  it('proposes only before publication and never mutates stored origins', () => {
    const bot = { published: false, allowed_origins: [] as string[], first_site_url: 'https://EXAMPLE.test/a' };
    expect(publicationOrigins(bot)).toEqual(['https://example.test']);
    expect(bot.allowed_origins).toEqual([]);
    expect(publicationOrigins({ ...bot, published: true })).toEqual([]);
    expect(publicationOrigins({ ...bot, first_site_url: null })).toEqual([]);
    expect(publicationOrigins({ ...bot, first_site_url: 'bad' })).toEqual([]);
    expect(publicationOrigins({ ...bot, allowed_origins: ['http://saved.test'] })).toEqual(['http://saved.test']);
  });
});
