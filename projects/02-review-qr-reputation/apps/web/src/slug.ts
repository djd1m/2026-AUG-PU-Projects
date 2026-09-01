// Генерация адреса точки из названия.
//
// ПОЛЯ «ПРИДУМАЙТЕ АДРЕС» В ФОРМЕ НЕТ — по разбору рынка (slug-constraints-ux.md):
// у Linktree и Telegram адрес — идентичность владельца, его набирают руками, спрашивать
// законно. У нас ссылку СКАНИРУЮТ; цена поля — «занято» в лицо новичку и regex-ребус,
// цена автогенерации — ноль. Google прошёл этот путь и откатился от ручных имён.
//
// Кириллица, пробелы, регистр НЕ ОТВЕРГАЮТСЯ — нормализуются. Отказ там, где можно
// молча сделать правильно, — наш же анти-паттерн тихого фолбэка, только вывернутый.

import { randomBytes } from 'node:crypto';

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Резерв: пути кабинета и гостя. Слаг, равный пути, ломал бы маршрутизацию прокси
 *  («/r/private/private») или читался бы как системная страница. */
export const RESERVED = new Set([
  'api', 'admin', 'internal', 'static', 'assets', 'r', 'go', 'v',
  'login', 'register', 'logout', 'dashboard', 'places', 'private',
]);

export function translit(name: string): string {
  const base = name.toLowerCase()
    .split('').map((c) => RU[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-')     // всё «не то» — в дефис, а не в отказ
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return base;
}

/** Кандидат слага. Пустой или короткий остаток («™»,«!!») и резерв получают хвост. */
export function slugCandidate(name: string, withTail = false): string {
  let s = translit(name);
  if (s.length < 3 || RESERVED.has(s)) withTail = true;
  if (withTail) {
    // Хвост СЛУЧАЙНЫЙ, а не «-2»: предсказуемый суффикс превращает чужое «занято» в
    // подсказку перебора соседних точек (slug-constraints-ux.md, вопрос 3).
    const tail = randomBytes(2).toString('hex');
    s = `${s ? s.slice(0, 19) + '-' : 'p-'}${tail}`;
  }
  return s;
}
