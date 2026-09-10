/** Query-only recovery. No order creation, mandate, buyer grant or provider secret. */
export function startAgentPaymentsPoll(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
  report: (code: string) => void = code => console.error('[worker]', code),
): () => void {
  const configured = env.AGENT_RECONCILE_URL;
  if (!configured) return () => {};
  let endpoint: URL;
  const secret = env.AGENT_GATEWAY_SECRET;
  try {
    endpoint = new URL(configured);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.pathname !== '/api/agent-payments/reconcile'
      || !secret || secret.length < 32) throw new Error('configuration');
  } catch {
    // An optional integration must not stop transcription or existing N3 delivery.
    report('agent_reconciliation_config_invalid');
    return () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  async function tick(): Promise<void> {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const response = await request(endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-agent-gateway-key': secret! },
        body: '{}',
      });
      await response.body?.cancel();
      if (!response.ok) report('agent_reconciliation_failed');
    } catch {
      if (!stopped) report('agent_reconciliation_unavailable');
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(() => void tick(), 30000);
    }
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}
