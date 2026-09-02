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
export function renderTestimonials(
  root: ShadowRoot,
  testimonials: WidgetTestimonial[],
  apiBase = '',
): void {
  const list = root.querySelector<HTMLElement>('.pw-list');
  if (!list) return;
  list.replaceChildren(); // идемпотентно на повторный вызов (напр. будущий ре-фетч конфига)
  for (const testimonial of testimonials) {
    list.appendChild(renderCard(apiBase, testimonial));
  }
}

/** Ровно то, что выдаёт наш сервер: /api/photo/<projectId>/<uuid>.<ext>. */
const PHOTO_PATH = /^\/api\/photo\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|png|webp)$/i;

function renderCard(apiBase: string, testimonial: WidgetTestimonial): HTMLElement {
  const card = document.createElement('article');
  card.className = CARD_CLASS;

  const text = document.createElement('p');
  text.className = 'pw-text';
  text.textContent = testimonial.text; // см. правило вверху файла — только textContent
  card.appendChild(text);

  // Фото автора, если приложено. src собирается из apiBase — относительный путь
  // на чужом домене указал бы на сайт владельца (см. комментарий в types.ts).
  // Схема проверяется: значение приходит по сети, а javascript:/data: в src
  // выполнились бы в контексте ЧУЖОГО сайта, где стоит виджет.
  // Снимок отзыва с внешней площадки — СОДЕРЖИМОЕ карточки, а не аватар. Путь проверяется
  // тем же выражением, что и фото автора: значение приходит по сети, и "//evil.example/x.jpg"
  // при пустом apiBase увело бы браузер на чужой домен.
  if (typeof testimonial.screenshot_url === 'string' && PHOTO_PATH.test(testimonial.screenshot_url)) {
    const shot = document.createElement('img');
    shot.className = 'pw-shot';
    shot.alt = '';
    shot.loading = 'lazy';
    shot.src = apiBase + testimonial.screenshot_url;
    card.appendChild(shot);
  }

  // Пометка источника — всегда при перенесённом отзыве, даже без ссылки: читатель обязан
  // понимать, что смотрит на перенесённое. Собирается СОЗДАНИЕМ УЗЛОВ, не склейкой разметки:
  // подпись и адрес приходят по сети, и innerHTML исполнил бы их на чужом сайте.
  if (typeof testimonial.source_label === 'string' && testimonial.source_label !== '') {
    const origin = document.createElement('p');
    origin.className = 'pw-origin';
    const url = testimonial.source_url;
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      // noopener обязателен: без него чужая площадка получает доступ к window.opener
      // страницы ХОЗЯИНА, на которой стоит наш виджет.
      link.rel = 'nofollow noopener noreferrer';
      link.textContent = `Отзыв с ${testimonial.source_label} \u2192`;
      origin.appendChild(link);
    } else {
      origin.textContent = `Отзыв с ${testimonial.source_label}`;
    }
    card.appendChild(origin);
  }

  const author = document.createElement('footer');
  author.className = 'pw-author';

  // Путь проверяется на ТОЧНОЕ соответствие нашему роуту, а не «начинается со слеша».
  // Форма "//evil.example/x.jpg" тоже начинается со слеша, но при пустом apiBase это
  // протокол-относительный URL — браузер ушёл бы на чужой домен (поймано тестом).
  if (typeof testimonial.photo_url === 'string' && PHOTO_PATH.test(testimonial.photo_url)) {
    const photo = document.createElement('img');
    photo.className = 'pw-photo';
    photo.alt = '';
    photo.loading = 'lazy';
    photo.width = 32;
    photo.height = 32;
    photo.src = apiBase + testimonial.photo_url;
    author.appendChild(photo);
  }

  // Пустое имя — законное состояние: у отзыва, принесённого снимком, автор виден на самом
  // снимке. Пустой узел показал бы читателю пустоту там, где он ждёт человека.
  if (testimonial.author_name !== '') {
    const name = document.createElement('span');
    name.className = 'pw-author-name';
    name.textContent = testimonial.author_name;
    author.appendChild(name);
  }

  if (testimonial.author_role) {
    const role = document.createElement('span');
    role.className = 'pw-author-role';
    role.textContent = testimonial.author_role;
    author.appendChild(role);
  }
  if (author.childNodes.length > 0) card.appendChild(author);

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
