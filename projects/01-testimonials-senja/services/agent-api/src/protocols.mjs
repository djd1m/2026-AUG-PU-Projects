import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GatewayError, object, tools, validateCommand } from './contracts.mjs';

export async function mcp(req, res, body, execute) {
  const server = new Server({ name: 'agent-payments', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools() }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      validateCommand(request.params.name, request.params.arguments);
      const data = await execute(request.params.name, request.params.arguments);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof GatewayError ? error.code : 'COMMAND_FAILED' }] };
    }
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once('close', () => { void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

export function agentCard(origin) {
  return { protocolVersion: '0.3.0', name: 'Agent payments', version: '0.1.0', url: `${origin}/a2a`,
    preferredTransport: 'JSONRPC', description: 'Buyer-authorized purchases. Structured commands only. First purchase requires human confirmation; existing orders survive gateway restarts.',
    capabilities: { streaming: false, pushNotifications: false },
    securitySchemes: { buyerBearer: { type: 'http', scheme: 'bearer' } }, security: [{ buyerBearer: [] }],
    defaultInputModes: ['application/json'], defaultOutputModes: ['application/json'],
    skills: [{ id: 'purchase', name: 'Controlled purchase', description: 'Get offer, prepare an order, request execution and inspect outcome.', tags: ['payments'] }],
  };
}
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
function task(order) {
  let state = ({ prepared: 'submitted', action_required: 'input-required', pending: 'working', unknown: 'working',
    succeeded: 'completed', failed: 'failed', canceled: 'canceled' })[order.paymentStatus];
  if (order.paymentStatus === 'succeeded' && order.fulfillmentStatus === 'pending') state = 'working';
  if (['prepared', 'action_required', 'pending'].includes(order.paymentStatus)
    && ['human_approval', 'open_url'].includes(order.nextAction?.kind)) state = 'input-required';
  if (!state || typeof order.orderId !== 'string') throw new GatewayError('INVALID_ORDER_RESULT', 503);
  return { kind: 'task', id: order.orderId, contextId: order.orderId, status: { state },
    artifacts: [{ artifactId: `${order.orderId}:status`, parts: [{ kind: 'data', data: order }] }] };
}
export async function a2a(body, execute) {
  let id = null;
  try {
    object(body, ['jsonrpc', 'id', 'method', 'params'], ['jsonrpc', 'id', 'method']);
    if (body.jsonrpc !== '2.0' || !(typeof body.id === 'string' || Number.isSafeInteger(body.id))
      || typeof body.method !== 'string') throw new Error();
    id = body.id;
  } catch { return [400, rpcError(null, -32600, 'Invalid Request')]; }
  try {
    if (body.method === 'message/send') {
      object(body.params, ['message', 'configuration'], ['message']);
      const config = body.params.configuration;
      if (config !== undefined) {
        object(config, ['acceptedOutputModes', 'blocking', 'historyLength'], []);
        if (config.blocking !== undefined && typeof config.blocking !== 'boolean') throw new GatewayError('INVALID_CONFIGURATION');
        if (config.historyLength !== undefined && (!Number.isSafeInteger(config.historyLength) || config.historyLength < 0)) throw new GatewayError('INVALID_CONFIGURATION');
        if (config.blocking === false) return [200, rpcError(id, -32004, 'Nonblocking execution is not supported')];
        if (config.acceptedOutputModes !== undefined && (!Array.isArray(config.acceptedOutputModes)
          || !config.acceptedOutputModes.includes('application/json'))) return [200, rpcError(id, -32005, 'Incompatible content types')];
      }
      const message = body.params.message;
      object(message, ['kind', 'role', 'messageId', 'parts'], ['kind', 'role', 'messageId', 'parts']);
      if (message.kind !== 'message' || message.role !== 'user' || typeof message.messageId !== 'string'
        || message.messageId.length < 1 || message.messageId.length > 160 || !Array.isArray(message.parts)
        || message.parts.length !== 1) throw new GatewayError('INVALID_MESSAGE');
      const part = message.parts[0]; object(part, ['kind', 'data']);
      if (part.kind !== 'data') return [200, rpcError(id, -32005, 'Structured data required')];
      object(part.data, ['command', 'input']);
      // Explicit requestKey remains shared with MCP; protocol replay must not generate new keys.
      const data = await execute(part.data.command, part.data.input);
      return [200, { jsonrpc: '2.0', id, result: data.orderId ? task(data) : {
        kind: 'message', role: 'agent', messageId: `${message.messageId}:result`, parts: [{ kind: 'data', data }],
      } }];
    }
    if (body.method === 'tasks/get' || body.method === 'tasks/cancel') {
      object(body.params, ['id', 'historyLength'], ['id']);
      if (body.params.historyLength !== undefined && (!Number.isSafeInteger(body.params.historyLength) || body.params.historyLength < 0)) throw new GatewayError('INVALID_CONFIGURATION');
      const data = await execute('order_get', { orderId: body.params.id });
      if (body.method === 'tasks/cancel') return [200, rpcError(id, -32002, 'Payment task cannot be canceled; revoke authorization in the human account')];
      return [200, { jsonrpc: '2.0', id, result: task(data) }];
    }
    return [200, rpcError(id, -32601, 'Method not found')];
  } catch (error) {
    return [error instanceof GatewayError ? error.status : 500,
      rpcError(id, -32000, error instanceof GatewayError ? error.code : 'COMMAND_FAILED')];
  }
}
