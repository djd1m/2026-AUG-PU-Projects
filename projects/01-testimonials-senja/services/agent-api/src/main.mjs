import { createGateway } from './server.mjs';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
const server = createGateway({ backendUrl: process.env.AGENT_BACKEND_URL,
  gatewaySecret: process.env.AGENT_GATEWAY_SECRET, publicOrigin: process.env.AGENT_PUBLIC_ORIGIN });
server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log('agent-payments gateway listening'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
