// Pseudocode §9 — normalizeSlug / ensureUniqueSlug / SLUG_PATTERN.
// Тесты на чистую логику: БД не нужна.

import { describe, expect, it } from 'vitest';
import {
  SLUG_PATTERN,
  ensureUniqueSlug,
  isValidSlug,
  normalizeSlug,
  normalizeSlugDeterministic,
  randomAlphaNum,
} from '../src/lib/slug';

describe('SLUG_PATTERN — AC FR-001 «^[a-z0-9-]{3,40}$»', () => {
  it('принимает валидные слаги', () => {
    for (const ok of ['abc', 'my-project', 'a-1', 'x'.repeat(40)]) {
      expect(isValidSlug(ok), ok).toBe(true);
    }
  });

  it('отклоняет невалидные', () => {
    for (const bad of ['ab', '', 'x'.repeat(41), 'Upper', 'with space', 'под_чёрк', 'слаг']) {
      expect(isValidSlug(bad), bad).toBe(false);
    }
  });
});

describe('normalizeSlug', () => {
  it('приводит регистр и пробелы к формату', () => {
    expect(normalizeSlug('My Cool Project')).toBe('my-cool-project');
  });

  it('схлопывает повторяющиеся дефисы и обрезает крайние', () => {
    expect(normalizeSlug('  --Hello___World--  ')).toBe('hello-world');
  });

  it('кириллица целиком превращается в дефисы и добирается суффиксом до 3 символов', () => {
    const slug = normalizeSlug('Отзывы');
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('обрезает до 40 символов и не оставляет дефис на конце', () => {
    const slug = normalizeSlug('a'.repeat(39) + ' ' + 'b'.repeat(20));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('короткий вход добирается до минимума 3 ("ab" -> "ab-xxx")', () => {
    const slug = normalizeSlug('ab');
    expect(slug.startsWith('ab-')).toBe(true);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('пустой вход и null дают валидный слаг, а не пустую строку', () => {
    for (const input of ['', null, undefined, '---', '!!!']) {
      expect(normalizeSlug(input as string), String(input)).toMatch(SLUG_PATTERN);
    }
  });

  it('результат ВСЕГДА соответствует SLUG_PATTERN (fuzz)', () => {
    const samples = ['a', 'A B', '  ', '💥', 'Ω-Ω', '-'.repeat(50), 'x'.repeat(100), '9'];
    for (const s of samples) {
      expect(normalizeSlug(s), JSON.stringify(s)).toMatch(SLUG_PATTERN);
    }
  });
});

describe('randomAlphaNum', () => {
  it('даёт запрошенную длину из безопасного алфавита', () => {
    for (const n of [3, 4, 8]) {
      const v = randomAlphaNum(n);
      expect(v).toHaveLength(n);
      expect(v).toMatch(/^[23456789bcdfghjkmnpqrstvwxz]+$/);
    }
  });

  it('не повторяется на соседних вызовах', () => {
    const seen = new Set(Array.from({ length: 50 }, () => randomAlphaNum(4)));
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe('ensureUniqueSlug — Pseudocode §9', () => {
  it('свободный слаг возвращается как есть', async () => {
    expect(await ensureUniqueSlug('free-slug', async () => false)).toBe('free-slug');
  });

  it('занятый слаг получает случайный суффикс', async () => {
    const taken = new Set(['taken']);
    const slug = await ensureUniqueSlug('taken', async (s) => taken.has(s));
    expect(slug).not.toBe('taken');
    expect(slug.startsWith('taken-')).toBe(true);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('суффикс не разрывает лимит в 40 символов', async () => {
    const base = 'a'.repeat(40);
    const taken = new Set([base]);
    const slug = await ensureUniqueSlug(base, async (s) => taken.has(s));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('после 10 неудачных попыток бросает, а не зацикливается', async () => {
    await expect(ensureUniqueSlug('busy', async () => true)).rejects.toThrow(/10 попыток/);
  });
});

describe('normalizeSlugDeterministic — ничего не выдумывает', () => {
  it('НЕ добирает слишком короткий ввод суффиксом (в отличие от normalizeSlug)', () => {
    // Ровно этот случай протаскивал "ab" мимо проверки формата и создавал "ab-x7q".
    expect(normalizeSlugDeterministic('ab')).toBe('ab');
    expect(isValidSlug(normalizeSlugDeterministic('ab'))).toBe(false);
    expect(isValidSlug(normalizeSlug('ab'))).toBe(true);
  });

  it('пустой вход остаётся пустым, а не превращается в случайный слаг', () => {
    expect(normalizeSlugDeterministic('')).toBe('');
    expect(normalizeSlugDeterministic('---')).toBe('');
    expect(normalizeSlug('')).toMatch(SLUG_PATTERN);
  });

  it('детерминирован: один вход — всегда один выход', () => {
    for (const s of ['My Slug', 'a-b-c', 'ПРИВЕТ мир']) {
      expect(normalizeSlugDeterministic(s)).toBe(normalizeSlugDeterministic(s));
    }
  });

  it('приводит регистр и пробелы так же, как normalizeSlug', () => {
    expect(normalizeSlugDeterministic('My Cool Project')).toBe('my-cool-project');
  });
});
