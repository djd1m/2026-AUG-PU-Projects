// extract-text-separators (дефект стенда 26.09): соседние элементы страницы склеивались без пробела — в цитате
// источника предпросмотра aicoding.space «целиком5 курсов health-advisorПодготовка». Набор — реальная разметка
// (снята 27.09) и типовые формы карточек, списков, таблиц; плюс склейка элементов PDF по геометрии.
// Тест СНАЧАЛА красный на прежнем коде (квитанция 05_completion.md, раздел «Красный до правки»).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractPage } from '../apps/worker/src/crawl/extract-text';
import { extractPdf } from '../apps/worker/src/pdf/extract-pdf';
import { buildPdf, pdfString } from './fixtures/pdf-factory';
// Чистый .mjs-модуль дочернего процесса PDF (типы выводятся из JS).
import { pageText } from '../apps/worker/src/pdf/page-text.mjs';

const body = (html: string) => extractPage(`<html><body>${html}</body></html>`);
const text = (html: string) => body(html).text;

describe('HTML: граница соседних элементов — пробел, слово, разрезанное тегом, — целое', () => {
  it('AC-1: разметка aicoding.space /courses/ — «целиком 5 курсов», «health-advisor Подготовка»', () => {
    const html = `<div class="famhd" id="viii"><span style="font-weight:700">08</span><h2 class="h">Готовые продукты</h2>`
      + `<span class="d" style="flex:1">как выглядит собранное на этом харнессе целиком</span><span class="d">5 курсов</span></div>`
      + `<a class="crs" href="/courses/health-advisor/"><span style="font-size:12.5px">health-advisor</span><span class="sg">Подготовка к разговору`
      + ` с врачом: разбор анализов и сочетаний лекарств, данные остаются у пользователя.</span><span class="d">@dzhechkov/health-advisor</span>`
      + `<span style="text-align:right">открыть →</span></a><a class="crs" href="/courses/trip-planner/"><span>trip-planner</span></a>`;
    const t = text(html);
    expect(t).toContain('целиком 5 курсов');
    expect(t).toContain('health-advisor Подготовка к разговору');
    expect(t).toContain('пользователя. @dzhechkov/health-advisor открыть → trip-planner');
    for (const glued of ['целиком5', 'health-advisorПодготовка', 'пользователя.@', 'открыть →trip']) expect(t).not.toContain(glued);
  });
  it('AC-2: карточки <a><span/><span/></a><a> — слова разделены', () => {
    expect(text('<div><a href="/a"><span>Стрижка</span><span>1 500 ₽</span></a><a href="/b"><span>Окрашивание</span><span>3 000 ₽</span></a></div>'))
      .toBe('Стрижка 1 500 ₽ Окрашивание 3 000 ₽');
  });
  it('AC-3: слово, разрезанное строчным тегом, — без лишних пробелов', () => {
    expect(text('<p><b>при</b>мер</p>')).toBe('пример');
    expect(text('<p>при<b>мер</b></p>')).toBe('пример');
    expect(text('<p><a href="/x">при</a>мер</p>')).toBe('пример');
    expect(text('<p>Цена: <b>350</b> ₽, <i>доставка</i> завтра</p>')).toBe('Цена: 350 ₽, доставка завтра');
    expect(text('<p>H<sub>2</sub>O и м<sup>2</sup></p>')).toBe('H2O и м2');
  });
  it('AC-4: списки, <br>, таблицы — отдельные блоки, как прежде', () => {
    expect(body('<ul><li>Доставка</li><li>Самовывоз</li></ul>').blocks.map((b) => b.text)).toEqual(['Доставка', 'Самовывоз']);
    expect(body('<p>Москва<br>Тверская, 1</p>').blocks.map((b) => b.text)).toEqual(['Москва', 'Тверская, 1']);
    expect(body('<table><tr><th>Услуга</th><td>Цена</td></tr></table>').blocks.map((b) => b.text)).toEqual(['Услуга', 'Цена']);
  });
  it('AC-5: заголовок из соседних элементов — «Шаг 1», и граница не переходит между заголовком и текстом', () => {
    const page = body('<h2><span>Шаг</span><span>1</span></h2><p><span>Оставьте</span><span>заявку</span></p>');
    expect(page.headings).toEqual([{ level: 2, text: 'Шаг 1' }]);
    expect(page.blocks.map((b) => b.text)).toEqual(['Шаг 1', 'Оставьте заявку']);
  });
  it('пробел на границе не удваивается и не появляется на краях блока', () => {
    expect(text('<p><span>А</span> <span>Б</span></p>')).toBe('А Б');
    expect(text('<p><span>А</span></p><p><span>Б</span></p>')).toBe('А\nБ');
    expect(text('<div><span></span><span>Текст</span></div>')).toBe('Текст');
  });
});

