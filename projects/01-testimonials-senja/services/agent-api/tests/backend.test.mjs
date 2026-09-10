import test from 'node:test';
import assert from 'node:assert/strict';
import { backendClient } from '../src/backend.mjs';
const options = { backendUrl: 'http://backend:3000/api/agent-payments/commands', gatewaySecret: 's'.repeat(43) };

test('lost execution response is not retried or represented as successful payment', async () => {
  let calls = 0;
  const call = backendClient({ ...options, fetchImpl: async (_url, request) => {
    calls++; assert.equal(request.redirect, 'error'); throw new Error('possibly accepted');
  } });
  await assert.rejects(call('payment_execute', { orderId: 'order' }, `Bearer ${'t'.repeat(43)}`, 'client'),
    error => error.code === 'BACKEND_RESULT_UNAVAILABLE_CHECK_EXISTING_ORDER' && error.status === 503);
  assert.equal(calls, 1);
});

test('configured backend and credentials cannot be supplied by a tool argument', async () => {
  assert.throws(() => backendClient({ ...options, gatewaySecret: '' }));
  assert.throws(() => backendClient({ ...options, backendUrl: 'http://user:pass@backend/api/agent-payments/commands' }));
  let calls = 0;
  const call = backendClient({ ...options, fetchImpl: async () => { calls++; return new Response('{}'); } });
  await assert.rejects(call('payment_execute', { orderId: 'x', backendUrl: 'https://attacker.test' }, 'token', 'ip'));
  await assert.rejects(call('approveOrder', { orderId: 'x' }, 'token', 'ip'));
  assert.equal(calls, 0);
});

test('core lowercase policy errors remain actionable without reflecting private messages', async () => {
  const call = backendClient({ ...options, fetchImpl: async () => new Response(JSON.stringify({
    error: { code: 'budget_exceeded', message: 'private provider detail' },
  }), { status: 409 }) });
  await assert.rejects(call('payment_execute', { orderId: 'order' }, 'buyer', 'ip'),
    error => error.code === 'budget_exceeded' && error.status === 409 && !error.message.includes('private'));
});
