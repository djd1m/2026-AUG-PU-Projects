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
  it('ревью (находка 1): теги без собственного текста — не граница; мягкий перенос между соседями — граница остаётся', () => {
    expect(text('<p><b>при</b><wbr>мер</p>')).toBe('пример');
    expect(text('<p><b>при</b><img src="x.png" alt="">мер</p>')).toBe('пример');
    expect(text('<p><b>при</b><script>var x = 1;</script>мер</p>')).toBe('пример');
    expect(text('<p><b>при</b><!-- c -->мер</p>')).toBe('пример');
    expect(text('<p><span>А</span>&shy;<span>Б</span></p>')).toBe('А Б');
    // Пропускаемый элемент (nav) закрывает блок, как и прежде: слова разделены переводом строки, а не склеены.
    expect(text('<div><span>Цена</span><nav>меню</nav><span>350 ₽</span></div>')).toBe('Цена\n350 ₽');
  });
});

describe('PDF: склейка прежняя — разделители расставляет pdfjs (ревью, находки 2–5, 7)', () => {
  it('элементы склеиваются как есть; hasEOL — перевод строки; неразрывный пробел схлопывается, как прежде', () => {
    expect(pageText([{ str: 'Стрижка ' }, { str: '1500', hasEOL: true }, { str: 'Москва' }])).toBe('Стрижка 1500\nМосква');
    expect(pageText([{ str: 'А\u00a0\u00a0Б' }])).toBe('А Б');
    expect(pageText([{ str: 'При' }, { str: 'мер' }])).toBe('Пример');
  });
});

// Регрессионная, не различающая: pdfjs сам вставляет пробел по зазору и перевод строки по смене строки, поэтому этот
// документ разделён и прежним кодом. Страж того, что поведение pdfjs, на которое мы опираемся, не изменилось.
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
    // Любая форма относительного импорта: from '…'/"…", import '…', import('…') (ревью, находка 6).
    const imports = [...child.matchAll(/(?:from|import)\s*\(?\s*['"]\.\/([\w.-]+)['"]/g)].map((m) => m[1]!);
    expect(imports).toContain('page-text.mjs');
    const build = JSON.parse(readFileSync('apps/worker/package.json', 'utf8')).scripts.build as string;
    for (const file of ['extract-child.mjs', ...imports]) expect(build, file).toContain(`'${file}'`);
  });
});
