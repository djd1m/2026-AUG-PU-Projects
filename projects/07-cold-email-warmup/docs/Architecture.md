# Architecture — N7 v1.1

## Architecture Overview

Distributed Monolith in project monorepo. Local Docker Compose on the development host, separate N7 network and volumes.
Production deployment remains gated. No changes to shared proxy without approval.

```mermaid
flowchart LR
  Browser --> Web[Web and API]
  Web --> PG[(PostgreSQL)]
  Worker[Bounded local scheduler and reply worker] --> PG
  Worker --> SMTP[Durable local test sink]
  Worker --> IMAP[Local inbox fixture]
  Web --> Pay[Canonical local TEST payment adapter]
```

## Component Breakdown / Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Accessible server shell + TypeScript interactive cabinet based on CJM A | Small MVP, full loading/error/consent states, no external UI assets |
| Backend | Node 22, TypeScript, bounded HTTP routing/domain services | Reuse donor native crypto/pg patterns, explicit validation |
| Database | PostgreSQL 16 container | Durable jobs, atomic quota, tenant data, unique idempotency keys |
| Cache | None initially | Avoid second authority for consent/quota |
| Queue | PostgreSQL jobs and SKIP LOCKED | Shared transaction for claim, consent and limits |
| Worker | Separate Node process/container using same domain package | Scheduled local warmup and bounded inbox ingestion |
| Infrastructure | Docker Compose, loopback-only web port variable | Isolated ownership; DB expose only, no host mapping |
| Test browser | Existing codex-ui-playwright 1.63.0 | Owner-required shared browser; isolated contexts/artifacts |

Project owns package.json and package-lock.json; root manifests untouched. Sol
proposes dependency edits, N7 integration owner reconciles final project lock.
No product LLM call required; no LLM secret is copied merely because available.

## Tenant / credential boundaries

ADR-001: credential encryption server-side required by background operation,
approved in OWN-N7-002. Separate runtime secrets for sessions, credential
AEAD and unsubscribe signing; keys never in DB, repo, API or logs. Mailbox AAD
prevents swapping ciphertext across tenants. Key-version enables explicit rotation.
Web cannot return decrypted credentials. Worker logs opaque IDs and typed errors.
Provider endpoints are operator allowlisted and IP-validated/pinned at connect time.

Tenant predicates are mandatory on every owner query; jobs carry server-derived
tenant. Cross-tenant pool selection happens only inside scheduler and returns
no peer email to dashboard. Direct SMTP recipients necessarily see sender address,
routing headers and test body in their own mail client. Versioned pool consent
must disclose this before either direction is scheduled. Private campaign content,
credentials, contact lists and pool enumeration stay tenant-private. Pool
participation needs recipient and sender consent; two-tenant message fixture and
API-denial tests establish both sides of this boundary.
Use account-scoped transaction helpers; independent tests use two tenants.

## External Dependencies

Checked 2026-10-02; quotes are short excerpts from opened primary documentation.

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| SMTP transport with enforced TLS | Nodemailer against compatible SMTP server | [SMTP docs](https://nodemailer.com/smtp): “Nodemailer requires a STARTTLS upgrade” · checked 2026-10-02 | CONFIRMED | FR-n7-002, FR-n7-005 |
| IMAP connect/read mailbox | ImapFlow against compatible IMAP server | [Quick Start](https://imapflow.com/docs/getting-started/quick-start/): “await client.connect()” · checked 2026-10-02 | CONFIRMED | FR-n7-002, FR-n7-006 |
| Live sending permission for a concrete mailbox/provider | Operator-selected provider | No live credentials or provider account policy checked yet | UNCONFIRMED | Live activation only, deferred out of initial local MVP acceptance |
| Provider complaint feed | Provider-specific adapter | No concrete provider selected; manual authenticated operator intake used locally | UNCONFIRMED | Automated live provider complaint intake deferred; FR-n7-007 uses local operator path |
| Live payment capture | Payment provider | Not invoked; real provider activation needs separate contract verification | UNCONFIRMED | Live charge deferred only; local fake adapter success REQUIRED for FR-n7-009 and growth conversion |

CONFIRMED library capability does not confirm a particular account's auth method,
terms, deliverability or complaint feed. Optional live capabilities do not silently
become required without an updated plan. Yahoo source fetch failed and is not cited
as confirmed. No managed database substitutes are used.

## Data / operations

Schema entities and invariants: Pseudocode.md. DB migrations forward-only schema
changes; no destructive data migration in MVP. DB backup/restore instructions and
readiness probes before deployment. Auth/consent/event audit retained without body
or credentials. Local fake provider fixtures never appear as live observations.

Local fake payment adapter has independent durable fixture state, operator-only
status simulation and canonical-state query. It is part of the product test/sandbox
mode, never production payment evidence. Fixture team100 minor RUB/30days is
explicitly TEST. Checkout must produce a successful verified single grant locally;
503/unavailable alone cannot meet FR-n7-009. Live provider is independently deferred.

All eligibility writers and final claimed→submitting use transaction advisory
lock(7,1), acquired first. Final conditional transition rechecks current job/lease,
consent/version, recipient enrollment/suppression, both pool parties, quarantine,
fresh poll, quota date/limits and live gate in the SAME transaction. The commit
is the irreversible boundary. Earlier committed stops guarantee zero transport;
later stops cancel future jobs but cannot recall in-flight work before socket call.
No lock is held across network I/O. This deliberate global MVP serialization keeps
transactions short; optimization requires new concurrency evidence.

Reply ingestion has three identities: physical UID observation, optional stable
Message-ID ledger, authoritative unique(mailbox,enrollment,reply) effect. Only the
last counts replies/stops, surviving UIDVALIDITY reset and missing Message-ID.
Rescan cursor/high-water persist atomically; incomplete/budget-exhausted rescan
never clears pause. Numerical limits are canonical Specification safety-v1.

SMTP boundary: durable conditional submitting commit before socket call. Exactly-once SMTP
delivery cannot be guaranteed; crash/timeout after submission becomes unknown_delivery.
Safety ceiling uses attempted/submitted reservations, not only success responses.
Replies/suppression cancel queued steps; already submitting messages cannot be recalled.

ADR-002 default deny/live gate; ADR-003 seed eligibility; ADR-004 verified billing;
ADR-005 donor provenance. CPU limit 2 for tests, no parallel heavy builds with root.

## Decision Traceability

ADR-001 → FR-n7-002; ADR-002 → FR-n7-003/005; ADR-003 → FR-n7-004/008;
ADR-004 → FR-n7-009/FR-GROWTH-002; ADR-005 → FR-n7-001/NFR-n7-001.
These links establish named coverage, not implemented behavior.

## Implemented boundary — 2026-10-03

F01–F06 product contracts are accepted locally; see [Completion](Completion.md).
No Nodemailer/ImapFlow or live payment SDK is installed. Provider-host validation
and encrypted configuration do not imply a real connection. Historical scenario
links below/above are design traceability; actual execution receipts are linked
in [acceptance traceability](acceptance-traceability.md).
