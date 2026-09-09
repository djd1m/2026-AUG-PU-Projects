import assert from 'node:assert/strict';
import test from 'node:test';

import { createContextGuard, disableWhile } from '../shared/ui/account/helpers.mjs';

test('form work keeps successful controls enabled while blocking another submit', async () => {
  const submit = { disabled: false };
  const amount = { disabled: false, name: 'amount', value: '20' };
  const form = {
    matches: () => false,
    querySelectorAll: selector => selector === 'button' ? [submit] : [],
  };

  await disableWhile(form, async () => {
    assert.equal(submit.disabled, true);
    assert.equal(amount.disabled, false);
    const successfulValue = amount.disabled ? null : amount.value;
    assert.equal(successfulValue, '20');
  });

  assert.equal(submit.disabled, false);
});

test('overlapping form operations keep controls disabled until the final lease ends', async () => {
  const submit = { disabled: false };
  const form = { matches: () => false, querySelectorAll: () => [submit] };
  let releaseFirst;
  let releaseSecond;
  const first = disableWhile(form, () => new Promise(resolve => { releaseFirst = resolve; }));
  const second = disableWhile(form, () => new Promise(resolve => { releaseSecond = resolve; }));

  assert.equal(submit.disabled, true);
  releaseFirst();
  await first;
  assert.equal(submit.disabled, true);
  releaseSecond();
  await second;
  assert.equal(submit.disabled, false);
});

test('replaced account context rejects a delayed result even when transport ignores abort', async () => {
  const contexts = createContextGuard();
  const oldContext = contexts.capture();
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const guardedResult = delayed.then(value => {
    contexts.assert(oldContext);
    return value;
  });

  const nextContext = contexts.replace();
  release('old secret');

  await assert.rejects(guardedResult, error => error?.name === 'AbortError');
  assert.equal(contexts.current(oldContext), false);
  assert.equal(contexts.current(nextContext), true);
  assert.equal(oldContext.signal.aborted, true);
});
