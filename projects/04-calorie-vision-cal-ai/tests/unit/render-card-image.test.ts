// AC-share-card-and-growth-events-1/13 — геометрия текста РЕНДЕРА карточки.
// ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-02, review-report.md): прежняя версия не
// ограничивала ШИРИНУ текста (60 символов шрифтом 48px давали 3154px при доступных 1000px) и
// вычисляла базовую линию строки источника НИЖЕ холста (1924 при высоте 1920). Оба воспроизведены
// судьёй локальным `sharp`-рендером; тесты здесь фиксируют исправленный ИНВАРИАНТ, а не полагаются
// на измерение пикселей готового растра (`sharp`/`librsvg` не даёт метрик текста).

import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_TEXT_WIDTH_PX,
  CARD_HEIGHT,
  DISH_NAME_MIN_FONT_PX,
  DISH_NAME_START_FONT_PX,
  SOURCE_LABEL_MIN_FONT_PX,
  SOURCE_LABEL_START_FONT_PX,
  SOURCE_LABEL_Y,
  estimateTextWidthPx,
  fitTextToWidth,
} from '../../apps/api/src/share/render-card-image.js';

describe('SOURCE_LABEL_Y: базовая линия строки источника не уходит за холст', () => {
  it('SOURCE_LABEL_Y + максимальный размер шрифта источника <= CARD_HEIGHT', () => {
    expect(SOURCE_LABEL_Y + SOURCE_LABEL_START_FONT_PX).toBeLessThanOrEqual(CARD_HEIGHT);
  });
});

describe('fitTextToWidth: оценённая ширина никогда не превышает доступную (RV-02)', () => {
  it('название 60 символов (воспроизведение судьи: 59 «Ш» + многоточие) укладывается в 1000px', () => {
    const worstCase = `${'Ш'.repeat(59)}…`; // максимум по sanitizeForCardText(., 60)
    const fitted = fitTextToWidth(worstCase, AVAILABLE_TEXT_WIDTH_PX, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
    expect(estimateTextWidthPx(fitted.text, fitted.fontSizePx)).toBeLessThanOrEqual(AVAILABLE_TEXT_WIDTH_PX);
  });

  it('строка источника 80 символов (максимум sanitizeForCardText) укладывается в 1000px', () => {
    const worstCase = `${'USDA FDC #123456 · '.repeat(4)}`.slice(0, 79) + '…';
    const fitted = fitTextToWidth(worstCase, AVAILABLE_TEXT_WIDTH_PX, SOURCE_LABEL_START_FONT_PX, SOURCE_LABEL_MIN_FONT_PX);
    expect(estimateTextWidthPx(fitted.text, fitted.fontSizePx)).toBeLessThanOrEqual(AVAILABLE_TEXT_WIDTH_PX);
  });

  it('короткий текст не уменьшается и не обрезается (не переоптимизирует легитимный случай)', () => {
    const fitted = fitTextToWidth('Овсянка', AVAILABLE_TEXT_WIDTH_PX, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
    expect(fitted).toEqual({ text: 'Овсянка', fontSizePx: DISH_NAME_START_FONT_PX });
  });

  it('даже при абсурдно узкой ширине (1px) результат — непустая строка длины ≥ 1, оценка не бесконечна', () => {
    const fitted = fitTextToWidth('А'.repeat(60), 1, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
    expect(fitted.text.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(fitted.fontSizePx)).toBe(true);
  });

  it('ИСПЫТАНИЕ (guard-must-be-able-to-fail): без подгонки (font-size фиксирован, обрезки нет) 60 символов на 48px превышают 1000px — страж ловит именно это', () => {
    const noFitEstimate = estimateTextWidthPx('Ш'.repeat(60), 48);
    expect(noFitEstimate).toBeGreaterThan(AVAILABLE_TEXT_WIDTH_PX); // подтверждает, что без правки инвариант был бы нарушен
  });
});

describe('OWN-013: подгонка текста завершается ВСЕГДА (латентный бесконечный цикл)', () => {
  it.each([
    ['ширина 1px', 1],
    ['ширина 0px', 0],
    ['отрицательная ширина', -5],
  ])('%s — функция возвращается, результат непустой', (_label, width) => {
    const fitted = fitTextToWidth('огурец, помидор и хлеб', width, DISH_NAME_START_FONT_PX, DISH_NAME_MIN_FONT_PX);
    expect(fitted.text.length).toBeGreaterThanOrEqual(1);
    expect(fitted.fontSizePx).toBe(DISH_NAME_MIN_FONT_PX);
  });

  it('ИСПЫТАНИЕ (guard-must-be-able-to-fail): прежняя формула на длине 2 даёт неподвижную точку', () => {
    // Прежний шаг: slice(0, Math.max(1, len - 2)) + '…'. Для строки длины 2 он возвращает ТУ ЖЕ
    // строку — цикл `while (length > 1 && слишком широко)` не мог завершиться никогда.
    const previousStep = (candidate: string): string => `${candidate.slice(0, Math.max(1, candidate.length - 2))}…`;
    expect(previousStep('х…')).toBe('х…');
  });
});
