export type RuntimeMode = 'disabled' | 'local_test' | 'live_provider';
export interface MailboxPage {items: Mailbox[]; total:number; limit:number; nextCursor:string|null;}
export interface Mailbox {
    diagnostics:{state:'disabled'|'never_run'|'pending'|'stale'|'current';result:null|{evidenceMode:string;checkedAt:string;smtp:{tls:string;auth:string;phase:string;code:string|null};imap:{tls:string;auth:string;phase:string;code:string|null}}};
    capacity:{state:'inactive'|'active'|'waiting_capacity';expiresAt:string|null};
    id: string;
    label: string;
    state: string;
    daily_limit: number;
    effective_limit: number;
    metadata: {
        senderAddress: string;
        smtpHost: string;
        smtpPort: number;
        imapHost: string;
    };
}
export interface Step {
    subject: string;
    body: string;
    delayHours: number;
}
export interface Campaign {
    id: string;
    state: string;
    steps: Step[];
    recipients: string[];
    personalization: Record<string, Record<string, string>>;
    content_version: number;
    recipient_fingerprint: string;
}
export interface Consent {
    scope: string;
    campaign_id: string | null;
    scope_version: number;
    recipient_fingerprint: string | null;
    revoked_at: string | null;
    granted_at: string;
}
export interface Poll {
    mode: RuntimeMode;
    scan: {
        state: string;
        provenance: string;
    } | null;
    lastComplete: string | null;
    scanComplete: boolean;
    realVerification: string;
}
export interface Observation {
    id: string;
    evidence: {
        sourceUrl: string;
        reference: string;
        observedAt: string;
        windowStart: string;
        windowEnd: string;
        metric: string;
        direction: string;
        numerator: number;
        denominator: number;
    };
}
export interface Comparison {
    reason: string;
    shareAllowed: boolean;
    display: string;
    baseline: Observation['evidence'];
    latest: Observation['evidence'];
}
export interface Report {
    id: string;
    token: string;
    created_at: string;
    revoked_at: string | null;
}
export interface Event {
    kind: string;
    created_at: string;
}
export interface Entitlement {
    plan: string;
    limits: { mailboxes: number | null; activeCampaigns: number };
    expiresAt: string | null;
    hardMailQuota: number;
}
export interface Price { plan: 'team'; amountMinor: number; currency: 'RUB'; durationDays: 30; label: 'TEST' | 'LIVE' }
export type Billing = Entitlement & (
    { mode: 'disabled'; checkoutAvailable: false; label: null } |
    { mode: 'local_test'; checkoutAvailable: true; label: 'TEST'; testPlan: Price } |
    { mode: 'live_provider'; checkoutAvailable: true; label: 'LIVE'; price: Price; availability: string }
);
interface IntentBase { id: string; plan: string; state: string; created_at: string; checkoutUrl: string | null }
export type Intent = IntentBase & (
    { mode: 'live_provider'; label: 'LIVE'; price: Price; availability: string; entitlement: Entitlement } |
    { mode: 'local_test' | 'disabled'; label: 'TEST'; price: Price; canonicalStatus: string | null; attribution_reason?: string; entitlement?: Entitlement }
);
export type IntentHistory = { id: string; state: string; created_at: string } & (
    {mode: 'local_test'; label: 'TEST'} | {mode: 'live_provider'; label: 'LIVE'}
);
export function modeLabel(mode: RuntimeMode) { return mode === 'live_provider' ? 'LIVE' : mode === 'local_test' ? 'TEST' : 'отключено'; }
export function pollFresh(poll: Poll, now = Date.now()) {
    const age = poll.lastComplete === null ? NaN : now - Date.parse(poll.lastComplete);
    return poll.scanComplete && age >= 0 && age < 60000;
}
export function pollGuidance(mode: RuntimeMode) {
    return mode === 'live_provider'
        ? 'Ответы проверяет IMAP worker после отдельного разрешения оператора; эта кнопка только читает статус. Нет полного IMAP-опроса младше 60 секунд — оператор должен разрешить transport, и live worker должен завершить опрос.'
        : mode === 'local_test' ? 'Оператор/worker выполняет TEST-опрос; эта кнопка только читает статус.'
        : 'Опрос отключён оператором; свежего полного опроса нет.';
}
export function diagnosticEvidence(mode: string | undefined) {
    return mode === 'live_provider' ? 'реальное соединение SMTP/IMAP' : mode === 'protocol_fixture' ? 'локальный протокольный fixture' : 'нет доказательств реального соединения';
}
export interface Partner {
    code: string;
    active: boolean;
    conversions: number;
    events: {
        shares: number;
        copies: number;
        links: number;
    };
    label: string;
}
export interface Metadata {
    identity: {
        account_id: string;
        tenant_id: string;
    };
    modes: {
        dispatch: RuntimeMode;
        poll: RuntimeMode;
        billing: RuntimeMode;
    };
    poolDisclosure: {
        version: number;
        headers: string[];
        testBody: string;
    };
    plans: {
        free: {
            mailboxes: number | null;
            activeCampaigns: number;
        };
        team: {
            mailboxes: number | null;
            activeCampaigns: number;
        };
    };
    intents: IntentHistory[];
    referralCookiePresent: boolean;
    providers: {
        host: string;
        limit: number;
    }[];
}
