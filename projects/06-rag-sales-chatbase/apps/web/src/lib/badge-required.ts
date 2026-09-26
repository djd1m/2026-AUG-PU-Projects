// BadgeRequired (Pseudocode; FR-TARIFF-001, FR-GROWTH-003, ADR-004) и ссылка бейджа.
// из N1: projects/01-testimonials-senja/apps/web/src/lib/tariff.ts (badgeRequiredFor) — адаптировано: тариф N1
// `paid` со сроком → три плана N6 без срока (оплаты в неделю нет, план назначает оператор, ADR-017); принцип тот же:
// функция получает ТОЛЬКО значение из БД, параметра от клиента у неё нет, и всё, что не РОВНО `nobadge` или
// `studio`, получает бейдж. Никаких trim/toLowerCase: нормализация превращает опечатку `'NOBADGE'` в снятый бейдж.
export function badgeRequired(planFromDatabase: unknown): boolean {
  return !(planFromDatabase === 'nobadge' || planFromDatabase === 'studio');
}

// из N1: projects/01-testimonials-senja/apps/web/src/lib/badge.ts (buildBadgeUrl) — адаптировано: канон §7
// `/?from=<домен хозяина>&utm_source=badge`; домен — hostname origin, ПРОШЕДШЕГО CheckOrigin (не ввод клиента).
export function badgeHref(publicOrigin: string, hostOrigin: string): string {
  const url = new URL('/', new URL(publicOrigin).origin);
  url.searchParams.set('from', new URL(hostOrigin).hostname);
  url.searchParams.set('utm_source', 'badge');
  return url.href;
}
