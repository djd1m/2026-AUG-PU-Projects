import { id, policy } from '../domain/common.mjs';

export function realState(tenantId, name, now) {
  const at = new Date(now).toISOString();
  return { runId: tenantId, mode: 'real', seedVersion: 'n3-real-v1', name, clock: at, sourceVersion: 1,
    actors: [{ id: id(), role: 'merchant', name }],
    // Explicitly publish a policy in the workspace before accepting orders.
    policyConfigured: [],
    policies: ['cash', 'credit'].map((kind, i) => policy({ kind, bps: 2000, windowDays: 30, holdDays: 7, recurring: true }, i + 1, at)),
    payments: [], refunds: [], ledger: [], registries: [], approvals: [], allocations: [], transfers: [], exceptions: [],
    reconciliations: [], reservations: [], invoices: [], enrollments: [], grants: [], tasks: [], audit: [] };
}
