// src/badge.ts
//
// Источник истины: docs/Pseudocode.md §5.2 (`startBadgeIntegrityWatch`, `checkAndRestore`),
// docs/ADR.md ADR-002, docs/Specification.md FR-GROWTH-003 (@security сценарии),
// .claude/rules/security.md §6.
//
// ============================================================================================
// ЧЕСТНАЯ ГРАНИЦА МЕХАНИЗМА — читать перед тем, как менять этот файл (ADR-002 "Последствия"):
//
//   ДЕТЕКТИРУЕТСЯ И ЧИНИТСЯ: точечное вмешательство в САМ узел badge (`.pw-badge`) — прямое
//   `display:none`/`visibility:hidden`/`opacity:0` на нём, либо удаление узла из shadow-дерева
//   целиком. Это возможно детектировать, потому что shadow-root открыт (`{mode:'open'}`,
//   ADR-001) — скрипт хоста технически способен дотянуться `element.shadowRoot
//   .querySelector('.pw-badge')` и поменять стиль напрямую или удалить узел; наш
//   `MutationObserver`, наблюдающий тот же shadow-root, видит эту мутацию и отменяет её.
//
//   НЕ ДЕТЕКТИРУЕТСЯ (архитектурная граница ADR-001, не пробел в этой функции): скрытие
//   РОДИТЕЛЬСКОГО контейнера целиком — например, `display:none` на элементе-обёртке в light DOM
//   СНАРУЖИ shadow-root (сам "shadow host", т.е. mount-элемент, или что-то ещё выше него).
//   `MutationObserver.observe(shadowRoot, {subtree:true})` физически не пересекает границу
//   shadow-дерева наружу — он не видит мутаций на предках. `computedStyle` на `.pw-badge` в этом
//   случае честно вернёт `display != "none"` (у самого узла стиль не менялся), а
//   `offsetWidth`/`offsetHeight` обнулятся из-за схлопывания предка. Инлайн-стиль на самом badge
//   (`forceVisibleStyles`) здесь НИЧЕГО не чинит — он не может перебить `display:none` на
//   элементе выше по дереву, это ограничение каскада CSS, а не пробел в коде. Мы сознательно
//   НЕ пытаемся "дотянуться" до DOM хоста выше собственного shadow-root — только фиксируем факт
//   для наблюдаемости (`logClientEvent`), без попытки восстановления. Остаточный риск закрывается
//   условиями оферты (ToS), а не кодом (ADR-002 "Последствия",
//   `[GAP: продуктовый текст ToS про запрет скрытия виджета — вне scope архитектуры]`).
//
// Решающая логика вынесена в чистую функцию `classifyBadgeVisibility` намеренно: jsdom (среда
// unit/integration-тестов этого пакета) не считает реальный layout, поэтому `offsetWidth`/
// `offsetHeight` на любых узлах в тестах всегда равны 0 независимо от видимости — тестировать
// "родительский hide" через настоящий DOM в jsdom означало бы либо ничего не проверять, либо
// незаметно соврать себе, что сценарий покрыт. Чистая функция тестируется синтетическими
// значениями снапшота — это честно показывает, что покрыто здесь (решающая логика), а что нет
// (реальный layout — требует браузерного E2E, см. tests/badge-integrity.test.ts и
// .claude/rules/testing.md §2, вне scope этого unit-уровня).
// ============================================================================================

export const BADGE_CLASS = 'pw-badge';
const BADGE_SLOT_SELECTOR = '.pw-badge-slot';
const RESTORE_INTERVAL_MS = 2000; // Pseudocode §5.2: "подстраховка без MutationObserver-триггера"

export type BadgeVisibilityVerdict = 'ok' | 'hidden-direct' | 'zero-size-ancestor' | 'missing';

export interface BadgeStyleSnapshot {
  display: string;
  visibility: string;
  opacity: string;
  offsetWidth: number;
  offsetHeight: number;
}

export type BadgeClickHandler = (event: MouseEvent) => void;
export type ClientEventLogger = (name: string) => void;

/**
 * Чистая функция классификации видимости — без обращения к DOM. См. разбор границы механизма
 * в заголовке файла.
 */
