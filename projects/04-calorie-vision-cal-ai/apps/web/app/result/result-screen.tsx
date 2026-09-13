'use client';

// Экран результата (`02_pseudocode.md`, `RenderResultSurface`, FR-source-and-correct-12,
// NFR-source-and-correct-3, AC-source-and-correct-26). FR-LOOK-007 — экран результата
// РОВНО один.
//
// RV-source-and-correct-01 (слепое ревью, 2026-09-13): компонент был ЧИСТО
// презентационным без единого обработчика — степпер, замена, удаление и разрешение
// расхождения существовали только в разметке. Теперь он принимает НЕОБЯЗАТЕЛЬНЫЙ набор
// действий (`ScanResultActions`): страница `app/result/[id]/page.tsx` подключает их к
// `POST /api/v1/scans/{id}/correct`, а сам компонент по-прежнему не делает сетевых
// вызовов сам и остаётся тестируемым `renderToStaticMarkup`'ом без действий (проп
// необязателен — `tests/integration/web-result-screen.test.tsx` рендерит его БЕЗ actions
// и проверяет ЧТЕНИЕ: источник виден, чужой текст выводится текстом, unmatched без нуля).
// Замер 100 мс степпера В БРАУЗЕРЕ остаётся E2E-после-MVP (спецификация, «Наследуемые
// сценарии»); ЗДЕСЬ проверяется, что действие ДОХОДИТ до маршрута правки, а не время.
//
// Задача N4 (замкнуть путь пользователя, дефект «после результата переходов нет вовсе»):
// добавлены ДВЕ главные кнопки — «в дневник» (`onGoToDiary`) и «поделиться» (`onShare`) — тем
// же приёмом: действия необязательны, компонент остаётся презентационным без них. `journeyNotice`
// — сообщение об отказе ЭТИХ двух действий (консент увёл бы страницу целиком, а не оставил
// заметку — заметка нужна для отказов, которые НЕ уводят: 404/409/сеть). Кнопка «к камере» —
// обычная ссылка, ВСЕГДА в разметке (пункт 5 задачи: возврат к камере с экрана результата),
// без действия и без сети — навигация браузера, не JS.
//
// Названия полей — snake_case НАМЕРЕННО: это ровно wire-форма ответа API
// (`packages/shared/src/domain/food.ts`, комментарий у `Snapshot`), а не внутреннее
// состояние компонента — дублировать её camelCase-версией значило бы завести ВТОРУЮ форму
// одного контракта, которая однажды разойдётся с первой молча.

import { useState } from 'react';

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
  /** Кадр экрана результата (FR-LOOK-007, DEC-A-050) — путь СВОЕГО origin
   * (`/api/v1/scans/{id}/photo`), не адрес хранилища напрямую: MinIO не публикует порт
   * наружу (`.claude/rules/docker-ports.md`), presigned-URL остаётся ВНУТРЕННИМ и байты
   * стримит сам `api` (`apps/api/src/routes/scans-photo.ts`, `apps/api/src/photo/photo-url.ts`
   * — там же история дефекта, найденного живой проверкой на развёрнутом стенде). `null` — ДВА
   * законных исхода: нормализации ещё не было, либо файл удалён по сроку 30 дней; в ОБОИХ
   * случаях блок фото не рисуется вовсе, а не пустой рамкой. `photo_url_expires_at` здесь не
   * читается (страница не перезапрашивает скан ради одного лишь истечения — следующий
   * поллинг/действие и так переиздаёт путь), но объявлен в типе, потому что ответ сервера
   * несёт оба поля вместе. */
  readonly photo_url: string | null;
  readonly photo_url_expires_at?: string | null;
}

export interface ReplaceCandidate {
  readonly food_item_id: string;
  readonly name_ru?: string;
  readonly name_en: string;
  readonly default_portion_g: number | null;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: number;
  readonly fat_per_100g: number;
  readonly carb_per_100g: number;
}

/**
 * Действия ОПЦИОНАЛЬНЫ: без них компонент остаётся ЧИСТО презентационным (совместимость с
 * существующим тестом рендера). Каждое действие — тонкая обёртка над
 * `POST /api/v1/scans/{id}/correct`, которую предоставляет вызывающая страница.
 */
export interface ScanResultActions {
  readonly onSetPortion?: (index: number, massG: number) => void | Promise<void>;
  readonly onDelete?: (index: number) => void | Promise<void>;
  readonly onSearchReplace?: (query: string) => Promise<readonly ReplaceCandidate[]>;
  readonly onReplace?: (index: number, foodItemId: string) => void | Promise<void>;
  readonly onResolveConflict?: () => void | Promise<void>;
  /** «В дневник» — CJM E (задача N4): при успехе страница сама уводит на экран дня, при
   * `403 consent_required` — на экран согласия. Компонент лишь вызывает и ждёт. */
  readonly onGoToDiary?: () => void | Promise<void>;
  /** «Поделиться» — CJM E, параллельная ветка (FR-GROWTH-001). Тоже может потребовать
   * согласия (карточка несёт состав блюда) — та же обработка, что у `onGoToDiary`. */
  readonly onShare?: () => void | Promise<void>;
}

