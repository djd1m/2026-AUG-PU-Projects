// OWN-013, единственный ФОРМАЛЬНЫЙ порог из исследования оформления бейджа: контраст текста к
// подложке по WCAG 2.1 — 3:1 для крупного текста. Подложка бейджа делается из САМОГО ФОТО
// (`frostedPillLayers`), поэтому её яркость зависит от снимка: без затемнения размытого слоя
// белая тарелка под пилюлей сводит контраст к нечитаемому. Проверяется ХУДШИЙ СЛУЧАЙ — белое
// фото, светлее уже не бывает.
//
// Слой 1 по лестнице стоимости обнаружения: измерение на растре, а не суждение о дизайне.

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderCardImage, BADGE_HEIGHT, SAFE_TOP } from '../../apps/api/src/share/render-card-image.js';

/** Относительная яркость sRGB по WCAG 2.1. */
function luminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Цвет текста бейджа — константа `INK` рендера. */
const BADGE_TEXT_LUMINANCE = luminance(0xf6, 0xee, 0xdf);
const WCAG_AA_LARGE_TEXT = 3;

async function renderOverSolid(colour: string): Promise<Buffer> {
  const photo = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: colour } }).jpeg().toBuffer();
  return renderCardImage(
    {
      dishName: 'проверка контраста',
      items: [{ label: 'позиция', massG: 100, kcal: 10 }],
      kcal: 10 as never,
      proteinG: 1 as never,
      fatG: 1 as never,
      carbG: 1 as never,
      sourceLabel: 'проверка',
      badgeRendered: true,
      photoUrl: 'https://local/solid.jpg',
    },
    { fetchImpl: (async () => new Response(photo)) as unknown as typeof fetch },
  );
}

/**
 * Полоса СТРОГО внутри пилюли и БЕЗ глифов: между знаком и текстом, по середине высоты.
 * Скруглённый торец в выборку не попадает — иначе измерялось бы фото рядом с бейджем, а не
 * подложка под ним (ошибка первого замера).
 */
const GLASS_PROBE = { left: 140, top: SAFE_TOP + 18 + Math.round(BADGE_HEIGHT / 2) - 16, width: 11, height: 30 };

async function worstBackdropLuminance(card: Buffer): Promise<number> {
  const { data, info } = await sharp(card).extract(GLASS_PROBE).raw().toBuffer({ resolveWithObject: true });
  let brightest = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    brightest = Math.max(brightest, luminance(data[i]!, data[i + 1]!, data[i + 2]!));
  }
  return brightest;
}

describe('контраст текста бейджа к подложке (WCAG AA, крупный текст)', () => {
  it(
    'белое фото — худший случай: контраст не ниже 3:1',
    async () => {
      const worst = await worstBackdropLuminance(await renderOverSolid('#ffffff'));
      expect(contrastRatio(BADGE_TEXT_LUMINANCE, worst)).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    },
    60_000,
  );

  it(
    'тёмное фото — контраст тоже не ниже 3:1 (подложка не осветляется до нечитаемости)',
    async () => {
      const worst = await worstBackdropLuminance(await renderOverSolid('#101014'));
      expect(contrastRatio(BADGE_TEXT_LUMINANCE, worst)).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
    },
    60_000,
  );

  it('ИСПЫТАНИЕ (guard-must-be-able-to-fail): подложка, НЕ затемняющая белое фото, порог не проходит', () => {
    // Яркость белого фото под лёгкой полупрозрачной заливкой (#15101C, 0.30) без затемнения
    // размытого слоя: ≈0,70 по относительной яркости — это 1,25:1, то есть текст нечитаем.
    const undarkened = 0.7;
    expect(contrastRatio(BADGE_TEXT_LUMINANCE, undarkened)).toBeLessThan(WCAG_AA_LARGE_TEXT);
  });
});
