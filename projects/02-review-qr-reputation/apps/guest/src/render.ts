// Гостевая страница выбора — НЕСУЩИЙ ИНВАРИАНТ ПРОДУКТА.
//
// ─────────────────────────────────────────────────────────────────────────────
// Ответ зависит ТОЛЬКО от slug. Это не пожелание, а свойство сигнатуры: у функции
// нет аргумента, куда можно подать контекст запроса. Ветвить по оценке, cookie,
// заголовку или времени физически не по чему — нечего читать.
//
// Так гейтинг («показать площадки только довольным») становится невыразимым на
// трёх независимых слоях сразу:
//   1. ТИП — здесь: нет входа для контекста;
//   2. ГРАНТЫ — роль app_render не имеет SELECT на private_feedback: тональность
//      недоступна даже при желании, запрос падает с permission denied;
//   3. СХЕМА — полей gating_enabled, rating_threshold, sort_order не существует.
// Один слой обходится, три вместе — нет. Стережёт T4 (побайтовая одинаковость).
//
// РАВНОВЕСНОСТЬ дверей (D-03, вариант Р1) обеспечена НЕ дисциплиной вёрстки, а
// отсутствием входа для различия: у двери есть key, title, href, note — и ничего,
// что шаблон мог бы прочитать как «эта важнее». Он рисует один и тот же узел в
// цикле и не умеет отличить приватную строку от площадки.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

export type Platform = 'yandex_maps' | 'twogis';
export type LinkKind = 'review_form' | 'card';

export interface PlaceRow {
  id: string;
  slug: string;
  name: string;
  branding_required: boolean;
}

export interface LinkRow {
  platform: Platform;
  url: string;
  link_kind: LinkKind;
}

/** Дверь. Все двери одной формы — иначе появилось бы поле, означающее «эта важнее». */
export interface Door {
  key: string;
  title: string;
  href: string;
  note: string | null;
}

const PLATFORM_TITLE: Record<Platform, string> = {
  yandex_maps: 'Яндекс.Карты',
  twogis: '2ГИС',
};

/**
 * Порядок дверей — ДЕТЕРМИНИРОВАННАЯ ПЕРЕСТАНОВКА ИЗ SLUG.
 *
 * Не случайная: случайность сделала бы страницу разной у двух гостей одной точки,
 * то есть скрытым A/B — и сломала бы T4, который требует побайтового совпадения.
 * Не хранимая: поля порядка нет в схеме намеренно, оно стало бы ручкой «показать
 * эту площадку выше», то есть неравенством дверей через чёрный ход.
 *
 * Перестановка из slug даёт третье: у каждой точки свой порядок (никакая площадка
 * не оказывается первой систематически), и он одинаков для всех её гостей.
 */
function doorOrderKey(slug: string, doorKey: string): string {
  return createHash('sha256').update(`${slug}|${doorKey}`).digest('hex');
}

export function buildDoors(slug: string, links: readonly LinkRow[], baseUrl: string): Door[] {
  const doors: Door[] = links.map((link) => ({
    key: `platform:${link.platform}`,
    title: PLATFORM_TITLE[link.platform],
    href: `${baseUrl}/go/${slug}/${link.platform}`,
    // Честная пометка о цене перехода, а не признак важности: у владельца может не
    // оказаться ссылки прямо на форму — диплинка на неё у площадок НЕ СУЩЕСТВУЕТ.
    note: link.link_kind === 'card' ? 'карточка организации, отзыв — следующим шагом' : null,
  }));

  // Приватная дверь — ЭЛЕМЕНТ ТОГО ЖЕ МНОЖЕСТВА, а не сущность под списком.
  // Название снято с отраслевого стандарта и намёка на сортировку по тональности
  // не содержит: оно не обещает «пожаловаться» и не отговаривает от публичного отзыва.
  doors.push({
    key: 'private',
    title: 'Написать нам напрямую',
    href: `${baseUrl}/r/${slug}/private`,
    note: null,
  });

  return doors.sort((a, b) => doorOrderKey(slug, a.key).localeCompare(doorOrderKey(slug, b.key)));
}

/** Экранирование. Единственное место, где пользовательский текст попадает в разметку. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Разметка.
 *
 * НИ ОДНОГО инлайнового скрипта, ни cookie, ни nonce, ни CSRF-токена — у гостя нет
 * сессии, значит нет и амбиентных полномочий, которые CSRF мог бы использовать.
 * Поэтому список нормализаций для T4 ПУСТ, и sha256 сравнивается по сырому телу.
 * Это сильнее нормализации: нормализация — то место, где страж однажды начнёт
 * стирать настоящее различие.
 *
 * Модалки нет вовсе: она требует JS, а страница обязана быть без скриптов.
 * Инвариант определил вёрстку, а не наоборот.
 */
export function template(placeName: string, doors: readonly Door[], branding: boolean): string {
  const rows = doors
    .map(
      (d) =>
        `<li class="door"><a class="door__link" href="${esc(d.href)}">` +
        `<span class="door__icon" aria-hidden="true">${ICON}</span>` +
        `<span class="door__title">${esc(d.title)}</span>` +
        (d.note ? `<span class="door__note">${esc(d.note)}</span>` : '') +
        `</a></li>`,
    )
    .join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(placeName)}</title><style>${CSS}</style></head>
<body><main class="card"><h1 class="title">${esc(placeName)}</h1>
<p class="lead">Расскажите, как всё прошло — выберите, где вам удобнее.</p>
<ul class="doors">${rows}</ul>${branding ? BRAND : ''}</main></body></html>`;
}

// ОДИН значок на ВСЕ двери, одноцветный, через currentColor.
// Цветной логотип площадки был бы визуальным ВЕСОМ: фирменные цвета рядом с нейтральной
// иконкой делают строки неравными при полном совпадении геометрии и типографики.
// Побочно снимается вопрос об использовании чужих товарных знаков.
const ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

const BRAND = '<p class="brand">Сделано на ReviewQR</p>';

// Системный шрифтовой стек: веб-шрифт — это запрос к чужому хосту с телефона гостя
// в заведении со слабой связью. Плюс любой динамически подставляемый токен вернул бы
// вариативность в тело ответа и сломал бы T4.
const CSS = `*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#faf9fb;
color:#1a1a1f;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.card{max-width:420px;margin:0 auto}.title{margin:0 0 4px;font-size:22px;line-height:1.25}
.lead{margin:0 0 20px;color:#5c5c6b;font-size:15px}.doors{list-style:none;margin:0;padding:0}
.door{margin:0 0 8px}
/* ОДИН класс на все двери. Модификатора для приватной НЕ СУЩЕСТВУЕТ: строки различаются
   только текстом. Высота 60px измерена у отраслевого образца и одинакова на всех устройствах. */
.door__link{display:flex;align-items:center;gap:12px;min-height:60px;padding:0 16px;
border:1px solid #e2e2ea;border-radius:10px;background:#fff;color:inherit;text-decoration:none}
.door__title{font-weight:600}.door__note{margin-left:auto;font-size:13px;color:#5c5c6b}
.brand{margin:24px 0 0;text-align:center;font-size:13px;color:#8a8a99}`;

export function notFoundHtml(): string {
  // 404 ОДИНАКОВ для несуществующего и архивного слага: различие было бы оракулом
  // существования точки.
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Не найдено</title>
<style>${CSS}</style></head><body><main class="card"><h1 class="title">Страница не найдена</h1>
<p class="lead">Проверьте ссылку или QR-код.</p></main></body></html>`;
}
