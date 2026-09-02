// Подготовка названия проекта к слагу: транслитерация и разбор ссылки.
// БЕЗ базы данных — чистые функции.

import { describe, expect, it } from 'vitest';
import { fromUrlIfUrl, normalizeSlug, slugSourceFromName, transliterate } from '../src/lib/slug';

const derive = (name: string) => normalizeSlug(slugSourceFromName(name));

describe('живые случаи со стенда', () => {
  it('русское название больше не превращается в случайные три буквы', () => {
    expect(derive('Кофейня Артель')).toBe('kofeynya-artel');
    expect(derive('Демо Проба')).toBe('demo-proba');
    expect(derive('Студия «Аврора»')).toBe('studiya-avrora');
  });

  it('вставленная ссылка даёт читаемый адрес, а не кашу из протокола', () => {
    // Ровно тот проект, что лежит на боевом стенде как https-productuniversity-ru.
    expect(derive('https://productuniversity.ru/claude')).toBe('productuniversity-claude');
    expect(derive('https://www.example.com/')).toBe('example');
    expect(derive('https://shop.example.co.uk/catalog/shoes')).toBe('example-shoes');
  });
});

describe('транслитерация', () => {
  it('переводит букву в букву, а щ и ю — в сочетания', () => {
    expect(transliterate('щука')).toBe('schuka');
    expect(transliterate('юла')).toBe('yula');
    expect(transliterate('объезд')).toBe('obezd');
  });

  it('латиницу и цифры не трогает', () => {
    expect(transliterate('Shop 24')).toBe('shop 24');
  });
});

describe('разбор ссылки', () => {
  it('не-ссылку возвращает как есть — иначе обычное название пострадало бы', () => {
    for (const plain of ['Кофейня', 'my shop', 'yandex.ru без протокола', '']) {
      expect(fromUrlIfUrl(plain)).toBe(plain);
    }
  });

  it('зона домена в слаг не попадает: .ru и .com читателю ничего не сообщают', () => {
    expect(fromUrlIfUrl('https://productuniversity.ru')).toBe('productuniversity');
    expect(fromUrlIfUrl('https://productuniversity.com')).toBe('productuniversity');
  });

  it('битая ссылка не роняет разбор', () => {
    expect(fromUrlIfUrl('https://')).toBe('https://');
  });
});

describe('явно введённый слаг НЕ трогается', () => {
  it('подготовка применяется только к названию — у явного слага своя дорога', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/lib/register.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const explicit = src.indexOf('normalizeSlugDeterministic(desired)');
    expect(explicit).toBeGreaterThan(-1);
    // В ветке явного слага подготовки быть не должно: перевод чужого ввода в другую
    // письменность — это подмена, а её тот же §9 запрещает.
    const branch = src.slice(explicit - 400, explicit + 200);
    expect(branch).not.toContain('slugSourceFromName');
  });
});
