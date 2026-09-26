// Настройки бота и код установки (фича bot-cabinet; FR-BOT-001, FR-BOT-002, FR-WIDGET-003; Pseudocode CreateBot,
// AddAllowedOrigin, InstallSnippet). Написано заново (ADR-016: донора нет). Чистые функции без сети и БД: их зовут
// маршруты кабинета (граница ввода) и тесты. Подпуть @n6/rag/bot-settings — клиентские компоненты не тянут node:fs.
//
// Контакт для «не знаю» — то, что посетитель ЧУЖОГО сайта увидит вместо ответа (FR-ANSWER-003). Поэтому закрытый
// набор форм: почта, телефон, https-ссылка. «Позвоните нам», javascript:, http:// — отказ, а не «сохранить как есть».
import { isIP } from 'node:net';

export const COMPANY_NAME_MAX_CHARS = 200;         // CHECK bot.company_name 1…200 (001_init.sql)
export const GREETING_MAX_CHARS = 300;
export const CONTACT_MAX_CHARS = 300;
export const ORIGINS_PER_BOT = 20;                 // Pseudocode AddAllowedOrigin п.2
export const DOMAIN_INPUT_MAX_CHARS = 253;

const chars = (text: string) => Array.from(text).length;
// Управляющие символы (кроме пробела) в тексте, который увидит посетитель, — отказ: перевод строки в контакте
// ломает строку «Напишите: …», а невидимые символы маскируют подмену.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]');

export type FieldResult = { ok: true; value: string } | { ok: false; message: string };

export function parseCompanyName(value: unknown): FieldResult {
  if (typeof value !== 'string') return { ok: false, message: 'Укажите название компании' };
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, message: 'Укажите название компании' };
  if (CONTROL.test(text)) return { ok: false, message: 'Название содержит служебные символы' };
  if (chars(text) > COMPANY_NAME_MAX_CHARS) return { ok: false, message: `Название — не длиннее ${COMPANY_NAME_MAX_CHARS} символов` };
  return { ok: true, value: text };
}

// Приветствие может быть пустым (у бота из предпросмотра оно пустое): виджет тогда покажет своё по умолчанию.
export function parseGreeting(value: unknown): FieldResult {
  if (typeof value !== 'string') return { ok: false, message: 'Приветствие — текст' };
  const text = value.trim();
  if (text.includes('\n') || CONTROL.test(text)) return { ok: false, message: 'Приветствие — одна строка без служебных символов' };
  if (chars(text) > GREETING_MAX_CHARS) return { ok: false, message: `Приветствие — не длиннее ${GREETING_MAX_CHARS} символов` };
  return { ok: true, value: text };
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;
// Телефон: цифры с «+» в начале, пробелами, дефисами и скобками; 10…15 цифр (E.164 — до 15).
const PHONE_SHAPE = /^\+?[0-9][0-9 ()-]*[0-9]$/;

export type ContactKind = 'email' | 'phone' | 'link';
export type ContactResult = { ok: true; value: string; kind: ContactKind } | { ok: false; message: string };
export const CONTACT_HINT = 'Почта (info@example.ru), телефон (+7 900 000-00-00) или ссылка https://…';
// Контакт для «не знаю» (FR-BOT-001): обязателен до показа кода установки и до ответа виджета.
export function parseContact(value: unknown): ContactResult {
  if (typeof value !== 'string') return { ok: false, message: `Укажите контакт: ${CONTACT_HINT}` };
  const text = value.trim();
  if (!text) return { ok: false, message: `Укажите контакт: ${CONTACT_HINT}` };
  if (CONTROL.test(text) || chars(text) > CONTACT_MAX_CHARS) return { ok: false, message: `Контакт — одна строка до ${CONTACT_MAX_CHARS} символов` };
  if (EMAIL.test(text) && !text.includes('..')) return { ok: true, value: text.toLowerCase(), kind: 'email' };
  if (PHONE_SHAPE.test(text)) {
    const digits = text.replace(/[^0-9]/g, '').length;
    if (digits >= 10 && digits <= 15) return { ok: true, value: text.replace(/\s+/g, ' '), kind: 'phone' };
    return { ok: false, message: 'В телефоне должно быть от 10 до 15 цифр' };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    let url: URL;
    try { url = new URL(text); } catch { return { ok: false, message: `Непригодная ссылка. ${CONTACT_HINT}` }; }
    // Только https: ссылку увидит посетитель чужого сайта; javascript:, data:, http:// — отказ.
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
      return { ok: false, message: 'Ссылка должна начинаться с https:// и вести на сайт или мессенджер' };
    }
    return { ok: true, value: url.href, kind: 'link' };
  }
  return { ok: false, message: `Не похоже на контакт. ${CONTACT_HINT}` };
}
// Контакт, прочитанный из БД, — только если он и сейчас проходит проверку (fail-closed: старая строка «позвоните»
// кода установки не открывает).
export function readContact(value: unknown): string | null {
  const parsed = parseContact(value);
  return parsed.ok ? parsed.value : null;
}

