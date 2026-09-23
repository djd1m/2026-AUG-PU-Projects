// Выбор кадрирования ПО ФАКТИЧЕСКОМУ положению людей (FR-2).
//
// Заслужено измерением 23.09.2026 на живом клипе: механическое деление кадра пополам дало
// пустую нижнюю панель в 10 замерах из 12 — 83 % клипа зритель видел человека сверху и стену
// снизу. Люди не сидят по половинам кадра, и предполагать это нельзя.
//
// Требование владельца дословно: «если мы делаем 2 этажа, то на обоих должны быть люди
// (полностью! а не просто кусок ноги или руки)». Отсюда два правила ниже.
import type { SourceDimensions, CropWindow } from './format.js';

export interface DetectedFace { cx: number; cy: number; w: number; h: number; score: number }
export interface FaceSample { t: number; faces: DetectedFace[] }
export interface FaceReport { width: number; height: number; samples: FaceSample[] }

/**
 * Доля замеров для ДВУХ ЭТАЖЕЙ: панель считается занятой, только если человек в ней почти всегда.
 * Требование владельца дословно: «на обоих должны быть люди (полностью!)».
 */
export const PRESENCE_REQUIRED = 0.9;
/**
 * Доля замеров для ОДНОГО крупного плана, и она НАМЕРЕННО много ниже.
 *
 * Заслужено прогоном 23.09.2026: три клипа из семи ушли в прежнее кадрирование с объяснением
 * «лица найдены, но присутствие ниже 0,9» — то есть в ту самую центральную обрезку со стеной,
 * от которой мы уходим. Правило было «не уверен — не трогаю», а верное — «не уверен в ДВУХ
 * этажах — покажи того, кто чаще в кадре». Человек, видимый в половине клипа, лучше стены во
 * всём клипе; при 0,9 выбор стоял между хорошим и ничем, и выигрывало ничто.
 */
export const PRESENCE_FOR_SINGLE = 0.5;
/** Ниже этого расхождения по горизонтали два лица считаются одним человеком, а не двумя. */
export const MIN_SEPARATION = 0.15;
/** Лицо занимает примерно эту долю высоты окна: остальное — торс. Иначе выйдет «кусок руки». */
export const FACE_SHARE_OF_WINDOW = 0.34;
/**
 * Лицо уже этой доли ширины кадра — не участник разговора, а фон или ложное срабатывание.
 *
 * Заслужено жалобой владельца 23.09.2026: «на с 1 по 2 секунды камера смотрит в стену». Замер
 * показал причину точно: на нулевой секунде детектор нашёл лицо шириной 0,04 кадра при cx=0,79,
 * а настоящий участник — 0,13 при cx=0,35. Других лиц в кадре не было, единственное было принято
 * за ведущее, окно уехало вправо, и правило «не переключаться чаще полутора секунд» продержало
 * его там ровно до 1,5 с.
 *
 * Порог 0,06 разделяет измеренные величины втрое надёжнее середины между ними.
 */
export const MIN_FACE_WIDTH = 0.06;

