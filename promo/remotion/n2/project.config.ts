// Ролик N2 «ReviewQR» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n2/ (promo/capture/n2/README.md), тайминги — по кадрам записей (шаг 0,5 с).
// Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688).
//
// ЦЕНА В КАДРЕ ЗАПРЕЩЕНА. В кабинете между карточкой точки и «Новой точкой» стоит блок «План: Free» с кнопкой
// «Подключить «Точку» — 990 ₽ / 30 дней». Поэтому КАЖДЫЙ кусок записи кабинета кадрируется так, чтобы видимое окно
// (не только crop — окно шире crop по одной оси) кончалось выше этого блока. В 9:16 desktop-запись вписывается
// целиком по высоте и цену не скрыть никаким crop — там кабинет идёт из mobile-записи с кадрированием
// (allowTallCrop: true, осознанно; см. README.md). Гостевые экраны и страница QR цены не содержат — 9:16 без crop.
import type {Crop, ProjectConfig} from '../shared/src/project';

const CAP2a = 'Заведите точку, вставьте ссылки на карточки.';
const CAP2b = 'QR и макеты для печати — готовы.';
const CAP3a = 'Гость сканирует QR и видит три равные двери.';
const CAP3b = 'Довольный гость выбирает Карты.';
const CAP3c = 'Недовольный — пишет владельцу напрямую.';
const CAP4 = 'Жалоба приходит вам — не в публичный разнос.';

// Кабинет desktop, точка уже создана: карточка точки y 245–640, блок цены с y 658.
const CARD_WIDE: Crop = {x: 600, y: 245, w: 720, h: 395}; // окно 245–640
const CARD_SQUARE: Crop = {x: 600, y: 151, w: 720, h: 504}; // окно 151–655: карточка целиком, блок цены с 658 — вне
// Кабинет desktop до создания: блок цены y 296–517, форма «Новая точка» y 535–830.
const FORM_WIDE: Crop = {x: 600, y: 540, w: 720, h: 290}; // окно ≈519–851
const FORM_SQUARE: Crop = {x: 610, y: 610, w: 700, h: 325}; // окно ≈527–1017: поле целиком, блок цены кончается на 517
// Кабинет mobile: окно 9:16 при ширине 780 — 1178 px высоты исходника.
const MOB_TOP: Crop = {x: 0, y: 200, w: 780, h: 1178}; // до прокрутки: «План: Free» с y≈1648 (за краем окна 1378)
const MOB_SCROLLED: Crop = {x: 0, y: 40, w: 780, h: 1178}; // после прокрутки: кнопка цены не выше y≈1388, окно до 1218