// AddAllowedOrigin п.1 (SC-US-005-2): «shop.example» → https://shop.example; явный http:// — для проверки на
// своём стенде. Хост без пути, запроса и учётных данных; порт — только нестандартный явно. Отказ: IP-адрес
// (частной сети — всегда; публичный — тоже: виджет ставится на сайт с именем), localhost и наш собственный origin.
export type OriginResult = { ok: true; origin: string } | { ok: false; message: string };
export function parseAllowedOrigin(value: unknown, publicOrigin: string): OriginResult {
  const refuse = (message: string): OriginResult => ({ ok: false, message });
  if (typeof value !== 'string') return refuse('Укажите домен сайта, например shop.example');
  const text = value.trim();
  if (!text || text.length > DOMAIN_INPUT_MAX_CHARS + 16 || /\s/.test(text)) return refuse('Укажите домен сайта, например shop.example');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try { url = new URL(withScheme); } catch { return refuse('Не похоже на домен. Пример: shop.example'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return refuse('Домен сайта — только https:// (или http:// для проверки)');
  if (url.username || url.password) return refuse('Домен без логина и пароля');
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return refuse('Нужен только домен, без пути: shop.example');
  const host = url.hostname.replace(/\.$/, '');
  if (isIP(host.replace(/^\[|\]$/g, ''))) return refuse('Нужен домен сайта, а не IP-адрес');
  if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) return refuse('Нужен публичный домен сайта, например shop.example');
  if (!/^[a-z0-9.-]+$/.test(host) || host.split('.').some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    return refuse('Домен содержит недопустимые символы (кириллический домен вводите как есть — браузер переведёт его в xn--)');
  }
  const origin = `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
  if (origin === new URL(publicOrigin).origin) return refuse('Это адрес самого Суфлёра: демо-страница установкой не считается');
  return { ok: true, origin };
}

// InstallSnippet (Pseudocode; SC-US-005-1, SC-US-005-3). Без контакта — отказ, экран показывает форму контакта
// вместо кода. Без собранного бандла виджета (манифест сборки — фича widget-runtime-and-badge) — тоже НЕ код:
// тег на несуществующий файл владелец вставит на сайт, и на сайте не появится ничего (silent-fallbacks).
export type InstallSnippet =
  | { kind: 'contact_required' }
  | { kind: 'bundle_missing'; directives: string[] }
  | { kind: 'ready'; tag: string; directives: string[] };
export const WIDGET_BUNDLE_FILE = /^widget\.[0-9a-f]{8,64}\.js$/;
export function cspDirectives(publicOrigin: string): string[] {
  const origin = new URL(publicOrigin).origin;
  // FR-WIDGET-003: точный список директив, который хозяин обязан разрешить (без unsafe-inline).
  return [`script-src ${origin}`, `connect-src ${origin}`, `img-src ${origin} data:`];
}
export function installSnippet(input: { contact: unknown; publicKey: string; publicOrigin: string; bundleFile: string | null }): InstallSnippet {
  if (!readContact(input.contact)) return { kind: 'contact_required' };
  const directives = cspDirectives(input.publicOrigin);
  if (!input.bundleFile || !WIDGET_BUNDLE_FILE.test(input.bundleFile)) return { kind: 'bundle_missing', directives };
  if (!/^[A-Za-z0-9_-]{22}$/.test(input.publicKey)) throw new Error('Непригодный public_key бота: код установки не строится');
  const origin = new URL(input.publicOrigin).origin;
  return { kind: 'ready', directives, tag: `<script src="${origin}/w/${input.bundleFile}" data-bot="${input.publicKey}" async></script>` };
}
