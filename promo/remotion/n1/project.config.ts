// Ролик N1 «Proofwall» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n1/ (promo/capture/n1/README.md), тайминги — по журналу записи и кадрам.
// Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688). 9:16 — mobile целиком.
import type {Crop, ProjectConfig, Segment} from '../shared/src/project';

const CAP1 = 'Клиенты вас хвалят. А показать на сайте нечего.';
const CAP2a = 'Отправьте клиенту одну ссылку.';
const CAP2b = 'Отзыв за минуту — без регистрации.';
const CAP3a = 'На стену попадает только то, что вы одобрили.';
const CAP3b = 'Нажали «Опубликовать» — отзыв уже на стене.';
const CAP4 = 'Одна строка кода — и отзывы на вашем сайте.';
// Круг правок 1 (DEC-S-02): постоянная плашка шаблона `footnote` на КАЖДОЙ сцене, где видны отзывы (форма с текстом
// отзыва, модерация, стена, блок кода с отзывами ниже, сайт кофейни) — вместо титра на последние 2 с сцены 4.
const DEMO = 'Отзывы демонстрационные';

// Одинаковое кадрирование для 16:9 и 1:1 (обе области шире записи по высоте — crop виден целиком в обеих).
const both = (c: Crop) => ({wide: c, square: c});

// Карточка формы /f/primer-coffee: x 712–1208, y 64–958.
const FORM_TOP = both({x: 700, y: 80, w: 520, h: 560}); // заголовок, имя, роль
const FORM_MID = both({x: 700, y: 280, w: 520, h: 560}); // имя … поле отзыва … фото
const FORM_LOW = both({x: 700, y: 420, w: 520, h: 560}); // отзыв, фото, «Отправить отзыв»
const FORM_DONE = both({x: 700, y: 60, w: 520, h: 500}); // «Спасибо! Отзыв отправлен.»

const scene2Desktop: Segment[] = [
  // Круг правок 2: окно начинается ниже бейджа тарифа «Бесплатный» (x 1372–1470, y 170–200 — forbidden-zones.tsv):
  // заголовок «primer-coffee» (y 190–238) тоже вне окна — раскадровка показала его срезанным краем: 16:9 окно y 240–720,
  // 1:1 — своё кадрирование, окно y 240–954 (строки ссылок x 450–1470 целиком, «Пароль» с y 958 — вне окна).
  {from: 0.9, to: 6.3, seconds: 2.5, caption: CAP2a, crop: {wide: {x: 440, y: 355, w: 1040, h: 250}, square: {x: 450, y: 400, w: 1020, h: 394}}}, // «Форма сбора», ссылка выделяется
  {from: 1.3, to: 12.7, seconds: 2.5, caption: CAP2a, crop: FORM_TOP}, // имя и роль печатаются
  {from: 12.7, to: 21.0, seconds: 2.5, caption: CAP2b, crop: FORM_MID}, // текст отзыва
  {from: 21.0, to: 28.1, seconds: 2, caption: CAP2b, crop: FORM_LOW}, // фото 24,2 → «Отправить» 27,9
  {from: 28.1, to: 30.6, seconds: 1.5, caption: CAP2b, crop: FORM_DONE}, // «Спасибо! Отзыв отправлен.»
];
// Файлы формы и ссылок — две разные записи; сегменты 1 и 2–5 берутся из разных дорожек ниже.

