// Ролик N5 «КлипМейкер» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n5/ (promo/capture/n5/README.md), тайминги — по кадрам записей и журналу.
// Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688).
// Сцена 2 SCENARIO разбита на две сцены шаблона (2а загрузка, 2б ход обработки): у mobile это два разных файла
// (upload-mobile, progress-mobile), а дорожка шаблона — один файл. Сюжетных сцен по-прежнему пять.
import type {ProjectConfig} from '../shared/src/project';

const CAP2a = 'Загрузите длинную запись.';
const CAP2b = 'Ход обработки — словами, а не вечным кругом.';
const CAP3a = 'Готовые вертикальные клипы с субтитрами.';
const CAP3b = 'У каждого — оценка 0–99 и объяснение почему.';
const CAP4a = 'На каждом клипе — метка с короткой ссылкой.';
const CAP4b = 'Зритель переходит и делает свои клипы.';

// desktop-кабинет: контент x 370–1550. Карточки клипов (после прокрутки, t ≥ 8 с): метка clipmkr.ru/c/… y≈670,
// кнопки y≈816, «Оценка 90 из 99» y≈935, строка «Цепкость · Самодостаточность · Длина» y≈958.
// После 32 с страница прокручена ещё на ≈60 px: у первой карточки видно начало раскрытого объяснения
// («Цепкость · 29/33» и текст) y≈960–1080 — дальше оно уходит за нижний край записи; целиком — только в mobile.
const GRID = {x: 360, y: 30, w: 1200, h: 1050};
const GRID_SQ = {x: 360, y: 40, w: 1200, h: 840};
const CARD1_BOTTOM = {x: 370, y: 640, w: 800, h: 440};
const CARD1_BOTTOM_SQ = {x: 370, y: 640, w: 640, h: 440};

const config: ProjectConfig = {
  id: 'n5',
  name: 'КлипМейкер',
  tagline: 'Из разговора — в ленту.',
  url: 'clipmkr.ru',
  tokens: {paper: '#0e1311', ink: '#eef2ec', accent: '#8fd4a4'}, // globals.css N5, тёмная тема (--paper, --ink, --green)
  font: {
    family: 'Onest', // у продукта system-ui; public/fonts → /usr/local/share/fonts образа promo-render (OFL)
    files: [
      {weight: '400', file: 'fonts/Onest-Regular.ttf'},
      {weight: '600', file: 'fonts/Onest-SemiBold.ttf'},
      {weight: '700', file: 'fonts/Onest-Bold.ttf'},
    ],
  },
  scenes: [
    {type: 'title', seconds: 7, lines: [{text: 'Час разговора. Пять сильных мыслей.'}, {text: 'А в ленте — ни одного клипа.', accent: true}]},
    {
      // 2а: форма «Новый выпуск», файл выбран, галочки, 17,5 с — «Создать клипы →»
      type: 'screen',
      seconds: 3,
      tracks: {
        desktop: {file: 'upload-desktop.webm', size: [1920, 1080], segments: [{from: 9.5, to: 18.5, seconds: 3, caption: CAP2a}]},
        mobile: {file: 'upload-mobile.webm', size: [780, 1688], segments: [{from: 4, to: 10.5, seconds: 3, caption: CAP2a}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 360, y: 110, w: 1200, h: 520}}, // карточка формы целиком
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 950, y: 140, w: 610, h: 430}}, // правая половина формы: файл, галочки, кнопка
      },
      note: 'На mobile кнопка «Создать клипы» НЕ нажата (вторая платная обработка); ход обработки на телефоне — отдельная запись той же загрузки.',
    },
    {
      // 2б: лента «Загрузка → Расшифровка → Выбор → Монтаж», 25,7 «Расшифровываем», 31,1 «Выбираем», 75,7 «Режем: готово 0 из 5»
      type: 'screen',
      seconds: 7,
      tracks: {
        desktop: {
          file: 'upload-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 21.5, to: 33, seconds: 5, caption: CAP2b},
            {from: 74.5, to: 78, seconds: 2, caption: CAP2b},
          ],
        },
        mobile: {file: 'progress-mobile.webm', size: [780, 1688], segments: [{from: 1, to: 13, seconds: 7, caption: CAP2b}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 360, y: 180, w: 1200, h: 560}}, // заголовок выпуска, блок хода, «Ваши клипы»
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 360, y: 190, w: 800, h: 560}}, // левая часть: шаги и подпись хода
      },
      note: 'Ход ускорен монтажом (≈ 4 мин 40 с обработки в журнале записи); титр сроков не называет. Кадр доходит до «Монтаж 0 из 5».',
    },
    {
      type: 'screen',
      seconds: 12,
      tracks: {
        desktop: {
          file: 'clips-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 3.5, to: 8, seconds: 3.5, caption: CAP3a, crop: {wide: GRID, square: GRID_SQ}}, // «Клипы готовы · 5 из 5», прокрутка
            {from: 8, to: 16, seconds: 4, caption: CAP3a, crop: {wide: GRID, square: GRID_SQ}}, // три карточки 90 / 88 / 86 с меткой
            {from: 29.5, to: 38, seconds: 4.5, caption: CAP3b, crop: {wide: CARD1_BOTTOM, square: CARD1_BOTTOM_SQ}}, // оценка и начало объяснения
          ],
        },
        mobile: {
          file: 'clips-mobile.webm',
          size: [780, 1688],
          segments: [
            // mobile: ~9,5 раскрыто «Почему такая оценка» (три строки объяснения целиком), 14,5–19 прокрутка ко второй
            // карточке (88), с 19,5 снова первая карточка с объяснением — этот кусок вырезан
            {from: 3, to: 9.5, seconds: 5.5, caption: CAP3a},
            {from: 9.5, to: 14.5, seconds: 4, caption: CAP3b},
            {from: 19.5, to: 25.5, seconds: 2.5, caption: CAP3b},
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: '16:9 и 1:1: раскрытое объяснение оценки на desktop видно только началом («Цепкость · 29/33» и текст) — остальное за нижним краем записи; целиком все три строки объяснения показывает 9:16.',
    },
    {
      type: 'screen',
      seconds: 10,
      tracks: {
        desktop: {
          file: 'link-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 4.5, to: 10.2, seconds: 4, caption: CAP4a, crop: {wide: {x: 360, y: 500, w: 1200, h: 540}, square: {x: 360, y: 560, w: 640, h: 440}}},
            {from: 10.2, to: 16.1, seconds: 6, caption: CAP4b, crop: {wide: {x: 460, y: 20, w: 1000, h: 710}, square: {x: 460, y: 20, w: 1000, h: 700}}},
          ],
        },
        mobile: {
          file: 'link-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 3.5, to: 8, seconds: 4, caption: CAP4a},
            {from: 8, to: 16, seconds: 6, caption: CAP4b},
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: 'Кадр показывает кнопку «Сделать свои клипы» на странице clipmkr.ru/c/ECY8LH, но не переход зрителя по ней: «делает свои клипы» — обещание кнопки, не снятое действие.',
    },
    {type: 'outro', seconds: 6},
  ],
};

export default config;
