import { createHmac } from 'node:crypto';
import type { AdmissionRepositoryContract } from '../../../../../packages/db/src/onboarding-contract';
import { HttpError } from './errors';
export const HTTP_IN_FLIGHT = 16;
export class HttpAdmission {
  private active = 0;
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= HTTP_IN_FLIGHT) throw new HttpError(503, 'overloaded');
    this.active++;
    try { return await work(); } finally { this.active--; }
  }
}
export function admissionSlot(kind: 'source' | 'identity', key: string | Buffer, secret: Buffer): number {
  return createHmac('sha256', secret).update(`n3a:admission:${kind}:v1:`).update(key).digest().readUInt32BE(0) % 4096;
}
export class DurableAdmission {
  constructor(private readonly repository: AdmissionRepositoryContract, private readonly secret: Buffer) {}
  async source(): Promise<void> {
    // Next ingress has no authenticated transport-peer handoff. Ignore all forwarding headers.
    const result = await this.repository.chargeSource(admissionSlot('source', 'unknown', this.secret));
    if (!result.allowed) throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(result.retry_after)));
  }
  async identity(identity: Buffer | null): Promise<void> {
    const result = await this.repository.chargeIdentity(admissionSlot('identity', identity ?? 'invalid', this.secret));
    if (!result.allowed) throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(result.retry_after)));
  }
}
