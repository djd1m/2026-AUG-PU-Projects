import type { VideoScreen, RibbonStage } from './screen-contract';

/** Лента стадий экрана записи (фича 29). Закрытый набор из четырёх стадий по статусам `video` канона §4:
 *  Загрузка = {uploading, queued}, Расшифровка = transcribing, Выбор = selecting, Монтаж = rendering. */
export const RIBBON_STAGES: readonly { key: RibbonStage; label: string }[] = [
  { key: 'upload', label: 'Загрузка' }, { key: 'transcribe', label: 'Расшифровка' },
  { key: 'select', label: 'Выбор' }, { key: 'render', label: 'Монтаж' },
];
/** Вид стадии. `silent` — молчание ≥ 5 мин по `updated_at`: это НЕ «идёт» (long-running-job). */
export type StepView = 'done' | 'running' | 'silent' | 'failed' | 'pending';
export type RibbonTone = 'running' | 'success' | 'failure' | 'silent';
export interface RibbonStep { key: RibbonStage; label: string; view: StepView; detail: string | null }
export interface Ribbon { tone: RibbonTone; steps: RibbonStep[] }

export const STEP_STATE_TEXT: Record<StepView, string> = {
  done: 'сделано', running: 'идёт', silent: 'нет ответа', failed: 'отказ', pending: 'впереди',
};
const STATUS_STAGE: Record<Exclude<VideoScreen['status'], 'done' | 'failed'>, RibbonStage> = {
  uploading: 'upload', queued: 'upload', transcribing: 'transcribe', selecting: 'select', rendering: 'render',
};

export function ribbonOf(video: VideoScreen): Ribbon {
  const failure = video.user_state === 'отказ', success = video.user_state === 'успех';
  const tone: RibbonTone = failure ? 'failure' : success ? 'success' : video.no_response ? 'silent' : 'running';
  // Стадия отказа — из последней попытки (A-2609-01): `video.status='failed'` исходную стадию не хранит.
  // Без попыток (или неизвестное значение) — «Загрузка»: отказ до первой попытки случается только там.
  const current: RibbonStage | null = success ? null
    : failure ? (video.failed_stage ?? 'upload')
    : STATUS_STAGE[video.status as keyof typeof STATUS_STAGE] ?? 'upload';
  const currentIndex = current === null ? RIBBON_STAGES.length : RIBBON_STAGES.findIndex(s => s.key === current);
  const currentView: StepView = tone === 'failure' ? 'failed' : tone === 'silent' ? 'silent' : 'running';
  return { tone, steps: RIBBON_STAGES.map((stage, index) => {
    const view: StepView = index < currentIndex ? 'done' : index === currentIndex ? currentView : 'pending';
    // «N из M» — только у идущего Монтажа: у остальных стадий счётчика нет (stage_progress там null).
    const detail = view === 'running' && stage.key === 'render' && video.clips_total > 0 ? `${video.clips_done} из ${video.clips_total}` : null;
    return { key: stage.key, label: stage.label, view, detail };
  }) };
}
