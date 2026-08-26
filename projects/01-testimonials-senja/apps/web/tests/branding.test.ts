// AC FR-002 «Брендирование владельцем» — и граница, которую оно открывает:
// значения приходят из projects.branding и попадают в атрибуты разметки.

import { describe, expect, it } from 'vitest';
import { readBranding } from '../src/lib/branding';

describe('readBranding — дефолты', () => {
  it('пустое/отсутствующее брендирование даёт рабочие значения', () => {
    for (const input of [{}, null, undefined, 'строка', 42]) {
      const b = readBranding(input);
      expect(b.heading).toBe('Оставьте отзыв');
      expect(b.accent_color).toBe('#6701ef');
      expect(b.logo_url).toBeNull();
    }
  });

  it('заданные значения проходят', () => {
    const b = readBranding({
      heading: 'Что вы думаете о нас?',
      accent_color: '#ff5500',
      logo_url: 'https://cdn.example.com/logo.png',
    });
    expect(b).toEqual({
      heading: 'Что вы думаете о нас?',
      accent_color: '#ff5500',
      logo_url: 'https://cdn.example.com/logo.png',
    });
  });
});

describe('accent_color — попадает в атрибут style, поэтому только hex', () => {
  it.each([
    'red',
    'red;background:url(javascript:alert(1))',
    '#fff',
    '#12345',
    'expression(alert(1))',
    '',
    '#gggggg',
  ])('отклоняет %j и падает на дефолт', (value) => {
    expect(readBranding({ accent_color: value }).accent_color).toBe('#6701ef');
  });

  it('принимает корректный hex в обоих регистрах', () => {
    expect(readBranding({ accent_color: '#AbCdEf' }).accent_color).toBe('#AbCdEf');
  });
});

describe('logo_url — попадает в src, поэтому только http(s)', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'не url вовсе',
    '',
    '   ',
  ])('отклоняет %j', (value) => {
    expect(readBranding({ logo_url: value }).logo_url).toBeNull();
  });

  it('принимает http и https', () => {
    expect(readBranding({ logo_url: 'https://a.example/l.png' }).logo_url).toBe('https://a.example/l.png');
    expect(readBranding({ logo_url: 'http://a.example/l.png' }).logo_url).toBe('http://a.example/l.png');
  });
});

describe('heading', () => {
  it('обрезается по длине, но НЕ экранируется — экранирует React при рендере', () => {
    const evil = '<script>alert(1)</script>';
    // Побайтовое сохранение — то же правило, что на приёме отзыва (FR-NFR-SEC-002).
    expect(readBranding({ heading: evil }).heading).toBe(evil);
    expect(readBranding({ heading: 'д'.repeat(300) }).heading).toHaveLength(120);
  });

  it('пустой заголовок падает на дефолт, а не оставляет пустую страницу', () => {
    expect(readBranding({ heading: '   ' }).heading).toBe('Оставьте отзыв');
  });
});
