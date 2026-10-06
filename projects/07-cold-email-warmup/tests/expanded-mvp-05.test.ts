import { test } from 'node:test';
import { runF11ContextIntegration } from './f11-context-integration.test.js';
import { bodyProtocolWitness } from './f11-body-protocol.test.js';
test('inbound context is bounded tenant scoped and expires',async t=>{
 await bodyProtocolWitness();await runF11ContextIntegration(t);
});
