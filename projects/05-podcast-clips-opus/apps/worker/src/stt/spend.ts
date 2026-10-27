import { open } from 'node:fs/promises';
import type { SttExecutionProvider } from '@clipmaker/shared/config';
export interface SpendEvent {
  video_id: string; fence: number; stage: 'stt'; chunk_index: number; attempt: number;
  unit: 'seconds'; quantity: number; result: 'started' | 'success' | 'timeout' | 'provider_error' | 'no_timestamps';
  phase: 'attempt' | 'outcome'; provider?: SttExecutionProvider; model?: string;
}
// Count phase=attempt only. An outcome shares its (video,fence,chunk,attempt)
// identity; an interrupted call remains started/unknown, never disappears.
export async function recordModelSpend(path: string, event: SpendEvent): Promise<void> {
  const file = await open(path, 'a', 0o600);
  try { await file.writeFile(JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n'); await file.sync(); }
  finally { await file.close(); }
}
