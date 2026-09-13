// AC-share-card-and-growth-events-13: инъекция и символ направления письма не проходят ни на
// одну поверхность (SSR HTML, растровый SVG-оверлей). Без БД, без сети (`04_refinement.md`,
// Testing Strategy — «закрытые перечисления, границы длины, экранирование» → unit).

import { describe, expect, it } from 'vitest';
import { sanitizeForCardText, escapeHtml, escapeSvgText } from '@n4/shared';

// `\u`-escape, а не литеральные bidi-символы, вставленные в текст файла: символы принудительного
// направления письма в самом исходнике теста были бы собственным классом атаки на код
// (`trojan source`), которого этот файл обязан избегать, а не демонстрировать.
const RLO = '‮';
const LRI = '⁦';
const RLI = '⁧';
const FSI = '⁨';
const PDI = '⁩';
const ALM = '؜';
const BIDI_RANGE = /[‪-‮⁦-⁩؜]/u;

describe('sanitizeForCardText: символы направления письма', () => {
  it('снимает LRE/RLE/PDF/LRO/RLO (U+202A–U+202E)', () => {
    const input = `курица${RLO}attack`;
    expect(sanitizeForCardText(input, 60)).toBe('курицаattack');
  });

  it('снимает LRI/RLI/FSI/PDI (U+2066–U+2069) и ALM (U+061C)', () => {
    const input = `${LRI}a${RLI}b${FSI}c${PDI}d${ALM}e`;
    expect(sanitizeForCardText(input, 60)).toBe('abcde');
  });

  it('E11: HTML-инъекция + bidi-override из AC-13 — символ направления снят, тег остаётся текстом до экранирования на поверхности', () => {
    const input = `<img src=x onerror=alert(1)>${RLO}elttit`;
    const sanitized = sanitizeForCardText(input, 60);
    expect(BIDI_RANGE.test(sanitized)).toBe(false);
    expect(sanitized).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('sanitizeForCardText: обрезка по длине', () => {
  it('строка короче предела возвращается без изменений', () => {
    expect(sanitizeForCardText('короткое название', 60)).toBe('короткое название');
  });

  it('строка длиннее предела обрезается до maxLen-1 символов плюс многоточие, итоговая длина не превышает maxLen', () => {
    const long = 'а'.repeat(70);
    const result = sanitizeForCardText(long, 60);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe(`${'а'.repeat(59)}…`);
  });

  it('название 60 символов ровно — не обрезается (граница включительно)', () => {
    const exact = 'б'.repeat(60);
    expect(sanitizeForCardText(exact, 60)).toBe(exact);
  });

  it('строка источника обрезается по границе 80', () => {
    const long = 'USDA FDC #123456 · '.repeat(10);
    const result = sanitizeForCardText(long, 80);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});

describe('escapeHtml: пять сущностей SSR-поверхности', () => {
  it('AC-13: HTML-инъекция выводится текстом, тег не появляется в разметке', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<img');
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('апостроф — числовой сущностью &#39;', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('экранирует &, <, >, ", \' одновременно', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('escapeSvgText: пять сущностей растровой поверхности', () => {
  it('AC-13: <, > экранированы — новый графический элемент SVG не открывается', () => {
    const payload = '<image href="evil"/>';
    const escaped = escapeSvgText(payload);
    expect(escaped).not.toContain('<image');
  });

  it('апостроф — именованной XML-сущностью &apos; (отличие от HTML)', () => {
    expect(escapeSvgText("it's")).toBe('it&apos;s');
  });

  it('экранирует &, <, >, ", \' одновременно', () => {
    expect(escapeSvgText(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});
