// Слаг проекта — Pseudocode §9, AC FR-001 «Слаг уникален, ^[a-z0-9-]{3,40}$».
//
// Схема НЕ навешивает CHECK на projects.slug (003_core.sql:33 — «валидация в коде»),
// поэтому этот модуль — единственное место, где живёт формат слага.

import { randomBytes } from 'node:crypto';

export const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
export const SLUG_MAX = 40;
export const SLUG_MIN = 3;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Алфавит без гласных и похожих глифов: суффикс не должен случайно сложиться в слово. */
const ALPHABET = '23456789bcdfghjkmnpqrstvwxz';

export function randomAlphaNum(length: number): string {
  // randomBytes, а не Math.random: слаг попадает в публичный URL /w/<slug>.
  // Отбрасываем байты, не попавшие в кратный диапазон — иначе смещение к началу алфавита.
  const out: string[] = [];
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit) {
        // `byte % length` всегда в диапазоне — noUncheckedIndexedAccess этого не выводит.
        out.push(ALPHABET[byte % ALPHABET.length]!);
        if (out.length === length) break;
      }
    }
  }
  return out.join('');
}

/**
 * Детерминированная часть нормализации: только приведение того, что пользователь уже написал.
 * Ничего не выдумывает — из "ab" получится "ab", а не "ab-x7q".
 */
export function normalizeSlugDeterministic(raw: string | null | undefined): string {
  let slug = (raw ?? '').toLowerCase();
  slug = slug.replace(/[^a-z0-9-]/g, '-'); // пробелы/спецсимволы/кириллица → дефис
  slug = slug.replace(/-{2,}/g, '-'); // схлопнуть повторы
  slug = slug.replace(/^-+|-+$/g, ''); // обрезать по краям
  slug = slug.slice(0, SLUG_MAX);
  // Обрезка по 40 могла обнажить дефис на конце ("...-") — убираем повторно.
  return slug.replace(/-+$/g, '');
}


/**
 * Транслитерация кириллицы и разбор ссылки — ПЕРЕД общей нормализацией.
 *
 * Зачем. `normalizeSlugDeterministic` заменяет всё нелатинское дефисом, и это верно для своей
 * задачи, но на двух живых видах ввода даёт мусор:
 *
 *   «Кофейня Артель»                    → пусто → случайный «f5q»
 *   «https://productuniversity.ru/claude» → «https-productuniversity-ru-claude»
 *
 * Оба случая наблюдались на боевом стенде: второй лежит там до сих пор отдельным проектом.
 * Причина одна — поле называется «название проекта», и люди кладут туда то, что у них под
 * рукой: русское имя заведения или адрес сайта. Спорить с этим бесполезно, надо понимать.
 *
 * Ссылка разбирается в «главную метку хоста + последний сегмент пути»: `productuniversity-claude`.
 * Не весь хост — зона (.ru, .com) в адресе стены не сообщает читателю ничего, а место занимает.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Кириллица → латиница. Незнакомые символы не трогаются: их разберёт общая нормализация. */
export function transliterate(raw: string): string {
  return raw.toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('');
}

/** Если ввод — ссылка, вернуть осмысленную часть; иначе вернуть ввод как есть. */
export function fromUrlIfUrl(raw: string): string {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return text;
  let u: URL;
  try { u = new URL(text); } catch { return text; }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const labels = host.split('.');
  // Главная метка — предпоследняя у обычного домена. У двухсоставных зон (co.uk, com.br)
  // предпоследняя это часть зоны, и правило «бери вторую с конца» давало бы «co».
  // Поймано тестом на shop.example.co.uk.
  //
  // ГРАНИЦА ЧЕСТНО: это не полный Public Suffix List, а короткий список самых частых
  // вторых уровней. Полный список — файл на десятки тысяч строк, который надо обновлять;
  // ради выбора адреса стены это несоразмерно. Промах даст менее красивый слаг, не поломку.
  const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
  let mainIndex = labels.length - 2;
  if (labels.length >= 3 && SECOND_LEVEL.has(labels[mainIndex] ?? '')) mainIndex -= 1;
  const main = labels.length >= 2 ? (labels[mainIndex] ?? '') : (labels[0] ?? '');
  const segments = u.pathname.split('/').filter((x) => x !== '');
  const last = segments.length > 0 ? segments[segments.length - 1]! : '';
  return last === '' ? main : `${main}-${last}`;
}

/**
 * Подготовка НАЗВАНИЯ проекта к превращению в слаг. Применяется только там, где слаг
 * выводится из названия: явно введённый слаг по-прежнему не подменяется — человек написал
 * ровно то, что хотел, и переводить его ввод в другую письменность мы не вправе.
 */
export function slugSourceFromName(raw: string | null | undefined): string {
  return transliterate(fromUrlIfUrl(raw ?? ''));
}

/**
 * Pseudocode §9 normalizeSlug: детерминированная нормализация ПЛЮС добор случайным
 * суффиксом до минимальной длины.
 *
 * РАСХОЖДЕНИЕ С Pseudocode §9 (разрешено в пользу заявленного намерения). Псевдокод
 * применяет эту функцию и к явно введённому слагу, а затем проверяет результат на
 * SLUG_PATTERN. Но добор суффиксом делает эту проверку недостижимой для слишком короткого
 * ввода: "ab" превращается в валидный "ab-x7q" и молча уезжает в БД. Это ровно то, что
 * тот же §9 запрещает словами «Пользователь ЯВНО ввёл слаг — не подменяем его молча
 * случайным вариантом», и что «Граничные случаи» требуют отдать как 400.
 *
 * Поэтому добор суффиксом оставлен ТОЛЬКО для выведенного из названия слага (там выбора
 * пользователя нет и подменять нечего), а явный слаг проверяется после
 * normalizeSlugDeterministic — см. register.ts.
 */
export function normalizeSlug(raw: string | null | undefined): string {
  const slug = normalizeSlugDeterministic(raw);
  if (slug.length < SLUG_MIN) {
    // "ab" -> "ab-x7q". Гарантирует минимум 3 символа даже из пустой строки.
    const suffix = randomAlphaNum(3);
    return (slug.length === 0 ? suffix : `${slug}-${suffix}`).slice(0, SLUG_MAX);
  }
  return slug;
}

/**
 * Pseudocode §9 ensureUniqueSlug: доподбор свободного слага.
 * Применяется ТОЛЬКО к выведенному из названия слагу — явно введённый пользователем
 * слаг при занятости отдаёт 409, а не подменяется молча (Pseudocode §9, «Граничные случаи»).
 */
export async function ensureUniqueSlug(
  candidate: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = candidate;
  let attempt = 0;
  while (await exists(slug)) {
    attempt += 1;
    if (attempt > 10) {
      throw new Error('не удалось подобрать уникальный слаг за 10 попыток');
    }
    const suffix = `-${randomAlphaNum(4)}`;
    slug = candidate.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '') + suffix;
  }
  return slug;
}
