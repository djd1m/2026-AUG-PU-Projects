# 04. API

Routes are defined in `src/server.ts`; input schemas live in domain input/services.
Success JSON is `{data,meta}`, errors are `{error:{code,message}}`, without secrets.
Unsafe tenant requests require a session cookie and exact Origin. Foreign resource:404;
unauthorized:401; rate limit:429; disabled/unavailable:503. Public unsubscribe accepts
a no-Origin server-to-server one-click request; a present Origin must match.
Operator routes require a separate Bearer and no cookie. None enable live transport.

| Method / path | Purpose |
|---|---|
| GET /healthz, /readyz | Database readiness, no secrets |
| POST /api/auth/register, /login, /logout | Account/session lifecycle (full prefix `/api/auth/`) |
| GET /api/auth/me, /api/app | Tenant identity and safe cabinet bootstrap |
| GET/POST /api/mailboxes | List/create |
| GET/PUT/PATCH /api/mailboxes/:id | Read/configure/state or limit changes |
| POST /api/mailboxes/:id/verify-test | Local verification only |
| GET/POST /api/mailboxes/:id/consents | Separate pool/campaign consent |
| GET /api/mailboxes/:id/reply-status | Poll status, real verification unknown |
| GET /api/pool | Aggregate pool state |
| GET/POST /api/campaigns; GET/PUT /api/campaigns/:id | Owned sequence records |
| GET /api/campaigns/:id/preview; POST .../start, .../pause | Explicit sequence controls |
| GET /api/dispatch/messages, /api/dispatch/jobs/:id | Owned local TEST sink/job |
| GET/POST /api/evidence; POST /api/evidence/compare | Manual observations/comparison |
| GET/POST /api/reports; POST /api/reports/:id/revoke, .../events | Share lifecycle |
| GET /reports/:token | Public whitelisted historical report |
| GET /api/billing/status; POST /api/billing/checkout; GET /api/billing/intents/:id | TEST billing |
| GET/POST/PATCH /api/partner; GET /api/partner/:code | Owned partner code/counts |
| GET /r/:code; GET /api/growth/events | Signed referral landing / owned events |
| GET/POST /unsubscribe/:token | Read-only confirmation / idempotent suppression |
| POST /api/complaints, /api/operator/billing/simulate, /api/operator/billing/reconcile | Separate operator authority |
