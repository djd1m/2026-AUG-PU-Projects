// Точка входа виджета «Суфлёра» (FR-WIDGET-001, Pseudocode «Виджет» п.1–5, ADR-005, ADR-013).
// из N1: projects/01-testimonials-senja/apps/widget/src/index.ts — перенесено: чтение document.currentScript
// СИНХРОННО до первого await, открытый Shadow DOM, «ошибка — не рисовать ничего». Адаптировано: data-slug →
// data-bot (public_key, 22 символа base64url); узел-хозяин — свой элемент <n6-sufler> в КОНЦЕ body (у донора —
// div после тега скрипта со style.all = initial: инлайновый стиль в документе хозяина под его CSP — отказ);
// пустой плейсхолдер донора убран — без конфигурации в документе хозяина не остаётся НИЧЕГО.
//
// Установка: <script src="<N6_PUBLIC_ORIGIN>/w/widget.<hash>.js" data-bot="<public_key>" async></script>
// Необязательный data-theme="light|dark" на теге; иначе — prefers-color-scheme посетителя (FR-WIDGET-004).
import { fetchConfig } from './api';
import { mountBubble } from './chat-window';
import { readSession, storeSession } from './session';
import { adoptStyles } from './styles';

const PUBLIC_KEY = /^[A-Za-z0-9_-]{22}$/;
export const HOST_TAG = 'n6-sufler';

function warn(message: string): void { console.warn(`[sufler-widget] ${message}`); }

export function readTag(script: HTMLScriptElement): { base: string; bot: string; theme: 'light' | 'dark' | null } | null {
  const bot = script.getAttribute('data-bot');
  if (!bot || !PUBLIC_KEY.test(bot)) { warn('атрибут data-bot отсутствует или непригоден — виджет не показан'); return null; }
  let base: string;
  try { base = new URL(script.src).origin; } catch { warn('адрес скрипта не разбирается — виджет не показан'); return null; }
  const theme = script.getAttribute('data-theme');
  return { base, bot, theme: theme === 'light' || theme === 'dark' ? theme : null };
}

async function boot(script: HTMLScriptElement): Promise<void> {
  const tag = readTag(script);
  if (!tag) return;
  const config = await fetchConfig(tag.base, tag.bot, readSession(tag.bot));
  if (!config) return;   // 403/404/сеть/форма — ничего не рисуем и не бросаем на странице хозяина
  storeSession(tag.bot, config.visitor_session);
  if (!document.body) await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  if (document.querySelector(`${HOST_TAG}[data-bot="${tag.bot}"]`)) return;   // тег вставлен дважды — один виджет
  const host = document.createElement(HOST_TAG);
  host.setAttribute('data-bot', tag.bot);
  if (tag.theme) host.setAttribute('data-theme', tag.theme);
  const root = host.attachShadow({ mode: 'open' });
  if (!adoptStyles(root)) { warn('браузер без adoptedStyleSheets — виджет не показан (инлайновые стили запрещены CSP хозяина)'); return; }
  mountBubble(root, config, { base: tag.base, bot: tag.bot, visitorSession: config.visitor_session });
  document.body.appendChild(host);
}

// currentScript валиден только в синхронной части classic-скрипта (async на это не влияет) — читаем сразу.
const current = typeof document !== 'undefined' ? document.currentScript : null;
if (current instanceof HTMLScriptElement) void boot(current).catch(() => undefined);
else if (typeof document !== 'undefined') warn('не найден собственный <script> — виджет не показан');
