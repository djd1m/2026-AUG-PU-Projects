import { quotaMessages } from './limits-contract';
import { z } from 'zod';
import type { VideoStatus, VideoFailureReason, ClipStatus } from '@clipmaker/shared/enums';

export const failureMessages = {
  too_large: 'Файл больше 2 ГБ.', not_media: 'Формат файла не поддерживается.',
  no_audio: 'В записи нет звуковой дорожки.', too_short: 'Запись короче двух минут.',
  too_long: 'Запись длиннее 90 минут.', probe_timeout: 'Не удалось прочитать свойства файла.',
  stt_failed: 'Не удалось расшифровать речь.', no_timestamps: 'Не удалось определить время слов.',
  no_fragments: 'Самодостаточных фрагментов не найдено.', schema_violation: 'Не удалось проверить выбранные фрагменты.',
  refused_user_uploads: quotaMessages.user_uploads, refused_user_minutes: quotaMessages.user_minutes,
  refused_user_llm: quotaMessages.user_llm, refused_global_minutes: quotaMessages.global_minutes,
  refused_global_llm: quotaMessages.global_llm,
  stalled: 'Обработка перестала отвечать.', render_failed: 'Не удалось собрать клипы.',
} satisfies Record<VideoFailureReason, string>;
export interface VideoScreen {
  video_id: string; status: VideoStatus; created_at: string; updated_at: string;
  duration_seconds: number | null; user_state: 'выполняется' | 'успех' | 'отказ';
  stage_label: string; stage_progress: number | null; clips_done: number; clips_total: number;
  no_response: boolean; failure_reason: string | null; next_action: 'retry' | 'upload' | 'tomorrow' | null;
  retry_after: string | null; poll_after_seconds: 5;
}
const explanation = z.string().trim().min(1);
export const scoreSchema = z.object({
  score: z.number().int().min(0).max(99),
  components: z.object({ hook: z.number().int().min(0).max(33), completeness: z.number().int().min(0).max(33), length: z.number().int().min(0).max(33) }),
  explanations: z.object({ hook: explanation, completeness: explanation, length: explanation }),
}).refine(v => v.score === v.components.hook + v.components.completeness + v.components.length);
export type ClipScreen = {
  clip_id: string; index: number; start: number; end: number; title: string; status: ClipStatus;
  watermarked: boolean; expires_at: string | null; available: boolean;
} & Partial<z.infer<typeof scoreSchema>>;
