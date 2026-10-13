---
name: project-context
description: Full project context and domain knowledge for RoomKind. Use when needing business context, domain understanding, or project background. Keywords: context, domain, business, glossary, background.
---

# Project Context

## Overview

Photo→style→depth-conditioned redesign→private comparison→explicit share/package. Sources docs/PRD.md and Final_Summary.md; no .ai-context files.

## Architecture Summary

Node22 web, PostgreSQL16 ledger/queue, private media volume, Python SD+ControlNet worker and YooKassa hosted checkout. See docs/Architecture.md.

## Key Decisions

ADR001 real depth conditioning;002 transactional credits/tickets/jobs;003 verified900RUB20pack;004 minimal native UI/private storage;005 explicit fixtures/evidence.

## Domain Glossary

| Term | Definition | Context |
|------|------------|---------|
| Ticket | Conservative daily attempt capacity | Not refundable credit |
| Reserve | One ledger debit for a job | Released once on terminal failure |
| Hold | Monotonic refund-review spending block | Stops starts and badge-free delivery |
| Accepted | Operator-reviewed exact real output | Not equivalent to job success |

## Bounded Contexts

No enterprise DDD hierarchy. Modules auth/media/jobs/payments/sharing have explicit API/transaction boundaries in Pseudocode.

## Business Rules

One trial/account; reserve/release/payment exactly once; first conversion/account; effective badge entitlement excludes hold; public consent+accepted real output required; fixtures never GPU evidence.

## User Personas

Owners/renters primary; realtors/bloggers secondary hypotheses, not measured segments.

## Success Metrics

12 unique share completions/week;20% onlyn≥30. Geometry12rooms×3styles, no opening changes,anchors≤2%; warmGPU p95≤25s atn≥30. All real measurements pending.