// Условие использования CC0-данных USDA (ADR-005) и обещание продукта FR-SOURCE-002 —
// строка ОДНА, не переизобретается в компоненте. Отсутствие — красный тест (NFR-3).
export const USDA_ATTRIBUTION =
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov.';

const PORTION_MIN_G = 5;
const PORTION_MAX_G = 2000;

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

/** Степпер: шаг 10 г кнопками, 50 г — отдельными кнопками (RV-01: реализация действия;
 * жест «долгое нажатие» как таковой замеряется в браузере — E2E после MVP, здесь тот же
 * числовой эффект доступен кнопкой), плюс поле ручного ввода. Границы 5–2000 г — те же,
 * что и на сервере (FR-source-and-correct-9); клиентская проверка — удобство, а не
 * защита, сервер обязан переприменить их сам. */
function PortionStepper({ item, index, actions }: { readonly item: ResultItem; readonly index: number; readonly actions: ScanResultActions }) {
  const [manual, setManual] = useState(String(item.mass_g));
  const [pending, setPending] = useState(false);

  if (actions.onSetPortion === undefined) return null;

  const apply = (massG: number): void => {
    if (!Number.isInteger(massG) || massG < PORTION_MIN_G || massG > PORTION_MAX_G) return;
    setPending(true);
    Promise.resolve(actions.onSetPortion?.(index, massG)).finally(() => setPending(false));
  };

  return (
    <div className="stepper" aria-label="порция">
      <button type="button" onClick={() => apply(item.mass_g - 50)} disabled={pending} aria-label="минус 50 г">
        -50
      </button>
      <button type="button" onClick={() => apply(item.mass_g - 10)} disabled={pending} aria-label="минус 10 г">
        -10
      </button>
      <input
        type="number"
        className="stepper__input"
        value={manual}
        onChange={(event) => setManual(event.target.value)}
        aria-label="порция, г"
      />
      <button
        type="button"
        onClick={() => {
          const value = Number(manual);
          if (Number.isFinite(value)) apply(Math.trunc(value));
        }}
        disabled={pending}
      >
        применить
      </button>
      <button type="button" onClick={() => apply(item.mass_g + 10)} disabled={pending} aria-label="плюс 10 г">
        +10
      </button>
      <button type="button" onClick={() => apply(item.mass_g + 50)} disabled={pending} aria-label="плюс 50 г">
        +50
      </button>
    </div>
  );
}

/** Замена ингредиента: поиск встроен в маршрут правки (FR-source-and-correct-10) — до 20
 * кандидатов, человек выбирает, ВИДЯ числа. */
