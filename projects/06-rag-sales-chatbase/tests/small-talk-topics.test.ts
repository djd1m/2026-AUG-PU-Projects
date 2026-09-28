// Темы приветствия светской беседы (A-N6-076; дефект стенда 28.09: «Например, спросите о темах: http://info.cern.ch»).
// Тема — только содержательный заголовок: адрес, пустое, служебное, цифры и знаки, повтор — не темы; длинное режется по
// границе слова; меньше двух тем — фраза без списка. Заголовок первого раздела страницы предпочтительнее заголовка страницы.
import { describe, expect, it } from 'vitest';
import { smallTalkReply, SMALL_TALK_MIN_TOPICS, topicsFromTitles, type PageTopicSource } from '../packages/rag/src/index';

const TAIL = ['Сезонные торты', 'Оплата заказа'];
// Кандидат → тема (null — не тема). Проверяется ПЕРВОЙ страницей перед двумя годными.
const TABLE: Array<[string, string | null]> = [
  // адреса — дефект стенда и его формы
  ['http://info.cern.ch', null], ['HTTP://INFO.CERN.CH', null], ['https://kolos.example/dostavka', null], ['https://kolos.example', null],
  ['www.kolos.ru', null], ['kolos.ru', null], ['info.cern.ch/hypertext/WWW/TheProject.html', null], ['kolos.ru:8080/ceny?x=1', null],
  ['mailto:info@kolos.ru', null], ['ftp://files.kolos.ru/price.pdf', null], ['пекарня.рф', null],
  // пустое, короткое, цифры и знаки
  ['', null], ['   ', null], ['\u0000\u0007', null], ['ab', null], ['404', null], ['2024', null], ['—', null], ['№ 5', null], ['1.2.3', null],
  // служебное и название компании
  ['Главная', null], ['главная страница', null], ['Home', null], ['Контакты', null], ['О компании', null], ['Untitled', null],
  ['Страница не найдена', null], ['404 — Страница не найдена', null], ['Колос', null], ['Колос | Главная', null], ['Без названия', null],
  // содержательные
  ['Доставка | Колос', 'Доставка'], ['Торты на заказ', 'Торты на заказ'], ['Цены на хлеб 2024', 'Цены на хлеб 2024'],
  ['прайс.pdf, с. 3', 'прайс'], ['Доставка\u0000', 'Доставка'], ['Web 2.0', 'Web 2.0'],
  ['http://info.cern.ch - home of the first website', 'home of the first website'],
  ['Главная — Пекарня на Арбате', 'Пекарня на Арбате'],
  // длинное — по границе слова, висящий союз срезается; одно длинное слово — не тема
  ['Доставка и оплата заказов по Москве и Московской области в течение дня', 'Доставка и оплата заказов по Москве…'],
  ['x'.repeat(41), null],
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
    const all = topicsFromTitles(TABLE.map(([title]) => title), 'Колос');
    for (const topic of all) expect(topic, topic).not.toMatch(/:\/\/|^www\.|\.(ru|рф|ch|example|com)\b/i);
  });
  it('повтор без учёта регистра, «ё» и знаков — одна тема; из одной страницы — одна тема; не больше трёх', () => {
    expect(topicsFromTitles(['Доставка', 'доставка!', 'ДОСТАВКА', 'Ёлки', 'елки', 'Цены', 'Торты', 'Кофе'], 'Колос'))
      .toEqual(['Доставка', 'Ёлки', 'Цены']);
    expect(topicsFromTitles(['Доставка | Цены | Торты', 'Кофе'], 'Колос')).toEqual(['Доставка', 'Кофе']);
  });
  it('заголовок первого раздела предпочтительнее заголовка страницы; негодный раздел уступает заголовку страницы', () => {
    const pages: PageTopicSource[] = [
      { title: 'http://info.cern.ch', heading: 'http://info.cern.ch - home of the first website' },
      { title: 'Доставка | Колос', heading: 'Доставка и оплата' },
      { title: 'Цены', heading: 'Главная' },
      { title: '', heading: null },
    ];
    expect(topicsFromTitles(pages, 'Колос')).toEqual(['home of the first website', 'Доставка и оплата', 'Цены']);
  });
  it(`меньше ${SMALL_TALK_MIN_TOPICS} тем — пустой список, и приветствие без списка тем (не «о темах: »)`, () => {
    const cern: PageTopicSource[] = [{ title: 'http://info.cern.ch', heading: 'http://info.cern.ch' }];
    expect(topicsFromTitles(cern, 'CERN')).toEqual([]);
    expect(topicsFromTitles(['http://info.cern.ch', 'Доставка'], 'Колос')).toEqual([]);
    const reply = smallTalkReply('greeting', { companyName: 'CERN', topics: topicsFromTitles(cern, 'CERN') });
    expect(reply).toBe('Здравствуйте! Я бот компании «CERN», отвечаю только по материалам сайта. Задайте вопрос о том, что есть на сайте компании.');
    expect(reply).not.toMatch(/http|темах/);
  });
  it('мусорный вход не роняет: не массив, не строки, объекты без полей', () => {
    for (const bad of [null, undefined, 'строка', 5, {}] as unknown[]) expect(topicsFromTitles(bad as string[], 'Колос')).toEqual([]);
    expect(topicsFromTitles([null, 5, {}, { title: 7 }, ['Доставка'], 'Доставка', 'Цены'] as unknown as string[], 'Колос')).toEqual(['Доставка', 'Цены']);
    expect(topicsFromTitles(['Доставка', 'Цены'], undefined as unknown as string)).toEqual(['Доставка', 'Цены']);
  });
});
