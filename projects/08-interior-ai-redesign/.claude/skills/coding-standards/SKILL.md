---
name: coding-standards
description: Coding standards with DDD patterns for RoomKind. Use when writing code, reviewing style, or applying project conventions. Keywords: style, convention, pattern, standard, Node ESM, PostgreSQL, Python, image processing.
---

# Coding Standards

## From .ai-context

No .ai-context. Follow docs/Architecture.md and project rules/coding-style.md: small ESM modules, typed boundary validation, parameterized SQL, Python worker separation. The DDD naming/file examples below are retained template reference only, NOT the selected project structure; actual structure is web/,worker/,db/,tests/.

## DDD Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Aggregate | PascalCase, noun | `OrderAggregate` |
| Entity | PascalCase, noun | `OrderItem` |
| Value Object | PascalCase, descriptive | `Money`, `Address` |
| Domain Event | PascalCase, past tense | `OrderPlaced` |
| Repository | I{Aggregate}Repository | `IOrderRepository` |
| Domain Service | {Action}Service | `PricingService` |

## File Organization (DDD)

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

Network/image work outside DB transactions. Lock budget→account→intent→job. Explicit provider/fixture modes and pinned model revisions; no silent fallback. Server integer money/credits and UTC.

## Anti-Patterns

Do not copy N6 time-plan/commissions, add Redis/S3 without requirement, use OpenAI imagegen instead of ControlNet, accept fixture quality, expose raw volume, or trust return URL/client badge flags.
