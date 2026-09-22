import { authorizeSelection, acceptSelection, failSelection, type Attempt, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import { validateFragments, FragmentSchemaError } from '@clipmaker/shared/fragments';
import { SelectionProviderError, type Selector } from '../llm/provider.js';
import { recordSelectionSpend, type SelectionSpend } from '../llm/spend.js';
interface Dependencies {
  pool: Pool; limits: Limits; selector: Selector; model: string; spendPath: string;
  enqueue: (attempt: Attempt) => Promise<void>;
  spend?: typeof recordSelectionSpend;
}
export async function selectFragments(attempt: Attempt, deps: Dependencies) {
  const input = await authorizeSelection(deps.pool, attempt, deps.limits, deps.model);
  if (!input) return;
  const spend = deps.spend ?? recordSelectionSpend;
  const event: SelectionSpend = { video_id: attempt.video_id, fence: attempt.fence, series_no: attempt.series_no,
    model: deps.model, provider: 'openrouter', stage: 'select', unit: 'calls', quantity: 1, phase: 'attempt', result: 'started' };
  let fragments;
  try {
    await spend(deps.spendPath, event);
    const response = await deps.selector.select(input.transcript, input.duration, new AbortController().signal);
    fragments = validateFragments(response, input.transcript, input.duration);
    await spend(deps.spendPath, { ...event, phase: 'outcome', result: fragments.length ? 'success' : 'no_fragments' });
  } catch (error) {
    const outcome = error instanceof FragmentSchemaError ? 'schema_violation' :
      error instanceof SelectionProviderError ? error.outcome : 'provider_error';
    await failSelection(deps.pool, attempt, outcome === 'schema_violation' ? 'schema_violation' : 'stalled');
    await spend(deps.spendPath, { ...event, phase: 'outcome', result: outcome });
    throw error;
  }
  if (!fragments.length) { await failSelection(deps.pool, attempt, 'no_fragments'); return; }
  const jobs = await acceptSelection(deps.pool, attempt, fragments);
  // Committed attempts are the outbox; watchdog recovers any Redis publish loss.
  for (const job of jobs ?? []) {
    try { await deps.enqueue(job); } catch { console.error('Рендер сохранён; сторож восстановит доставку задания'); }
  }
}
