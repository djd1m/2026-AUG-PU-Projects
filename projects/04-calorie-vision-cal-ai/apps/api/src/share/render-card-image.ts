// `RenderCardImage` (02_pseudocode.md) — композиция фото + SVG-оверлей в JPEG 1080×1920
// через `sharp` (уже зависимость проекта, `03_architecture.md` — второго рендерера не заводится).
//
// ПЕРЕРАБОТКА ОБЛИКА (OWN-013, 16.09.2026). Прежняя карточка: фото в верхних 70%, чёрный блок
// снизу, бейдж — белая непрозрачная плашка в правом верхнем углу. Владелец на живой карточке:
// «бейдж смотрится ОЧЕНЬ убого». Разобрано роем, четыре находки легли в основу новой раскладки:
//
//   1. БЕЗОПАСНАЯ ЗОНА Stories. Верхние и нижние ~250 px холста 1080×1920 перекрыты интерфейсом
//      Instagram/Telegram (аватар, полоса прогресса, поле ответа). Прежний бейдж стоял на y = 24 —
//      то есть был НЕ ВИДЕН в сторис вообще, ради чего и существовал. Весь читаемый слой теперь
//      живёт внутри [SAFE_TOP, SAFE_BOTTOM].
//   2. ФОТО ВО ВЕСЬ КАДР + НАПРАВЛЕННЫЙ ЗАТЕМНИТЕЛЬ. Тёмная плашка на треть карточки — приём
//      2015 года; современная практика overlay-карточек — градиент, затемняющий РОВНО ту зону,
//      где лежит текст.
//   3. СТЕКЛО, А НЕ ПЛАШКА. Бейдж — матовое стекло: подложка делается РАЗМЫТИЕМ САМОГО ФОТО под
//      ней (`sharp.blur`), сверху полупрозрачная заливка и тонкая светлая обводка. В SVG этого
//      не сделать (`backdrop-filter` librsvg не знает), поэтому стекло собирается композицией
//      слоёв ДО оверлея — см. `frostedPillLayers`.
//   4. ИЕРАРХИЯ «ЧИСЛО-ГЕРОЙ». Первым читается ккал, затем состав блюда, затем макросы, и
//      самым мелким — строка источника («мелкий шрифт доверия»).
//
// Инвариант бейджа из FR-3 (высота ≤ 8% холста, непересечение с числами) сохранён и по-прежнему
// проверяется тестом по геометрии — он стал строже: бейдж теперь 4% вместо 8%.

import type { ShareCardItem, ShareCardRenderInput } from '@n4/shared';
import { escapeSvgText } from '@n4/shared';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/** Полоса интерфейса сторис сверху и снизу: читаемый слой в неё не заходит. */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = CARD_HEIGHT - 250;

/** Фото — на ВЕСЬ холст. Константа сохранена: на неё ссылаются тесты геометрии. */
export const PHOTO_HEIGHT = CARD_HEIGHT;

const SIDE_MARGIN = 64;
export const AVAILABLE_TEXT_WIDTH_PX = CARD_WIDTH - 2 * SIDE_MARGIN;

/** 1920 × 0,08 = 153,6 — верхняя граница FR-3. Фактическая высота вдвое меньше. */
export const BADGE_MAX_HEIGHT = Math.floor(CARD_HEIGHT * 0.08);
export const BADGE_HEIGHT = 88;
const BADGE_ICON_SIZE = 46;
const BADGE_PADDING_X = 28;
/**
 * Справа отступ БОЛЬШЕ левого и равен радиусу торца. Слева у пилюли круглый знак — он повторяет
 * форму дуги и смотрится в ней естественно; справа стоит буква, и при отступе «как слева» она
 * зрительно упирается в скругление (владелец: «слово целиком внутри — НО ВПРИТЫК»). Отступ,
 * равный радиусу, гарантирует, что последний глиф не заходит в дугу вовсе.
 */
