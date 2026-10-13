---
name: coding-standards
description: Coding standards with DDD patterns for N7 Почтовый прогрев. Use when writing code, reviewing style, or applying project conventions. Keywords: style, convention, pattern, standard, TypeScript, PostgreSQL, SMTP, IMAP.
---

# Coding Standards

## From .ai-context

SPARC project: strict TypeScript/nativeHTTP, parameterizedpg, one-client transactions, typed fail-closed adapters; .claude/rules/coding-style.md.

## DDD Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Aggregate | PascalCase, noun | `OrderAggregate` |
| Entity | PascalCase, noun | `OrderItem` |
| Value Object | PascalCase, descriptive | `Money`, `Address` |
| Domain Event | PascalCase, past tense | `OrderPlaced` |
| Repository | I{Aggregate}Repository | `IOrderRepository` |
| Domain Service | {Action}Service | `PricingService` |

## File Organization (DDD reference; N7 uses SPARC modules)

```
src/
├── domain/
│   ├── {context}/
│   │   ├── aggregates/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/
│   │   ├── repositories/
│   │   └── services/
│   └── shared/
├── application/
│   └── {context}/
│       ├── commands/
│       ├── queries/
│       └── handlers/
└── infrastructure/
    └── {context}/
        ├── persistence/
        └── messaging/
```

## ADR-Based Standards

ADR001 external AEADkeys+tenant/mailboxAAD;002 no blindresend;003 no synthetic reputation;004 immutableintent+canonicalprovider;005 sourceSHA/license/security reuse evidence.

## Anti-Patterns

Reject client-only worker secrets, in-memory job/quota authority, UID-only reply dedup, redirect entitlement grant and unbounded KDF. No gratuitous DDD abstractions; naming table is vocabulary only.
