// Сценарий PILOT-N6.md: 45 с, 30 fps, 5 сцен. Тайминги клипов — по кадрам записей
// (promo/capture/README.md + просмотр раскадровки): ожидание ответа в записях chat-* уже
// отсутствует (Playwright/рекордер не пишет кадры без изменений), ответ появляется на ~11 с.

export const FPS = 30;
export const TOTAL_FRAMES = 45 * FPS; // 1350 = ровно 45,0 с

export type Layout = 'wide' | 'tall' | 'square';

export const FORMATS: {id: string; width: number; height: number; layout: Layout}[] = [
  {id: 'n6-16x9', width: 1920, height: 1080, layout: 'wide'},
  {id: 'n6-9x16', width: 1080, height: 1920, layout: 'tall'},
  {id: 'n6-1x1', width: 1080, height: 1080, layout: 'square'},
];

export const SCENES = {
  s1: {from: 0, frames: 150},
  s2: {from: 150, frames: 300},
  s3: {from: 450, frames: 450},
  s4: {from: 900, frames: 240},
  s5: {from: 1140, frames: 210},
} as const;

// Проверка на этапе загрузки: сцены покрывают ролик без щелей и нахлёстов.
{
  let at = 0;
  for (const [k, s] of Object.entries(SCENES)) {
    if (s.from !== at) throw new Error(`Сцена ${k} начинается с ${s.from}, ожидалось ${at}`);
    at += s.frames;
  }
  if (at !== TOTAL_FRAMES) throw new Error(`Сцены дают ${at} кадров, а не ${TOTAL_FRAMES}`);
}

/** Кадрирование записи: 'cover' с точкой привязки и приближением (desktop) либо 'contain' (mobile). */
export type View = {fit: 'cover' | 'contain'; scale: number; origin: string};

/** Кусок записи: секунды [from, to] исходника, уложенные в `frames` кадров ролика. */
export type Segment = {from: number; to: number; frames: number; caption: string; view?: View};

export type Clip = {
  file: string; // имя в /assets (public/rec → /assets)
  segments: Segment[];
  view: View; // кадрирование по умолчанию; сегмент может переопределить
};

const CAP2 = 'Вставьте адрес сайта. Через минуту бот отвечает по вашим материалам.';
const CAP3a = 'Каждый ответ — с источником.';
const CAP3b = 'Чего нет на сайте — не выдумывает.';
const CAP4 = 'Одна строка кода — и бот на вашем сайте.';

const CONTAIN: View = {fit: 'contain', scale: 1, origin: '50% 50%'};
// desktop: окно чата справа; после второго вопроса страница прокручена и ответ — у нижнего края.
const CHAT_TOP: View = {fit: 'cover', scale: 1.3, origin: '76% 0%'};
const CHAT_BOTTOM: View = {fit: 'cover', scale: 1.3, origin: '76% 100%'};

const chat = (top?: View, bottom?: View): Segment[] => [
  {from: 3, to: 9, frames: 90, caption: CAP3a, view: top}, // ввод первого вопроса ×2
  {from: 9, to: 15, frames: 180, caption: CAP3a, view: top}, // «Ищем ответ…» → ответ с источником ×1
  {from: 45, to: 50, frames: 75, caption: CAP3b, view: bottom}, // второй вопрос ×2
  {from: 50, to: 53.5, frames: 105, caption: CAP3b, view: bottom}, // «не нашёл в материалах» ×1
];

const DESKTOP_AND_MOBILE: Record<'desktop' | 'mobile', {s2: Clip; s3: Clip; s4: Clip}> = {
  desktop: {
    s2: {
      file: 'preview-desktop.webm',
      segments: [
        {from: 2.5, to: 8, frames: 110, caption: CAP2}, // ввод адреса ×1,5
        {from: 8, to: 38.5, frames: 190, caption: CAP2}, // индексация 0→19 страниц ×4,8
      ],
      view: {fit: 'cover', scale: 1.5, origin: '50% 0%'},
    },
    s3: {file: 'chat-desktop.webm', segments: chat(CHAT_TOP, CHAT_BOTTOM), view: CHAT_TOP},
    s4: {
      file: 'widget-desktop.webm',
      segments: [{from: 0, to: 12, frames: 240, caption: CAP4}],
      view: {fit: 'cover', scale: 1, origin: '50% 50%'},
    },
  },
  mobile: {
    s2: {
      file: 'preview-mobile.webm',
      segments: [
        {from: 1.5, to: 6.8, frames: 106, caption: CAP2},
        {from: 6.8, to: 29.5, frames: 194, caption: CAP2},
      ],
      view: CONTAIN,
    },
    s3: {file: 'chat-mobile.webm', segments: chat(), view: CONTAIN},
    s4: {file: 'widget-mobile.webm', segments: [{from: 0, to: 10.8, frames: 240, caption: CAP4}], view: CONTAIN},
  },
};

// 1:1 — те же desktop-записи; у экрана индексации содержимое слева, поэтому своя привязка.
export const CLIPS: Record<Layout, {s2: Clip; s3: Clip; s4: Clip}> = {
  wide: DESKTOP_AND_MOBILE.desktop,
  tall: DESKTOP_AND_MOBILE.mobile,
  square: {
    ...DESKTOP_AND_MOBILE.desktop,
    s2: {...DESKTOP_AND_MOBILE.desktop.s2, view: {fit: 'cover', scale: 1.2, origin: '20% 0%'}},
  },
};

for (const [layout, clips] of Object.entries(CLIPS)) {
  for (const [scene, clip] of Object.entries(clips)) {
    const sum = clip.segments.reduce((a, s) => a + s.frames, 0);
    const want = SCENES[scene as keyof typeof SCENES].frames;
    if (sum !== want) throw new Error(`${layout}/${scene}: сегменты дают ${sum} кадров, сцена — ${want}`);
  }
}

export const TOKENS = {paper: '#0d0f12', ink: '#eef1f4', accent: '#5fd0d8'};
