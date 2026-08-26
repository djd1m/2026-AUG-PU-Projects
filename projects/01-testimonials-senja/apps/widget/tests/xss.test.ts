// tests/xss.test.ts
//
// Источник истины: docs/Specification.md FR-006 @security ("Вредоносная разметка не исполняется
// во встроенном виджете на чужом домене"), .claude/rules/security.md §1, .claude/rules/
// testing.md §6, docs/Refinement.md §3.5.
//
// Тест-контракт (Refinement.md §3.5, буквально): проверяем НЕ ТОЛЬКО неисполнение разметки, но и
// корректное отображение как ТЕКСТА — `strip_tags` прошёл бы первую проверку, но испортил бы
// легитимный отзыв с символами `<`/`&`. Поэтому ассерты сравнивают `textContent` побайтово с
// исходной строкой, а не просто "не бросило исключение".

import { describe, expect, it } from 'vitest';
import { buildSkeleton, renderTestimonials } from '../src/render';
import type { WidgetTestimonial } from '../src/types';

function freshShadowRoot(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('XSS: рендер вредоносного отзыва на чужом домене (FR-006 @security)', () => {
  it('текст с <script> выводится как текст и не создаёт исполняемый узел', () => {
    const root = freshShadowRoot();
    buildSkeleton(root);

    const malicious = '<script>window.__xss=true</script>';
    const testimonials: WidgetTestimonial[] = [
      { id: 't1', author_name: 'Ivan', author_role: null, text: malicious },
    ];

    renderTestimonials(root, testimonials);

    // 1) Ничего не исполнилось.
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();

    // 2) В DOM нет фактического <script>-узла, порождённого пользовательским контентом.
    expect(root.querySelector('script')).toBeNull();

    // 3) Контент отображается как текст, побайтово равный исходной строке (не strip_tags).
    const textNode = root.querySelector<HTMLElement>('.pw-text');
    expect(textNode).not.toBeNull();
    expect(textNode?.textContent).toBe(malicious);
    // Внутренняя разметка узла не содержит "живых" тегов — только экранированный текст.
    expect(textNode?.innerHTML).not.toContain('<script>');
  });

  it('имя автора с <img onerror=...> не исполняется и не пропадает как текст', () => {
    const root = freshShadowRoot();
    buildSkeleton(root);

    const maliciousName = '<img src=x onerror=alert(document.domain)>';
    const testimonials: WidgetTestimonial[] = [
      { id: 't2', author_name: maliciousName, author_role: null, text: 'Отличный сервис!' },
    ];

    renderTestimonials(root, testimonials);

    expect(root.querySelector('img')).toBeNull();

    const nameNode = root.querySelector<HTMLElement>('.pw-author-name');
    expect(nameNode).not.toBeNull();
    // Видимо как строка, а не исчезло молча (Refinement.md §3.5 п.3).
    expect(nameNode?.textContent).toBe(maliciousName);
  });

  it('легитимный отзыв с символами < и & отображается без искажения (не strip_tags)', () => {
    const root = freshShadowRoot();
    buildSkeleton(root);

    const legit = 'Цена < конкурентов, а сервис && поддержка — на высоте.';
    renderTestimonials(root, [
      { id: 't3', author_name: 'Мария', author_role: 'CEO', text: legit },
    ]);

    const textNode = root.querySelector<HTMLElement>('.pw-text');
    expect(textNode?.textContent).toBe(legit); // ничего не вырезано и не сломано
  });

  it('виджет не получает доступа к DOM/cookie хост-страницы через рендер отзыва', () => {
    // Структурная гарантия ADR-001: рендер идёт исключительно внутри переданного ShadowRoot,
    // renderTestimonials не трогает document.body/document.cookie напрямую.
    const root = freshShadowRoot();
    buildSkeleton(root);
    const cookieBefore = document.cookie;

    renderTestimonials(root, [
      { id: 't4', author_name: 'x', author_role: null, text: '<script>document.cookie="x=1"</script>' },
    ]);

    expect(document.cookie).toBe(cookieBefore);
  });
});
