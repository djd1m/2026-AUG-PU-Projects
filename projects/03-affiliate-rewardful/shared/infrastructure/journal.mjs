import { assert, canonical } from '../domain/common.mjs';

function facts(state) {
  const result = new Map();
  const add = (kind, key, value) => {
    const composite = `${kind}:${key}`;
    assert(!result.has(composite), 'INVARIANT', 500, 'Нарушена уникальность факта');
    result.set(composite, { kind, key, value });
  };
  for (const [kind, field] of Object.entries({ policy: 'policies', payment: 'payments', refund: 'refunds', ledger: 'ledger',
    transfer: 'transfers', approval: 'approvals', reconciliation: 'reconciliations', exception: 'exceptions', enrollment: 'enrollments', invoice: 'invoices', audit: 'audit' })) {
    for (const value of state[field] ?? []) add(kind, value.businessKey ?? value.id, value);
  }
  for (const artifact of state.registries ?? []) for (const revision of artifact.revisions) add('registry_revision', `${artifact.id}/${revision.revision}`, revision);
  for (const transfer of state.transfers ?? []) for (const obligationId of transfer.obligationIds) add('obligation_transfer', obligationId, { obligationId, transferId: transfer.id });
  for (const reservation of state.reservations ?? []) {
    const { state: status, transitions, ...original } = reservation;
    add('reservation', reservation.id, original);
    for (const transition of transitions) add('billing_transition', transition.id, { ...transition, reservationId: reservation.id });
    if (status === 'success') add('credit_application', reservation.id, { ...original, state: status });
  }
  return result;
}
export async function persistChanges(client, tenantId, before, after) {
  const previous = facts(before), current = facts(after), additions = [];
  for (const [key, fact] of previous) assert(current.has(key) && canonical(current.get(key).value) === canonical(fact.value), 'IMMUTABLE_FACT', 500, 'Попытка изменить историю');
  for (const [key, fact] of current) if (!previous.has(key)) additions.push(fact);
  if (additions.length) await client.query(`INSERT INTO immutable_facts (tenant_id, kind, business_key, payload)
    SELECT $1, f.kind, f.key, f.value FROM jsonb_to_recordset($2::jsonb) AS f(kind text, key text, value jsonb)`, [tenantId, JSON.stringify(additions)]);
  const oldAllocations = before.allocations ?? [];
  for (const old of oldAllocations) {
    const next = after.allocations.find(a => a.obligationId === old.obligationId);
    if (canonical(old) === canonical(next)) continue;
    assert(!old.transferId, 'IMMUTABLE_TRANSFER', 500, 'Попытка изменить отправленное обязательство');
    await client.query('DELETE FROM allocations WHERE tenant_id=$1 AND obligation_id=$2 AND transfer_id IS NULL', [tenantId, old.obligationId]);
  }
  for (const next of after.allocations) {
    const old = oldAllocations.find(a => a.obligationId === next.obligationId);
    if (canonical(old) === canonical(next)) continue;
    await client.query('INSERT INTO allocations (tenant_id,obligation_id,artifact_id,revision,partner_id,transfer_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, next.obligationId, next.artifactId, next.revision, next.partnerId, next.transferId]);
  }
  await client.query('UPDATE tenants SET state=$2 WHERE id=$1', [tenantId, JSON.stringify(after)]);
}