export function classifyBadgeVisibility(snap: BadgeStyleSnapshot | null): BadgeVisibilityVerdict {
  if (snap === null) return 'missing';
  const isHiddenDirectly =
    snap.display === 'none' || snap.visibility === 'hidden' || snap.opacity === '0';
  if (isHiddenDirectly) return 'hidden-direct';
  const hasZeroSize = snap.offsetWidth === 0 && snap.offsetHeight === 0;
  if (hasZeroSize) return 'zero-size-ancestor';
  return 'ok';
}

function snapshotOf(node: HTMLElement): BadgeStyleSnapshot {
  const style = getComputedStyle(node);
  return {
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    offsetWidth: node.offsetWidth,
    offsetHeight: node.offsetHeight,
  };
}

/**
 * !important в инлайн-стиле перебивает точечную попытку скрыть САМ узел. Не властен над
 * `display:none` на предке снаружи shadow-root — см. заголовок файла.
 */
function forceVisibleStyles(node: HTMLElement): void {
  node.style.setProperty('display', 'inline-flex', 'important');
  node.style.setProperty('visibility', 'visible', 'important');
  node.style.setProperty('opacity', '1', 'important');
}

function createBadgeNode(onClick: BadgeClickHandler): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = BADGE_CLASS;
  a.target = '_blank';
  a.rel = 'noopener noreferrer nofollow';
  a.textContent = 'Powered by Proofwall'; // статичная строка — не пользовательский ввод
  a.addEventListener('click', onClick);
  return a;
}

/**
 * Pseudocode.md §3/§5.2 `renderBadge(host, badge_required)`. `badge_required` — решение
 * сервера (ADR-002/FR-GROWTH-003): виджет безусловно рендерит badge при `true` и безусловно не
 * рендерит при `false`, без собственной логики "если free — показать".
 */
export function renderBadge(root: ShadowRoot, badgeRequired: boolean, onClick: BadgeClickHandler): void {
  const slot = root.querySelector<HTMLElement>(BADGE_SLOT_SELECTOR);
  if (!slot) return;
  slot.replaceChildren();
  if (!badgeRequired) return;
  slot.appendChild(createBadgeNode(onClick));
}

export interface BadgeWatchHandle {
  stop(): void;
}

/**
 * Pseudocode.md §5.2 `startBadgeIntegrityWatch`. Наблюдает `root` (ShadowRoot) — по построению
 * не может увидеть изменения на предке в light DOM хоста (см. заголовок файла).
 */
export function startBadgeIntegrityWatch(
  root: ShadowRoot,
  badgeRequired: boolean,
  onClick: BadgeClickHandler,
  logClientEvent: ClientEventLogger = () => {},
): BadgeWatchHandle {
  if (!badgeRequired) {
    return { stop() {} }; // paid — badge не рендерится, следить не за чем
  }

  const tick = () => checkAndRestore(root, badgeRequired, onClick, logClientEvent);

  const observer = new MutationObserver(tick);
  observer.observe(root, { attributes: true, childList: true, subtree: true });
  const interval = setInterval(tick, RESTORE_INTERVAL_MS);

  return {
    stop() {
      observer.disconnect();
      clearInterval(interval);
    },
  };
}

/** Pseudocode.md §5.2 `checkAndRestore(badgeNode)` — см. разбор границы механизма вверху файла. */
export function checkAndRestore(
  root: ShadowRoot,
  badgeRequired: boolean,
  onClick: BadgeClickHandler,
  logClientEvent: ClientEventLogger = () => {},
): void {
  if (!badgeRequired) return;

  const node = root.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  const verdict = classifyBadgeVisibility(node ? snapshotOf(node) : null);

  switch (verdict) {
    case 'missing':
      renderBadge(root, true, onClick); // recreateBadgeNode()
      logClientEvent('badge_hide_attempt_blocked');
      return;
    case 'hidden-direct':
      forceVisibleStyles(node as HTMLElement);
      logClientEvent('badge_hide_attempt_blocked');
      return;
    case 'zero-size-ancestor':
      // НЕ чиним (см. заголовок файла). Только лог, без изменения DOM — поэтому повторные тики
      // не накапливают состояние и не создают восстановительный цикл (Refinement.md §3.1).
      logClientEvent('badge_zero_size_detected_possible_ancestor_hide');
      return;
    case 'ok':
      return;
  }
}
