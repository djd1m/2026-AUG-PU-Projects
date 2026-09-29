// Ролик N4 «Тарелка» на общем шаблоне (promo/remotion/shared/README.md). Тексты титров — здесь; SCENARIO.md — для чтения.
// Записи: /home/dz-projects-2026/.promo-assets/n4/ (promo/capture/n4/README.md). В ролик идёт ТОЛЬКО mobile
// (продукт — PWA на телефоне; desktop-записи сняты с другим порядком правки порции 130 → 104).
// Кадрирование crop — в пикселях ИСХОДНОЙ mobile-записи 780×1688; 9:16 показывает запись целиком (без crop).
import type {Crop, ProjectConfig, Segment, Track} from '../shared/src/project';

const W = 780;
const H = 1688;
// Полоса по высоте mobile-записи: во весь её рост ширина, вертикаль — только нужная зона экрана.
const band = (y: number, h: number): Crop => ({x: 0, y, w: W, h});
// Один и тот же прямоугольник для 16:9 и 1:1: mobile-запись по центру на фоне токенов, зона крупнее, чем «целиком».
const both = (c: Crop): Segment['crop'] => ({wide: c, square: c});
const mobile = (file: string, segments: Segment[]): Track => ({file, size: [W, H], segments});

const config: ProjectConfig = {
  id: 'n4',
  name: 'Тарелка',
  tagline: 'Калории по фото. Числа — из базы USDA.',
  url: 'tarelka.aicoding.space',
  // Токены globals.css N4. Фон ролика — --dark, текст — --paper: акцент #ffc531 на светлом --paper почти не читается,
  // а на тёмном — как на карточке продукта. Шаблон знает один фон на весь ролик (см. README.md).
  tokens: {paper: '#1b1523', ink: '#fbf8f2', accent: '#ffc531'},
  font: {
    // Шаблон знает ОДНО семейство. Насыщенность 700 шаблон ставит только заголовкам (титул, имя в финале) — ей отдан
    // Unbounded, как заголовкам продукта; 400/600 (титры, подзаголовок, адрес) — Onest. Оба вариативные TTF (OFL).
    family: 'Tarelka',
    files: [
      {weight: '400', file: 'fonts/Onest-wght.ttf'},
      {weight: '600', file: 'fonts/Onest-wght.ttf'},
      {weight: '700', file: 'fonts/Unbounded-wght.ttf'},
    ],
  },
  scenes: [
    {
      type: 'title',
      seconds: 7,
      lines: [{text: "Считать калории вручную — скучно."}, {text: "Найти блюдо, угадать вес, вбить руками…"}, {text: "Через неделю бросают.", accent: true}],
    },
    {
      // capture-mobile: 0,5–5 с видоискатель, ~5,3 «галерея», 5,5–7,3 «распознаётся…», с 7,4 результат 104 ккал.
      // Хвост после 10 с — ожидание скрипта, не берём дальше 11,8 с (результат стоит неподвижно).
      type: 'screen',
      seconds: 10,
      tracks: {
        mobile: mobile('capture-mobile.webm', [
          {from: 0.5, to: 5.3, seconds: 3.5, caption: 'Сфотографируйте тарелку', crop: both(band(120, 1380))},
          {from: 5.3, to: 11.8, seconds: 6.5, caption: 'Без регистрации: состав и калории за секунды', crop: both(band(0, 1100))},
        ]),
      },
      use: {wide: {track: 'mobile'}, tall: {track: 'mobile'}, square: {track: 'mobile'}},
      note: 'Распознавание в кадре — в реальном времени (≈2 с «распознаётся…»), без ускорения.',
    },
    {
      // result-mobile: 0,5–5,5 плитки и прокрутка к «Яблоку»; ~5,8 раскрыта плашка USDA FDC · 171688;
      // ~9,3 «+50» → 130 ккал и плашка расхождения «Оценка по фото: 104 · Из базы: 130».
      type: 'screen',
      seconds: 13,
      tracks: {
        mobile: mobile('result-mobile.webm', [
          {from: 0.5, to: 5.5, seconds: 4, caption: 'Числа — из открытой базы USDA', crop: both(band(420, 1100))},
          {from: 5.5, to: 8.8, seconds: 4.5, caption: 'Источник рядом с каждой позицией', crop: both(band(560, 1100))},
          {from: 8.8, to: 13.3, seconds: 4.5, caption: 'Ошиблась порция — поправьте', crop: both(band(450, 1100))},
        ]),
      },
      use: {wide: {track: 'mobile'}, tall: {track: 'mobile'}, square: {track: 'mobile'}},
      note: 'После «+50 г» на ~1 с видна плашка расхождения «Оценка по фото: 104 · Из базы: 130» — поведение продукта.',
    },
    {
      // share-mobile: ~2,5 «поделиться» → «готовим…» → ~4,5 ссылка /c/<id> внизу; с 7,3 публичная карточка 9:16.
      type: 'screen',
      seconds: 9,
      tracks: {
        mobile: mobile('share-mobile.webm', [
          {from: 2.3, to: 7.2, seconds: 3.5, caption: 'Готовая ссылка — в сторис и в мессенджер', crop: both(band(560, 1100))},
          {from: 7.3, to: 14.9, seconds: 5.5, caption: 'Карточка для сторис', crop: both(band(0, 1300))},
        ]),
      },
      use: {wide: {track: 'mobile'}, tall: {track: 'mobile'}, square: {track: 'mobile'}},
      note: 'Бейдж на карточке — плашка «Тарелка» с логотипом; титр его дословно не называет. card-image.jpg шаблон показать не умеет — карточка из записи.',
    },
    {type: 'outro', seconds: 6},
  ],
};

export default config;
