// Пузырь и окно чата (FR-WIDGET-001, FR-WIDGET-004, FR-LOOK-011, NFR-SEC-002, NFR-PERF-003).
// из N1: projects/01-testimonials-senja/apps/widget/src/render.ts — перенесён приём «только textContent, ссылка —
// после проверки схемы»; адаптировано: лента отзывов → пузырь 56 px и окно диалога; окно строится ЛЕНИВО, по
// первому клику (до клика в корне только кнопка — ничего не тормозит страницу хозяина).
//
// Инварианты, которые стерегут tests/widget-source.test.ts и браузерный набор на чужом origin:
//  - только textContent и createElement — ни innerHTML, ни insertAdjacentHTML (stored-XSS на чужом сайте);
//  - ни одного style-атрибута и <style> (CSP хозяина без unsafe-inline); иконки — SVG через createElementNS;
//  - обработчики — на узлах внутри корня, не на window/document хозяина; Esc — на окне.

import { ask, sendEvent, type AskResult, type WidgetConfig } from './api';
import { badgeIntact, renderBadge, startBadgeWatch, type BadgeOptions } from './badge';

export interface WidgetContext { base: string; bot: string; visitorSession: string }
export const QUESTION_MAX_CHARS = 500;   // Pseudocode AnswerQuestion п.1: вопрос ≤ 500 символов
export const WARNING = 'Не сообщайте паспортные и платёжные данные.';

const SVG = 'http://www.w3.org/2000/svg';
function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', path);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
  return svg;
}
const CHAT_ICON = 'M4 5h16v11H9l-5 4z';
const CLOSE_ICON = 'M6 6l12 12M18 6L6 18';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function intro(config: WidgetConfig): string {
  // FR-ANSWER-005: бот представляется ботом и не выдаёт себя за человека.
  // Название компании — в заголовке окна; здесь без него (кавычки в названии дали бы «Пекарня «Колос»»).
  const first = 'Я бот, отвечаю по материалам сайта.';
  return config.greeting ? `${config.greeting}\n${first}` : `Здравствуйте! ${first}`;
}

// Сообщение бота в ленте: текст — ТЕКСТОМ, источник — «Источник: <заголовок>» с раскрытием цитаты.
export function renderReply(result: AskResult, contact: string): HTMLLIElement {
  const item = el('li', 'msg bot');
  if (result.kind === 'answered') {
    item.appendChild(document.createTextNode(result.text));
    if (result.source) {
      const details = el('details', 'src');
      details.appendChild(el('summary', undefined, `Источник: ${result.source.title} ↗`));
      if (result.source.excerpt) details.appendChild(el('p', undefined, result.source.excerpt));
      if (result.source.url) {
        const a = el('a', 'link', 'Открыть страницу ↗');
        a.href = result.source.url;   // уже прошла safeHref (http/https) в api.ts
        a.target = '_blank';
        a.rel = 'noopener nofollow';
        details.appendChild(a);
      }
      item.appendChild(details);
    }
    return item;
  }
  item.textContent = result.kind === 'error' ? `Не получилось получить ответ. Напишите: ${contact}` : result.text;
  return item;
}

export function mountBubble(root: ShadowRoot, config: WidgetConfig, ctx: WidgetContext): HTMLButtonElement {
  const shell = el('div', 'n6');
  const bubble = el('button', 'bubble');
  bubble.type = 'button';
  bubble.setAttribute('aria-label', `Открыть чат: ${config.company_name}`);
  bubble.setAttribute('aria-expanded', 'false');
  bubble.appendChild(icon(CHAT_ICON));
  shell.appendChild(bubble);
  root.appendChild(shell);

  let panel: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  const open = () => {
    panel ??= buildPanel(root, shell, config, ctx, close);
    panel.hidden = false;
    bubble.setAttribute('aria-expanded', 'true');
    input = panel.querySelector('input');
    input?.focus();
  };
  const close = () => {
    if (!panel) return;
    panel.hidden = true;
    bubble.setAttribute('aria-expanded', 'false');
    bubble.focus();
  };
  bubble.addEventListener('click', () => (panel && !panel.hidden ? close() : open()));
  return bubble;
}

function buildPanel(root: ShadowRoot, shell: HTMLElement, config: WidgetConfig, ctx: WidgetContext, close: () => void): HTMLElement {
  const panel = el('div', 'panel');
  panel.id = 'n6-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'n6-title');
  panel.hidden = true;

  const head = el('div', 'head');
  const title = el('h2', 'title', config.company_name);
  title.id = 'n6-title';
  const closeBtn = el('button', 'icon-btn');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть чат');
  closeBtn.appendChild(icon(CLOSE_ICON));
  closeBtn.addEventListener('click', close);
  head.append(title, closeBtn);

  const log = el('ol', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'Переписка');
  log.appendChild(el('li', 'msg bot', intro(config)));

  const warn = el('p', 'warn', WARNING);
  const form = el('form', 'form');
  const label = el('label', 'sr', 'Ваш вопрос');
  label.htmlFor = 'n6-input';
  const input = el('input', 'input');
  input.id = 'n6-input';
  input.type = 'text';
  input.maxLength = QUESTION_MAX_CHARS;
  input.autocomplete = 'off';
  input.placeholder = 'Задайте вопрос';
  const send = el('button', 'send', 'Отправить');
  send.type = 'submit';
  form.append(label, input, send);

  const foot = el('div', 'n6-foot');
  const slot = el('div', 'n6-slot');
  foot.appendChild(slot);
  panel.append(head, log, warn, form, foot);
  shell.appendChild(panel);

  const badge: BadgeOptions | null = config.badge_required && config.badge_href
    ? { href: config.badge_href, onClick: () => sendEvent(ctx.base, { bot: ctx.bot, visitor_session: ctx.visitorSession, type: 'badge_click' }) }
    : null;
  if (badge) {
    renderBadge(slot, true, badge);
    startBadgeWatch(root, slot, badge);
    sendEvent(ctx.base, { bot: ctx.bot, visitor_session: ctx.visitorSession, type: 'badge_impression' });
  }

  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  let busy = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    // ADR-004: без видимого бейджа (на free) вопрос не уходит — бейдж восстанавливается, посетитель жмёт снова.
    if (badge && !badgeIntact(root, slot, badge)) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    log.appendChild(el('li', 'msg user', question));
    const pending = el('li', 'msg note', 'Ищу в материалах…');
    log.appendChild(pending);
    log.setAttribute('aria-busy', 'true');
    void ask(ctx.base, { bot: ctx.bot, visitor_session: ctx.visitorSession, question: question.slice(0, QUESTION_MAX_CHARS) }).then((result) => {
      pending.remove();
      log.appendChild(renderReply(result, config.contact));
      log.setAttribute('aria-busy', 'false');
      log.scrollTop = log.scrollHeight;
      busy = false;
      send.disabled = false;
    });
  });
  return panel;
}
