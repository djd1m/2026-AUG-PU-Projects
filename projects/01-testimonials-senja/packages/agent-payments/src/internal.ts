import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  AgentContext,
  EngineOptions,
  GrantView,
  HumanContext,
  MandateView,
  Money,
  OrderView,
  ProviderRequest,
  Scope,
} from './contracts.js';
export class PaymentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
    this.name = 'PaymentError';
  }
}
export function requireValue(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new PaymentError(code, status);
}
export const id = () => randomUUID();
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const scopeArgs = (scope: Scope) => [scope.merchantId, scope.buyerId, scope.resourceId];
export const sameScope = (a: Scope, b: Scope) =>
  JSON.stringify(scopeArgs(a)) === JSON.stringify(scopeArgs(b));
export function text(value: unknown): asserts value is string {
  requireValue(
    typeof value === 'string' && value.length > 0 && value.length <= 300,
    'invalid_input',
    400,
  );
}
export function money(value: Money) {
  requireValue(
    value &&
      typeof value.minor === 'string' &&
      /^[1-9]\d{0,20}$/.test(value.minor) &&
      /^[A-Z]{3}$/.test(value.currency),
    'invalid_money',
    400,
  );
}
export function validScope(scope: Scope) {
  scopeArgs(scope).forEach(text);
}
export function human(context: HumanContext) {
  validScope(context);
  text(context.humanId);
  text(context.consentReference);
}
export function future(value: string, now: Date) {
  requireValue(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) > now.getTime(),
    'expired',
    409,
  );
}
export type StoredOrder = OrderView & {
  grantId: string;
  attributionBinding?: string;
  attemptId?: string;
  approvedBy?: string;
  saveMethod?: boolean;
};
export type Attempt = {
  id: string;
  provider: string;
  accountId: string;
  request: ProviderRequest;
  grantId: string;
  mandateId?: string;
  human: boolean;
  dispatchedAt?: string;
  providerId?: string;
};
export class Context {
  readonly now: () => Date;
  constructor(readonly options: EngineOptions) {
    this.now = options.clock ?? (() => new Date());
    requireValue(options.provider.test === true, 'test_provider_required', 400);
  }
  tx<T>(scope: Scope, op: (client: PoolClient) => Promise<T>) {
    validScope(scope);
    return this.options.store.transaction(
      scope,
      op,
      this.options.host.lockResource ? (c) => this.options.host.lockResource!(c, scope) : undefined,
    );
  }
  async authenticate(agent: AgentContext): Promise<GrantView> {
    text(agent.token);
    text(agent.audience);
    text(agent.merchantId);
    return this.options.store.transaction(
      { merchantId: agent.merchantId, buyerId: '_authentication', resourceId: '_' },
      async (client) => this.auth(client, agent),
    );
  }
  async auth(client: PoolClient, agent: AgentContext): Promise<GrantView> {
    const { rows } = await client.query(
      'SELECT data FROM agent_payments.grants WHERE token_hash=$1 AND merchant=$2',
      [hash(agent.token), agent.merchantId],
    );
    const grant: GrantView | undefined = rows[0]?.data;
    requireValue(
      grant &&
        !grant.revoked &&
        grant.audience === agent.audience &&
        Date.parse(grant.expiresAt) > this.now().getTime(),
      'unauthorized',
      401,
    );
    return grant;
  }
  async order(client: PoolClient, scope: Scope, orderId: string): Promise<StoredOrder> {
    text(orderId);
    const { rows } = await client.query(
      'SELECT data FROM agent_payments.orders WHERE id=$1 AND merchant=$2 AND buyer=$3 AND resource=$4 FOR UPDATE',
      [orderId, ...scopeArgs(scope)],
    );
    requireValue(rows[0], 'not_found', 404);
    return rows[0].data;
  }
  async save(client: PoolClient, order: StoredOrder) {
    await client.query('UPDATE agent_payments.orders SET data=$2 WHERE id=$1', [
      order.orderId,
      order,
    ]);
  }
  view(order: StoredOrder): OrderView {
    const {
      orderId,
      scope,
      quote,
      paymentStatus,
      fulfillmentStatus,
      attributionStatus,
      nextAction,
      refundedMinor,
      version,
    } = order;
    return {
      orderId,
      scope,
      quote,
      paymentStatus,
      fulfillmentStatus,
      attributionStatus,
      nextAction,
      refundedMinor,
      version,
    };
  }
  async mandate(
    client: PoolClient,
    scope: Scope,
    mandateId?: string,
  ): Promise<MandateView | undefined> {
    const { rows } = await client.query(
      'SELECT data FROM agent_payments.mandates WHERE merchant=$1 AND buyer=$2 AND resource=$3 ORDER BY id',
      scopeArgs(scope),
    );
    return rows
      .map((r) => r.data as MandateView)
      .find(
        (m) =>
          (!mandateId || m.mandateId === mandateId) &&
          !m.revoked &&
          Date.parse(m.policy.validUntil) > this.now().getTime(),
      );
  }
}
export async function audit(client: PoolClient, scope: Scope, kind: string, subject: string) {
  await client.query(
    'INSERT INTO agent_payments.audit(merchant,buyer,kind,subject_id) VALUES($1,$2,$3,$4)',
    [scope.merchantId, scope.buyerId, kind, subject],
  );
}
