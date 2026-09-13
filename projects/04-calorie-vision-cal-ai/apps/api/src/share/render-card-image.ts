// `RenderCardImage` (02_pseudocode.md) — композиция фото + SVG-оверлей в JPEG 1080×1920
// через `sharp` (уже зависимость проекта, `03_architecture.md` — второго рендерера не
// заводится). Единственный вход — `ShareCardRenderInput` (восемь полей).
//
// Геометрия читается из этого файла тестом на непересечение бейджа и плиток чисел
// (`AC-share-card-and-growth-events-4/5`, «бейдж ≤8% высоты и не пересекает плитки»).

import type { ShareCardRenderInput } from '@n4/shared';
import { escapeSvgText } from '@n4/shared';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
/** Верхние ~70% холста — фото (шаг 1 `RenderCardImage`). */
export const PHOTO_HEIGHT = Math.round(CARD_HEIGHT * 0.7);
/** 1920 × 0,08 = 153,6; округление ВНИЗ — превышение недопустимо ни на пиксель (FR-3). */
export const BADGE_HEIGHT = Math.floor(CARD_HEIGHT * 0.08);
const BADGE_MARGIN = 24;
const BADGE_WIDTH = 340;

const TILE_TOP = PHOTO_HEIGHT + 260;
const TILE_HEIGHT = 140;
const TILE_GAP = 16;
const TILE_WIDTH = Math.floor((CARD_WIDTH - 2 * 40 - 3 * TILE_GAP) / 4);
const SIDE_MARGIN = 40;
/** Строка источника — сразу ПОД плитками с фиксированным малым зазором, а не «плитка + 180».
 *  ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-02): прежняя формула `TILE_TOP + 140 +
 *  180 = 1924` при `CARD_HEIGHT = 1920` — базовая линия ниже холста, текст обрезан снизу. */
const SOURCE_LABEL_GAP_BELOW_TILES = 40;
export const SOURCE_LABEL_Y = TILE_TOP + TILE_HEIGHT + SOURCE_LABEL_GAP_BELOW_TILES;

export interface CardGeometry {
  readonly badgeRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly tileRects: ReadonlyArray<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }>;
}

/** Бейдж — в углу зоны фото (y от 0), плитки чисел — НИЖЕ фото: диапазоны Y не пересекаются
 *  геометрически по построению, а не «на глаз» (`04_refinement.md`, «Стражи…»). */
export function computeCardGeometry(): CardGeometry {
  const badgeRect = { x: CARD_WIDTH - BADGE_MARGIN - BADGE_WIDTH, y: BADGE_MARGIN, width: BADGE_WIDTH, height: BADGE_HEIGHT };
  const tileRects = [0, 1, 2, 3].map((i) => ({ x: 40 + i * (TILE_WIDTH + TILE_GAP), y: TILE_TOP, width: TILE_WIDTH, height: TILE_HEIGHT }));
  return { badgeRect, tileRects };
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Инвариант геометрии — проверяется тестом; функция экспортируется, чтобы страж мог её вызвать. */
export function badgeOverlapsAnyTile(geometry: CardGeometry): boolean {
  return geometry.tileRects.some((tile) => rectsOverlap(geometry.badgeRect, tile));
}

/**
 * Подгонка текста под ширину холста (RV-share-card-and-growth-events-02). `sharp`/`librsvg` не
 * даёт измерить реальную ширину текста ДО рендера (нет canvas/font-metrics библиотеки — «НОЛЬ
 * новых пакетов», `03_architecture.md`), поэтому ширина ОЦЕНИВАЕТСЯ консервативным (заведомо не
 * заниженным) средним коэффициентом ширины символа для жирного шрифта. Оценка ЗАВЕДОМО ШИРЕ, чем
 * у большинства реальных символов (в т.ч. кириллицы) — переоценка здесь безопасна (текст выйдет
 * МЕЛЬЧЕ/короче необходимого, а не вылезет за холст), недооценка была бы дефектом.
 *
 * Стратегия: (1) уменьшать размер шрифта до нижней границы; (2) если и на нижней границе строка
 * не влезает — обрезать по символам с многоточием, пока не влезет. Перенос на вторую строку не
 * делается — единственная строка проще проверить геометрически и достаточна: `sanitizeForCardText`
 * УЖЕ ограничивает исходную длину (60/80 символов), это последний рубеж на случай, что даже
 * ограниченная по символам строка визуально шире холста при максимальном размере шрифта.
 */
const AVG_CHAR_WIDTH_FACTOR = 0.62;

export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * AVG_CHAR_WIDTH_FACTOR;
}

export interface FittedText {
  readonly text: string;
  readonly fontSizePx: number;
}

export function fitTextToWidth(text: string, maxWidthPx: number, startFontSizePx: number, minFontSizePx: number): FittedText {
  let fontSizePx = startFontSizePx;
  while (fontSizePx > minFontSizePx && estimateTextWidthPx(text, fontSizePx) > maxWidthPx) {
    fontSizePx -= 2;
  }
  let candidate = text;
  while (candidate.length > 1 && estimateTextWidthPx(candidate, fontSizePx) > maxWidthPx) {
    // Обрезаем по одному символу с конца, заменяя многоточием (или добавляя его при первой
    // обрезке) — оценка пересчитывается на каждом шаге, а не один раз.
    const withoutEllipsis = candidate.endsWith('…') ? candidate.slice(0, -1) : candidate;
    candidate = `${withoutEllipsis.slice(0, Math.max(0, withoutEllipsis.length - 1))}…`;
  }
  return { text: candidate, fontSizePx };
}