const BADGE_PADDING_RIGHT = BADGE_HEIGHT / 2;
const BADGE_GAP = 14;
const BADGE_TEXT = 'Тарелка';
const BADGE_TEXT_FONT_PX = 38;

/** Текстовый блок снизу: состав → герой → макросы → источник. */
export const SOURCE_LABEL_Y = SAFE_BOTTOM - 8;
const MACRO_CHIP_HEIGHT = 92;
const MACRO_CHIP_GAP = 14;
const MACRO_ROW_Y = SOURCE_LABEL_Y - MACRO_CHIP_HEIGHT - 46;
const HERO_BASELINE_Y = MACRO_ROW_Y - 42;
const HERO_FONT_PX = 132;
const ITEM_LINE_HEIGHT = 52;
const ITEM_FONT_PX = 34;
const DISH_NAME_FONT_PX = 58;

export const SOURCE_LABEL_MIN_FONT_PX = 16;
export const SOURCE_LABEL_START_FONT_PX = 26;
export const DISH_NAME_MIN_FONT_PX = 32;
export const DISH_NAME_START_FONT_PX = DISH_NAME_FONT_PX;

const INK = '#F6EEDF';
const MUTED = '#B9B0A2';
const ACCENT = '#FFC531';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CardGeometry {
  readonly badgeRect: Rect;
  /** Чипы макронутриентов — то, что прежде было «плитками чисел». */
  readonly tileRects: readonly Rect[];
  readonly heroBaselineY: number;
  readonly sourceLabelY: number;
}

/** Ширина бейджа считается по тексту: пилюля обнимает содержимое, а не растянута на глазок. */
function badgeWidth(): number {
  return BADGE_PADDING_X + BADGE_ICON_SIZE + BADGE_GAP + BADGE_TEXT_WIDTH_PX + BADGE_PADDING_RIGHT;
}

/**
 * Бейдж — В БЕЗОПАСНОЙ ЗОНЕ сверху слева (над фото), числа — внизу: диапазоны Y не пересекаются
 * по построению, а не «на глаз» (`04_refinement.md`, «Стражи…»).
 */
