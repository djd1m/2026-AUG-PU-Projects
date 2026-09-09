---
name: project-context
description: >
  Load N3a product scope, actors, business rules and unresolved decisions. Use for
  N3a domain questions, requirements, roadmap, UX, N1 integration or payout work.
---

# N3a project context

Read these sources in order: `docs/validation-report.md`, `docs/PRD.md`,
`docs/Specification.md`, then the role-specific source named below. The validated documents
are plans and contracts; no application, API, service, test, deployment, or real transfer is
implied by their presence.

## Product and actors

N3a runs one pilot affiliate program for N1 Proofwall. An owner configures the program and
manually transfers the prior calendar month's payable amount on the 5th. A partner accepts a
specific terms version, gets a personal link/promo, and sees only their attribution, ledger,
corrections, and payout state. A scoped operator may review exceptions. The invited N1 customer
has no access to partner data.

The core path is program setup → invite/consent → link or promo → N1 registration → verified
ЮKassa payment → commission → immutable monthly registry → authorized manual transfer
observation. N1 stays the billing authority; N3a owns its affiliate ledger. N2 is a source donor.

## Non-negotiable vocabulary

| Term | Meaning |
|---|---|
| eligible payment | A unique, provider-verified N1 payment that matches the captured policy |
| transport receipt | A delivery attempt/identity; it is not business-payment uniqueness |
| ledger posting | Append-only monetary effect with provenance |
| correction | Linked negative or compensating posting; history is not rewritten |
| registry snapshot | Immutable freeze for a calendar month |
| payout preparation | Current tax/evidence decision; it does not send money |
| transfer observation | Claimed external fact under review; not automatic authorization |
| sent | Authorized operator record of sending; not bank receipt |
| MRR unknown | Required display until reliable subscription/period facts arrive |

## Scope boundaries

MVP includes N1 attribution, every eligible manual renewal payment, refunds, owner/partner
views, registry/tax gates, manual marking, voluntary share, and free-page badge seed. It excludes
autocharge, automatic/bulk bank payouts, public API, MCP/A2A product features, multitenant SaaS
network, multiple providers, production rollout, and N1 testimonial-widget changes.

D7 is unresolved. Keep the N3a platform-affiliate feature blocked. Do not assume either a
lead-only pilot or immediate monetary dogfooding; the latter needs N3a price, billing source,
verified payment contract, and owner decision. N1 payments cannot stand in for N3a sales.

## Source routing

- Observable behavior and SC IDs: `docs/Specification.md`
- Algorithms, values, state transitions and API shapes: `docs/Pseudocode.md`
- Placement, trust boundaries and stack proposal: `docs/Architecture.md`
- Decisions and rejected alternatives: `docs/ADR.md`
- C4 relationships: `docs/C4_Diagrams.md`
- Tests and failure fixtures: `docs/Refinement.md`, `docs/test-scenarios.md`
- Release and operational gates: `docs/Completion.md`
- Reuse/provenance: `docs/discovery/reuse-inventory.md`
- Current limits and review evidence: `docs/validation-report.md`
