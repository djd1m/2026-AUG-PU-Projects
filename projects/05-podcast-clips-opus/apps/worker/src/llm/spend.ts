import { open } from 'node:fs/promises';
export interface SelectionSpend {
  video_id: string; fence: number; series_no: number; model: string; provider: 'openrouter';
  stage: 'select'; unit: 'calls'; quantity: 1; phase: 'attempt' | 'outcome';
  result: 'started' | 'success' | 'timeout' | 'provider_error' | 'schema_violation' | 'no_fragments';
}
// Only phase=attempt is a billable count. Write and fsync BEFORE dispatch so an
// interrupted request remains counted; outcomes never erase failed attempts.
export async function recordSelectionSpend(path: string, event: SelectionSpend) {
  const file = await open(path, 'a', 0o600);
  try { await file.writeFile(JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n'); await file.sync(); }
  finally { await file.close(); }
}