export function computeCardGeometry(): CardGeometry {
  const badgeRect: Rect = { x: SIDE_MARGIN, y: SAFE_TOP + 18, width: badgeWidth(), height: BADGE_HEIGHT };
  const chipWidth = Math.floor((CARD_WIDTH - 2 * SIDE_MARGIN - 2 * MACRO_CHIP_GAP) / 3);
  const tileRects: Rect[] = [0, 1, 2].map((i) => ({
    x: SIDE_MARGIN + i * (chipWidth + MACRO_CHIP_GAP),
    y: MACRO_ROW_Y,
    width: chipWidth,
    height: MACRO_CHIP_HEIGHT,
  }));
  return { badgeRect, tileRects, heroBaselineY: HERO_BASELINE_Y, sourceLabelY: SOURCE_LABEL_Y };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Инвариант геометрии — проверяется тестом; функция экспортируется, чтобы страж мог её вызвать. */
export function badgeOverlapsAnyTile(geometry: CardGeometry): boolean {
  return geometry.tileRects.some((tile) => rectsOverlap(geometry.badgeRect, tile));
}

/**
 * Оценка ширины строки без метрик шрифта (у проекта НОЛЬ зависимостей ради этого): средняя
 * ширина глифа как доля кегля.
 *
 * ЗАМЕРЕНО 16.09.2026 растеризацией обоих шрифтов (владелец: «слово Тарелка должно быть целиком
 * внутри бейджа»). Прежний единый коэффициент 0,58 был ЗАНИЖЕН, а комментарий рядом с ним
 * утверждал обратное — «намеренно завышена». Из-за этого пилюля бейджа оказалась на 25 px уже
 * своего текста, и последняя буква вылезала за край.
 *
 *   Unbounded 700 38px «Тарелка»                 → 180 px, коэффициент 0,677
 *   Unbounded 800 58px «огурец, помидор и хлеб»  → 808 px, коэффициент 0,633
 *   Onest     400 34px «огурец · 95 г»           → 226 px, коэффициент 0,511
 *   Onest     400 26px «USDA FDC · 230 г · …»    → 392 px, коэффициент 0,538
 *
 * Единый безопасный коэффициент невозможен: строка из широких глифов («ЩЩЩ…») даёт 1,32 у
 * Unbounded и 1,09 у Onest. Поэтому оценка остаётся ОЦЕНКОЙ для подгонки кегля, а фактическое
 * непопадание текста за края ловится ИЗМЕРЕНИЕМ РАСТРА (`share-card-text-fits.test.ts`) — то
 * есть на слое 1, а не доверием к формуле.
 */
export const CHAR_WIDTH_FACTOR_DISPLAY = 0.72;
export const CHAR_WIDTH_FACTOR_TEXT = 0.6;

export function estimateTextWidthPx(text: string, fontSizePx: number, factor: number = CHAR_WIDTH_FACTOR_DISPLAY): number {
  return text.length * fontSizePx * factor;
}

/**
 * Ширина слова «Тарелка» в Unbounded 700 на 38 px — ЗАМЕРЕНА, а не оценена: это константа
 * бренда, она не меняется от карточки к карточке, и пилюля обязана обнимать её точно.
 * 180 px — сам текст, плюс 4 px на `letter-spacing="0.5"` у семи знаков: интервал добавляется
 * ПОСЛЕ каждого глифа, включая последний, и без него замер оказывается на 3-4 px короче
 * фактического растра. Тест `share-card-text-fits` перемеряет это растром и падает, если
 * поменялись шрифт, кегль, интервал или само слово.
 */
export const BADGE_TEXT_WIDTH_PX = 184;

export interface FittedText {
  readonly text: string;
  readonly fontSizePx: number;
}

export function fitTextToWidth(
  text: string,
  maxWidthPx: number,
  startFontSizePx: number,
  minFontSizePx: number,
  factor: number = CHAR_WIDTH_FACTOR_DISPLAY,
): FittedText {
  let fontSizePx = startFontSizePx;
  while (fontSizePx > minFontSizePx && estimateTextWidthPx(text, fontSizePx, factor) > maxWidthPx) {
    fontSizePx -= 2;
  }
  let candidate = text;
  while (candidate.length > 1 && estimateTextWidthPx(candidate, fontSizePx, factor) > maxWidthPx) {
    // На длине 2 отрезать «два символа и добавить многоточие» НЕЛЬЗЯ: `slice(0, max(1, 0))`
    // возвращает тот же один символ, к нему снова приписывается «…», и строка становится
    // НЕПОДВИЖНОЙ ТОЧКОЙ — цикл крутится вечно. Это латентный дефект прежней редакции: он не
    // проявлялся, пока подобранный кегль успевал уложить строку раньше, чем она доходила до
    // длины 2, и вскрылся при новой ширине колонки (OWN-013). Сравнение с предыдущим значением
    // оставлено ВТОРЫМ рубежом: оно делает завершение свойством кода, а не расчёта границ.
    const next = candidate.length <= 2 ? candidate.slice(0, 1) : `${candidate.slice(0, candidate.length - 2)}…`;
    if (next === candidate) break;
    candidate = next;
  }
  return { text: candidate, fontSizePx };
}

// Шрифты — ТЕ ЖЕ два семейства, что у `web` (`apps/web/app/globals.css`): 'Unbounded' на
// заголовке/числах, 'Onest' на обычном тексте. `font-family` в SVG раньше не указывался вовсе —
// на стенде `api` в образе `node:*-slim` нет НИ ОДНОГО шрифта и `fontconfig` не установлен
// (`fc-list` в контейнере → 0 строк), рисовать текст librsvg было нечем, и он молча пропускался
// (пустой глиф, а не ошибка). Дублирование строки — не опечатка: SVG не поддерживает CSS custom
// properties (`var(--font-display)`), и `--font-display` из `globals.css` здесь физически
// недоступен — этот файл рендерится СЕРВЕРОМ, вне DOM.
const FONT_FAMILY_DISPLAY = "'Unbounded', 'Onest', sans-serif";
const FONT_FAMILY_TEXT = "'Onest', sans-serif";

/** Знак «Тарелка»: тарелка с бликом. Своя геометрия, без внешних ресурсов. */
function badgeIconMarkup(x: number, y: number, size: number): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="3" opacity="0.9" />
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.52).toFixed(1)}" fill="${ACCENT}" />
    <path d="M ${(cx - r * 0.62).toFixed(1)} ${(cy - r * 0.18).toFixed(1)} a ${(r * 0.64).toFixed(1)} ${(r * 0.64).toFixed(1)} 0 0 1 ${(r * 0.52).toFixed(1)} ${(-r * 0.5).toFixed(1)}"
          fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.65" />
  `;
}

function badgeMarkup(rect: Rect): string {
  const iconX = rect.x + BADGE_PADDING_X;
  const iconY = rect.y + (rect.height - BADGE_ICON_SIZE) / 2;
  const textX = iconX + BADGE_ICON_SIZE + BADGE_GAP;
  const textY = rect.y + rect.height / 2 + BADGE_TEXT_FONT_PX * 0.35;
  // Заливка и обводка — поверх УЖЕ размытого участка фото (`frostedPillLayers`): вместе это и
  // есть матовое стекло. Светлая линия по верхней кромке — «пойманный свет», приём, который
  // отличает стекло от полупрозрачного прямоугольника.
  return `
    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rect.height / 2}"
          fill="#15101C" fill-opacity="0.30" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="1.5" />
    <path d="M ${rect.x + rect.height / 2} ${rect.y + 1.5} H ${rect.x + rect.width - rect.height / 2}"
          stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="1.5" stroke-linecap="round" fill="none" />
    ${badgeIconMarkup(iconX, iconY, BADGE_ICON_SIZE)}
    <text x="${textX}" y="${textY}" font-family="${FONT_FAMILY_DISPLAY}" font-size="${BADGE_TEXT_FONT_PX}"
          font-weight="700" letter-spacing="0.5" fill="${INK}">${escapeSvgText(BADGE_TEXT)}</text>
  `;
}

/** Состав блюда: «название · масса» слева, ккал справа. Не больше того, что дал `buildCardPayload`. */
function itemsMarkup(items: readonly ShareCardItem[], topY: number): string {
  return items
    .map((item, i) => {
      const y = topY + i * ITEM_LINE_HEIGHT;
      const left = fitTextToWidth(`${item.label} · ${item.massG} г`, AVAILABLE_TEXT_WIDTH_PX - 160, ITEM_FONT_PX, 24, CHAR_WIDTH_FACTOR_TEXT);
      return `
        <circle cx="${SIDE_MARGIN + 6}" cy="${y - 10}" r="5" fill="${ACCENT}" opacity="0.85" />
        <text x="${SIDE_MARGIN + 28}" y="${y}" font-family="${FONT_FAMILY_TEXT}" font-size="${left.fontSizePx}" fill="${INK}"
              stroke="#15101C" stroke-opacity="0.32" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${escapeSvgText(left.text)}</text>
        <text x="${CARD_WIDTH - SIDE_MARGIN}" y="${y}" text-anchor="end" font-family="${FONT_FAMILY_DISPLAY}" font-size="${ITEM_FONT_PX}" font-weight="600" fill="${INK}"
              stroke="#15101C" stroke-opacity="0.32" stroke-width="5" paint-order="stroke" stroke-linejoin="round" opacity="0.85">${escapeSvgText(String(item.kcal))}</text>
      `;
    })
    .join('\n');
}

function buildSvgOverlay(input: ShareCardRenderInput, geometry: CardGeometry): string {
  // Подгонка — на СЫРОМ тексте (по видимым символам), экранирование — ПОСЛЕ: у `&` при
  // экранировании четыре лишних символа разметки (`&amp;`), которые не занимают места на
  // холсте — считать их в оценке ширины значило бы урезать текст сильнее необходимого.
  const fittedDishName = fitTextToWidth(input.dishName, AVAILABLE_TEXT_WIDTH_PX, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
  const fittedSourceLabel = fitTextToWidth(input.sourceLabel, AVAILABLE_TEXT_WIDTH_PX, SOURCE_LABEL_START_FONT_PX, SOURCE_LABEL_MIN_FONT_PX, CHAR_WIDTH_FACTOR_TEXT);
  const dishName = escapeSvgText(fittedDishName.text);
  const sourceLabel = escapeSvgText(fittedSourceLabel.text);
  const { tileRects, badgeRect } = geometry;

  const macros: readonly { readonly label: string; readonly value: string }[] = [
    { label: 'белки', value: `${input.proteinG} г` },
    { label: 'жиры', value: `${input.fatG} г` },
    { label: 'углеводы', value: `${input.carbG} г` },
  ];

  const chipsMarkup = tileRects
    .map((rect, i) => {
      const macro = macros[i]!;
      const cx = rect.x + rect.width / 2;
      return `
        <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="26"
              fill="#FFFFFF" fill-opacity="0.09" stroke="#FFFFFF" stroke-opacity="0.15" stroke-width="1" />
        <text x="${cx}" y="${rect.y + 40}" text-anchor="middle" font-family="${FONT_FAMILY_DISPLAY}" font-size="32" font-weight="700" fill="${INK}">${escapeSvgText(macro.value)}</text>
        <text x="${cx}" y="${rect.y + 72}" text-anchor="middle" font-family="${FONT_FAMILY_TEXT}" font-size="23" fill="${MUTED}">${escapeSvgText(macro.label)}</text>
      `;
    })
    .join('\n');

  // Состав рисуется ВВЕРХ от названия блюда: сколько позиций пришло, столько строк, и блок
  // растёт к центру карточки, не наезжая на героя снизу.
  const itemsTopY = geometry.heroBaselineY - HERO_FONT_PX - 34;
  const itemsBlockTop = itemsTopY - (input.items.length - 1) * ITEM_LINE_HEIGHT;
  const dishNameY = itemsBlockTop - 44;
  const scrimTop = Math.max(SAFE_TOP, dishNameY - DISH_NAME_FONT_PX - 420);

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#15101C" stop-opacity="0" />
        <stop offset="0.28" stop-color="#15101C" stop-opacity="0.62" />
        <stop offset="0.52" stop-color="#15101C" stop-opacity="0.90" />
        <stop offset="1" stop-color="#15101C" stop-opacity="0.985" />
      </linearGradient>
      <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#15101C" stop-opacity="0.45" />
        <stop offset="1" stop-color="#15101C" stop-opacity="0" />
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="${CARD_WIDTH}" height="${SAFE_TOP + 180}" fill="url(#topScrim)" />
    <rect x="0" y="${scrimTop}" width="${CARD_WIDTH}" height="${CARD_HEIGHT - scrimTop}" fill="url(#scrim)" />

    ${badgeMarkup(badgeRect)}

    <text x="${SIDE_MARGIN}" y="${dishNameY}" font-family="${FONT_FAMILY_DISPLAY}" font-size="${fittedDishName.fontSizePx}" font-weight="800"
          fill="${INK}" stroke="#15101C" stroke-opacity="0.38" stroke-width="7" paint-order="stroke" stroke-linejoin="round">${dishName}</text>
    ${itemsMarkup(input.items, itemsBlockTop)}

    <!-- Число и единица — ОДНА строка с tspan: положение «ккал» задаёт сам растеризатор через
         dx, а не наша оценка ширины. Оценка здесь была ошибкой: после уточнения коэффициента
         (0,58 → 0,72) зазор между «41» и «ккал» вырос с 13 px до 50 px — владелец увидел это
         как «оформление испортилось». dx точен для любого числа знаков и не зависит от шрифта. -->
    <text x="${SIDE_MARGIN}" y="${geometry.heroBaselineY}" font-family="${FONT_FAMILY_DISPLAY}" font-size="${HERO_FONT_PX}" font-weight="800" fill="${INK}">${escapeSvgText(String(input.kcal))}<tspan dx="2" dy="-14" font-family="${FONT_FAMILY_TEXT}" font-size="42" font-weight="500" fill="${ACCENT}">ккал</tspan></text>

    ${chipsMarkup}

    <text x="${SIDE_MARGIN}" y="${geometry.sourceLabelY}" font-family="${FONT_FAMILY_TEXT}" font-size="${fittedSourceLabel.fontSizePx}" fill="${MUTED}" opacity="0.85">${sourceLabel}</text>
  </svg>`;
}

