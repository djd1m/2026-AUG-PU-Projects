// src/render.ts
//
// Источник истины: docs/Pseudocode.md §3 (`renderTestimonials` вызывается из `widgetBootstrap`),
// docs/Specification.md FR-006 (@security сценарий "вредоносная разметка не исполняется"),
// .claude/rules/security.md §1, .claude/rules/testing.md §6.
//
// ПРАВИЛО, НЕ ОБСУЖДАЕТСЯ (security.md §1): пользовательский контент отзыва — `text`,
// `author_name`, `author_role`, `transcript` — вставляется ТОЛЬКО через `textContent`.
// Никогда `innerHTML`/`insertAdjacentHTML`/`outerHTML` на этих полях. Отзывы приходят без
// аутентификации (FR-002/003 сохраняют их побайтово как есть) и рендерятся на произвольном
// чужом домене — это единственная защита от stored-XSS в этом пакете (FR-006 @security).
// Тест-контракт (Refinement.md §3.5): не только неисполнение JS, но и корректное отображение
// как текста — поэтому здесь нет `strip_tags`/regex-санитизации, которая исказила бы легитимный
// отзыв с символами `<`/`&`.

import type { WidgetTestimonial } from './types';

const CARD_CLASS = 'pw-card';

/** Строит начальный скелет внутри shadow-root: контейнер списка + слот под badge. */
export function buildSkeleton(root: ShadowRoot): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'pw-widget';

  const list = document.createElement('div');
  list.className = 'pw-list';

  const badgeSlot = document.createElement('div');
  badgeSlot.className = 'pw-badge-slot';

  wrapper.appendChild(list);
  wrapper.appendChild(badgeSlot);
  root.appendChild(wrapper);
}

/** Pseudocode.md §3: рендер карточек отзывов внутри shadow-root. */
export function renderTestimonials(root: ShadowRoot, testimonials: WidgetTestimonial[]): void {
  const list = root.querySelector<HTMLElement>('.pw-list');
  if (!list) return;
  list.replaceChildren(); // идемпотентно на повторный вызов (напр. будущий ре-фетч конфига)
  for (const testimonial of testimonials) {
    list.appendChild(renderCard(testimonial));
  }
}

function renderCard(testimonial: WidgetTestimonial): HTMLElement {
  const card = document.createElement('article');
  card.className = CARD_CLASS;

  const text = document.createElement('p');
  text.className = 'pw-text';
  text.textContent = testimonial.text; // см. правило вверху файла — только textContent
  card.appendChild(text);

  const author = document.createElement('footer');
  author.className = 'pw-author';

  const name = document.createElement('span');
  name.className = 'pw-author-name';
  name.textContent = testimonial.author_name;
  author.appendChild(name);

  if (testimonial.author_role) {
    const role = document.createElement('span');
    role.className = 'pw-author-role';
    role.textContent = testimonial.author_role;
    author.appendChild(role);
  }
  card.appendChild(author);

  // security.md §5 / FR-NFR-SEC-002 сц.3: машинная расшифровка помечается явно на каждой
  // публичной поверхности рендера, не мелким шрифтом. Виджет — такая поверхность (исполняется
  // на чужом домене), наравне с SSR-страницей `/w/<slug>` (там же реализуется отдельно, в
  // apps/web — не входит в этот пакет).
  if (testimonial.transcript && testimonial.transcript_source === 'machine') {
    const label = document.createElement('p');
    label.className = 'pw-transcript-label';
    label.textContent = 'Машинная расшифровка видео';
    card.appendChild(label);
  }

  return card;
}

/** Pseudocode.md §3: проект не найден/деактивирован — тихий no-op, без видимого содержимого. */
export function renderEmptyPlaceholder(root: ShadowRoot): void {
  const wrapper = root.querySelector<HTMLElement>('.pw-widget');
  if (wrapper) wrapper.replaceChildren();
}
