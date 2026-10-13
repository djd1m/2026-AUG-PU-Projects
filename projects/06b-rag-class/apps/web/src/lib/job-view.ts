// Что видит владелец в каждом из трёх состояний задачи (SC-US-004-1…3, long-running-job.md «Три состояния, не два»).
// Чистая функция: экран строится только отсюда, поэтому три состояния различимы по построению и проверяются юнит-тестом.
// Неизвестное состояние — не «готово» и не вечный прогресс: отказ с причиной (honest-configuration CFG-I3).
// «Индексация: страниц N из M» — форма подписи из Specification SC-US-004-1 («страниц:» как заголовок счётчика), не
// согласуется с числом намеренно; «Готово: …» — число со словом, поэтому склоняется (08_review.md F-6).

export interface JobPayload {
  readonly job_id: string;
  readonly state: unknown;
  readonly progress_done: number;
  readonly progress_total: number | null;
  readonly fragments: number;
  readonly error: string | null;
  readonly note: string | null;
}

export type JobAction = { readonly kind: 'retry'; readonly label: 'Повторить' }
  | { readonly kind: 'sandbox'; readonly label: 'Спросить в песочнице' };

export interface JobScreen {
  readonly kind: 'running' | 'succeeded' | 'failed';
  readonly title: string;
  readonly detail: string | null;
  readonly action: JobAction | null;
  /** Пока задача жива, кнопки добавления источника и повтора погашены (третья копия работы не стартует). */
  readonly live: boolean;
}

/**
 * Форма слова при числе по-русски: 1 страница, 2 страницы, 5 страниц; 11–14 — всегда «много» (11 страниц), 21 — «одна»,
 * 111 — «много». Нецелое или отрицательное число — отказ: склонять нечего, а «правдоподобная» форма скрыла бы мусор.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`склонение: число ${String(n)} не целое ≥ 0`);
  const tens = n % 100;
  const last = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const pages = (n: number) => `${n} ${plural(n, 'страница', 'страницы', 'страниц')}`;
const fragments = (n: number) => `${n} ${plural(n, 'фрагмент', 'фрагмента', 'фрагментов')}`;

export function jobScreen(job: JobPayload): JobScreen {
  switch (job.state) {
    case 'running':
      return { kind: 'running', live: true, action: null, detail: null,
        title: job.progress_total === null
          ? `Индексация: страниц ${job.progress_done}, всего пока неизвестно`
          : `Индексация: страниц ${job.progress_done} из ${job.progress_total}` };
    case 'succeeded':
      return { kind: 'succeeded', live: false, detail: job.note,
        title: `Готово: ${pages(job.progress_done)}, ${fragments(job.fragments)}`,
        action: { kind: 'sandbox', label: 'Спросить в песочнице' } };
    case 'failed':
      return { kind: 'failed', live: false, detail: null,
        title: `Не удалось: ${job.error ?? 'причина не записана'}`, action: { kind: 'retry', label: 'Повторить' } };
    default:
      return { kind: 'failed', live: false, detail: null, action: null,
        title: 'Состояние задачи не распознано — обновите страницу' };
  }
}
