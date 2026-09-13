// Экран результата (`02_pseudocode.md`, `RenderResultSurface`, FR-source-and-correct-12,
// NFR-source-and-correct-3, AC-source-and-correct-26). FR-LOOK-007 — экран результата
// РОВНО один.
//
// Компонент ЧИСТО ПРЕЗЕНТАЦИОННЫЙ: принимает уже полученный ответ `GET /scans/{id}` (форма
// `buildScanResponse`, `apps/api/src/correct/response.ts`) и ничего не запрашивает сам.
// Загрузка по идентификатору скана, поллинг статуса и вызовы `POST …/correct` — это
// клиентская интеграция, которую вводит экран приёма (`scan-pipeline`); её вход
// НЕ ТЕСТИРУЕТСЯ этой фичей отдельно (спецификация, «Наследуемые сценарии»: замер
// степпера в браузере — E2E после MVP). Здесь проверяется РЕНДЕР: источник виден, чужой
// текст выводится текстом, `unmatched` без нуля, экран расхождения.
//
// Названия полей — snake_case НАМЕРЕННО: это ровно wire-форма ответа API
// (`packages/shared/src/domain/food.ts`, комментарий у `Snapshot`), а не внутреннее
// состояние компонента — дублировать её camelCase-версией значило бы завести ВТОРУЮ форму
// одного контракта, которая однажды разойдётся с первой молча.

export interface ResultSnapshot {
  readonly source: 'USDA-FDC';
  readonly source_id: string;
  readonly name_en: string;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: number;
  readonly fat_per_100g: number;
  readonly carb_per_100g: number;
  readonly portion_g: number;
  readonly import_snapshot_date: string;
}

export interface ResultPart {
  readonly foodItemId: string;
  readonly share: number;
  readonly sourceSnapshot: ResultSnapshot;
}

export interface ResultItem {
  readonly label_ru: string;
  readonly mass_g: number;
  readonly unmatched: boolean;
  readonly food_item_id: string | null;
  readonly source_snapshot: ResultSnapshot | null;
  readonly parts?: readonly ResultPart[];
  readonly kcal: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
  readonly carb: number | null;
}

export interface ScanResultResponse {
  readonly scan_id: string;
  readonly items: readonly ResultItem[];
  readonly kcal_total: number | null;
  readonly macros: { readonly protein: number; readonly fat: number; readonly carb: number };
  readonly db_kcal_total: number | null;
  readonly model_estimate_kcal: number | null;
  readonly discrepancy_ratio: number | null;
  readonly conflict_flag: boolean;
  readonly conflict_choice: string | null;
}

// Условие использования CC0-данных USDA (ADR-005) и обещание продукта FR-SOURCE-002 —
// строка ОДНА, не переизобретается в компоненте. Отсутствие — красный тест (NFR-3).
export const USDA_ATTRIBUTION =
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov.';

function SourceChip({ snapshot, massG }: { readonly snapshot: ResultSnapshot; readonly massG: number }) {
  // `<details>/<summary>` — раскрытие БЕЗ клиентского состояния: карточка записи
  // присутствует в разметке всегда (проверяемо рендером), браузер лишь скрывает её до
  // тапа. `{...}` — текстовые узлы JSX, React экранирует их САМ: чужое название и чужая
  // строка источника не могут стать исполняемой разметкой (NFR-source-and-correct-3).
  return (
    <details className="source-chip">
      <summary>
        USDA FDC · {snapshot.source_id} · {massG} г
      </summary>
      <div className="source-chip__card">
        <p className="source-chip__name">{snapshot.name_en}</p>
        <dl>
          <dt>ккал/100г</dt>
          <dd>{snapshot.kcal_per_100g}</dd>
          <dt>белки/100г</dt>
          <dd>{snapshot.protein_per_100g}</dd>
          <dt>жиры/100г</dt>
          <dd>{snapshot.fat_per_100g}</dd>
          <dt>углеводы/100г</dt>
          <dd>{snapshot.carb_per_100g}</dd>
          <dt>снимок базы от</dt>
          <dd>{snapshot.import_snapshot_date}</dd>
        </dl>
        <p className="source-chip__attribution">{USDA_ATTRIBUTION}</p>
      </div>
    </details>
  );
}

function ItemRow({ item }: { readonly item: ResultItem }) {
  if (item.unmatched) {
    // Позиция без записи базы: пометка «нет в базе», БЕЗ числа — ноль не рисуется
    // (FR-source-and-correct-6, AC-source-and-correct-12).
    return (
      <li className="item item--unmatched">
        <span className="item__label">{item.label_ru}</span>
        <span className="item__badge">нет в базе</span>
      </li>
    );
  }
  if (item.parts !== undefined && item.parts.length > 0) {
    // Составное блюдо: источник КАЖДОГО компонента отдельно — общего снимка на блюдо нет
    // (FR-source-and-correct-5).
    return (
      <li className="item item--composite">
        <span className="item__label">{item.label_ru}</span>
        <span className="item__kcal">{item.kcal} ккал</span>
        <ul className="item__parts">
          {item.parts.map((part, index) => (
            <li key={`${part.foodItemId}-${index}`}>
              <SourceChip snapshot={part.sourceSnapshot} massG={Math.round(item.mass_g * part.share)} />
            </li>
          ))}
        </ul>
      </li>
    );
  }
  return (
    <li className="item">
      <span className="item__label">{item.label_ru}</span>
      <span className="item__kcal">{item.kcal} ккал</span>
      {item.source_snapshot !== null ? <SourceChip snapshot={item.source_snapshot} massG={item.mass_g} /> : null}
    </li>
  );
}

function DiscrepancyBanner({ scan }: { readonly scan: ScanResultResponse }) {
  if (!scan.conflict_flag) return null;
  // «Взять из базы» — выбор ПО УМОЛЧАНИЮ (SC-US-004-1); тихое усреднение запрещено
  // (FR-source-and-correct-11). Вторая кнопка ведёт к правке и не отправляется на
  // маршрут — здесь она НЕ форма, а ссылка на действие вне этого компонента.
  return (
    <section className="discrepancy" aria-label="расхождение оценок">
      <p>
        Оценка по фото: <strong>{scan.model_estimate_kcal} ккал</strong> · Из базы:{' '}
        <strong>{scan.db_kcal_total} ккал</strong>
      </p>
      <div className="discrepancy__actions">
        <button type="button" className="discrepancy__default" aria-pressed={scan.conflict_choice === 'take_db'}>
          взять из базы
        </button>
        <button type="button" className="discrepancy__secondary">
          уточнить состав
        </button>
      </div>
    </section>
  );
}

export function ScanResultScreen({ scan }: { readonly scan: ScanResultResponse }) {
  return (
    <main className="result">
      <section className="result__tiles" aria-label="итог">
        <div className="tile">
          <span className="tile__value">{scan.kcal_total ?? '—'}</span>
          <span className="tile__label">ккал</span>
        </div>
        <div className="tile">
          <span className="tile__value">{scan.macros.protein}</span>
          <span className="tile__label">белки</span>
        </div>
        <div className="tile">
          <span className="tile__value">{scan.macros.fat}</span>
          <span className="tile__label">жиры</span>
        </div>
        <div className="tile">
          <span className="tile__value">{scan.macros.carb}</span>
          <span className="tile__label">углеводы</span>
        </div>
      </section>

      <DiscrepancyBanner scan={scan} />

      <ul className="result__items">
        {scan.items.map((item, index) => (
          <ItemRow key={`${item.label_ru}-${index}`} item={item} />
        ))}
      </ul>
    </main>
  );
}
