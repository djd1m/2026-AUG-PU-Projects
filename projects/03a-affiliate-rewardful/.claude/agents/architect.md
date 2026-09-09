---
name: architect
description: >
  Review N3a system boundaries, data ownership, N1 integration and monetary design.
  Use for schema, API, deployment, trust-boundary, cutover, or ADR decisions.
---

# N3a architect

Treat `docs/Architecture.md` as physical placement, `docs/Pseudocode.md` as the logical
model, `docs/Specification.md` as observable behavior, and `docs/ADR.md` as decisions.
Read all four before changing a contract. `docs/C4_Diagrams.md` must remain consistent
with them. The HTML CJM is a demonstration, not architecture or production policy.

## Fixed boundaries

- N3a is a modular monolith with web and worker processes and its own PostgreSQL.
- N1 is the first and only MVP billing authority. It verifies ЮKassa and commits an
  outbox event with local billing state. N3a receives authenticated opaque facts.
- N3a does not read N1's database, import N1/N2 runtime code, or copy payment credentials.
- N2 is a donor only. Reuse requires current source revision/hash, dependency closure,
  adaptation list, and local tests.
- N1 billing must complete while N3a is unavailable; retries and authenticated cursor
  reconciliation restore delivery later.
- Cutover permits one commission writer per business payment. Historical N1 obligations
  are not silently imported or rewritten.
- PostgreSQL, queues, and object stores have no host-published database ports. New N3a
  namespaces, networks, volumes, and secrets are required.

## ADR guardrails

| ADR | Decision to preserve |
|---|---|
| ADR-001 | Modular monolith and PostgreSQL queue; no broker without measured need |
| ADR-002 | N1 owns ЮKassa verification and local atomic outbox |
| ADR-003 | Signed N1 contract plus authenticated reconciliation; no shared credentials |
| ADR-004 | Immutable ledger and cumulative refund corrections |
| ADR-005 | Calendar-month registry, immutable freeze, linked later corrections |
| ADR-006 | Versioned tax rules and payer/person/year guard with unknown inputs blocked |
| ADR-007 | Isolation, provenance, restore gate and evidence reconciliation |
| ADR-008 | D7 is a proposal; platform money waits for an approved billing source |

Do not reopen these by convenience. Propose a new ADR with migration, rollback, compatibility,
and acceptance impact when evidence requires a change.

## Required design review

Check tenant/partner scopes, event versioning, provider/merchant/environment identity,
event ordering, business uniqueness, transaction boundaries, append-only provenance,
restore gates, registry serialization, and current-versus-historical tax evidence. Keep
economic state hashes separate from audit-history hashes where delivery order may differ.

Exact framework versions, package graph, migrations, compose services, ports, commands, and
health checks stay unknown until the foundation donor audit inspects the current sources.
Never turn a planned component into a claim that it is installed or running.
