// src/api.ts
//
// Источник истины: docs/Pseudocode.md §5.1 (`fetchWidgetConfig`, `apiWidgetConfig`),
// docs/Architecture.md §4.2 ("единственный сетевой запрос"), §6 (таблица событий аналитики —
// `badge_click`), docs/ADR.md ADR-002, .claude/rules/coding-style.md §3/§4.

import type { WidgetConfigResponse } from './types';

/** coding-style.md §3: таймаут сетевого запроса конфигурации — 300 мс, не подвисание. */
const CONFIG_TIMEOUT_MS = 300;

/** Architecture §10 — канонический путь, НЕ `/api/widget-config`. */
const CONFIG_PATH = '/api/widget/config';

/** Architecture §6 — канонический путь для клика по badge. */
const BADGE_CLICK_PATH = '/api/widget/badge-click';

/**
 * Базовый origin для API-запросов виджета.
 *
 * По умолчанию — origin, с которого загружен сам файл виджета (`scriptEl.src`). На этой неделе
 * это совпадает с origin приложения: один VPS, один Caddy перед `web` (ADR-007) — отдельного
 * CDN-домена под статику виджета документы не описывают как отдельную инфраструктуру, несмотря
 * на иллюстративный `cdn.proofwall.app` в примере ADR-007.
 * [GAP: Architecture.md §11 не фиксирует финальную топологию доменов CDN/API — если она
 * появится, `data-api-base` на теге `<script>` уже даёт точку расширения без изменения кода.]
 */
export function resolveApiBase(scriptEl: HTMLScriptElement): string {
  const override = scriptEl.getAttribute('data-api-base');
  if (override) return override.replace(/\/+$/, '');
  try {
    return new URL(scriptEl.src).origin;
  } catch {
    return window.location.origin;
  }
}

function isWidgetConfigResponse(value: unknown): value is WidgetConfigResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.badge_required === 'boolean' && Array.isArray(v.testimonials);
}

/**
 * Pseudocode.md §5.1 `fetchWidgetConfig(slug, domain)`. Единственный сетевой запрос виджета
 * (Architecture §4.2) — сервер в этом же запросе резолвит тариф, пишет `widget_installs` и
 * `badge_impression` (см. index.ts, где объясняется, почему это не отдельный клиентский вызов).
 *
 * Любой сбой (таймаут, сеть, невалидный ответ) сведён к одному безопасному исходу — `null`,
 * который вызывающая сторона превращает в `renderEmptyPlaceholder` (Pseudocode §3).
 */
export async function fetchWidgetConfig(
  apiBase: string,
  slug: string,
  domain: string,
): Promise<WidgetConfigResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const url =
      `${apiBase}${CONFIG_PATH}?slug=${encodeURIComponent(slug)}` +
      `&domain=${encodeURIComponent(domain)}`;
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    // ADR-002: даже если сервер по ошибке пришлёт лишнее поле (напр. `tier`), клиент его не
    // читает — используем только форму, которую сами объявили в types.ts.
    return isWidgetConfigResponse(data) ? data : null;
  } catch {
    return null; // включая AbortError по таймауту — единый безопасный исход
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Architecture §6: `badge_click` — единственное аналитическое событие, которое отправляет сам
 * виджет (остальные — `widget_installed`/`invite_shown`/`badge_impression` — пишутся сервером
 * внутри `/api/widget/config`, см. index.ts). `sendBeacon` не блокирует переход по ссылке и
 * гарантированно уходит даже если страница закрывается сразу после клика.
 */
export function sendBadgeClick(apiBase: string, slug: string, domain: string): void {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
  try {
    const blob = new Blob([JSON.stringify({ slug, domain })], { type: 'application/json' });
    navigator.sendBeacon(`${apiBase}${BADGE_CLICK_PATH}`, blob);
  } catch {
    // Аналитика — не критичный путь: клик по badge не должен ломаться из-за редкого исключения
    // sendBeacon (напр. превышение браузерной квоты в очереди).
  }
}
