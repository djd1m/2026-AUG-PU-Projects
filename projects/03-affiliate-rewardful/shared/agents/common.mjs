import { hash, object, str, assert, integer, safeTree } from '../domain/common.mjs';

export { object, str, assert, integer, safeTree };
export const taskActions = { registry: 'registry.prepare', partner: 'partner.read', credit: 'credit.read' };
export const allowedActions = ['dashboard', 'program.read', 'registry.prepare', 'registry.read', 'partner.read', 'credit.read', 'share.read'];
export const taskOperations = ['task.create', 'task.run', 'task.read', 'task.cancel'];
export const keyFor = (grantId, messageId, step) => `agent:${step}:${hash([grantId, messageId])}`;
export function checkTaskInput(input, authority) {
  object(input, ['kind', 'input'], ['kind', 'input']);
  assert(Object.hasOwn(taskActions, input.kind));
  object(input.input, input.kind === 'registry' ? ['period', 'artifactId'] : input.kind === 'partner' ? ['partnerId'] : ['customerId']);
  assert(authority.actions.includes(taskActions[input.kind]), 'GRANT_SCOPE', 403);
}
export function publicTask(task) {
  return Object.fromEntries(['taskId', 'id', 'kind', 'state', 'result', 'createdAt', 'completedAt', 'canceledAt', 'error']
    .filter(key => Object.hasOwn(task, key)).map(key => [key, task[key]]));
}
export function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: typeof id === 'string' || Number.isSafeInteger(id) ? id : null, error: { code, message } };
}
export function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
export function safeError(error) {
  if (error.status === 401) return [401, -32000, 'Authentication required'];
  if (error.status === 403) return [403, -32000, 'Access denied'];
  if (error.status === 404) return [200, -32001, 'Task not found'];
  if (error.status === 409) return [200, -32602, 'Request conflicts with existing state'];
  if (error.status === 429) return [429, -32000, 'Request limit exceeded'];
  if (error.status === 400) return [200, -32602, 'Invalid params'];
  return [500, -32603, 'Internal error'];
}