function ReplaceControl({ index, actions }: { readonly index: number; readonly actions: ScanResultActions }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<readonly ReplaceCandidate[]>([]);
  const [pending, setPending] = useState(false);

  if (actions.onSearchReplace === undefined || actions.onReplace === undefined) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="item__replace-open">
        заменить
      </button>
    );
  }

  return (
    <div className="replace" aria-label="замена ингредиента">
      <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="искать в базе…" aria-label="поиск замены" />
      <button
        type="button"
        disabled={pending || query.trim() === ''}
        onClick={() => {
          setPending(true);
          actions
            .onSearchReplace?.(query)
            .then(setCandidates)
            .finally(() => setPending(false));
        }}
      >
        искать
      </button>
      <ul className="replace__candidates">
        {candidates.map((candidate) => (
          <li key={candidate.food_item_id}>
            <button
              type="button"
              onClick={() => {
                setPending(true);
                Promise.resolve(actions.onReplace?.(index, candidate.food_item_id)).finally(() => {
                  setPending(false);
                  setOpen(false);
                });
              }}
              disabled={pending}
            >
              {candidate.name_ru ?? candidate.name_en} — {candidate.kcal_per_100g} ккал/100г
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen(false)}>
        отмена
      </button>
    </div>
  );
}

function ItemRow({ item, index, actions }: { readonly item: ResultItem; readonly index: number; readonly actions: ScanResultActions }) {
  const deleteButton =
    actions.onDelete !== undefined ? (
      <button type="button" className="item__delete" onClick={() => actions.onDelete?.(index)} aria-label="удалить позицию">
        удалить
      </button>
    ) : null;

  if (item.unmatched) {
    // Позиция без записи базы: пометка «нет в базе», БЕЗ числа — ноль не рисуется
    // (FR-source-and-correct-6, AC-source-and-correct-12).
    return (
      <li className="item item--unmatched">
        <span className="item__label">{item.label_ru}</span>
        <span className="item__badge">нет в базе</span>
        <ReplaceControl index={index} actions={actions} />
        {deleteButton}
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
          {item.parts.map((part, partIndex) => (
            <li key={`${part.foodItemId}-${partIndex}`}>
              <SourceChip snapshot={part.sourceSnapshot} massG={Math.round(item.mass_g * part.share)} />
            </li>
          ))}
        </ul>
        {deleteButton}
      </li>
    );
  }
  return (
    <li className="item">
      <span className="item__label">{item.label_ru}</span>
      <span className="item__kcal">{item.kcal} ккал</span>
      {item.source_snapshot !== null ? <SourceChip snapshot={item.source_snapshot} massG={item.mass_g} /> : null}
      <PortionStepper item={item} index={index} actions={actions} />
      <ReplaceControl index={index} actions={actions} />
      {deleteButton}
    </li>
  );
}

function DiscrepancyBanner({ scan, actions }: { readonly scan: ScanResultResponse; readonly actions: ScanResultActions }) {
  if (!scan.conflict_flag) return null;
  // «Взять из базы» — выбор ПО УМОЛЧАНИЮ (SC-US-004-1); тихое усреднение запрещено
  // (FR-source-and-correct-11). Вторая кнопка ведёт к правке и НЕ отправляется на
  // маршрут — по root `ResolveDiscrepancy` шаг 5 это возврат к set_portion/replace_item,
  // уже реализованным выше; отдельного обработчика у неё намеренно нет.
  return (
    <section className="discrepancy" aria-label="расхождение оценок">
      <p>
        Оценка по фото: <strong>{scan.model_estimate_kcal} ккал</strong> · Из базы:{' '}
        <strong>{scan.db_kcal_total} ккал</strong>
      </p>
      <div className="discrepancy__actions">
        <button
          type="button"
          className="discrepancy__default"
          aria-pressed={scan.conflict_choice === 'take_db'}
          onClick={() => actions.onResolveConflict?.()}
          disabled={actions.onResolveConflict === undefined}
        >
          взять из базы
        </button>
        <button type="button" className="discrepancy__secondary">
          уточнить состав
        </button>
      </div>
    </section>
  );
}

/** Кнопки главного пути (задача N4, пункт 1): «в дневник» и «поделиться», РАЗЛИЧИМЫ формой —
 * первая заливкой (главное действие пути), вторая акцентной обводкой. Каждая — своя ожидающая
 * кнопка: `pending` не общий на обе, иначе клик по одной блокировал бы вторую без причины. */
function JourneyActions({ actions, notice }: { readonly actions: ScanResultActions; readonly notice: string | null }) {
  const [pending, setPending] = useState<'diary' | 'share' | null>(null);
  if (actions.onGoToDiary === undefined && actions.onShare === undefined) return null;

  const run = (kind: 'diary' | 'share', handler: () => void | Promise<void>): void => {
    setPending(kind);
    Promise.resolve(handler()).finally(() => setPending(null));
  };

  return (
    <section className="result__journey" aria-label="дальнейшие действия">
      <div className="result__cta">
        {actions.onGoToDiary !== undefined ? (
          <button
            type="button"
            className="btn btn--primary btn--wide"
            disabled={pending !== null}
            onClick={() => run('diary', actions.onGoToDiary as () => void | Promise<void>)}
          >
            {pending === 'diary' ? 'сохраняем…' : 'в дневник'}
          </button>
        ) : null}
        {actions.onShare !== undefined ? (
          <button
            type="button"
            className="btn btn--accent btn--wide"
            disabled={pending !== null}
            onClick={() => run('share', actions.onShare as () => void | Promise<void>)}
          >
            {pending === 'share' ? 'готовим…' : 'поделиться'}
          </button>
        ) : null}
      </div>
      {notice !== null ? (
        <p className="result__notice" role="alert">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

export function ScanResultScreen({
  scan,
  actions = {},
  journeyNotice = null,
}: {
  readonly scan: ScanResultResponse;
  readonly actions?: ScanResultActions;
  /** Отказ «в дневник»/«поделиться», который НЕ увёл со страницы (404/409/сеть) — консент
   * уводит целиком (см. страницу маршрута), заметки не требует. */
  readonly journeyNotice?: string | null;
}) {
  return (
    <main className="result">
      {/* Кадр (FR-LOOK-007, DEC-A-050) — над плитками чисел, `null` вообще не рисуется
          (см. `ScanResultResponse.photo_url`). Подписи ингредиентов ПОВЕРХ фото НЕ
          рисуются намеренно (осознанный пропуск части FR-LOOK-007, см. квитанцию): у нас
          нет координат позиций на кадре, рисовать их наугад значило бы показать выдуманное
          (`.claude/rules/fail-closed-defaults.md`). */}
      {scan.photo_url !== null ? (
        <div className="result__photo">
          <img src={scan.photo_url} alt="фото блюда со скана" />
        </div>
      ) : null}

      <section className="result__tiles" aria-label="итог">
        <div className="tile tile--kcal">
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

      <DiscrepancyBanner scan={scan} actions={actions} />

      <JourneyActions actions={actions} notice={journeyNotice} />

      <ul className="result__items">
        {scan.items.map((item, index) => (
          <ItemRow key={`${item.label_ru}-${index}`} item={item} index={index} actions={actions} />
        ))}
      </ul>

      {/* Возврат к камере (задача N4, пункт 5) — обычная ссылка, не действие: работает без
          JS и без сетевого вызова, тот же приём навигации, что и остальная фича (переходы —
          не через роутер-библиотеку). */}
      <a href="/" className="btn btn--ghost btn--wide result__back">
        к камере
      </a>
    </main>
  );
}