export interface RenderCardImageDeps {
  /** Внедряется тестами: `fetch` реальной presigned-ссылки — сеть, но локальная (MinIO той же сети compose). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Матовое стекло под бейджем: участок УЖЕ готового фото вырезается, размывается и кладётся
 * обратно через маску со скруглением. В SVG это невозможно (`backdrop-filter` librsvg не
 * поддерживает), а без размытия пилюля выглядит наклейкой, а не стеклом.
 */
async function frostedPillLayers(
  sharpModule: typeof import('sharp'),
  photo: Buffer,
  rect: Rect,
): Promise<{ readonly input: Buffer; readonly top: number; readonly left: number }[]> {
  const region = {
    left: Math.max(0, rect.x - 2),
    top: Math.max(0, rect.y - 2),
    width: Math.min(CARD_WIDTH, rect.width + 4),
    height: Math.min(CARD_HEIGHT, rect.height + 4),
  };
  const mask = Buffer.from(
    `<svg width="${region.width}" height="${region.height}" xmlns="http://www.w3.org/2000/svg">
       <rect x="2" y="2" width="${rect.width}" height="${rect.height}" rx="${rect.height / 2}" fill="#fff" />
     </svg>`,
  );
  // Яркость УМЕНЬШАЕТСЯ, а не увеличивается. Единственный формальный порог, найденный
  // исследованием, — контраст WCAG AA: 3:1 для крупного текста. Замер на живой карточке:
  // светлое фото (белая тарелка) под пилюлей давало 1,5:1 на самых ярких пикселях — текст
  // бейджа на таком фото нечитаем. Полупрозрачной заливки для гарантии мало: чтобы закрыть
  // белое фото только ею, нужна непрозрачность ≈0,76, и стекло превращается обратно в плашку.
  // Поэтому затемняется САМ размытый слой, а заливка остаётся лёгкой — стекло сохраняется,
  // а нижняя граница контраста перестаёт зависеть от того, что на фото.
  const frosted = await sharpModule(photo)
    .extract(region)
    .blur(18)
    .modulate({ saturation: 1.25, brightness: 0.5 })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return [{ input: frosted, top: region.top, left: region.left }];
}

export async function renderCardImage(input: ShareCardRenderInput, deps: RenderCardImageDeps = {}): Promise<Buffer> {
  const sharpModule = (await import('sharp')).default;
  const doFetch = deps.fetchImpl ?? fetch;

  const photoResponse = await doFetch(input.photoUrl);
  if (!photoResponse.ok) throw new Error(`фото недоступно для рендера карточки: ${photoResponse.status}`);
  const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());

  const geometry = computeCardGeometry();
  const svg = buildSvgOverlay(input, geometry);

  // Фото — на ВЕСЬ холст (`cover`): карточка перестала быть «фото сверху, плашка снизу».
  const photoFull = await sharpModule(photoBuffer)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const glass = input.badgeRendered ? await frostedPillLayers(sharpModule, photoFull, geometry.badgeRect) : [];

  return sharpModule(photoFull)
    .composite([...glass, { input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
}
