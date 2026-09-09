import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { object, str, assert, checkTaskInput, allowedActions, taskOperations, publicTask, safeError, keyFor } from './common.mjs';

const identifier = { type: 'string', minLength: 1, maxLength: 160 };
const schemas = {
  dashboard: {}, 'program.read': {}, 'share.read': {},
  'registry.prepare': { period: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }, artifactId: identifier },
  'registry.read': { artifactId: identifier }, 'partner.read': { partnerId: identifier }, 'credit.read': { customerId: identifier },
  'task.create': { kind: { enum: ['registry', 'partner', 'credit'] }, input: { type: 'object' } },
  'task.run': { taskId: identifier }, 'task.read': { taskId: identifier }, 'task.cancel': { taskId: identifier },
};
const required = { 'registry.prepare': ['period'], 'registry.read': ['artifactId'], 'task.create': ['kind', 'input'],
  'task.run': ['taskId'], 'task.read': ['taskId'], 'task.cancel': ['taskId'] };
const readOnly = action => !['registry.prepare', 'task.create', 'task.run', 'task.cancel'].includes(action);
function permitted(authority) { return [...allowedActions.filter(action => authority.actions.includes(action)), ...taskOperations]; }
function tool(action) {
  const properties = { input: { type: 'object', properties: schemas[action], required: required[action] ?? [], additionalProperties: false } };
  if (!readOnly(action)) properties.idempotencyKey = identifier;
  return { name: action.replace('.', '_'), description: `Run ${action} with the credential's existing grant. Task execution is deterministic; no LLM or payout sending.`,
    inputSchema: { type: 'object', properties, required: readOnly(action) ? ['input'] : ['input', 'idempotencyKey'], additionalProperties: false },
    annotations: { readOnlyHint: readOnly(action), destructiveHint: false, idempotentHint: true, openWorldHint: false } };
}
export async function mcp(req, res, body, { execute, reauthenticate }) {
  const server = new Server({ name: 'n3-agents', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const current = await reauthenticate();
      return { tools: permitted(current).map(tool) };
    } catch (error) { throw new McpError(ErrorCode.InternalError, safeError(error)[2]); }
  });
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const current = await reauthenticate();
      const action = permitted(current).find(value => value.replace('.', '_') === request.params.name);
      if (!action) throw new McpError(ErrorCode.InvalidParams, 'Unknown or unauthorized tool');
      const args = request.params.arguments;
      object(args, readOnly(action) ? ['input'] : ['input', 'idempotencyKey'], ['input']);
      object(args.input, Object.keys(schemas[action]), required[action]);
      if (!readOnly(action)) str(args.idempotencyKey);
      if (action === 'task.create') checkTaskInput(args.input, current);
      if (!taskOperations.includes(action)) assert(current.actions.includes(action), 'GRANT_SCOPE', 403);
      const key = readOnly(action) ? undefined : keyFor(current.grantId, args.idempotencyKey, `mcp-${action}`);
      const result = await execute(action, args.input, key);
      await reauthenticate();
      const data = taskOperations.includes(action) ? publicTask(result) : result;
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      if (error instanceof McpError) throw error;
      const [, , message] = safeError(error);
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once('close', () => { void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
