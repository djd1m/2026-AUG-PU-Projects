// src/styles.ts
//
// Источник истины: docs/ADR.md ADR-001 (Shadow DOM), docs/Architecture.md §4.1,
// .claude/rules/coding-style.md §3 ("все стили инжектятся внутрь shadow-root через <style>,
// не использовать глобальные CSS-классы для виджета").
//
// `:host { all: initial }` — сброс наследуемых от хоста CSS-свойств, которые Shadow DOM
// пропускает по спецификации (font-family, color и т.п. наследуются даже через границу shadow-
// root, если явно не сброшены). Без этого агрессивный глобальный CSS хоста (`* { all: unset }`,
// см. testing.md §2) мог бы всё равно "просочиться" внутрь через наследование, а не через
// каскад — это не баг Shadow DOM, а его сознательно ограниченная гарантия (ADR-001 упоминает
// только каскад/селекторы, наследование — отдельная категория, которую здесь закрываем явно).
const CSS = `
:host {
  all: initial;
  display: block;
  box-sizing: border-box;
  contain: content;
}
.pw-widget, .pw-widget *, .pw-widget *::before, .pw-widget *::after {
  box-sizing: inherit;
}
.pw-widget {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pw-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pw-card {
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}
.pw-text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.pw-author {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #444;
}
.pw-author-role {
  font-weight: 400;
  color: #888;
}
.pw-transcript-label {
  margin: 8px 0 0;
  font-size: 12px;
  font-style: italic;
  color: #777;
}
.pw-photo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 8px;
  flex: none;
  background: #eee;
}
.pw-badge-slot {
  display: flex;
}
.pw-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
  text-decoration: none;
  padding: 4px 0;
}
.pw-badge:hover {
  color: #222;
  text-decoration: underline;
}
`;

/** Pseudocode.md §3 `injectScopedStyles(host)` — вызывается сразу после attachShadow. */
export function injectScopedStyles(root: ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
}
