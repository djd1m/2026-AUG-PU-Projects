import { z } from 'zod';
import { MAX_UPLOAD_BYTES, quotaResetAt } from '@clipmaker/shared/upload';
import type { QuotaScope } from '@clipmaker/shared/enums';
export const createVideoSchema = z.object({ declared_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  filename: z.string().trim().min(1).max(255).refine((s) => !/[\x00-\x1f/\\]/.test(s)), source: z.literal('upload') }).strict();
export const completeUploadSchema = z.object({ video_id: z.string().uuid(),
  parts: z.array(z.object({ part_number: z.number().int().min(1).max(10000), etag: z.string().min(1).max(256) }).strict()).min(1).max(200),
}).strict().refine((input) => {
  const sorted = input.parts.map((p) => p.part_number).sort((a, b) => a - b);
  return sorted.every((number, index) => number === index + 1);
}, 'Номера частей должны идти подряд без повторов');
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export class UploadError extends Error {
  constructor(readonly code: 'invalid' | 'not_found' | 'conflict' | 'refused' | 'unavailable',
    message: string, readonly status: number, readonly details: Record<string, unknown> = {}) { super(message); }
}
const quotaMessages = { user_uploads: 'Загрузки на сегодня исчерпаны', user_minutes: 'Минуты на сегодня исчерпаны',
  user_llm: 'Обработки на сегодня исчерпаны', global_minutes: 'Общий суточный объём исчерпан',
  global_llm: 'Общий суточный лимит обработок исчерпан' };
export function quotaError(scope: QuotaScope, now: Date) {
  const visible = scope === 'user_upload_refunds' ? 'user_uploads' : scope;
  return new UploadError('refused', quotaMessages[visible], 429, { scope: visible, resets_at: quotaResetAt(now) });
}
