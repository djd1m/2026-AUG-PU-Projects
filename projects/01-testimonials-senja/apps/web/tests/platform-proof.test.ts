// Разбор площадки и ссылки на первоисточник. БЕЗ базы данных: чистые функции проверяются
// в самом дешёвом слое, и этот файл годится в офлайн-набор демонстрации.

import { describe, expect, it } from 'vitest';
import { PLATFORMS, detectPlatform, platformFrom, hasProof, isPlatformKey, platformLabel, validateSourceUrl } from '../src/lib/platform-proof';

describe('площадка из закрытого списка', () => {
  it('известные ключи принимаются, посторонние — нет', () => {
    for (const k of Object.keys(PLATFORMS)) expect(isPlatformKey(k)).toBe(true);
    for (const bad of ['', 'google', 'YANDEX_MAPS', 'yandex maps', null, undefined, 42, {}, ['yandex_maps']]) {
      expect(isPlatformKey(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('во фразе «Отзыв с …» падеж родительный — иначе выходит «с другой источник»', () => {
    // Читатель стены видит эту строку целиком; согласование — не мелочь оформления.
    expect(`Отзыв с ${platformFrom('other')}`).toBe('Отзыв с внешней площадки');
    expect(`Отзыв с ${platformFrom('yandex_maps')}`).toBe('Отзыв с Яндекс.Карты');
    expect(platformFrom('нет такого')).toBeNull();
  });

  it('подпись берётся из таблицы, у неизвестного ключа её нет', () => {
    expect(platformLabel('yandex_maps')).toBe('Яндекс.Карты');
    expect(platformLabel('twogis')).toBe('2ГИС');
    expect(platformLabel('unknown')).toBeNull();
    expect(platformLabel(null)).toBeNull();
  });
});

describe('ссылка на первоисточник', () => {
  it('принимает адрес площадки, включая поддомен', () => {
    for (const u of ['https://yandex.ru/maps/org/x/1/reviews', 'https://maps.yandex.ru/org/x']) {
      const r = validateSourceUrl('yandex_maps', u);
      expect(r.ok, u).toBe(true);
    }
    expect(validateSourceUrl('twogis', 'https://2gis.ru/firm/1/tab/reviews').ok).toBe(true);
  });

  it('поддомен проверяется ПО ТОЧКЕ — иначе evilyandex.ru прошёл бы', () => {
    // Ловушка: endsWith('yandex.ru') без точки истинно и для 'evilyandex.ru'.
    const r = validateSourceUrl('yandex_maps', 'https://evilyandex.ru/maps');
    expect(r.ok).toBe(false);
  });

  it('http отвергается — и причина названа отдельно от «не та площадка»', () => {
    const r = validateSourceUrl('yandex_maps', 'http://yandex.ru/maps');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('https');
  });

  it('чужая площадка отвергается с называнием ожидаемых хостов', () => {
    const r = validateSourceUrl('twogis', 'https://yandex.ru/maps/org/x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2gis.ru');
  });

  it('не-ссылка отвергается', () => {
    for (const bad of ['', 'yandex.ru', 'javascript:alert(1)', 'не ссылка']) {
      expect(validateSourceUrl('yandex_maps', bad).ok, bad).toBe(false);
    }
  });

  it('«другое» принимает любой https-хост, но по-прежнему не http', () => {
    expect(validateSourceUrl('other', 'https://example.com/review/7').ok).toBe(true);
    expect(validateSourceUrl('other', 'http://example.com/review/7').ok).toBe(false);
  });
});

describe('площадка выводится из адреса — без обращения в сеть', () => {
  it('узнаёт известные площадки, включая поддомены', () => {
    expect(detectPlatform('https://yandex.ru/maps/org/x/1/reviews/')).toBe('yandex_maps');
    expect(detectPlatform('https://maps.yandex.ru/org/x')).toBe('yandex_maps');
    expect(detectPlatform('https://2gis.ru/moscow/firm/1/tab/reviews')).toBe('twogis');
    expect(detectPlatform('https://otzovik.com/review_1.html')).toBe('otzovik');
  });

  it('неизвестный хост — «другое», а НЕ отказ: ссылка остаётся доказательством', () => {
    expect(detectPlatform('https://example.com/review/7')).toBe('other');
  });

  it('не-ссылка и http дают null — тогда площадку спросят у владельца', () => {
    for (const bad of ['', 'yandex.ru', 'http://yandex.ru/maps', 'не ссылка']) {
      expect(detectPlatform(bad), bad).toBeNull();
    }
  });

  it('подделка хоста не проходит: evilyandex.ru это «другое», не Яндекс', () => {
    expect(detectPlatform('https://evilyandex.ru/maps')).toBe('other');
  });
});

describe('доказательство обязано быть хотя бы одно', () => {
  it('ни ссылки, ни снимка — отказ', () => {
    expect(hasProof(null, false)).toBe(false);
    expect(hasProof('', false)).toBe(false);
  });

  it('достаточно любого одного', () => {
    expect(hasProof('https://yandex.ru/x', false)).toBe(true);
    expect(hasProof(null, true)).toBe(true);
    expect(hasProof('https://yandex.ru/x', true)).toBe(true);
  });
});

/** Срезает комментарии: страж обязан проверять КОД, а не текст рядом с ним. Первая редакция
 *  этих стражей нашла `innerHTML` в шапке файла, где он ЗАПРЕЩЁН словами, и дала ложное
 *  красное — тот же класс, что ловил проект в других местах. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('форма кабинета', () => {
  it('список площадок в форме СОВПАДАЕТ с серверным — иначе владелец выберет и получит отказ', async () => {
    const { PLATFORM_OPTIONS } = await import('../src/app/dashboard/[slug]/platform-form');
    const inForm = PLATFORM_OPTIONS.map((o) => o.value).sort();
    const onServer = Object.keys(PLATFORMS).sort();
    expect(inForm).toEqual(onServer);
  });

  it('подписи в форме совпадают с серверными — читатель и владелец видят одно название', async () => {
    const { PLATFORM_OPTIONS } = await import('../src/app/dashboard/[slug]/platform-form');
    for (const o of PLATFORM_OPTIONS) {
      if (o.value === 'other') continue; // у «другого» подпись на карточке иная по смыслу
      expect(platformLabel(o.value), o.value).toBe(o.label);
    }
  });

  it('страж: форма не отправляет project_id — проект резолвится по slug и владельцу', async () => {
    const { readFileSync } = await import('node:fs');
    // Комментарии срезаются: в файле есть строка «project_id НЕ отправляется», и страж по
    // сырому тексту поймал бы её — форма вместо смысла, третий случай этого класса за прогон.
    const src = code(readFileSync(new URL('../src/app/dashboard/[slug]/platform-form.tsx', import.meta.url), 'utf8'));
    expect(src).not.toContain('project_id');
  });

  it('страж: кнопка заблокирована, пока нечего добавлять', async () => {
    const { readFileSync } = await import('node:fs');
    const src = code(readFileSync(new URL('../src/app/dashboard/[slug]/platform-form.tsx', import.meta.url), 'utf8'));
    expect(src).toMatch(/disabled=\{busy \|\| !ready\}/);
    // Снимка ОДНОГО достаточно; ссылки без текста — нет.
    expect(src).toMatch(/const ready = \(file !== null\) \|\| \(sourceUrl\.trim\(\) !== '' && text\.trim\(\) !== ''\)/);
  });

  it('страж: вставка из буфера принимает и картинку, и адрес', async () => {
    const { readFileSync } = await import('node:fs');
    const src = code(readFileSync(new URL('../src/app/dashboard/[slug]/platform-form.tsx', import.meta.url), 'utf8'));
    expect(src).toContain('clipboardData.files');
    expect(src).toContain("clipboardData.getData('text')");
    expect(src).toMatch(/onPaste=\{onPaste\}/);
  });

  it('страж: обе поверхности пропускают ПУСТОГО автора', async () => {
    const { readFileSync } = await import('node:fs');
    const wall = code(readFileSync(new URL('../src/app/w/[slug]/page.tsx', import.meta.url), 'utf8'));
    expect(wall).toMatch(/item\.author_name !== ''/);
    const widget = code(readFileSync(new URL('../../widget/src/render.ts', import.meta.url), 'utf8'));
    expect(widget).toMatch(/testimonial\.author_name !== ''/);
    // И пустой подвал не приклеивается к карточке.
    expect(widget).toMatch(/author\.childNodes\.length > 0/);
  });
});

describe('стражи по исходнику', () => {
  it('снимок рендерится как СОДЕРЖИМОЕ карточки, а не в слоте аватара', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/app/w/[slug]/page.tsx', import.meta.url), 'utf8');
    const c = code(src);
    const shot = c.indexOf('screenshot_object_key');
    expect(shot).toBeGreaterThan(-1);
    // Границей блока служит НАЧАЛО следующего блока (пометка источника), а не позиция
    // класса аватара: аватар лежит ниже по файлу, и слайс «до него» захватывал бы весь
    // подвал карточки — ложное красное вместо проверки.
    const nextBlock = c.indexOf("item.source === 'platform'", shot);
    const shotBlock = c.slice(shot, nextBlock > shot ? nextBlock : shot + 700);
    expect(shotBlock).toContain('quote__shot');
    expect(shotBlock).not.toContain('quote__avatar');
  });

  it('ссылка на чужую площадку несёт noopener и nofollow — на обеих поверхностях', async () => {
    const { readFileSync } = await import('node:fs');
    for (const rel of ['../src/app/w/[slug]/page.tsx', '../../widget/src/render.ts']) {
      const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
      const i = src.indexOf('source_url');
      expect(i, rel).toBeGreaterThan(-1);
      const block = code(src).slice(code(src).indexOf('source_url'), code(src).indexOf('source_url') + 1400);
      expect(block, rel).toContain('noopener');
      expect(block, rel).toContain('nofollow');
    }
  });

  it('виджет собирает подпись СОЗДАНИЕМ УЗЛОВ, не склейкой разметки', async () => {
    const { readFileSync } = await import('node:fs');
    const c = code(readFileSync(new URL('../../widget/src/render.ts', import.meta.url), 'utf8'));
    expect(c).not.toContain('innerHTML');
    expect(c).toContain("createElement('a')");
  });
});