export interface FramingPlan {
  mode: 'dual' | 'single' | 'center';
  /** Положения окон долей хода (0 — левый край, 1 — правый), сверху вниз. */
  positions: { x: number; y: number }[];
  /** Почему выбран этот способ — попадает в журнал, чтобы решение было объяснимо постфактум. */
  reason: string;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Делит лица на две группы по горизонтали и считает, в какой доле замеров каждая присутствует.
 * Группировка простая — по медиане: сложнее не нужно, участников в подкасте двое.
 */
function cluster(samples: FaceSample[]): { x: number; y: number; presence: number }[] {
  const all = samples.flatMap(s => s.faces).filter(f => f.w >= MIN_FACE_WIDTH);
  if (!all.length) return [];
  const split = median(all.map(f => f.cx));
  const left = all.filter(f => f.cx <= split), right = all.filter(f => f.cx > split);
  const groups = [left, right].filter(g => g.length);
  // Одна группа: либо человек один, либо двое сидят вплотную и разделять их нечего.
  if (groups.length === 2 && Math.abs(median(right.map(f => f.cx)) - median(left.map(f => f.cx))) < MIN_SEPARATION) {
    return [{ x: median(all.map(f => f.cx)), y: median(all.map(f => f.cy)), presence: 1 }];
  }
  return groups.map(group => ({
    x: median(group.map(f => f.cx)),
    y: median(group.map(f => f.cy)),
    // Присутствие считается по ЗАМЕРАМ, а не по числу лиц: один замер с двумя лицами одной
    // группы не должен выглядеть как два момента присутствия.
    presence: samples.filter(s => s.faces.some(f => group.includes(f))).length / samples.length,
  }));
}

export function planFraming(report: FaceReport, source: SourceDimensions, windowSize: CropWindow): FramingPlan {
  const groups = cluster(report.samples).sort((a, b) => a.x - b.x);
  const travelX = Math.max(1, source.width - windowSize.width);
  const travelY = Math.max(1, source.height - windowSize.height);
  // Лицо ставится в верхнюю треть окна, чтобы под ним поместился торс.
  const place = (g: { x: number; y: number }) => ({
    x: Math.min(1, Math.max(0, (g.x * source.width - windowSize.width / 2) / travelX)),
    y: Math.min(1, Math.max(0, (g.y * source.height - windowSize.height * FACE_SHARE_OF_WINDOW) / travelY)),
  });

  const occupied = groups.filter(g => g.presence >= PRESENCE_REQUIRED);
  if (occupied.length >= 2) {
    const [top, bottom] = [occupied[0]!, occupied[occupied.length - 1]!];
    return { mode: 'dual', positions: [place(top), place(bottom)],
      reason: `две группы лиц, присутствие ${top.presence.toFixed(2)} и ${bottom.presence.toFixed(2)}` };
  }
  if (occupied.length === 1) {
    return { mode: 'single', positions: [place(occupied[0]!)],
      reason: `один человек, присутствие ${occupied[0]!.presence.toFixed(2)}; два этажа дали бы стену` };
  }
  // Ни одна группа не годится для этажа — но это НЕ повод возвращаться к слепой обрезке.
  // Берём того, кто чаще в кадре: планка для крупного плана своя и много ниже.
  const best = groups.reduce<{ x: number; y: number; presence: number } | null>(
    (top, g) => (!top || g.presence > top.presence ? g : top), null);
  if (best && best.presence >= PRESENCE_FOR_SINGLE) {
    return { mode: 'single', positions: [place(best)],
      reason: `крупный план по самому частому лицу, присутствие ${best.presence.toFixed(2)}` };
  }
  return { mode: 'center', positions: [],
    reason: best ? `самое частое лицо только в ${best.presence.toFixed(2)} замеров` : 'лиц не найдено' };
}

// ── Следование кадра за лицом (FR-3) ───────────────────────────────────────────────────────────
//
// Почему за ЛИЦОМ, а не за говорящим. Измерено 23.09.2026 на живой записи: оба канала звука несут
// одно и то же — корреляция громкостей 0,9995, медианная разница 0,0 дБ, и НИ ОДНОГО окна из
// 10 611, где разница превышала бы 3 дБ. Раздельных микрофонов в том, что доходит до продукта,
// нет, и определять говорящего по каналам нельзя.
//
// Зато камера в подкасте уже режет с одного участника на другого — то есть режиссёр СДЕЛАЛ выбор
// за нас, и в кадре чаще всего ровно одно лицо. Следовать за ним и дешевле, и точнее: положения
// лиц у нас уже есть, платить за них второй раз не нужно.

/** Не переключаться чаще: иначе кадр «дышит» на каждом промахе детектора. */
export const MIN_DWELL_SECONDS = 1.5;
/**
 * Сколько подряд замеров без лица терпеть, прежде чем уводить кадр в безопасное положение.
 *
 * Заслужено жалобой владельца 23.09.2026: «есть моменты во всех клипах, где камера смотрит в
 * стену». Причина была в том, что замер БЕЗ лица просто пропускался, и окно оставалось там, где
 * стояло, — то есть продолжало смотреть в точку, откуда человек уже ушёл. Пропуск данных читался
 * как «ничего не изменилось», хотя изменилось всё.
 */
export const BLIND_SAMPLES_ALLOWED = 2;
/** Ближе этого по горизонтали — тот же план, а не новый. Доля ширины кадра. */
export const SAME_SHOT_THRESHOLD = 0.06;

export interface FollowSegment { from: number; x: number; y: number }

/**
 * Превращает замеры в последовательность планов: «с такой-то секунды окно стоит вот так».
 * Время — ОТНОСИТЕЛЬНО начала клипа: внутри фильтров ffmpeg отсчёт идёт от нуля, потому что
 * обрезка `-ss` стоит до входа.
 */
export function planFollow(report: FaceReport, source: SourceDimensions, windowSize: CropWindow,
  clipStart: number): FollowSegment[] {
  const travelX = Math.max(1, source.width - windowSize.width);
  const travelY = Math.max(1, source.height - windowSize.height);
  const segments: FollowSegment[] = [];

  // Безопасное положение на случай, когда лица не видно: медиана всех найденных за клип.
  // Это НЕ середина кадра: середина в подкасте и есть та самая стена между участниками.
  const seen = report.samples.flatMap(s => s.faces).filter(f => f.w >= MIN_FACE_WIDTH);
  const safe = seen.length
    ? { x: Math.min(1, Math.max(0, (median(seen.map(f => f.cx)) * source.width - windowSize.width / 2) / travelX)),
        y: Math.min(1, Math.max(0, (median(seen.map(f => f.cy)) * source.height - windowSize.height * FACE_SHARE_OF_WINDOW) / travelY)) }
    : { x: 0.5, y: 0.5 };

  let blind = 0;
  for (const sample of report.samples) {
    const from = Math.max(0, sample.t - clipStart);
    const last = segments[segments.length - 1];
    // Ведущее лицо — самое крупное: ближний план важнее случайно попавшего в кадр затылка.
    const lead = sample.faces.filter(f => f.w >= MIN_FACE_WIDTH).reduce<DetectedFace | null>(
      (best, f) => (!best || f.w * f.h > best.w * best.h ? f : best), null);

    if (!lead) {
      // Лица нет — это ДАННЫЕ. Одиночный промах детектора терпим, устойчивое отсутствие — нет:
      // человек ушёл из кадра, и держать окно на его прежнем месте значит показывать стену.
      if (++blind <= BLIND_SAMPLES_ALLOWED) continue;
      if (last && Math.abs(last.x - safe.x) < SAME_SHOT_THRESHOLD) continue;
      segments.push({ from, ...safe });
      continue;
    }
    blind = 0;

    const x = Math.min(1, Math.max(0, (lead.cx * source.width - windowSize.width / 2) / travelX));
    const y = Math.min(1, Math.max(0, (lead.cy * source.height - windowSize.height * FACE_SHARE_OF_WINDOW) / travelY));
    // Тот же план — не добавляем. Слишком рано — тоже: пусть кадр постоит.
    if (last && (Math.abs(last.x - x) < SAME_SHOT_THRESHOLD || from - last.from < MIN_DWELL_SECONDS)) continue;
    segments.push({ from, x, y });
  }
  if (segments.length && segments[0]!.from > 0) segments[0]!.from = 0;
  return segments;
}
