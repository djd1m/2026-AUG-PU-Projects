// Темы приветствия светской беседы (A-N6-076; дефект стенда 28.09: «Например, спросите о темах: http://info.cern.ch»).
// Тема — только содержательный заголовок: адрес, пустое, служебное, цифры и знаки, повтор — не темы; длинное режется по
// границе слова; меньше двух тем — фраза без списка. Негодный заголовок страницы подменяется её первым разделом из
// context_path, построенного НАСТОЯЩИМ chunkDocument (ревью круга 1: формат пути задаёт производитель, а не тест).
import { describe, expect, it } from 'vitest';
import { chunkDocument, pageHeading, smallTalkReply, SMALL_TALK_MIN_TOPICS, topicsFromTitles, type ChunkBlock, type PageTopicSource } from '../packages/rag/src/index';

const TAIL = ['Сезонные торты', 'Оплата заказа'];
// Кандидат → тема (null — не тема). Проверяется ПЕРВОЙ страницей перед двумя годными.
const TABLE: Array<[string, string | null]> = [
  // адреса — дефект стенда и его формы (ревью круга 1: «//», точка в конце, punycode, кавычки)
  ['http://info.cern.ch', null], ['HTTP://INFO.CERN.CH', null], ['https://kolos.example/dostavka', null], ['https://kolos.example', null],
  ['www.kolos.ru', null], ['kolos.ru', null], ['info.cern.ch/hypertext/WWW/TheProject.html', null], ['kolos.ru:8080/ceny?x=1', null],
  ['mailto:info@kolos.ru', null], ['ftp://files.kolos.ru/price.pdf', null], ['пекарня.рф', null], ['//info.cern.ch', null],
  ['info.cern.ch.', null], ['xn--e1afmkfd.xn--p1ai', null], ['«http://info.cern.ch»', null], ['"kolos.ru"', null], ['(www.kolos.ru)', null],
  // пустое, короткое, цифры и знаки
  ['', null], ['   ', null], ['\u0000\u0007', null], ['ab', null], ['404', null], ['2024', null], ['—', null], ['№ 5', null], ['1.2.3', null],
  // служебное (в том числе с кодом ошибки) и название компании
  ['Главная', null], ['главная страница', null], ['Home', null], ['Контакты', null], ['О компании', null], ['Untitled', null],
  ['Страница не найдена', null], ['404 — Страница не найдена', null], ['Ошибка 404', null], ['404 Not Found', null], ['Error 500', null],
  ['Колос', null], ['Колос | Главная', null], ['Без названия', null],
  // содержательные
  ['Доставка | Колос', 'Доставка'], ['Торты на заказ', 'Торты на заказ'], ['Цены на хлеб 2024', 'Цены на хлеб 2024'],
  ['прайс.pdf, с. 3', 'прайс'], ['Доставка\u0000', 'Доставка'], ['Web 2.0', 'Web 2.0'], ['Торты (на заказ)', 'Торты (на заказ)'],
  ['http://info.cern.ch - home of the first website', 'home of the first website'],
  ['Главная — Пекарня на Арбате', 'Пекарня на Арбате'],
  // длинное — по границе слова, висящий предлог/союз срезается, «РФ» остаётся; после обрезки — повторная проверка
  ['Доставка и оплата заказов по Москве и Московской области в течение дня', 'Доставка и оплата заказов по Москве…'],
  ['Доставка товаров по РФ ' + 'оченьдлинноеслово'.repeat(3), 'Доставка товаров по РФ…'],
  ['Свежий хлеб и выпечка каждый день к завтраку', 'Свежий хлеб и выпечка каждый день…'],
  ['12345 ' + 'доставка'.repeat(8), null], ['Главная ' + 'доставка'.repeat(8), null], ['x'.repeat(41), null],
];

