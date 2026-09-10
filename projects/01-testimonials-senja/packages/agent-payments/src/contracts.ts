import type { PoolClient } from 'pg';

export type Money = { minor: string; currency: string };
export type Scope = { merchantId: string; buyerId: string; resourceId: string };
/** Host MUST construct after authenticated human session, ownership and CSRF verification. Never expose via agent transport. */
export type HumanContext = Scope & { humanId: string; consentReference: string };
export type AgentContext = { token: string; audience: string; merchantId: string };
export type Offer = {
  productId: string; amount: Money; termsVersion: string; billingPeriod: string;
  budgetPeriod: string; expiresAt: string; autonomousEligible: boolean;
  attributionRequired: boolean; description: string;
};
export type QuoteView = Offer & { quoteId: string; scope: Scope };
export type PaymentState = 'prepared' | 'action_required' | 'pending' | 'unknown' | 'succeeded' | 'failed' | 'canceled';
export type NextAction = { kind: 'human_approval'; url: string } | { kind: 'open_url'; url: string }
  | { kind: 'wait'; retryAfterSeconds: number } | { kind: 'none' };
export type OrderView = {
  orderId: string; scope: Scope; quote: QuoteView; paymentStatus: PaymentState;
  fulfillmentStatus: 'not_started' | 'pending' | 'active' | 'review_required';
  attributionStatus: 'none' | 'pending' | 'confirmed' | 'rejected'; nextAction: NextAction;
  refundedMinor: string; version: number;
};
export type MandatePolicy = {
  productId: string; amount: Money; termsVersion: string; validUntil: string;
  perPaymentMinor: string; perBudgetPeriodMinor: string; sharedBudgetMinor: string;
  /** Server-defined calendar identity, e.g. Europe/Moscow. No defaults. */
  calendar: string;
};
export type MandateView = { mandateId: string; scope: Scope; policy: MandatePolicy; revoked: boolean };
export type GrantView = { grantId: string; scope: Scope; audience: string; expiresAt: string; revoked: boolean };
export type DomainEvent = {
  eventId: string; schemaVersion: 1; merchantId: string; buyerId: string; resourceId: string;
  orderId: string; attemptId: string; providerId: string; providerAccountId: string; aggregateVersion: number; type: 'payment.succeeded' | 'payment.refunded';
  amount: Money; refundedMinor: string; occurredAt: string; correlationId: string;
  attributionBinding?: string; refundId?: string;
};
export type ProviderRequest = {
  attemptId: string; orderId: string; scope: Scope; amount: Money; description: string;
  idempotencyKey: string; returnUrl: string; saveMethod: boolean;
  /** Private backend-only field. Never serialize into an agent response or event. */
  methodReference?: string;
};
export type ProviderResult = {
  providerId: string; accountId: string; test: true; orderId: string; attemptId: string;
  amount: Money; status: 'pending' | 'succeeded' | 'canceled'; confirmationUrl?: string;
  savedMethod?: { reference: string; saved: true };
};
export interface ProviderPort {
  readonly provider: string; readonly accountId: string; readonly test: true;
  readonly supportsSavedMethods: boolean;
  create(request: ProviderRequest): Promise<ProviderResult>;
  /** Must ONLY query. An unknown creation without provider ID stays unresolved, never recreated. */
  query(request: ProviderRequest, providerId?: string): Promise<ProviderResult | null>;
  queryRefund?(refundId: string): Promise<{
    refundId: string; providerId: string; accountId: string; test: true; amount: Money; status: 'succeeded' | 'pending' | 'canceled';
  }>;
}
export interface HostPort {
  getOffer(scope: Scope, productId: string): Promise<Offer>;
  /** Must acknowledge required external attribution before returning a binding. */
  prepareAttribution?(scope: Scope, orderId: string, quote: QuoteView): Promise<string | undefined>;
  approvalUrl(orderId: string): string;
  returnUrl(orderId: string): string;
  /** Acquire existing product/legacy locks first, on this exact connection. No network. */
  lockResource?(client: PoolClient, scope: Scope): Promise<void>;
  /** Local idempotent fulfillment and outbox MUST use this exact transaction client; no network. */
  fulfill(client: PoolClient, event: DomainEvent, order: OrderView): Promise<'active' | 'pending'>;
  refund(client: PoolClient, event: DomainEvent, order: OrderView): Promise<'active' | 'review_required'>;
}
export interface StorePort {
  transaction<T>(scope: Scope, operation: (client: PoolClient) => Promise<T>, beforeLock?: (client: PoolClient) => Promise<void>): Promise<T>;
}
export type EngineOptions = { store: StorePort; provider: ProviderPort; host: HostPort; clock?: () => Date };
export interface PaymentsEngine {
  issueGrant(human: HumanContext, input: { audience: string; expiresAt: string }): Promise<GrantView & { token: string }>;
  revokeGrant(human: HumanContext, grantId: string): Promise<void>;
  createMandate(human: HumanContext, policy: MandatePolicy): Promise<MandateView>;
  revokeMandate(human: HumanContext, mandateId: string): Promise<void>;
  getOffer(agent: AgentContext, productId: string): Promise<QuoteView>;
  createOrder(agent: AgentContext, input: { quoteId: string; idempotencyKey: string }): Promise<OrderView>;
  executePayment(agent: AgentContext, input: { orderId: string; mandateId?: string }): Promise<OrderView>;
  getOrder(agent: AgentContext, orderId: string): Promise<OrderView>;
  /** Explicit human approval permits assisted payment, and never requires a mandate. */
  approveOrder(human: HumanContext, input: { orderId: string; saveMethod: boolean }): Promise<OrderView>;
  reconcile(scope: Scope, orderId: string, providerIdHint?: string): Promise<OrderView>;
  reconcileRefund(scope: Scope, orderId: string, refundId: string): Promise<OrderView>;
  /** Host records verified legacy spending under the same buyer lock, never applies agent caps to humans. */
  observeHumanSpend(client: PoolClient, scope: Scope, input: { sourceId: string; amount: Money; budgetPeriod: string; billingPeriod: string }): Promise<void>;
  pendingEvents(scope: Scope, limit?: number): Promise<DomainEvent[]>;
  acknowledgeEvent(scope: Scope, eventId: string): Promise<void>;
}
