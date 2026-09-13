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

function buildSvgOverlay(input: ShareCardRenderInput, geometry: CardGeometry): string {
  const dishName = escapeSvgText(input.dishName);
  const sourceLabel = escapeSvgText(input.sourceLabel);
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
        <text x="${cx}" y="${rect.y + 55}" text-anchor="middle" font-size="34" font-weight="700" fill="#ffffff">${escapeSvgText(num.value)}</text>
        <text x="${cx}" y="${rect.y + 95}" text-anchor="middle" font-size="20" fill="#9a9aa5">${escapeSvgText(num.label)}</text>
      `;
    })
    .join('\n');

  const badgeMarkup = input.badgeRendered
    ? `<rect x="${badgeRect.x}" y="${badgeRect.y}" width="${badgeRect.width}" height="${badgeRect.height}" rx="12" fill="#ffffffcc" />
       <text x="${badgeRect.x + badgeRect.width / 2}" y="${badgeRect.y + badgeRect.height / 2 + 10}" text-anchor="middle" font-size="28" font-weight="600" fill="#101014">распознано в «Тарелке»</text>`
    : '';

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <text x="40" y="${PHOTO_HEIGHT + 60}" font-size="48" font-weight="800" fill="#ffffff">${dishName}</text>
    <text x="40" y="${TILE_TOP + 4 * (TILE_HEIGHT / 4) + 180}" font-size="24" fill="#9a9aa5">${sourceLabel}</text>
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
