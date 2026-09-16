// OWN-013: текст карточки ФАКТИЧЕСКИ помещается — измерением растра, а не доверием к формуле.
//
// Владелец на живой карточке: «слово Тарелка должно быть целиком внутри бейджа». Причина —
// заниженный коэффициент ширины глифа: пилюля считалась на 25 px уже своего текста. Единый
// безопасный коэффициент невозможен (строка широких глифов даёт 1,32 против 0,63 у обычной),
// поэтому попадание в границы проверяется ЗДЕСЬ, на пикселях.

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  renderCardImage,
  computeCardGeometry,
  BADGE_TEXT_WIDTH_PX,
  CARD_WIDTH,
} from '../../apps/api/src/share/render-card-image.js';

const SIDE_MARGIN = 64;

async function renderOverBlack(dishName: string, items: readonly { label: string; massG: number; kcal: number }[]): Promise<Buffer> {
  // Чёрное фото: любой глиф светлее фона, значит «самый правый светлый пиксель» — это текст.
  const photo = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#000000' } }).jpeg().toBuffer();
  return renderCardImage(
    {
      dishName,
      items,
      kcal: 1234 as never,
      proteinG: 12.3 as never,
      fatG: 45.6 as never,
      carbG: 78.9 as never,
      sourceLabel: 'USDA FoodData Central · 1230 г · 5 позиций',
      badgeRendered: true,
      photoUrl: 'https://local/black.jpg',
    },
    { fetchImpl: (async () => new Response(photo)) as unknown as typeof fetch },
  );
}

/** Самый правый светлый пиксель в горизонтальной полосе. `-1` — светлых пикселей нет. */
async function rightmostLightPixel(card: Buffer, top: number, height: number): Promise<number> {
  const { data, info } = await sharp(card)
    .extract({ left: 0, top, width: CARD_WIDTH, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i]! > 190 && data[i + 1]! > 185 && data[i + 2]! > 175) right = Math.max(right, x);
    }
  }
  return right;
}

describe('текст помещается в свои границы (измерение растра)', () => {
  it(
    'слово в бейдже целиком внутри пилюли — с внутренним отступом, а не впритык',
    async () => {
      const card = await renderOverBlack('блюдо', [{ label: 'позиция', massG: 100, kcal: 10 }]);
      const { badgeRect } = computeCardGeometry();
      const rightmost = await rightmostLightPixel(card, badgeRect.y + 20, badgeRect.height - 40);
      expect(rightmost).toBeGreaterThan(0);
      // Отступ справа равен радиусу торца: последний глиф не имеет права зайти в дугу.
      expect(rightmost).toBeLessThanOrEqual(badgeRect.x + badgeRect.width - badgeRect.height / 2);
    },
    60_000,
  );

  it(
    'ИСПЫТАНИЕ (guard-must-be-able-to-fail): пилюля по ЗАНИЖЕННОЙ прежней оценке уже своего текста',
    () => {
      // Прежний коэффициент 0,58 на «Тарелка» 38px давал 155 px против замеренных 180 px.
      const previousEstimate = Math.ceil('Тарелка'.length * 38 * 0.58);
      expect(previousEstimate).toBeLessThan(BADGE_TEXT_WIDTH_PX);
    },
  );

  it(
    'длинное название блюда не выходит за поле карточки',
    async () => {
      const card = await renderOverBlack('огурец, помидор и хлеб с маслом и сыром', [
        { label: 'хлеб пшеничный формовой', massG: 150, kcal: 411 },
        { label: 'помидор', massG: 120, kcal: 22 },
        { label: 'огурец', massG: 95, kcal: 14 },
      ]);
      const { heroBaselineY } = computeCardGeometry();
      // Полоса всего текстового блока: название, состав, герой, источник.
      const rightmost = await rightmostLightPixel(card, heroBaselineY - 320, 420);
      expect(rightmost).toBeGreaterThan(0);
      expect(rightmost).toBeLessThanOrEqual(CARD_WIDTH - SIDE_MARGIN);
    },
    60_000,
  );
});
