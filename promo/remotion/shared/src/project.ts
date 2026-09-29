// Контракт project.config.ts и его проверка при загрузке бандла.
// Любое нарушение — исключение: бандл/рендер падает, а не обрезает или растягивает молча.

export const FPS = 30;
export const TOTAL_SECONDS = 45;
export const TOTAL_FRAMES = TOTAL_SECONDS * FPS; // 1350

/** Три формата ролика — всегда все три, из одного компонента. */
export type Format = 'wide' | 'tall' | 'square';
export const FORMATS: {id: string; format: Format; width: number; height: number}[] = [
  {id: 'promo-16x9', format: 'wide', width: 1920, height: 1080},
  {id: 'promo-9x16', format: 'tall', width: 1080, height: 1920},
  {id: 'promo-1x1', format: 'square', width: 1080, height: 1080},
];

/** Прямоугольник ИСХОДНОЙ записи в её пикселях, который обязан попасть в кадр целиком. */
export type Crop = {x: number; y: number; w: number; h: number};

/** Кусок записи: секунды [from, to] исходника, уложенные в `seconds` секунд ролика (ускорение = (to-from)/seconds). */
export type Segment = {
  from: number;
  to: number;
  seconds: number;
  caption: string;
  /** Кадрирование по форматам для этого куска; перекрывает кадрирование дорожки. */
  crop?: Partial<Record<Format, Crop>>;
};

/** Одна запись экрана и её нарезка. `size` — пиксели файла (ffprobe), нужны для кадрирования. */
export type Track = {file: string; size: [number, number]; segments: Segment[]};

export type TitleScene = {
  type: 'title';
  seconds: number;
  /** Строки заголовка; accent — цвет акцента. */
  lines: {text: string; accent?: boolean}[];
};

export type ScreenScene = {
  type: 'screen';
  seconds: number;
  /** Дорожки по имени (обычно desktop и mobile — у них разные тайминги). */
  tracks: Record<string, Track>;
  /** Какая дорожка идёт в какой формат и как кадрируется (нет crop = запись целиком). */
  use: Record<Format, {track: string; crop?: Crop}>;
  /** Расхождение титра и кадра (например, титр обещает то, чего кадр не показывает) — для SCENARIO.md и квитанции. */
  note?: string;
};

export type OutroScene = {type: 'outro'; seconds: number};

export type Scene = TitleScene | ScreenScene | OutroScene;

export type ProjectConfig = {
  /** Совпадает с именем папки promo/remotion/<id>/. */
  id: string;
  /** Название продукта (финальная сцена). */
  name: string;
  /** Подзаголовок финальной сцены. */
  tagline: string;
  /** Адрес, как его показать в кадре (без https://). */
  url: string;
  tokens: {paper: string; ink: string; accent: string};
  /** Шрифт: файлы TTF относительно <proj>/public/. Нужны насыщенности 400, 600 и 700. */
  font: {family: string; files: {weight: '400' | '600' | '700'; file: string}[]};
  scenes: Scene[];
  /** 9:16 показывает запись ЦЕЛИКОМ; кадрирование tall разрешено только явно. */
  allowTallCrop?: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const isFrameAligned = (sec: number) => Math.abs(sec * FPS - Math.round(sec * FPS)) < 1e-6;

export function validateProject(p: ProjectConfig): void {
  const err = (m: string): never => {
    throw new Error(`project.config.ts (${p?.id ?? '?'}): ${m}`);
  };
  if (!p || typeof p !== 'object') err('конфиг пуст');
  if (!/^[a-z0-9-]+$/.test(p.id ?? '')) err(`id «${p.id}» — только a-z, 0-9, «-»`);
  for (const k of ['name', 'tagline', 'url'] as const) if (!p[k]?.trim()) err(`пустое поле ${k}`);
  for (const k of ['paper', 'ink', 'accent'] as const) if (!HEX.test(p.tokens?.[k] ?? '')) err(`tokens.${k} не #rrggbb`);
  if (!p.font?.family?.trim()) err('font.family пуст');
  for (const w of ['400', '600', '700']) {
    if (!p.font.files?.some((f) => f.weight === w && f.file.trim())) err(`нет файла шрифта насыщенности ${w}`);
  }
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) err('scenes пуст');
  const total = p.scenes.reduce((a, s) => a + s.seconds, 0);
  if (Math.round(total * FPS) !== TOTAL_FRAMES) err(`сцены дают ${total} с, а нужно ровно ${TOTAL_SECONDS}`);
  if (p.scenes.filter((s) => s.type === 'outro').length !== 1 || p.scenes[p.scenes.length - 1].type !== 'outro') {
    err('ровно одна сцена outro, и она последняя');
  }
  p.scenes.forEach((s, i) => {
    const at = `сцена ${i + 1}`;
    if (!(s.seconds > 0) || !isFrameAligned(s.seconds)) err(`${at}: seconds=${s.seconds} не кратно 1/${FPS} с`);
    if (s.type === 'title') {
      if (!s.lines?.length || s.lines.some((l) => !l.text.trim())) err(`${at}: пустой заголовок`);
    } else if (s.type === 'screen') {
      for (const [name, t] of Object.entries(s.tracks ?? {})) {
        const [w, h] = t.size ?? [0, 0];
        if (!(w > 0 && h > 0)) err(`${at}/${name}: size не задан`);
        if (!t.file?.trim()) err(`${at}/${name}: file пуст`);
        let frames = 0;
        for (const [j, g] of t.segments.entries()) {
          const sat = `${at}/${name}/кусок ${j + 1}`;
          if (!(g.to > g.from && g.from >= 0)) err(`${sat}: from/to`);
          if (!(g.seconds > 0) || !isFrameAligned(g.seconds)) err(`${sat}: seconds не кратно 1/${FPS} с`);
          if (!g.caption?.trim()) err(`${sat}: пустой титр`);
          for (const c of Object.values(g.crop ?? {})) checkCrop(c, w, h, sat, err);
          frames += Math.round(g.seconds * FPS);
        }
        if (frames !== Math.round(s.seconds * FPS)) err(`${at}/${name}: куски дают ${frames} кадров, сцена — ${Math.round(s.seconds * FPS)}`);
      }
      for (const f of ['wide', 'tall', 'square'] as Format[]) {
        const u = s.use?.[f];
        if (!u) err(`${at}: нет use.${f}`);
        const t = s.tracks[u.track];
        if (!t) err(`${at}: use.${f} ссылается на нет такой дорожки «${u.track}»`);
        if (u.crop) checkCrop(u.crop, t.size[0], t.size[1], `${at}/use.${f}`, err);
        const tallCropped = f === 'tall' && (u.crop || t.segments.some((g) => g.crop?.tall));
        if (tallCropped && !p.allowTallCrop) err(`${at}: 9:16 кадрируется, а правило серии — запись целиком (allowTallCrop: true, если осознанно)`);
      }
    }
  });
}

function checkCrop(c: Crop, w: number, h: number, at: string, err: (m: string) => never) {
  if (!(c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= h)) {
    err(`${at}: crop ${JSON.stringify(c)} выходит за запись ${w}×${h}`);
  }
}

/** Кадры начала каждой сцены. */
export function sceneStarts(p: ProjectConfig): number[] {
  let at = 0;
  return p.scenes.map((s) => {
    const start = at;
    at += Math.round(s.seconds * FPS);
    return start;
  });
}