export const DISH_NAME_START_FONT_PX = 48;
export const DISH_NAME_MIN_FONT_PX = 28;
export const SOURCE_LABEL_START_FONT_PX = 24;
export const SOURCE_LABEL_MIN_FONT_PX = 16;
export const AVAILABLE_TEXT_WIDTH_PX = CARD_WIDTH - 2 * SIDE_MARGIN;

// Шрифты — ТЕ ЖЕ два семейства, что у `web` (`apps/web/app/globals.css`): 'Unbounded' на
// заголовке/числах, 'Onest' на обычном тексте. `font-family` в SVG раньше не указывался
// вовсе — на стенде `api` в образе `node:*-slim` нет НИ ОДНОГО шрифта и `fontconfig` не
// установлен (`fc-list` в контейнере → 0 строк), рисовать текст librsvg было нечем, и он
// молча пропускался (пустой глиф, а не ошибка). Дублирование строки — не опечатка: SVG не
// поддерживает CSS custom properties (`var(--font-display)`), и `--font-display` из
// `globals.css` здесь физически недоступен — этот файл рендерится СЕРВЕРОМ, вне DOM.
const FONT_FAMILY_DISPLAY = "'Unbounded', 'Onest', sans-serif";
const FONT_FAMILY_TEXT = "'Onest', sans-serif";

function buildSvgOverlay(input: ShareCardRenderInput, geometry: CardGeometry): string {
  // Подгонка — на СЫРОМ тексте (по видимым символам), экранирование — ПОСЛЕ: у `&` при
  // экранировании четыре лишних символа разметки (`&amp;`), которые не занимают места на
  // холсте — считать их в оценке ширины значило бы урезать текст сильнее необходимого.
  const fittedDishName = fitTextToWidth(input.dishName, AVAILABLE_TEXT_WIDTH_PX, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
  const fittedSourceLabel = fitTextToWidth(input.sourceLabel, AVAILABLE_TEXT_WIDTH_PX, SOURCE_LABEL_START_FONT_PX, SOURCE_LABEL_MIN_FONT_PX);
  const dishName = escapeSvgText(fittedDishName.text);
  const sourceLabel = escapeSvgText(fittedSourceLabel.text);
  const { tileRects, badgeRect } = geometry;
  const numbers: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: 'ккал', value: String(input.kcal) },
    { label: 'белки', value: `${input.proteinG} г` },
    { label: 'жиры', value: `${input.fatG} г` },
    { label: 'углеводы', value: `${input.carbG} г` },
  ];

  const tileMarkup = tileRects
    .map((rect, i) => {
      const num = numbers[i]!;
      const cx = rect.x + rect.width / 2;
      return `
        <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="16" fill="#1c1c22" />
        <text x="${cx}" y="${rect.y + 55}" text-anchor="middle" font-family="${FONT_FAMILY_DISPLAY}" font-size="34" font-weight="700" fill="#ffffff">${escapeSvgText(num.value)}</text>
        <text x="${cx}" y="${rect.y + 95}" text-anchor="middle" font-family="${FONT_FAMILY_TEXT}" font-size="20" fill="#9a9aa5">${escapeSvgText(num.label)}</text>
      `;
    })
    .join('\n');

  const badgeMarkup = input.badgeRendered
    ? `<rect x="${badgeRect.x}" y="${badgeRect.y}" width="${badgeRect.width}" height="${badgeRect.height}" rx="12" fill="#ffffffcc" />
       <text x="${badgeRect.x + badgeRect.width / 2}" y="${badgeRect.y + badgeRect.height / 2 + 10}" text-anchor="middle" font-family="${FONT_FAMILY_TEXT}" font-size="28" font-weight="600" fill="#101014">распознано в «Тарелке»</text>`
    : '';

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <text x="${SIDE_MARGIN}" y="${PHOTO_HEIGHT + 60}" font-family="${FONT_FAMILY_DISPLAY}" font-size="${fittedDishName.fontSizePx}" font-weight="800" fill="#ffffff">${dishName}</text>
    <text x="${SIDE_MARGIN}" y="${SOURCE_LABEL_Y}" font-family="${FONT_FAMILY_TEXT}" font-size="${fittedSourceLabel.fontSizePx}" fill="#9a9aa5">${sourceLabel}</text>
    ${tileMarkup}
    ${badgeMarkup}
  </svg>`;
}

export interface RenderCardImageDeps {
  /** Внедряется тестами: `fetch` реальной presigned-ссылки — сеть, но локальная (MinIO той же сети compose). */
  readonly fetchImpl?: typeof fetch;
}

export async function renderCardImage(input: ShareCardRenderInput, deps: RenderCardImageDeps = {}): Promise<Buffer> {
  const sharpModule = (await import('sharp')).default;
  const doFetch = deps.fetchImpl ?? fetch;

  const photoResponse = await doFetch(input.photoUrl);
  if (!photoResponse.ok) throw new Error(`фото недоступно для рендера карточки: ${photoResponse.status}`);
  const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());

  const geometry = computeCardGeometry();
  const svg = buildSvgOverlay(input, geometry);

  const base = await sharpModule({ create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 3, background: '#101014' } })
    .jpeg()
    .toBuffer();
  const photoResized = await sharpModule(photoBuffer)
    .resize(CARD_WIDTH, PHOTO_HEIGHT, { fit: 'cover' })
    .toBuffer();

  return sharpModule(base)
    .composite([
      { input: photoResized, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}