describe('topicsFromTitles: только содержательные заголовки (A-N6-076)', () => {
  it(`таблица ${TABLE.length} заголовков`, () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(20);
    const wrong = TABLE.flatMap(([title, topic]) => {
      const got = topicsFromTitles([title, ...TAIL], 'Колос');
      const want = topic === null ? TAIL : [topic, ...TAIL];
      return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${JSON.stringify(title)}: ждали ${JSON.stringify(want)}, получили ${JSON.stringify(got)}`];
    });
    expect(wrong).toEqual([]);
  });
  it('ни одна выданная тема не похожа на адрес, какой бы ни была таблица', () => {
    for (const [title] of TABLE) {
      for (const topic of topicsFromTitles([title, ...TAIL], 'Колос')) expect(topic, title).not.toMatch(/\/\/|^www\.|\.(ru|рф|ch|example|com|xn--)/i);
    }
  });
  it('повтор без учёта регистра, «ё» и знаков (в том числе внутри слова) — одна тема; из одной страницы — одна; не больше трёх', () => {
    expect(topicsFromTitles(['Доставка', 'доставка!', 'ДОСТАВКА', 'Ёлки', 'елки', 'Авто-мойка', 'Автомойка', 'Цены', 'Кофе'], 'Колос'))
      .toEqual(['Доставка', 'Ёлки', 'Авто-мойка']);
    expect(topicsFromTitles(['Доставка | Цены | Торты', 'Кофе'], 'Колос')).toEqual(['Доставка', 'Кофе']);
  });
  it('негодный заголовок страницы подменяется её первым разделом; годный заголовок страницы остаётся', () => {
    const pages: PageTopicSource[] = [
      { title: 'http://info.cern.ch', path: 'http://info.cern.ch › http://info.cern.ch - home of the first website' },
      { title: 'Доставка | Колос', path: 'Доставка | Колос › Доставка и оплата' },
      { title: '', path: 'Цены › Опт' },
      { title: '', path: null },
    ];
    expect(topicsFromTitles(pages, 'Колос')).toEqual(['home of the first website', 'Доставка', 'Цены']);
  });
  it(`меньше ${SMALL_TALK_MIN_TOPICS} тем — пустой список, и приветствие без списка тем (не «о темах: »)`, () => {
    const cern: PageTopicSource[] = [{ title: 'http://info.cern.ch', path: 'http://info.cern.ch' }];
    expect(topicsFromTitles(cern, 'CERN')).toEqual([]);
    expect(topicsFromTitles(['http://info.cern.ch', 'Доставка'], 'Колос')).toEqual([]);
    const reply = smallTalkReply('greeting', { companyName: 'CERN', topics: topicsFromTitles(cern, 'CERN') });
    expect(reply).toBe('Здравствуйте! Я бот компании «CERN», отвечаю только по материалам сайта. Задайте вопрос о том, что есть на сайте компании.');
    expect(reply).not.toMatch(/http|темах/);
  });
  it('мусорный вход не роняет: не массив, не строки, объекты без полей', () => {
    for (const bad of [null, undefined, 'строка', 5, {}] as unknown[]) expect(topicsFromTitles(bad as string[], 'Колос')).toEqual([]);
    expect(topicsFromTitles([null, 5, {}, { title: 7, path: 8 }, ['Доставка'], 'Доставка', 'Цены'] as unknown as string[], 'Колос')).toEqual(['Доставка', 'Цены']);
    expect(topicsFromTitles(['Доставка', 'Цены'], undefined as unknown as string)).toEqual(['Доставка', 'Цены']);
  });
});

describe('pageHeading: первый раздел из context_path, построенного chunkDocument', () => {
  const text = (t: string): ChunkBlock => ({ kind: 'text', text: t });
  const h = (level: number, t: string): ChunkBlock => ({ kind: 'heading', level, text: t });
  // Путь фрагмента, который readBotPageTitles выберет: первый по порядку, чей путь не равен заголовку страницы.
  const firstPath = (title: string, blocks: ChunkBlock[]) =>
    chunkDocument({ title, blocks }).map((c) => c.contextPath).find((p) => p !== '' && p !== title) ?? null;
  it('заголовок + h1 + h2 → h1; вводный текст до h1 не мешает', () => {
    const path = firstPath('http://info.cern.ch', [text('Вводный абзац.'), h(1, 'Home of the first website'), h(2, 'Сроки'), text('Текст раздела.')]);
    expect(pageHeading('http://info.cern.ch', path)).toBe('Home of the first website');
  });
  it('пустой заголовок страницы: путь начинается с h1 (chunkDocument выбрасывает пустое) → h1, а не h2', () => {
    const path = firstPath('', [h(1, 'Доставка'), h(2, 'Сроки'), text('Текст.')]);
    expect(path).toBe('Доставка › Сроки');
    expect(pageHeading('', path)).toBe('Доставка');
  });
  it('разделитель « › » внутри заголовка страницы не принимается за раздел', () => {
    const path = firstPath('Каталог › Колос', [h(1, 'Хлеб'), text('Текст.')]);
    expect(pageHeading('Каталог › Колос', path)).toBe('Хлеб');
    expect(pageHeading('Каталог › Колос', 'Каталог › Колос')).toBeNull();
  });
  it('h1 совпал с заголовком страницы: «разделом» стал h2, но годный заголовок страницы идёт первым', () => {
    const path = firstPath('Доставка', [h(1, 'Доставка'), h(2, 'Сроки'), text('Текст.')]);
    expect(pageHeading('Доставка', path)).toBe('Сроки');
    expect(topicsFromTitles([{ title: 'Доставка', path }, 'Цены'], 'Колос')).toEqual(['Доставка', 'Цены']);
  });
  it('лишние пробелы в заголовке страницы сжаты, как в chunkDocument; путь без префикса заголовка — раздела нет', () => {
    const path = firstPath('  Доставка   хлеба ', [h(1, 'Сроки'), text('Текст.')]);
    expect(pageHeading('  Доставка   хлеба ', path)).toBe('Сроки');
    expect(pageHeading('Доставка', 'Другое › Раздел')).toBeNull();
    expect(pageHeading('Доставка', null)).toBeNull();
    expect(pageHeading(undefined, 'Раздел › Подраздел')).toBe('Раздел');
  });
});
