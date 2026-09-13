// Возврат с экрана согласия (ADR-009, «согласие — до первой записи в дневник, не при
// установке»): экран результата уводит на `/consent?return=<путь>` и ждёт назад. Вынесено в
// чистую функцию — решение «куда вести после решения» не требует DOM.
//
// `returnTo` приходит из query-параметра, то есть от значения, которое МЫ САМИ положили в адрес
// при переходе — но проверяется всё равно строго (`fail-closed-defaults`, CFG-I3): открытый
// адрес в query — это открытая дверь для редиректа на чужой домен, если её не сузить.
// Разрешён РОВНО один вид пути: начинается с одиночного `/`, не начинается с `//` (тот
// протокол-независимый вид браузер трактует как ссылку на другой хост — `//evil.example`).

const SAFE_RETURN_PATTERN = /^\/(?!\/)\S*$/;

export function isSafeReturnPath(value: string | null): value is string {
  return value !== null && SAFE_RETURN_PATTERN.test(value);
}

/**
 * `null` — «безопасного пути назначения нет», вызывающий обязан упасть на запасной переход
 * (`router.back()`): решение согласия принято, но вернуться содержательно некуда.
 * `grant` дописывает `consent=granted` — сигнал экрану-получателю повторить действие, ради
 * которого согласие спрашивалось (FR: «после согласия автоматически повторить подтверждение»).
 * `decline` возвращает БЕЗ этого сигнала — повторять нечего, отказ окончателен для этой попытки.
 */
export function resolveDecisionTarget(decision: 'grant' | 'decline', returnTo: string | null): string | null {
  if (!isSafeReturnPath(returnTo)) return null;
  if (decision === 'decline') return returnTo;
  const separator = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${separator}consent=granted`;
}

/** Обратная операция — строит `/consent?return=...` со страницы результата. `intent` — что
 * повторить после согласия («diary» либо «share»), несётся ВНУТРИ самого `returnTo` (одно поле
 * вместо двух независимых параметров, которые могли бы разойтись). */
export function buildConsentUrl(returnTo: string): string {
  return `/consent?return=${encodeURIComponent(returnTo)}`;
}
