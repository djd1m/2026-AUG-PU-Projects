import { object, str, assert, integer, checkTaskInput, keyFor, rpcError, safeError } from './common.mjs';

export function agentCard(origin) {
  return {
    protocolVersion: '0.3.0', name: 'Круг', version: '1.0.0', url: `${origin}/a2a`, preferredTransport: 'JSONRPC',
    description: 'Deterministic account tasks. Send one JSON data part with {kind: registry|partner|credit, input: {...}} and a stable messageId. No conversational context or LLM execution.',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: { agentBearer: { type: 'http', scheme: 'bearer' } }, security: [{ agentBearer: [] }],
    supportsAuthenticatedExtendedCard: false, defaultInputModes: ['application/json'], defaultOutputModes: ['application/json'],
    skills: Object.entries({ registry: 'Prepare a registry draft', partner: 'Read own partner rewards', credit: 'Read own customer credit' })
      .map(([id, name]) => ({ id, name, description: name, tags: [id], inputModes: ['application/json'], outputModes: ['application/json'] })),
  };
}
function taskResult(task) {
  const id = task.taskId ?? task.id;
  const result = { kind: 'task', id, contextId: id, status: { state: task.state === 'pending' ? 'submitted' : task.state,
    timestamp: task.completedAt ?? task.canceledAt ?? task.createdAt } };
  if (task.result !== null && task.result !== undefined) result.artifacts = [{ artifactId: `${id}:result`,
    name: 'Task result', parts: [{ kind: 'data', data: task.result }] }];
  if (task.state === 'failed') result.status.message = { kind: 'message', role: 'agent', messageId: `${id}:error`, taskId: id,
    contextId: id, parts: [{ kind: 'text', text: 'Task failed validation. Review the task in your account.' }] };
  return result;
}
function config(value = {}) {
  object(value, ['acceptedOutputModes', 'historyLength', 'pushNotificationConfig', 'blocking']);
  if (value.pushNotificationConfig !== undefined) return [-32003, 'Push Notification is not supported'];
  if (value.acceptedOutputModes !== undefined) {
    assert(Array.isArray(value.acceptedOutputModes) && value.acceptedOutputModes.length <= 20);
    value.acceptedOutputModes.forEach(mode => str(mode, 100));
    if (!value.acceptedOutputModes.includes('application/json')) return [-32005, 'Incompatible content types'];
  }
  if (value.historyLength !== undefined) integer(value.historyLength, 0, 100);
  if (value.blocking !== undefined) assert(typeof value.blocking === 'boolean');
  if (value.blocking === false) return [-32004, 'Nonblocking execution is not supported'];
}
export async function a2a(body, { authority, execute, reauthenticate }) {
  const id = body?.id;
  try {
    object(body, ['jsonrpc', 'id', 'method', 'params'], ['jsonrpc', 'method']);
    assert(body.jsonrpc === '2.0' && typeof body.method === 'string');
    assert(id === undefined || typeof id === 'string' || Number.isSafeInteger(id));
  } catch { return [400, rpcError(null, -32600, 'Invalid Request')]; }
  // A2A defines request/response operations, not side effects via notifications.
  if (id === undefined) return [204, undefined];
  try {
    let result;
    if (body.method === 'message/send') {
      object(body.params, ['message', 'configuration'], ['message']);
      const invalidConfig = config(body.params.configuration);
      if (invalidConfig) return [200, rpcError(id, ...invalidConfig)];
      const message = body.params.message;
      object(message, ['kind', 'role', 'messageId', 'parts'], ['kind', 'role', 'messageId', 'parts']);
      assert(message.kind === 'message' && message.role === 'user'); str(message.messageId, 160);
      assert(Array.isArray(message.parts) && message.parts.length === 1);
      const part = message.parts[0];
      if (part?.kind !== 'data') return [200, rpcError(id, -32005, 'Incompatible content types')];
      object(part, ['kind', 'data'], ['kind', 'data']); checkTaskInput(part.data, authority);
      const created = await execute('task.create', part.data, keyFor(authority.grantId, message.messageId, 'create'));
      // Read current state after create replay; never publish the stale cached pending task.
      result = await execute('task.run', { taskId: created.taskId ?? created.id }, keyFor(authority.grantId, message.messageId, 'run'));
      result = await execute('task.read', { taskId: result.taskId ?? result.id });
    } else if (['tasks/get', 'tasks/cancel'].includes(body.method)) {
      object(body.params, body.method === 'tasks/get' ? ['id', 'historyLength'] : ['id'], ['id']); str(body.params.id);
      if (body.params.historyLength !== undefined) integer(body.params.historyLength, 0, 100);
      result = await execute('task.read', { taskId: body.params.id });
      if (body.method === 'tasks/cancel') {
        if (['completed', 'failed', 'canceled'].includes(result.state)) return [200, rpcError(id, -32002, 'Task cannot be canceled')];
        result = await execute('task.cancel', { taskId: body.params.id }, keyFor(authority.grantId, body.params.id, 'cancel'));
        if (result.state !== 'canceled') return [200, rpcError(id, -32002, 'Task cannot be canceled')];
      }
    } else if (body.method.startsWith('tasks/pushNotificationConfig/')) return [200, rpcError(id, -32003, 'Push Notification is not supported')];
    else if (['message/stream', 'tasks/resubscribe'].includes(body.method)) return [200, rpcError(id, -32004, 'This operation is not supported')];
    else if (body.method === 'agent/getAuthenticatedExtendedCard') return [200, rpcError(id, -32007, 'Authenticated Extended Card not configured')];
    else return [200, rpcError(id, -32601, 'Method not found')];
    await reauthenticate();
    return [200, { jsonrpc: '2.0', id, result: taskResult(result) }];
  } catch (error) { const [status, code, message] = safeError(error); return [status, rpcError(id, code, message)]; }
}
