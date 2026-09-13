// Экран результата — рендер (AC-source-and-correct-26). Тот же приём, что и
// `web-shell.test.tsx`: `renderToStaticMarkup` тем же React, что и сервер — поднимать
// Next ради разметки значило бы проверять Next, а не свой экран.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScanResultScreen, USDA_ATTRIBUTION, type ScanResultResponse } from '../../apps/web/app/result/result-screen.js';

const XSS_LABEL = '<img src=x onerror=alert(1)>';

function baseScan(overrides: Partial<ScanResultResponse> = {}): ScanResultResponse {
  return {
    scan_id: 'scan-1',
    items: [],
    kcal_total: 250,
    macros: { protein: 10, fat: 5, carb: 30 },
    db_kcal_total: 250,
    model_estimate_kcal: 260,
    discrepancy_ratio: 0.04,
    conflict_flag: false,
    conflict_choice: null,
    // FR-LOOK-007/DEC-A-050: дефолт — «кадра нет», ЗАКОННЫЙ исход (нормализации ещё не
    // было / файл удалён по сроку), а не выдуманный адрес.
    photo_url: null,
    ...overrides,
  };
}

describe('ScanResultScreen (AC-source-and-correct-26)', () => {
  it('показывает имя базы, source_id, порцию, дату снимка и цитату USDA; чужая разметка выводится текстом', () => {
    const scan = baseScan({
      items: [
        {
          label_ru: XSS_LABEL,
          mass_g: 250,
          unmatched: false,
          food_item_id: 'food-1',
          source_snapshot: {
            source: 'USDA-FDC',
            source_id: '168878',
            name_en: 'Rice, white, cooked',
            kcal_per_100g: 130,
            protein_per_100g: 2.7,
            fat_per_100g: 0.3,
            carb_per_100g: 28.2,
            portion_g: 250,
            import_snapshot_date: '2026-04-01',
          },
          kcal: 325,
          protein: 6.8,
          fat: 0.8,
          carb: 70.5,
        },
      ],
    });

    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);

    // Источник виден: имя базы, source_id, порция, название записи, дата снимка, цитата.
    expect(html).toContain('USDA FDC');
    expect(html).toContain('168878');
    expect(html).toContain('250');
    expect(html).toContain('Rice, white, cooked');
    expect(html).toContain('2026-04-01');
    expect(html).toContain(USDA_ATTRIBUTION);

    // Разметка из названия (пришла от модели) выводится ТЕКСТОМ и не исполняется: React
    // экранирует JSX-текст сам — тега `<img` в выводе быть не должно, должны быть сущности.
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('позиция unmatched показывается без числа, с пометкой «нет в базе»', () => {
    const scan = baseScan({
      items: [
        { label_ru: 'неизвестное блюдо', mass_g: 150, unmatched: true, food_item_id: null, source_snapshot: null, kcal: null, protein: null, fat: null, carb: null },
      ],
    });
    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);
    expect(html).toContain('нет в базе');
    // Ноль не рисуется вместо неизвестного.
    expect(html).not.toMatch(/item__kcal">0/);
  });

  it('составное блюдо показывает источник КАЖДОЙ части отдельно', () => {
    const scan = baseScan({
      items: [
        {
          label_ru: 'борщ',
          mass_g: 300,
          unmatched: false,
          food_item_id: 'synonym-1',
          source_snapshot: null,
          kcal: 210,
          protein: 8,
          fat: 6,
          carb: 25,
          parts: [
            {
              foodItemId: 'part-1',
              share: 0.5,
              sourceSnapshot: { source: 'USDA-FDC', source_id: 'A1', name_en: 'Beetroot', kcal_per_100g: 43, protein_per_100g: 1.6, fat_per_100g: 0.2, carb_per_100g: 10, portion_g: 150, import_snapshot_date: '2026-04-01' },
            },
            {
              foodItemId: 'part-2',
              share: 0.5,
              sourceSnapshot: { source: 'USDA-FDC', source_id: 'B2', name_en: 'Cabbage', kcal_per_100g: 25, protein_per_100g: 1.3, fat_per_100g: 0.1, carb_per_100g: 5.8, portion_g: 150, import_snapshot_date: '2026-04-01' },
            },
          ],
        },
      ],
    });
    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);
    expect(html).toContain('Beetroot');
    expect(html).toContain('Cabbage');
    expect((html.match(/USDA FDC/g) ?? []).length).toBe(2);
  });

  it('при conflict_flag показывает оба числа и выбор «взять из базы» по умолчанию', () => {
    const scan = baseScan({ conflict_flag: true, model_estimate_kcal: 780, db_kcal_total: 640, conflict_choice: null });
    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);
    expect(html).toContain('780');
    expect(html).toContain('640');
    expect(html).toContain('взять из базы');
    expect(html).toContain('уточнить состав');
  });

  it('FR-LOOK-007/DEC-A-050: кадр показывается, когда photo_url задан', () => {
    const scan = baseScan({ photo_url: 'https://storage.example.internal/n4-photos/session/scan.normalized.jpg?X-Amz-Signature=abc' });
    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);
    expect(html).toContain('result__photo');
    expect(html).toContain('<img');
    expect(html).toContain('storage.example.internal');
  });

  it('FR-LOOK-007/DEC-A-050: блок кадра отсутствует ВОВСЕ, когда photo_url = null — не пустая рамка', () => {
    const scan = baseScan({ photo_url: null });
    const html = renderToStaticMarkup(<ScanResultScreen scan={scan} />);
    expect(html).not.toContain('result__photo');
    expect(html).not.toContain('<img');
  });
});