// Элемент pdfjs: str, transform [a, b, c, d, e(x), f(y)], width (в единицах страницы), hasEOL.
const item = (str: string, x: number, y: number, width: number, size = 10, hasEOL = false) =>
  ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL });

describe('PDF: разделитель между элементами — из геометрии', () => {
  it('AC-6: зазор на строке — пробел; стык без зазора — без пробела', () => {
    expect(pageText([item('Стрижка', 50, 700, 40), item('1500', 120, 700, 20)])).toBe('Стрижка 1500');
    expect(pageText([item('При', 50, 700, 15), item('мер', 65, 700, 15)])).toBe('Пример');
    expect(pageText([item('При', 50, 700, 15), item('мер', 64.8, 700, 15)])).toBe('Пример');
  });
  it('AC-6: смена строки без hasEOL — перевод строки; hasEOL сохраняется; пустые элементы не дают пробелов', () => {
    expect(pageText([item('Москва', 50, 700, 30), item('Тверская', 50, 686, 40)])).toBe('Москва\nТверская');
    expect(pageText([item('Москва', 50, 700, 30, 10, true), item('Тверская', 50, 686, 40)])).toBe('Москва\nТверская');
    expect(pageText([item('А', 50, 700, 5), item('', 60, 700, 0), item('Б', 90, 700, 5)])).toBe('А Б');
  });
  it('AC-6: элемент уже несёт пробел — второго нет; элемент без геометрии склеивается как прежде', () => {
    expect(pageText([item('Цена: ', 50, 700, 30), item('350', 90, 700, 15)])).toBe('Цена: 350');
    expect(pageText([{ str: 'А' }, { str: 'Б' }])).toBe('АБ');
  });
});

describe('PDF настоящим pdfjs (AC-7): дочерний процесс разбора', () => {
  it('два фрагмента на одной строке через зазор — слова разделены; слово из двух кусков без зазора — целое', async () => {
    const raw = `BT /F1 12 Tf 72 720 Td ${pdfString('Стрижка')} Tj ET BT /F1 12 Tf 300 720 Td ${pdfString('1500')} Tj ET `
      + `BT /F1 12 Tf 72 690 Td ${pdfString('При')} Tj ${pdfString('мер')} Tj ET `
      + `BT /F1 12 Tf 72 660 Td ${pdfString('Прайс салона на стрижки и окрашивание действует с сентября')} Tj ET`;
    const text = (await extractPdf(buildPdf([{ raw }]))).pages[0]!;
    expect(text).toContain('Стрижка 1500');
    expect(text).toContain('Пример');
    expect(text).not.toContain('Стрижка1500');
  }, 30_000);
});

describe('Страж сборки (AC-8): каждый относительный импорт дочернего процесса PDF копируется сборкой воркера', () => {
  it('extract-child.mjs → dist/pdf: копирует build из apps/worker/package.json', () => {
    const child = readFileSync('apps/worker/src/pdf/extract-child.mjs', 'utf8');
    const imports = [...child.matchAll(/from\s+'\.\/([\w.-]+\.mjs)'/g)].map((m) => m[1]!);
    expect(imports).toContain('page-text.mjs');
    const build = JSON.parse(readFileSync('apps/worker/package.json', 'utf8')).scripts.build as string;
    for (const file of ['extract-child.mjs', ...imports]) expect(build, file).toContain(`'${file}'`);
  });
});
