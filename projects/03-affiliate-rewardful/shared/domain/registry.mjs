import { assert, object, str, integer, iso, id, hash, sum, ownResource, sourceChanged } from './common.mjs';

export const paymentNet = (state, paymentId) => sum(state.ledger.filter(e => e.paymentId === paymentId).map(e => e.amountMinor));
export function registryView(state, artifact) {
  const revision = artifact.revisions.at(-1);
  return { artifactId: artifact.id, id: artifact.id, ...revision, status: artifact.status, approval: artifact.approval,
    transfers: state.transfers.filter(t => t.artifactId === artifact.id), simulated: true };
}
function snapshot(state, period, artifactId) {
  const rowsByPartner = new Map(), exclusions = [];
  const start = `${period}-01T00:00:00.000Z`;
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  for (const payment of state.payments) {
    if (!payment.rewardMinor) { exclusions.push({ paymentId: payment.id, reason: payment.attribution.reason, amountMinor: 0 }); continue; }
    const amountMinor = paymentNet(state, payment.id);
    const allocation = state.allocations.find(a => a.obligationId === payment.id);
    let reason;
    if (payment.kind !== 'cash') reason = 'subscription_credit';
    else if (payment.effectiveAt < start || payment.effectiveAt >= end.toISOString()) reason = 'outside_period';
    else if (payment.availableAt > state.clock) reason = 'held';
    else if (allocation?.transferId) reason = 'sent';
    else if (allocation && allocation.artifactId !== artifactId) reason = 'allocated';
    else if (amountMinor <= 0) reason = 'refunded_or_disputed';
    if (reason) { exclusions.push({ paymentId: payment.id, beneficiaryId: payment.beneficiaryId, kind: payment.kind, amountMinor, reason }); continue; }
    const actor = ownResource(state.actors, payment.beneficiaryId);
    const row = rowsByPartner.get(actor.id) ?? { partnerId: actor.id, name: actor.name, currency: 'RUB', amountMinor: 0, obligationIds: [] };
    row.amountMinor = sum([row.amountMinor, amountMinor]); row.obligationIds.push(payment.id); rowsByPartner.set(actor.id, row);
  }
  const rows = [...rowsByPartner.values()].sort((a, b) => a.partnerId.localeCompare(b.partnerId));
  rows.forEach(row => row.obligationIds.sort()); exclusions.sort((a, b) => a.paymentId.localeCompare(b.paymentId));
  return { period, sourceVersion: state.sourceVersion, policyVersions: [...new Set(state.payments.map(p => p.policyVersion))].sort((a, b) => a - b),
    rows, exclusions, amountMinor: sum(rows.map(r => r.amountMinor)), currency: 'RUB', dueDate: `${end.toISOString().slice(0, 7)}-05` };
}
export function prepare(state, input, actorId) {
  object(input, ['period', 'artifactId'], ['period']);
  if (Object.hasOwn(input, 'artifactId')) str(input.artifactId);
  assert(typeof input.period === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(input.period));
  const artifact = input.artifactId ? ownResource(state.registries, str(input.artifactId)) :
    { id: id(), ownerId: actorId, revisions: [], approval: null, status: 'draft' };
  assert(artifact.ownerId === actorId, 'FORBIDDEN', 403, 'Недоступный артефакт');
  const content = snapshot(state, input.period, artifact.id), contentHash = hash(content);
  if (artifact.revisions.at(-1)?.hash === contentHash) return registryView(state, artifact);
  if (!input.artifactId) { assert(state.registries.length < 100, 'DEMO_LIMIT', 429); state.registries.push(artifact); }
  artifact.approval = null; artifact.status = 'draft';
  state.allocations = state.allocations.filter(a => a.artifactId !== artifact.id || a.transferId);
  artifact.revisions.push({ ...content, revision: artifact.revisions.length + 1, hash: contentHash, preparedAt: state.clock });
  return registryView(state, artifact);
}
function exact(state, input, needsApproval = false) {
  str(input.artifactId); integer(input.revision, 1); str(input.hash, 64);
  const artifact = ownResource(state.registries, input.artifactId), revision = artifact.revisions.at(-1);
  assert(revision.revision === input.revision && revision.hash === input.hash, 'STALE_REVISION', 409, 'Версия реестра изменилась; пересчитайте');
  assert(revision.sourceVersion === state.sourceVersion, 'STALE_SOURCE', 409, 'Начисления изменились; пересчитайте реестр');
  if (needsApproval) assert(artifact.approval?.revision === revision.revision && artifact.approval.hash === revision.hash, 'APPROVAL_REQUIRED', 409, 'Утвердите актуальную версию');
  return [artifact, revision];
}
const refFields = ['artifactId', 'revision', 'hash'];
export function approve(state, input, actorId) {
  object(input, refFields, refFields); const [artifact, revision] = exact(state, input);
  assert(revision.rows.length > 0, 'EMPTY_REGISTRY', 409, 'Нет доступных выплат');
  for (const row of revision.rows) for (const obligationId of row.obligationIds) {
    const existing = state.allocations.find(a => a.obligationId === obligationId);
    assert(!existing || existing.artifactId === artifact.id && existing.revision === revision.revision,
      'ALLOCATION_CONFLICT', 409, 'Обязательство уже закреплено за другим реестром');
    if (!existing) state.allocations.push({ obligationId, artifactId: artifact.id, revision: revision.revision, partnerId: row.partnerId, transferId: null });
  }
  if (!artifact.approval) {
    artifact.approval = { id: id(), artifactId: artifact.id, actorId, revision: revision.revision, hash: revision.hash, approvedAt: state.clock };
    state.approvals ??= []; state.approvals.push(artifact.approval);
  }
  const sentRows = revision.rows.filter(row => row.obligationIds.every(obligationId =>
    state.allocations.some(a => a.obligationId === obligationId && a.transferId))).length;
  artifact.status = sentRows === revision.rows.length ? 'sent' : sentRows ? 'partially_sent' : 'approved';
  return registryView(state, artifact);
}
export function csvCell(value) {
  let text = String(value);
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportRegistry(state, input) {
  object(input, refFields, refFields); const [artifact, revision] = exact(state, input, true);
  const csv = [['period', 'partner_id', 'name', 'amount_minor', 'currency', 'revision', 'hash'],
    ...revision.rows.map(row => [revision.period, row.partnerId, row.name, row.amountMinor, 'RUB', revision.revision, revision.hash])]
    .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return { artifactId: artifact.id, revision: revision.revision, hash: revision.hash, csv, filename: `n3-${revision.period}-v${revision.revision}.csv`, simulated: true };
}
function evidence(input, state) {
  str(input.evidence, 500); iso(input.sentAt);
  assert(Date.parse(input.sentAt) <= Date.parse(state.clock), 'FUTURE_TRANSFER', 400, 'Дата отправки ещё не наступила');
}
export function sent(state, input, actorId) {
  object(input, [...refFields, 'partnerId', 'evidence', 'sentAt'], [...refFields, 'partnerId', 'evidence', 'sentAt']);
  evidence(input, state); const [artifact, revision] = exact(state, input, true);
  const row = revision.rows.find(r => r.partnerId === input.partnerId); assert(row, 'NOT_FOUND', 404, 'Строка не найдена');
  const prior = state.transfers.find(t => t.artifactId === artifact.id && t.revision === revision.revision && t.partnerId === input.partnerId);
  if (prior) { assert(prior.evidence === input.evidence && prior.sentAt === iso(input.sentAt), 'TRANSFER_CONFLICT', 409, 'Факт отправки уже сохранён'); return prior; }
  const allocations = row.obligationIds.map(obligationId => state.allocations.find(a => a.obligationId === obligationId));
  assert(allocations.every(a => a && a.artifactId === artifact.id && a.revision === revision.revision && !a.transferId), 'ALLOCATION_CONFLICT', 409);
  sum([...state.transfers.map(t => t.amountMinor), row.amountMinor]);
  const transfer = { id: id(), artifactId: artifact.id, revision: revision.revision, hash: revision.hash, partnerId: row.partnerId,
    amountMinor: row.amountMinor, currency: 'RUB', obligationIds: row.obligationIds, actorId, evidence: input.evidence, sentAt: iso(input.sentAt), simulated: true, credited: false };
  state.transfers.push(transfer); allocations.forEach(a => { a.transferId = transfer.id; });
  artifact.status = revision.rows.every(r => r.obligationIds.every(p => state.allocations.find(a => a.obligationId === p)?.transferId)) ? 'sent' : 'partially_sent';
  return transfer;
}
export function reconcile(state, input, actorId) {
  const fields = ['artifactId', 'revision', 'partnerId', 'amountMinor', 'evidence', 'sentAt'];
  object(input, fields, fields); integer(input.revision, 1); integer(input.amountMinor, 1, Number.MAX_SAFE_INTEGER); evidence(input, state);
  const artifact = ownResource(state.registries, input.artifactId);
  const revision = artifact.revisions.find(r => r.revision === input.revision);
  const row = revision?.rows.find(r => r.partnerId === input.partnerId); assert(row, 'NOT_FOUND', 404, 'Исходная строка не найдена');
  const businessKey = `${artifact.id}/${revision.revision}/${row.partnerId}`;
  const old = state.reconciliations.find(r => r.businessKey === businessKey);
  if (old) { assert(old.inputHash === hash(input), 'RECONCILIATION_CONFLICT', 409); return old; }
  const currentMinor = sum(row.obligationIds.map(p => paymentNet(state, p)));
  const record = { ...input, id: id(), businessKey, inputHash: hash(input), originalAmountMinor: row.amountMinor,
    currentAmountMinor: currentMinor, discrepancyMinor: input.amountMinor - currentMinor, actorId, createdAt: state.clock, simulated: true };
  sourceChanged(state);
  // Historical CSV may have been used after approval was invalidated. Preserve that fact and bar a second settlement.
  const unsent = row.obligationIds.filter(p => !state.allocations.some(a => a.obligationId === p && a.transferId));
  if (unsent.length) {
    sum([...state.transfers.map(t => t.amountMinor), input.amountMinor]);
    const transfer = { id: id(), artifactId: artifact.id, revision: revision.revision, hash: revision.hash, partnerId: row.partnerId,
      amountMinor: input.amountMinor, currency: 'RUB', obligationIds: unsent, actorId, evidence: input.evidence, sentAt: iso(input.sentAt),
      simulated: true, credited: false, reconciliationId: record.id };
    state.transfers.push(transfer);
    for (const obligationId of unsent) state.allocations.push({ obligationId, artifactId: artifact.id, revision: revision.revision, partnerId: row.partnerId, transferId: transfer.id });
  }
  state.reconciliations.push(record);
  state.exceptions.push({ id: id(), type: 'stale_csv_reconciliation', reconciliationId: record.id, beneficiaryId: row.partnerId,
    amountMinor: record.discrepancyMinor, kind: 'cash', createdAt: state.clock, explanation: 'Зафиксирован фактический синтетический перевод по историческому CSV; повторная выплата не разрешена' });
  return record;
}
