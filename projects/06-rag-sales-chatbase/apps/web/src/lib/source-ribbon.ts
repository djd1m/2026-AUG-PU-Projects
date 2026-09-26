// из N5: projects/05-podcast-clips-opus/apps/web/src/lib/progress-ribbon.ts (фича 29 N5) — адаптировано: стадии
// источника N6 вместо стадий видео; вид `silent` («нет ответа» ≥ 5 мин) и закрытый набор видов стадии перенесены
// без изменения смысла (long-running-job: молчание — НЕ «идёт»). Стадия отказа выводится из причины канона §4, а не
// из последней попытки (у index_job стадия не хранится).
//
// Три стадии по пути задачи индексации (ADR-009): Очередь (queued) → Чтение (страницы сайта / разбор PDF) →
// Фрагменты (нарезка и эмбеддинги). Воркер ведёт страницу целиком (прочитал → нарезал → записал), поэтому
// «Фрагменты» идут, как только появился первый фрагмент, а счётчик страниц продолжает расти.
export type SourceStage = 'queue' | 'read' | 'index';
export const SOURCE_STAGES: readonly { key: SourceStage; label: string }[] = [
  { key: 'queue', label: 'Очередь' }, { key: 'read', label: 'Чтение' }, { key: 'index', label: 'Фрагменты' },
];
export type StepView = 'done' | 'running' | 'silent' | 'failed' | 'pending';
export type RibbonTone = 'running' | 'success' | 'failure' | 'silent';
export interface RibbonStep { key: SourceStage; label: string; view: StepView; detail: string | null }
export interface Ribbon { tone: RibbonTone; steps: RibbonStep[] }
export const STEP_STATE_TEXT: Record<StepView, string> = {
  done: 'сделано', running: 'идёт', silent: 'нет ответа', failed: 'отказ', pending: 'впереди',
};

export interface RibbonJob {
  state: 'running' | 'done' | 'failed' | 'no_response'; queued: boolean;
  pages_done: number; pages_total: number | null; chunks_done: number; reason?: string;
}
// Причины, случающиеся ДО первого фрагмента (чтение источника), и ПОСЛЕ (эмбеддинги). Неизвестная — по прогрессу.
const READ_REASONS = new Set(['robots_disallowed', 'unreachable', 'blocked_address', 'no_text', 'not_pdf', 'too_large', 'no_text_layer']);
const INDEX_REASONS = new Set(['quota_refused', 'embedding_unavailable']);

export function ribbonOf(job: RibbonJob | null, kind: 'site' | 'pdf'): Ribbon {
  // Источник без задачи — непоследовательное состояние: не «идёт», а «нет ответа».
  if (!job) return { tone: 'silent', steps: SOURCE_STAGES.map((s, i) => ({ ...s, view: i === 0 ? 'silent' : 'pending', detail: null })) };
  const success = job.state === 'done', failure = job.state === 'failed';
  const tone: RibbonTone = success ? 'success' : failure ? 'failure' : job.state === 'no_response' ? 'silent' : 'running';
  const progressed: SourceStage = job.chunks_done > 0 ? 'index' : 'read';
  const current: SourceStage | null = success ? null
    : failure ? (READ_REASONS.has(job.reason ?? '') ? 'read' : INDEX_REASONS.has(job.reason ?? '') ? 'index' : progressed)
    : job.queued ? 'queue' : progressed;
  const currentIndex = current === null ? SOURCE_STAGES.length : SOURCE_STAGES.findIndex((s) => s.key === current);
  const currentView: StepView = tone === 'failure' ? 'failed' : tone === 'silent' ? 'silent' : 'running';
  const pages = kind === 'pdf' ? 'стр. PDF' : 'страниц';
  // Пока задача жива и страниц прочитано меньше известного итога, «Чтение» не «сделано», даже если фрагменты уже идут.
  const readingOn = !success && !failure && current === 'index' && !(job.pages_total !== null && job.pages_done >= job.pages_total);
  return { tone, steps: SOURCE_STAGES.map((stage, index) => {
    let view: StepView = index < currentIndex ? 'done' : index === currentIndex ? currentView : 'pending';
    if (stage.key === 'read' && readingOn) view = currentView;
    let detail: string | null = null;
    if (stage.key === 'read' && view !== 'pending' && job.pages_done > 0) {
      detail = job.pages_total ? `${job.pages_done} из ${job.pages_total} ${pages}` : `${job.pages_done} ${pages}`;
    }
    if (stage.key === 'index' && view !== 'pending' && job.chunks_done > 0) detail = `${job.chunks_done} фрагм.`;
    return { key: stage.key, label: stage.label, view, detail };
  }) };
}
