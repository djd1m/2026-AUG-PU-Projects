// Ролик N3 «Круг», вариант A «кабинет владельца» (решение владельца 29.09), на общем шаблоне
// (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения владельцем.
// Записи: /home/dz-projects-2026/.promo-assets/n3/a-tour-{desktop,mobile}.webm — одна страница и один демосеанс на
// раскладку (promo/capture/n3/README.md); from/to — t_file_s журнала record-log-2026-09-29T19-0{7,9}-*.json,
// уточнённые по кадрам. Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688).
//
// Служебные полосы стенда (зелёная «Рабочий кабинет — вход», тёмная «Лаборатория Круг · Новый сеанс») на коротких
// экранах desktop остаются вверху кадра — окна crop начинаются ниже (forbidden-zones.tsv). 9:16 — mobile-запись целиком:
// её куски выбраны там, где полосы уже прокручены за край (кадры 15,7/24,8/34,6 с).
import type {Crop, ProjectConfig} from '../shared/src/project';

const CAP2a = 'Владелец задаёт процент с оплат.';
const CAP2b = 'Новые условия — новой версией правил.';
const CAP3a = 'Реестр к выплате за месяц — одной кнопкой.';
const CAP3b = 'Утвердите его и отметьте ручной перевод.';
const CAP4 = 'Пригласите партнёров ссылкой с условиями.';
const DEMO = 'Данные демонстрационные';

// desktop, экраны без прокрутки («Правила», «Приглашение», «Реестр» до подготовки): контент x 500–1640, y 170–1000.
const TOP: Crop = {x: 480, y: 170, w: 1200, h: 830};
const INVITE: Crop = {x: 480, y: 170, w: 1200, h: 700};
// desktop, «Реестр» после прокрутки к форме отметки (с 49,5 с полос уже нет): «К переводу» y 20 … «Сохранить факт» y 950.
const REG_LOW: Crop = {x: 480, y: 10, w: 1200, h: 1000};
const both = (c: Crop) => ({wide: c, square: c});

const config: ProjectConfig = {
  id: 'n3',
  name: 'Круг',
  tagline: 'Партнёрская программа: процент только с оплат',
  url: 'reward.aicoding.space',
  // projects/03-affiliate-rewardful/shared/ui/style.css:3 — --pale (фон), --ink (текст), --blue (акцент)
  tokens: {paper: '#f0f8ff', ink: '#353e44', accent: '#0087ee'},
  font: {
    family: 'Rubik', // шрифт продукта (shared/ui/rubik-*.ttf, OFL); начертания 600 нет — берётся bold
    files: [
      {weight: '400', file: 'fonts/rubik-regular.ttf'},
      {weight: '600', file: 'fonts/rubik-bold.ttf'},
      {weight: '700', file: 'fonts/rubik-bold.ttf'},
    ],
  },
  scenes: [
    {type: 'title', seconds: 6, lines: [{text: 'Партнёры приводят клиентов.'}, {text: 'А вознаграждение считают вручную.', accent: true}]},
    {
      type: 'screen',
      seconds: 10,
      tracks: {
        desktop: {
          file: 'a-tour-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 15.5, to: 19.3, seconds: 4, caption: CAP2a, crop: both(TOP)}, // «Правила», курсор к ставке, ввод «25»
            {from: 19.3, to: 25.8, seconds: 6, caption: CAP2b, crop: both(TOP)}, // «Опубликовать» → «Опубликована версия 3» (22,15)
          ],
        },
        mobile: {
          file: 'a-tour-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 16.0, to: 19.3, seconds: 4, caption: CAP2a}, // ставка 20 → ввод «25» (19,16)
            // Круг правок 1 (раскадровка 9:16): с 23,2 с страница прокручивается к верху и показывает служебные полосы —
            // конец куска 24,2 → 23,1 (замедление ×0,63).
            {from: 19.3, to: 23.1, seconds: 6, caption: CAP2b}, // «Опубликована версия 3» (20,72)
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      footnote: DEMO,
    },
    {
      type: 'screen',
      seconds: 14,
      tracks: {
        desktop: {
          file: 'a-tour-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 38.3, to: 42.8, seconds: 3.5, caption: CAP3a, crop: both(TOP)}, // «Подготовить реестр» → «К переводу 600,00 ₽» (41,2)
            {from: 44.3, to: 48.3, seconds: 3, caption: CAP3b, crop: both(TOP)}, // «Утвердить эту версию» → «Утверждён» (45,95)
            {from: 50.2, to: 56.2, seconds: 3, caption: CAP3b, crop: both(REG_LOW)}, // форма: партнёр «Анна», ввод поручения
            {from: 62.2, to: 68.5, seconds: 4.5, caption: CAP3b, crop: both(REG_LOW)}, // дата → «Сохранить факт» (65,89) → «Отправлено вручную»
          ],
        },
        mobile: {
          file: 'a-tour-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 34.6, to: 38.0, seconds: 3.5, caption: CAP3a}, // «К переводу 600,00 ₽», касание «Утвердить»
            {from: 38.0, to: 41.6, seconds: 3, caption: CAP3b}, // «Утверждён»
            {from: 43.0, to: 49.6, seconds: 3, caption: CAP3b}, // «Анна», поручение, дата
            {from: 51.0, to: 55.8, seconds: 4.5, caption: CAP3b}, // «Сохранить факт» (51,32) → «Отмечено оператором»
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      footnote: DEMO,
      note: 'Отметка — синтетический факт оператора: продукт сам пишет «Не подтверждает зачисление в банке»; титр говорит «ручной перевод», а не «выплата».',
    },
    {
      type: 'screen',
      seconds: 9,
      tracks: {
        desktop: {file: 'a-tour-desktop.webm', size: [1920, 1080], segments: [{from: 26.9, to: 35.9, seconds: 9, caption: CAP4, crop: both(INVITE)}]},
        // Круг правок 1 (раскадровка 9:16): после invite.end (30,33) страница прокручивается к верху с полосами — конец 31,4 → 30,2;
        // круг правок 2: на 24,76–24,84 с у верхнего края ещё низ тёмной полосы — начало 24,8 → 25,0.
        mobile: {file: 'a-tour-mobile.webm', size: [780, 1688], segments: [{from: 25.0, to: 30.2, seconds: 9, caption: CAP4}]},
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      footnote: DEMO,
      note: 'Приглашение — предпросмотр текущего демосеанса (так пишет сам экран); титр не утверждает, что партнёр вступил.',
    },
    // Название — --ink #353e44: 10,18:1 к --pale (акцент --blue дал бы 3,43:1).
    {type: 'outro', seconds: 6, titleColor: '#353e44'},
  ],
};

export default config;
