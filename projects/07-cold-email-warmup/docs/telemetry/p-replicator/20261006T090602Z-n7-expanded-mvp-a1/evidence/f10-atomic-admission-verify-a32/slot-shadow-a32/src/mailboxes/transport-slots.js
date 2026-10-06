import { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
const owners = new WeakMap();
export async function acquireTransportSlot(pool, protocol, tenant, mailbox) {
    return eligibilityTransaction(pool, c => acquireTransportSlotInTransaction(c, protocol, tenant, mailbox));
}
// Trusted caller must already hold FIRST pg_advisory_xact_lock(7,1).
export async function acquireTransportSlotInTransaction(c, protocol, tenant, mailbox) {
    if ((await c.query('SELECT 1 FROM transport_operation WHERE protocol=$1 AND mailbox_id=$2 AND operation IS NOT NULL', [protocol, mailbox])).rowCount)
        throw new HttpError(503, 'transport_busy');
    const free = (await c.query('SELECT slot FROM transport_operation WHERE protocol=$1 AND operation IS NULL ORDER BY slot LIMIT 1 FOR UPDATE', [protocol])).rows[0];
    if (!free)
        throw new HttpError(503, 'transport_busy');
    const result = { protocol, slot: free.slot, operation: randomUUID(), ownerProcess: randomUUID(), ownerHost: hostname(), tenant, mailbox };
    await c.query(`UPDATE transport_operation SET operation=$3,tenant_id=$4,mailbox_id=$5,owner_process=$6,owner_host=$7,expires_at=clock_timestamp()+interval '120 seconds' WHERE protocol=$1 AND slot=$2`, [protocol, result.slot, result.operation, tenant, mailbox, result.ownerProcess, result.ownerHost]);
    owners.set(result, { child: null, sealed: false, consumed: false });
    return Object.freeze(result);
}
export function consumePreadmittedSlot(slot, tenant, mailbox) {
    const owner = owners.get(slot);
    if (!owner || owner.sealed || owner.child || owner.consumed || slot.protocol !== 'imap' || slot.tenant !== tenant || slot.mailbox !== mailbox)
        throw new HttpError(403, 'owner_unproved');
    owner.consumed = true;
    return slot;
}
// Only a registered owner which NEVER bound a child can dispose an unused reservation.
export async function releaseUnusedTransportSlot(pool, slot) {
    const owner = owners.get(slot);
    if (!owner || owner.child || owner.sealed && !owner.unusedProof)
        return false;
    owner.unusedProof ??= closedOwnerProof(slot);
    const released = await releaseTransportSlot(pool, owner.unusedProof);
    if (released)
        delete owner.unusedProof;
    return released;
}
// A proof is an unforgeable in-process closure created by the exact child lifetime owner.
const proofs = new WeakMap();
export function bindTransportChild(slot, child) { const owner = owners.get(slot); if (!owner || owner.sealed || owner.child || !(child instanceof ChildProcess))
    throw new HttpError(403, 'owner_unproved'); owner.child = child; }
export function closedOwnerProof(slot) { const owner = owners.get(slot); if (!owner || owner.child && owner.child.exitCode === null && owner.child.signalCode === null)
    throw new HttpError(403, 'closure_unproved'); owner.sealed = true; const proof = {}; proofs.set(proof, slot); return proof; }
export async function releaseTransportSlot(pool, proof) {
    const s = proofs.get(proof);
    if (!s)
        throw new HttpError(403, 'closure_unproved');
    const result = await eligibilityTransaction(pool, c => c.query(`UPDATE transport_operation SET operation=NULL,tenant_id=NULL,mailbox_id=NULL,owner_process=NULL,owner_host=NULL,expires_at=NULL WHERE protocol=$1 AND slot=$2 AND operation=$3 AND owner_process=$4 AND owner_host=$5`, [s.protocol, s.slot, s.operation, s.ownerProcess, s.ownerHost]));
    if (result.rowCount)
        proofs.delete(proof);
    return result.rowCount === 1;
}
