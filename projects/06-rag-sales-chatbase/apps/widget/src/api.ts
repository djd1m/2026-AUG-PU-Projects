// из N1: projects/01-testimonials-senja/apps/widget/src/api.ts (+ types.ts) — адаптировано: один сетевой вызов
// конфигурации заменён тремя маршрутами канона §5 (`GET /w/v1/config?bot=`, `POST /w/v1/event`, `POST /w/v1/ask`);
// `data-api-base` донора убран — API живёт на origin самого скрипта; таймаут 300 мс донора поднят до 5 с (чужая
// сеть посетителя); ответ — обёртка N6 `{ data }` | `{ error }`.
//
// ВСЕ запросы — `credentials: 'omit'` (FR-WIDGET-002): cookie хозяина и наши к серверу не едут, поэтому сервер
// вправе отвечать точным origin без Allow-Credentials, а джокер `*` запрещён отдельно (ADR-005).
// Любой сбой сети или формы ответа сводится к ОДНОМУ безопасному исходу: null / { kind: 'error' } — исключение на
// странице хозяина недопустимо (Pseudocode «Виджет» п.2).

export interface WidgetConfig {
  company_name: string;
  greeting: string;
  contact: string;
  badge_required: boolean;
  badge_href: string | null;
}
export interface SourceView { title: string; url: string | null; excerpt: string }
export type AskResult =
  | { kind: 'answered'; text: string; source: SourceView | null }
  | { kind: 'unknown'; text: string }
  | { kind: 'limit'; text: string }
  | { kind: 'error' };

const CONFIG_TIMEOUT_MS = 5000;
const ASK_TIMEOUT_MS = 30000;
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

// Ссылка, пришедшая по сети, — только http(s): javascript:/data: в href исполнились бы на ЧУЖОМ сайте (NFR-SEC-002).
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

// Форма ответа конфигурации проверяется целиком: badge_required — СТРОГО boolean, иначе конфигурации нет вовсе
// (виджет не рисуется), а не «бейджа нет». Решение о бейдже принимает только сервер (ADR-004).
export function parseConfig(value: unknown): WidgetConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const company = str(d.company_name, 200), greeting = str(d.greeting, 300), contact = str(d.contact, 300);
  if (!company || greeting === null || !contact || typeof d.badge_required !== 'boolean') return null;
  const href = safeHref(d.badge_href);
  if (d.badge_required && !href) return null;
  return { company_name: company, greeting, contact, badge_required: d.badge_required, badge_href: href };
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await run(controller.signal); } finally { clearTimeout(timer); }
}

export async function fetchConfig(base: string, bot: string): Promise<WidgetConfig | null> {
  try {
    return await withTimeout(CONFIG_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${base}/w/v1/config?bot=${encodeURIComponent(bot)}`, { credentials: 'omit', mode: 'cors', signal });
      return response.ok ? parseConfig(await response.json()) : null;
    });
  } catch { return null; }
}

// Событие бейджа: keepalive — клик уходит, даже если посетитель сразу покидает страницу. Аналитика не критична:
// ошибки глотаются (показ и клик считает сервер с дедупликацией на сутки).
export function sendEvent(base: string, body: { bot: string; visitor_session: string; type: 'badge_impression' | 'badge_click' }): void {
  try {
    void fetch(`${base}/w/v1/event`, { method: 'POST', credentials: 'omit', mode: 'cors', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
  } catch { /* fetch недоступен — событие не отправлено, виджет работает */ }
}

function parseSource(value: unknown): SourceView | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  const title = str(s.title, 500), excerpt = str(s.excerpt, 2000);
  if (!title) return null;
  return { title, url: safeHref(s.url), excerpt: excerpt ?? '' };
}

// Контракт ответа (Pseudocode «API Contracts», форма N6): 200 { data: { status: answered, text, source } |
// { status: unknown, text, contact } }, 429 { error: { code: limit, message } }. Маршрут — фича visitor-ask-and-limits.
export function parseAsk(status: number, value: unknown): AskResult {
  if (typeof value !== 'object' || value === null) return { kind: 'error' };
  if (status === 429) {
    const message = str((value as { error?: { message?: unknown } }).error?.message, 500);
    return { kind: 'limit', text: message ?? 'Лимит вопросов на сегодня исчерпан.' };
  }
  if (status !== 200) return { kind: 'error' };
  const data = (value as { data?: Record<string, unknown> }).data;
  if (!data) return { kind: 'error' };
  const text = str(data.text, 4000);
  if (data.status === 'answered' && text) return { kind: 'answered', text, source: parseSource(data.source) };
  if (data.status === 'unknown' && text) return { kind: 'unknown', text };
  return { kind: 'error' };
}

export async function ask(base: string, body: { bot: string; visitor_session: string; question: string }): Promise<AskResult> {
  try {
    return await withTimeout(ASK_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${base}/w/v1/ask`, { method: 'POST', credentials: 'omit', mode: 'cors', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let json: unknown = null;
      try { json = await response.json(); } catch { json = null; }
      return parseAsk(response.status, json);
    });
  } catch { return { kind: 'error' }; }
}
