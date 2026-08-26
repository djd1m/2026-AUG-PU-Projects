// src/index.ts
//
// Точка входа виджета — единственный файл, который выполняется браузером после сборки.
// Источник истины: docs/Pseudocode.md §3 (`widgetBootstrap`), docs/Architecture.md §4
// (схема виджета, канонический путь `/api/widget/config`), docs/ADR.md ADR-001, ADR-002.
//
// Встраивание (см. README.md):
//   <script src="https://.../widget.js" data-slug="acme" async></script>

import { buildSkeleton, renderEmptyPlaceholder, renderTestimonials } from './render';
import { renderBadge, startBadgeIntegrityWatch } from './badge';
import { fetchWidgetConfig, resolveApiBase, sendBadgeClick } from './api';
import { injectScopedStyles } from './styles';

function logWarning(message: string): void {
  console.warn(`[proofwall-widget] ${message}`);
}

/**
 * `document.currentScript` остаётся валидным, пока выполняется синхронная верхнеуровневая часть
 * classic-скрипта — атрибут `async` на это не влияет (HTML-спецификация сбрасывает
 * `currentScript` только для модулей и скриптов, вставленных динамически после первого тика).
 * Поэтому читаем его синхронно первой же операцией, до любого `await`.
 */
function resolveOwnScriptTag(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) return current;
  // Фолбэк для окружений без `document.currentScript` (очень старые браузеры) — берём последний
  // вставленный тег с маркером `data-slug`, которым помечается наш скрипт (см. README.md).
  const candidates = document.querySelectorAll<HTMLScriptElement>('script[data-slug]');
  return candidates.length > 0 ? (candidates[candidates.length - 1] ?? null) : null;
}

function createMountElement(scriptEl: HTMLScriptElement): HTMLElement {
  const mount = document.createElement('div');
  // Лёгкая защита самого узла-обёртки от наследуемых свойств хоста ДО attachShadow — Shadow DOM
  // изолирует содержимое, но не сам узел, на который он навешен (ADR-001 "Последствия").
  mount.style.all = 'initial';
  scriptEl.insertAdjacentElement('afterend', mount);
  return mount;
}

export async function widgetBootstrap(): Promise<void> {
  const scriptEl = resolveOwnScriptTag();
  if (!scriptEl) {
    logWarning('не удалось найти собственный <script>-тег, рендер отменён');
    return;
  }

  const slug = scriptEl.getAttribute('data-slug');
  if (!slug) {
    logWarning('data-slug отсутствует, рендер отменён');
    return;
  }

  const mountEl = createMountElement(scriptEl);
  // ADR-001: `root` ниже — это ShadowRoot, а не сам DOM-узел с прикреплённым деревом (тот в
  // терминологии платформы называется "shadow host" — это `mountEl` выше, живёт в light DOM
  // хоста). Вся дальнейшая логика получает только `root` и физически не хранит ссылку на DOM
  // хоста выше него — это архитектурная граница (см. заголовок src/badge.ts), а не пропущенный
  // параметр.
  const root = mountEl.attachShadow({ mode: 'open' });
  injectScopedStyles(root);
  buildSkeleton(root);

  const apiBase = resolveApiBase(scriptEl);
  const domain = window.location.hostname;
  const onBadgeClick = (): void => sendBadgeClick(apiBase, slug, domain);

  const config = await fetchWidgetConfig(apiBase, slug, domain);
  if (config === null) {
    renderEmptyPlaceholder(root); // Pseudocode §3: проект не найден/деактивирован — тихий no-op
    return;
  }

  renderTestimonials(root, config.testimonials);
  renderBadge(root, config.badge_required, onBadgeClick); // FR-GROWTH-003 — решение сервера

  // ПРИМЕЧАНИЕ ПО РАСХОЖДЕНИЮ Pseudocode.md ↔ Architecture.md (см. .claude/rules/
  // p-replicator-known-gaps.md PR-003): Pseudocode.md §3 записывает
  // `recordInstallAndInviteIfNeeded(slug, currentDomain())` как отдельный шаг ПОСЛЕ
  // `fetchWidgetConfig`, что при поверхностном чтении читается как второй клиентский вызов.
  // Architecture.md §4.2 явно называет `GET /api/widget/config` "единственным сетевым запросом"
  // и описывает вставку в `widget_installs` + эмиссию `widget_installed`/`invite_shown`/
  // `badge_impression` как часть СЕРВЕРНОЙ обработки ЭТОГО ЖЕ запроса (шаг 3). Architecture.md —
  // более специфичный и более поздний по канону источник (coding-style.md §2), поэтому здесь
  // сознательно нет второго вызова: сервер уже сделал эту работу к моменту, когда пришёл ответ.
  startBadgeIntegrityWatch(root, config.badge_required, onBadgeClick, (name) => {
    // Клиентские anti-tamper-события (`badge_hide_attempt_blocked`,
    // `badge_zero_size_detected_possible_ancestor_hide`) не входят в таблицу §6 Architecture.md
    // среди инструментируемых `analytics_events` — не изобретаем не описанный в документах
    // эндпоинт для их отправки на сервер, оставляем консольным логом на этой неделе.
    // [GAP: если понадобится серверная наблюдаемость anti-tamper-попыток — нужен отдельный FR]
    console.debug(`[proofwall-widget] ${name}`);
  });
}

// Файл — сам точка входа: автозапуск при исполнении тегом `<script async>` (FR-006 AC).
if (typeof document !== 'undefined') {
  void widgetBootstrap();
}
