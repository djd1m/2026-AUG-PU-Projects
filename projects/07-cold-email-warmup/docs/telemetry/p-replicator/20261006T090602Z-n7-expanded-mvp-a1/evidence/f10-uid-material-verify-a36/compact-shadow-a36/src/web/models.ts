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
    mode: string;
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
export interface Billing {
    plan: string;
    limits: {
        mailboxes: number | null;
        activeCampaigns: number;
    };
    expiresAt: string | null;
    mode: string;
    checkoutAvailable: boolean;
    hardMailQuota: number;
    testPlan: {
        amountMinor: number;
        currency: string;
        durationDays: number;
    };
}
export interface Intent {
    id: string;
    state: string;
    canonicalStatus: string | null;
    attribution_reason: string;
    mode: string;
    entitlement: {
        plan: string;
    };
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
        dispatch: string;
        poll: string;
        billing: string;
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
    intents: {
        id: string;
        state: string;
        created_at: string;
    }[];
    referralCookiePresent: boolean;
    providers: {
        host: string;
        limit: number;
    }[];
}