const config: ProjectConfig = {
  id: 'n1',
  name: 'Proofwall',
  tagline: 'Отзывы клиентов — на стене и на вашем сайте.',
  url: 'proofwall.aicoding.space',
  // globals.css N1: фон страницы --ink #1e0a3c, текст на нём белый (--surface), акцент --accent #6701ef
  tokens: {paper: '#1e0a3c', ink: '#ffffff', accent: '#6701ef'},
  font: {
    // Bricolage Grotesque и DM Sans продукта НЕ содержат кириллицы (next/font subsets latin/latin-ext — unicode-range
    // в CSS стенда без U+04xx), титры русские → Onest образа promo-render (OFL), как у остальных проектов серии.
    family: 'Onest',
    files: [
      {weight: '400', file: 'fonts/Onest-Regular.ttf'},
      {weight: '600', file: 'fonts/Onest-SemiBold.ttf'},
      {weight: '700', file: 'fonts/Onest-Bold.ttf'},
    ],
  },
  scenes: [
    {
      type: 'screen',
      seconds: 7,
      tracks: {
        desktop: {file: 'wall-empty-desktop.webm', size: [1920, 1080], segments: [{from: 0.5, to: 7.5, seconds: 7, caption: CAP1}]},
        mobile: {file: 'wall-empty-mobile.webm', size: [780, 1688], segments: [{from: 0.5, to: 5.4, seconds: 7, caption: CAP1}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 600, y: 50, w: 720, h: 470}}, // «Что говорят клиенты · Пока ни одного…» + пустая карточка
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 600, y: 50, w: 720, h: 470}},
      },
    },
    {
      type: 'screen',
      seconds: 2.5,
      tracks: {
        desktop: {file: 'links-desktop.webm', size: [1920, 1080], segments: [scene2Desktop[0]]},
        // круг правок 2: с 3,0 с страница прокручена, бейджа тарифа «Бесплатный» (до ≈2,9 с вверху) в кадре нет
        mobile: {file: 'links-mobile.webm', size: [780, 1688], segments: [{from: 3.0, to: 5.5, seconds: 2.5, caption: CAP2a}]},
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
    },
    {
      type: 'screen',
      seconds: 8.5,
      tracks: {
        desktop: {file: 'form-desktop.webm', size: [1920, 1080], segments: scene2Desktop.slice(1)},
        mobile: {
          file: 'form-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 0.7, to: 6.4, seconds: 2.5, caption: CAP2a},
            {from: 6.4, to: 13.1, seconds: 2.5, caption: CAP2b},
            {from: 13.1, to: 17.1, seconds: 2, caption: CAP2b},
            {from: 17.1, to: 19.8, seconds: 1.5, caption: CAP2b},
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      footnote: DEMO,
      note: 'Кнопка выбора фото в headless Chromium подписана по-английски («Choose File») — в кадре до 24,2 с записи.',
    },
    {
      type: 'screen',
      seconds: 5.5,
      tracks: {
        desktop: {
          file: 'moderate-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 4.2, to: 10.5, seconds: 2.5, caption: CAP3a, crop: both({x: 440, y: 30, w: 1040, h: 810})}, // «5 на проверке», карточки
            {from: 10.5, to: 14.4, seconds: 3, caption: CAP3a, crop: both({x: 440, y: 440, w: 1040, h: 400})}, // «Опубликовать» 12,0 → чип
          ],
        },
        mobile: {
          file: 'moderate-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 3.9, to: 6.0, seconds: 2.5, caption: CAP3a},
            {from: 6.0, to: 9.1, seconds: 3, caption: CAP3a},
          ],
        },
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      footnote: DEMO,
    },
    {
      type: 'screen',
      seconds: 6.5,
      tracks: {
        desktop: {file: 'wall-desktop.webm', size: [1920, 1080], segments: [{from: 1.0, to: 14.2, seconds: 6.5, caption: CAP3b}]},
        mobile: {file: 'wall-mobile.webm', size: [780, 1688], segments: [{from: 1.1, to: 13.3, seconds: 6.5, caption: CAP3b}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 600, y: 50, w: 720, h: 880}}, // стена из пяти карточек + «Собрано через Proofwall»
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 600, y: 50, w: 720, h: 880}},
      },
      footnote: DEMO,
    },
    {
      type: 'screen',
      seconds: 4.6,
      tracks: {
        desktop: {file: 'snippet-desktop.webm', size: [1920, 1080], segments: [{from: 3.7, to: 9.4, seconds: 4.6, caption: CAP4}]},
        mobile: {file: 'snippet-mobile.webm', size: [780, 1688], segments: [{from: 3.4, to: 7.7, seconds: 4.6, caption: CAP4}]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 440, y: 190, w: 1040, h: 150}}, // «Виджет на свой сайт» + тег <script>
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 440, y: 190, w: 1040, h: 150}},
      },
      footnote: DEMO, // ниже блока кода в кадре — очередь «Отзывы» с демонстрационными карточками
    },
    {
      type: 'screen',
      seconds: 4.4,
      tracks: {
        desktop: {
          file: 'site-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 7.1, to: 9.5, seconds: 2.4, caption: CAP4},
            {from: 9.5, to: 11.5, seconds: 2, caption: CAP4},
          ],
        },
        mobile: {
          file: 'site-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 5.6, to: 10.0, seconds: 2.4, caption: CAP4},
            {from: 10.0, to: 15.1, seconds: 2, caption: CAP4},
          ],
        },
      },
      use: {
        // «Что говорят гости» + виджет с пятью отзывами + «Powered by Proofwall» + подвал «…· пример».
        // Карточки виджета — x 115–1805: в 1:1 тот же прямоугольник, что в 16:9, иначе правый край карточек срезан.
        wide: {track: 'desktop', crop: {x: 100, y: 280, w: 1720, h: 780}},
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 100, y: 280, w: 1720, h: 780}},
      },
      footnote: DEMO,
      note: 'Страница кофейни поднята внутри контейнера записи (http://127.0.0.1:8099) — чужой origin, но не сайт клиента.',
    },
    // Название в финале — --accent-tint #eee0ff продукта: 14,38:1 к фону #1e0a3c (акцент #6701ef давал 2,43:1).
    {type: 'outro', seconds: 6, titleColor: '#eee0ff'},
  ],
};

export default config;
