import { commands, GatewayError, validateCommand } from './contracts.mjs';

export function backendClient({ backendUrl, gatewaySecret, fetchImpl = fetch }) {
  const url = new URL(backendUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== '/api/agent-payments/commands') throw new Error('INVALID_BACKEND_URL');
  if (typeof gatewaySecret !== 'string' || gatewaySecret.length < 32) throw new Error('AGENT_GATEWAY_SECRET_REQUIRED');
  return async function execute(command, input, authorization, clientKey) {
    validateCommand(command, input);
    if (!commands[command].public && !authorization) throw new GatewayError('BUYER_GRANT_REQUIRED', 401);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', 'x-agent-gateway-key': gatewaySecret,
          ...(authorization ? { authorization } : {}), 'x-agent-client-key': clientKey },
        body: JSON.stringify({ command, input }),
      });
      // Bound the response while reading; Content-Length is not an authority.
      const reader = response.body?.getReader(); let size = 0, chunks = [];
      if (!reader) throw new Error('empty backend response');
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); throw new Error('oversized backend response'); }
        chunks.push(value);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!response.ok) {
        // Do not reflect backend exception text, provider payloads or credentials.
        const code = typeof result?.error?.code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(result.error.code)
          ? result.error.code : 'BACKEND_REFUSED';
        throw new GatewayError(code, [400, 401, 403, 404, 409, 413, 429, 503].includes(response.status) ? response.status : 503);
      }
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid result');
      return result;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      // No automatic retry: a lost response to execute can mean an accepted payment.
      throw new GatewayError('BACKEND_RESULT_UNAVAILABLE_CHECK_EXISTING_ORDER', 503);
    }
  };
}
