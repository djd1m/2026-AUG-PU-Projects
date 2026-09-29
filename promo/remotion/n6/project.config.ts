// Ролик N6 «Суфлёр» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n6/ (promo/capture/README.md), тайминги — по кадрам записей.
// Кадрирование crop — в пикселях ИСХОДНОЙ записи (desktop 1920×1080, mobile 780×1688).
import type {ProjectConfig, Segment} from '../shared/src/project';

// Круг правок 1: было 68 знаков («Вставьте адрес сайта. Через минуту бот отвечает по вашим материалам.») — риск
// третьей строки в 9:16/1:1; ≤ 45 знаков, в кадре — «Читаем сайт: k из ≤ 20 страниц».
const CAP2 = 'Вставьте адрес сайта — бот прочитает его сам.';
const CAP3a = 'Каждый ответ — с источником.';
const CAP3b = 'Чего нет на сайте — не выдумывает.';
// Круг правок 2 (находка 1 второго круга Codex): сцена 4 снята заново учёткой-фикстурой — экран установки со строкой
// <script …> (install-*) и виджет, открытый на странице ЧУЖОГО origin http://shop.example:8099 (embed-*), куда эта строка
// вставлена как есть (promo/capture/README.md, «Круг правок 2»). Было (круг 1): «Окно бота — на вашем сайте без переделок.»
// над окном предпросмотра — обещание без доказательства в кадре.
const CAP4a = 'В кабинете — одна строка кода для сайта.';
const CAP4b = 'Вставили её — и бот на вашей странице.';

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
  allowTallCrop: true, // только сцена 4а (экран установки: скрыть плашку тарифа); остальные сцены 9:16 — запись целиком
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
    // Сцена 4а — экран «Установка на сайт» (install-*, журнал record-log-2026-09-29T12-19-05-665Z.json: код виден
    // 4,88 / 3,58 с, «Скопировать код» 13,09 / 6,93 с, «Скопировано» сразу). Ниже кода — плашка «На бесплатном плане …
    // Убрать бейдж» (тариф, в кадр нельзя): каждое кадрирование обрывается над ней (desktop y ≥ 544, mobile css y ≥ 621).
    {
      type: 'screen',
      seconds: 4,
      tracks: {
        desktop: {file: 'install-desktop.webm', size: [1920, 1080], segments: [
          {from: 5, to: 10.5, seconds: 1.8, caption: CAP4a}, // курсор вдоль строки <script …>
          {from: 10.5, to: 15.2, seconds: 2.2, caption: CAP4a}, // «Скопировать код» → «Скопировано»
        ]},
        mobile: {file: 'install-mobile.webm', size: [780, 1688], segments: [
          {from: 3.6, to: 6.6, seconds: 1.8, caption: CAP4a},
          {from: 6.6, to: 9.3, seconds: 2.2, caption: CAP4a},
        ]},
      },
      use: {
        wide: {track: 'desktop', crop: {x: 400, y: 110, w: 900, h: 415}}, // карточка кода: строка <script>, кнопка, раскрывашки
        tall: {track: 'mobile', crop: {x: 0, y: 0, w: 780, h: 1178}}, // css 0–589: шапка, карточка кода, раскрывашки
        square: {track: 'mobile', crop: {x: 0, y: 300, w: 780, h: 546}}, // css 150–423: «Код установки» → «Скопировано»
      },
      note: 'Кадрирование обрывается над плашкой «Убрать бейдж» (тариф): 9:16 кадрируется осознанно (allowTallCrop).',
    },
    // Сцена 4б — страница http://shop.example:8099 (чужой origin, CSP и враждебный CSS), строка установки вставлена как
    // есть: пузырь виден 2,05 / 0,67 с, нажат 5,67 / 3,20 с, окно с приветствием; вопросов нет (платных вызовов 0).
    {
      type: 'screen',
      seconds: 4,
      tracks: {
        desktop: {file: 'embed-desktop.webm', size: [1920, 1080], segments: [
          {from: 1.2, to: 6.0, seconds: 2, caption: CAP4b}, // страница, пузырь, курсор к пузырю, нажатие
          {from: 6.0, to: 12.0, seconds: 2, caption: CAP4b}, // окно чата открыто на странице
        ]},
        mobile: {file: 'embed-mobile.webm', size: [780, 1688], segments: [
          {from: 0.4, to: 3.6, seconds: 2, caption: CAP4b},
          {from: 3.6, to: 9.6, seconds: 2, caption: CAP4b},
        ]},
      },
      use: {wide: {track: 'desktop'}, tall: {track: 'mobile'}, square: {track: 'desktop'}},
      note: 'На mobile окно виджета открывается во весь экран: страница видна в первой половине сцены, до нажатия.',
    },
    {type: 'outro', seconds: 7},
  ],
};

export default config;
