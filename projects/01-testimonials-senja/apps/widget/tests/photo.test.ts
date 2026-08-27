// tests/photo.test.ts
//
// FR-002: фото автора в виджете. Два свойства, каждое из которых при поломке даёт
// проблему на ЧУЖОМ сайте, а не на нашем.

import { describe, expect, it } from 'vitest';
import { buildSkeleton, renderTestimonials } from '../src/render';
import type { WidgetTestimonial } from '../src/types';

function mount(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  buildSkeleton(root);
  return root;
}

const base = (over: Partial<WidgetTestimonial> = {}): WidgetTestimonial => ({
  id: 'a', author_name: 'Автор', author_role: null, text: 'отзыв', ...over,
});

const photoOf = (root: ShadowRoot) => root.querySelector<HTMLImageElement>('.pw-photo');

describe('фото автора в виджете', () => {
  it('ИНВАРИАНТ: путь разрешается относительно apiBase, а не сайта хоста', () => {
    const root = mount();
    renderTestimonials(root, [base({ photo_url: '/api/photo/p/k.jpg' })], 'https://proofwall.app');
    // Без префикса браузер пошёл бы за картинкой на сайт владельца, где её нет.
    expect(photoOf(root)?.getAttribute('src')).toBe('https://proofwall.app/api/photo/p/k.jpg');
  });

  it('ИНВАРИАНТ: небезопасная схема в photo_url отбрасывается', () => {
    // Значение приходит ПО СЕТИ и вставляется в src на ЧУЖОМ сайте.
    for (const evil of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/x.jpg',
      '//evil.example/x.jpg',
      'vbscript:msgbox(1)',
      '../../etc/passwd',
    ]) {
      const root = mount();
      renderTestimonials(root, [base({ photo_url: evil })], 'https://proofwall.app');
      expect(photoOf(root), evil).toBeNull();
    }
  });

  it('без фото элемент не создаётся', () => {
    for (const v of [null, undefined, '']) {
      const root = mount();
      renderTestimonials(root, [base({ photo_url: v as string })], 'https://proofwall.app');
      expect(photoOf(root)).toBeNull();
    }
  });

  it('фото не мешает тексту и имени рендериться', () => {
    const root = mount();
    renderTestimonials(root, [base({ photo_url: '/api/photo/p/k.png', text: 'текст' })], 'https://x');
    expect(root.textContent).toContain('текст');
    expect(root.textContent).toContain('Автор');
  });

  it('alt пустой — фото декоративное, имя рядом уже озвучено', () => {
    const root = mount();
    renderTestimonials(root, [base({ photo_url: '/api/photo/p/k.png' })], 'https://x');
    expect(photoOf(root)?.getAttribute('alt')).toBe('');
  });
});
