---
name: coding-standards
description: N8 TypeScript module boundaries, conventions, Decimal and SQL patterns for code/review.
---

# Coding Standards

## From .ai-context

No .ai-context/DDD artifact was generated; authoritative SPARC paths docs/Architecture.md, Specification.md, Pseudocode.md, ADR.md. TypeScript strict, small pure domain functions/ports, validated runtime boundaries. Generic root toolkit remains linked.

## DDD Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Entity/DTO | PascalCase | DesignRevision |
| Value | descriptive immutable type | BudgetLine |
| Store port | named domain interface | AuthStore |
| Provider port | named capability interface | PaymentProvider |
| Command | verb reflecting effect | approveDesign |
| SQL table/column | snake_case | design_revision/shell_id |

## File Organization (DDD)

N8 uses modules instead of an additional DDD layer hierarchy:

```text
packages/domain/src/identity/index.ts
packages/domain/src/space/index.ts
packages/domain/src/design/index.ts
packages/domain/src/procurement/index.ts
packages/domain/src/billing/index.ts
packages/domain/src/sharing/index.ts
packages/db/src/
packages/adapters/src/
apps/web/src/server/composition.ts
apps/web/src/app/
apps/worker/src/
```

Every module exports its public contract. Concrete I/O dependency belongs in adapters/db/composition. Types from other modules import public subpath only. No donor runtime import: adapted code carries provenance and tests.

## ADR-Based Standards

Identity guards pre-body, bcrypt bytes bounded. Canonical decimal strings until Decimal conversion; minor money bounded integer. Transaction lock order stable mutex→Account→Project→budgets→Job; payment Account→Order. Network outside transaction. Ownership predicates/scalar FKs/embedded relation validation are separate guards. One current-shell hash; immutable source content. Runtime secrets never client bundle.

## Anti-Patterns

No arbitrary model code/URLs; no computed unknown0; no current rows used to reproduce old budget; no in-memory rate/payment ledger; no client price/entitlement; no schema-mutating runtime role; no broad fallback from misspelled config. No shared file writers or new engines without concrete AC.
