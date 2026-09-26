// из N1: projects/01-testimonials-senja/apps/widget/src/badge.ts — перенесено: чистая классификация видимости,
// восстановление через MutationObserver + интервал, честная граница механизма. Адаптировано: текст «Работает на
// Суфлёре», ссылка `/?from=<домен>&utm_source=badge` строится СЕРВЕРОМ (badge_href); у донора пересозданный бейдж
// терял ссылку (renderBadge без badgeUrl в ветке 'missing') — здесь href передаётся при каждом восстановлении;
// + `badgeIntact` — ворота поля вопроса (ADR-004: «без бейджа поле вопроса блокируется»).
//
// ЧЕСТНАЯ ГРАНИЦА (ADR-004, донор ADR-002): детектируется и чинится вмешательство в САМ узел бейджа внутри
// теневого корня — удаление, `display:none`/`visibility:hidden`/`opacity:0`/`hidden`, в том числе правилом, которое
// скрипт хозяина вписал в НАШ корень (корень открыт). НЕ детектируется скрытие узла-хозяина или его предков стилями
// хозяина СНАРУЖИ корня: MutationObserver не пересекает границу теневого дерева наружу, а инлайн-стиль бейджа не
// перебивает `display:none` предка. Это закрывается условием оферты, не кодом (FR-TARIFF-001).
//
// Инлайн-стиль бейджа ставится через CSSOM (`style.setProperty`) — это НЕ style-атрибут разметки и не требует
// `unsafe-inline` в CSP хозяина (FR-WIDGET-003); `setAttribute('style', …)` здесь запрещён стражем исходника.

export const BADGE_CLASS = 'n6-badge';
export const BADGE_TEXT = 'Работает на Суфлёре';
const RESTORE_INTERVAL_MS = 2000;

export type BadgeVisibilityVerdict = 'ok' | 'hidden-direct' | 'zero-size-ancestor' | 'missing';
export interface BadgeStyleSnapshot { display: string; visibility: string; opacity: string; hidden: boolean; offsetWidth: number; offsetHeight: number }

export function classifyBadgeVisibility(snap: BadgeStyleSnapshot | null): BadgeVisibilityVerdict {
  if (snap === null) return 'missing';
  if (snap.hidden || snap.display === 'none' || snap.visibility === 'hidden' || snap.opacity === '0') return 'hidden-direct';
  if (snap.offsetWidth === 0 && snap.offsetHeight === 0) return 'zero-size-ancestor';
  return 'ok';
}

function snapshotOf(node: HTMLElement): BadgeStyleSnapshot {
  const computed = getComputedStyle(node);
  return {
    display: node.style.display || computed.display, visibility: node.style.visibility || computed.visibility,
    opacity: node.style.opacity || computed.opacity, hidden: node.hidden, offsetWidth: node.offsetWidth, offsetHeight: node.offsetHeight,
  };
}

function forceVisible(node: HTMLElement): void {
  node.style.setProperty('display', 'inline-flex', 'important');
  node.style.setProperty('visibility', 'visible', 'important');
  node.style.setProperty('opacity', '1', 'important');
  node.hidden = false;
}

export interface BadgeOptions { href: string; onClick: () => void }

function createBadge(options: BadgeOptions): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = BADGE_CLASS;
  a.target = '_blank';
  a.rel = 'noopener nofollow';
  a.textContent = BADGE_TEXT;   // статичная строка, не ввод
  if (/^https?:\/\//i.test(options.href)) a.href = options.href;
  a.addEventListener('click', () => options.onClick());
  return a;
}

// Бейдж рисуется ТОЛЬКО по решению сервера: required=false — слот пуст, required=true — ссылка. Своей логики
// «если free» у клиента нет (ADR-004).
export function renderBadge(slot: HTMLElement, required: boolean, options: BadgeOptions): void {
  slot.replaceChildren();
  if (required) slot.appendChild(createBadge(options));
}

export function checkAndRestore(root: ShadowRoot, slot: HTMLElement, options: BadgeOptions, log: (name: string) => void = () => {}): BadgeVisibilityVerdict {
  const node = root.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  const verdict = classifyBadgeVisibility(node ? snapshotOf(node) : null);
  if (verdict === 'missing') {
    // Слот мог быть удалён вместе с бейджем — тогда бейдж возвращается в сохранённый слот, а слот на место.
    if (!slot.isConnected) root.querySelector('.n6-foot')?.appendChild(slot);
    renderBadge(slot, true, options);
    log('badge_hide_attempt_blocked');
  } else if (verdict === 'hidden-direct') {
    forceVisible(node as HTMLElement);
    log('badge_hide_attempt_blocked');
  } else if (verdict === 'zero-size-ancestor') {
    log('badge_zero_size_detected_possible_ancestor_hide');   // не чиним: граница механизма (заголовок файла)
  }
  return verdict;
}

// Ворота поля вопроса: вопрос уходит, только если бейдж на месте и виден. Скрытый — восстанавливается, а ЭТОТ
// вопрос не отправляется (посетитель нажмёт ещё раз уже при видимом бейдже).
export function badgeIntact(root: ShadowRoot, slot: HTMLElement, options: BadgeOptions): boolean {
  return checkAndRestore(root, slot, options) === 'ok';
}

export interface BadgeWatch { stop(): void }
export function startBadgeWatch(root: ShadowRoot, slot: HTMLElement, options: BadgeOptions, log?: (name: string) => void): BadgeWatch {
  const tick = () => { checkAndRestore(root, slot, options, log); };
  const observer = new MutationObserver(tick);
  observer.observe(root, { attributes: true, childList: true, subtree: true });
  const interval = setInterval(tick, RESTORE_INTERVAL_MS);
  return { stop() { observer.disconnect(); clearInterval(interval); } };
}