const config: ProjectConfig = {
  id: 'n2',
  name: 'ReviewQR',
  tagline: 'Довольные — на Карты, недовольные — вам.',
  url: 'reviewqr.aicoding.space',
  // apps/web/src/pages.ts:18–23: --brand-soft (фон), --ink, --brand (акцент)
  tokens: {paper: '#eaf2ff', ink: '#10202f', accent: '#025bde'},
  font: {
    family: 'Onest', // шрифт продукта системный → Onest образа promo-render (OFL), как N6
    files: [
      {weight: '400', file: 'fonts/Onest-Regular.ttf'},
      {weight: '600', file: 'fonts/Onest-SemiBold.ttf'},
      {weight: '700', file: 'fonts/Onest-Bold.ttf'},
    ],
  },
  allowTallCrop: true, // только кабинет (цена); гостевые и QR в 9:16 — запись целиком
  scenes: [
    {type: 'title', seconds: 6, lines: [{text: 'Недовольный гость пишет на Картах.'}, {text: 'Довольный — молчит.', accent: true}]},
    // Сцена 2 разбита на три по файлам записи (одна дорожка = один файл).
    {
      type: 'screen',
      seconds: 3.5,
      tracks: {
        desktop: {
          file: 'owner-create-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 4.5, to: 9.3, seconds: 2.5, caption: CAP2a, crop: {wide: FORM_WIDE, square: FORM_SQUARE}}, // ввод названия, «Создать»
            {from: 9.5, to: 11, seconds: 1, caption: CAP2a, crop: {wide: CARD_WIDE, square: CARD_SQUARE}}, // карточка /r/pekarnya-na-rechnoy
          ],
        },
        mobile: {
          file: 'owner-place-mobile.webm',
          size: [780, 1688],
          segments: [{from: 0, to: 2, seconds: 3.5, caption: CAP2a, crop: {tall: MOB_TOP}}],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: 'В 9:16 кадра создания точки нет (mobile-записи создания нет, а desktop в 9:16 показывает цену): там сразу карточка точки со ссылками.',
    },
    {
      type: 'screen',
      seconds: 3.5,
      tracks: {
        desktop: {
          file: 'owner-place-desktop.webm',
          size: [1920, 1080],
          segments: [{from: 1, to: 17, seconds: 3.5, caption: CAP2a, crop: {wide: CARD_WIDE, square: CARD_SQUARE}}], // ссылки → «Сохранить ссылки»
        },
        mobile: {
          file: 'owner-place-mobile.webm',
          size: [780, 1688],
          segments: [{from: 2, to: 8.8, seconds: 3.5, caption: CAP2a, crop: {tall: MOB_SCROLLED}}],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
    },
    {
      type: 'screen',
      seconds: 4,
      tracks: {
        // страница QR с 3,5 с (до этого — кабинет с ценой); mobile обрезает макеты справа — во всех форматах desktop
        desktop: {file: 'owner-qr-desktop.webm', size: [1920, 1080], segments: [{from: 4, to: 17.5, seconds: 4, caption: CAP2b}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 590, y: 240, w: 740, h: 470}},
        tall: {track: 'desktop', crop: {x: 590, y: 0, w: 740, h: 1080}}, // колонка страницы во всю высоту записи
        square: {track: 'desktop', crop: {x: 600, y: 240, w: 720, h: 470}},
      },
    },
    // Сцена 3: гость. Главная раскладка — mobile (9:16 целиком, 1:1 — кадрирование); 16:9 — desktop-страница.
    {
      type: 'screen',
      seconds: 7,
      tracks: {
        desktop: {
          file: 'guest-choice-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 0.5, to: 8.5, seconds: 4, caption: CAP3a},
            {from: 8.5, to: 12.5, seconds: 3, caption: CAP3b}, // клик «Яндекс.Карты» ≈11,5 с
          ],
        },
        mobile: {
          file: 'guest-choice-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 0.5, to: 5.5, seconds: 4, caption: CAP3a},
            {from: 5.5, to: 9.5, seconds: 3, caption: CAP3b}, // касание «Яндекс.Карты» ≈7 с
          ],
        },
      },
      use: {
        wide: {track: 'desktop', crop: {x: 720, y: 20, w: 480, h: 430}},
        tall: {track: 'mobile'},
        square: {track: 'mobile', crop: {x: 0, y: 40, w: 780, h: 800}},
      },
    },
    {
      type: 'screen',
      seconds: 7,
      tracks: {
        desktop: {
          file: 'guest-private-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 3.5, to: 20.5, seconds: 6, caption: CAP3c}, // «Написать напрямую» → текст → оценка → отправка
            {from: 20.5, to: 22.5, seconds: 1, caption: CAP3c}, // «Отправлено», хвост вырезан
          ],
        },
        mobile: {
          file: 'guest-private-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 2.5, to: 19, seconds: 3.5, caption: CAP3c, crop: {square: {x: 0, y: 60, w: 780, h: 800}}}, // форма, ввод текста
            {from: 19, to: 26, seconds: 2.5, caption: CAP3c, crop: {square: {x: 0, y: 540, w: 780, h: 800}}}, // оценка 2, контакт, отправка
            {from: 26, to: 28, seconds: 1, caption: CAP3c, crop: {square: {x: 0, y: 0, w: 780, h: 600}}}, // «Отправлено», хвост вырезан
          ],
        },
      },
      use: {
        wide: {track: 'desktop', crop: {x: 720, y: 20, w: 480, h: 620}},
        tall: {track: 'mobile'},
        square: {track: 'mobile'},
      },
    },
    // Сцена 4: кабинет → чип «обращения: 3» → список. Кабинет прокручен с ≈3 с (карточка y 140–535, цена с y 553).
    {
      type: 'screen',
      seconds: 8,
      tracks: {
        desktop: {
          file: 'inbox-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 3, to: 6.5, seconds: 2.5, caption: CAP4,
              crop: {wide: {x: 600, y: 140, w: 720, h: 400}, square: {x: 600, y: 47, w: 720, h: 504}}}, // окно 47–551, блок цены с 553,
            {from: 7, to: 14, seconds: 5.5, caption: CAP4,
              crop: {wide: {x: 600, y: 100, w: 720, h: 500}, square: {x: 600, y: 100, w: 720, h: 500}}},
          ],
        },
        mobile: {
          file: 'inbox-mobile.webm',
          size: [780, 1688],
          segments: [
            // кабинет прокручен с ≈2,5 с: карточка y 140–1160, «План: Free» с y≈1272, кнопка цены с y≈1520
            {from: 3, to: 5.4, seconds: 2.5, caption: CAP4, crop: {tall: {x: 0, y: 140, w: 780, h: 1020}}},
            {from: 5.6, to: 13, seconds: 5.5, caption: CAP4}, // список обращений, запись целиком
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: 'Титр молчит о Telegram: привязка не снималась (личный чат владельца), доставка видна только в кабинете.',
    },
    {type: 'outro', seconds: 6},
  ],
};

export default config;
