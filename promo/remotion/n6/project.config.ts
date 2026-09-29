// Ролик N6 «Суфлёр» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n6/ (promo/capture/README.md), тайминги — по кадрам записей.
// Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688).
import type {ProjectConfig, Segment} from '../shared/src/project';

// Круг правок 1: было 68 знаков («Вставьте адрес сайта. Через минуту бот отвечает по вашим материалам.») — риск
// третьей строки в 9:16/1:1; ≤ 45 знаков, в кадре — «Читаем сайт: k из ≤ 20 страниц».
const CAP2 = 'Вставьте адрес сайта — бот прочитает его сам.';
const CAP3a = 'Каждый ответ — с источником.';
const CAP3b = 'Чего нет на сайте — не выдумывает.';
// Круг правок 1 (DEC-S-01): было «Одна строка кода — и бот на вашем сайте.» — экран установки (<script>) не снят,
// в кадре окно чата предпросмотра рядом с макетом страницы. Титр — о том, что видно, без обещания строки кода.
const CAP4 = 'Окно бота — на вашем сайте без переделок.';

// Тайминги ответов сверены по кадрам (круг правок 1): клик «Спросить» ≈ 9 с / ≈ 50 с записи, «Ищем ответ…» ≈ 2 с,
// ответ виден с ≈ 11 с / ≈ 52 с — в обеих раскладках. 30 с в журнале — задержка скрипта, не ожидание в кадре
// (promo/capture/README.md); 15–45 с записи — неподвижный кадр с ответом, в монтаж не идёт.
// desktop-чат: окно бота x 1120–1536. До второго вопроса страница не прокручена (окно с y≈270),
// после — прокручена на ≈90 px, ответ «не нашёл» у нижнего края (y≈950–1040).
const chat = (desktop: boolean): Segment[] => [
  {from: 3, to: 9, seconds: 3, caption: CAP3a, // ввод первого вопроса ×2
    crop: desktop ? {wide: {x: 380, y: 260, w: 1160, h: 820}, square: {x: 1120, y: 270, w: 420, h: 480}} : undefined},
  {from: 9, to: 15, seconds: 6, caption: CAP3a, // «Ищем ответ…» → ответ с плашкой источника
    crop: desktop ? {wide: {x: 380, y: 260, w: 1160, h: 820}, square: {x: 1120, y: 270, w: 420, h: 480}} : undefined},
  {from: 45, to: 50, seconds: 2.5, caption: CAP3b, // второй вопрос ×2
    crop: desktop ? {wide: {x: 380, y: 170, w: 1160, h: 910}, square: {x: 1120, y: 560, w: 420, h: 500}} : undefined},
  {from: 50, to: 53.5, seconds: 3.5, caption: CAP3b, // «не нашёл в материалах»
    crop: desktop ? {wide: {x: 380, y: 170, w: 1160, h: 910}, square: {x: 1120, y: 560, w: 420, h: 500}} : undefined},
];

const config: ProjectConfig = {
  id: 'n6',
  name: 'Суфлёр',
  tagline: 'Отвечает только по вашим материалам.',
  url: 'sufler.aicoding.space',
  tokens: {paper: '#0d0f12', ink: '#eef1f4', accent: '#5fd0d8'}, // globals.css N6, тёмная тема
  font: {
    family: 'Onest', // public/fonts → /usr/local/share/fonts образа promo-render (OFL)
    files: [
      {weight: '400', file: 'fonts/Onest-Regular.ttf'},
      {weight: '600', file: 'fonts/Onest-SemiBold.ttf'},
      {weight: '700', file: 'fonts/Onest-Bold.ttf'},
    ],
  },
  scenes: [
    {type: 'title', seconds: 5, lines: [{text: 'Посетители спрашивают —'}, {text: 'сайт молчит.', accent: true}]},
    {
      type: 'screen',
      seconds: 10,
      tracks: {
        desktop: {
          file: 'preview-desktop.webm',
          size: [1920, 1080],
          segments: [
            {from: 2.5, to: 8, seconds: 110 / 30, caption: CAP2}, // ввод адреса ×1,5
            {from: 8, to: 38.5, seconds: 190 / 30, caption: CAP2}, // индексация 0→19 страниц ×4,8
          ],
        },
        mobile: {
          file: 'preview-mobile.webm',
          size: [780, 1688],
          segments: [
            {from: 1.5, to: 6.8, seconds: 106 / 30, caption: CAP2},
            {from: 6.8, to: 29.5, seconds: 194 / 30, caption: CAP2},
          ],
        },
      },
      use: {
        wide: {track: 'desktop', crop: {x: 370, y: 0, w: 1180, h: 420}}, // шапка, форма/прогресс, список шагов
        tall: {track: 'mobile'}, // запись целиком
        square: {track: 'desktop', crop: {x: 370, y: 80, w: 740, h: 300}}, // заголовок и полоса прогресса
      },
    },
    {
      type: 'screen',
      seconds: 15,
      tracks: {
        desktop: {file: 'chat-desktop.webm', size: [1920, 1080], segments: chat(true)},
        mobile: {file: 'chat-mobile.webm', size: [780, 1688], segments: chat(false)},
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: 'У бота предпросмотра контакт не задан: «не нашёл» без контакта, поэтому титр без слова «контакт».',
    },
    {
      type: 'screen',
      seconds: 8,
      tracks: {
        desktop: {file: 'widget-desktop.webm', size: [1920, 1080], segments: [{from: 0, to: 12, seconds: 8, caption: CAP4}]},
        mobile: {file: 'widget-mobile.webm', size: [780, 1688], segments: [{from: 0, to: 10.8, seconds: 8, caption: CAP4}]},
      },
      use: {
        // макет страницы сайта + окно чата с бейджем «Работает на Суфлёре» (окно x 1120–1536, y 272–630)
        wide: {track: 'desktop', crop: {x: 380, y: 262, w: 1160, h: 400}},
        tall: {track: 'mobile'},
        square: {track: 'desktop', crop: {x: 1110, y: 262, w: 440, h: 380}},
      },
      note: 'Титр без «строки кода»: кадр — окно чата предпросмотра с бейджем рядом с макетом страницы. Настоящий виджет и экран установки (<script>) не сняты — для полного блока «распространение» нужна пересъёмка со входом.',
    },
    {type: 'outro', seconds: 7},
  ],
};

export default config;
