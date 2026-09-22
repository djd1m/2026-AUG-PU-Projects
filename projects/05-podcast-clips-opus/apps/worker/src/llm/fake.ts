import type { Fragment } from '@clipmaker/shared/fragments';
import { SelectionProviderError, type Selector } from './provider.js';
export type FakeCase = 'valid' | 'few' | 'empty' | 'excess' | 'score' | 'explanation' | 'length' | '5xx' | 'timeout';
export const fakeFragment = (index = 0): Fragment => ({ start_seconds: index * 30, end_seconds: index * 30 + 25,
  title: 'Самостоятельная мысль', score: 75, score_hook: 25, score_completeness: 25, score_length: 25,
  explain_hook: 'Начинается с вопроса', explain_completeness: 'Мысль закончена', explain_length: 'Длина подходит' });
export function createFakeSelector(scenario: FakeCase = 'valid'): Selector {
  return { async select(_transcript, _duration, signal) {
    signal.throwIfAborted();
    if (scenario === '5xx' || scenario === 'timeout') throw new SelectionProviderError(scenario === '5xx' ? 'provider_error' : 'timeout');
    const fragments = Array.from({ length: scenario === 'excess' ? 10 : scenario === 'empty' ? 0 : scenario === 'few' ? 2 : 3 }, (_, i) => fakeFragment(i));
    if (scenario === 'score') fragments.forEach(f => { f.score_hook = 34; });
    if (scenario === 'explanation') fragments.forEach(f => { f.explain_hook = ' '; });
    if (scenario === 'length') fragments.forEach(f => { f.end_seconds = f.start_seconds + 76; });
    return { fragments };
  } };
}
