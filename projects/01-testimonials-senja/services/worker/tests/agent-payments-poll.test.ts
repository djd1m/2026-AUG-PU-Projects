import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentPaymentsPoll } from '../src/agent-payments-poll.js';

afterEach(() => vi.useRealTimers());
const env = { AGENT_RECONCILE_URL: 'http://web:3000/api/agent-payments/reconcile', AGENT_GATEWAY_SECRET: 'x'.repeat(40) };
describe('query-only agent payment recovery', () => {
  it('disabled or invalid optional configuration leaves legacy worker running without requests', () => {
    const request = vi.fn(), report = vi.fn();
    startAgentPaymentsPoll({}, request, report)();
    startAgentPaymentsPoll({ ...env, AGENT_RECONCILE_URL: 'https://user:secret@example.org/wrong' }, request, report)();
    expect(request).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('agent_reconciliation_config_invalid');
  });
  it('does not overlap requests and stops retries on shutdown', async () => {
    vi.useFakeTimers();
    let finish!: (r: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const stop = startAgentPaymentsPoll(env, request);
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0] as unknown as [URL, RequestInit];
    expect(options[1].body).toBe('{}');
    expect(options[1].redirect).toBe('error');
    finish(new Response('{}'));
    await vi.advanceTimersByTimeAsync(1);
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('contains backend failure and never logs credential-bearing exception text', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new Error(env.AGENT_GATEWAY_SECRET));
    const report = vi.fn();
    const stop = startAgentPaymentsPoll(env, request, report);
    await vi.advanceTimersByTimeAsync(30001);
    stop();
    expect(request).toHaveBeenCalledTimes(2);
    expect(report.mock.calls).toEqual([['agent_reconciliation_unavailable'], ['agent_reconciliation_unavailable']]);
  });
});
