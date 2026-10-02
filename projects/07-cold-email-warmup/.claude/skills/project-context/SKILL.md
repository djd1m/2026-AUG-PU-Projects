---
name: project-context
description: Full project context and domain knowledge for N7 Почтовый прогрев. Use when needing business context, domain understanding, or project background. Keywords: context, domain, business, glossary, background.
---

# Project Context

## Overview

Local-first SMTP/IMAP warmup and sequences; UI based on CJM A; no AI replies/CRM. Source docs/PRD.md.

## Architecture Summary

Distributed monolith: web/API, worker, PostgreSQL16, isolated Docker network. See docs/Architecture.md.

## Key Decisions

ADR001 server AEAD;002 final submitting and default local transport;003 consented seed cohort;004 canonical local billing;005 narrow safe donor reuse.

## Domain Glossary

| Term | Definition | Context |
|------|------------|---------|
| consent | separate versioned permission | pool or campaign |
| submitting | durable irreversible in-flight boundary | dispatch |
| reply effect | unique mailbox/enrollment stop/count | ingestion |
| unknown | insufficient real observation | reputation |

## Bounded Contexts

SPARC, no DDD layer imposed: identity, mailbox, dispatch/replies, billing/growth modules.

## Business Rules

Separate consent; shared daily quota; every letter unsubscribe; stop/reply/complaint quarantine; no invented reputation. Direct peers see disclosed sender/headers/test body; private campaign APIs stay isolated.

## User Personas

Course seed cohort and small B2B sales team; operator handles test fixtures and provider permissions.

## Success Metrics

Seed30 eligible mailboxes is a pilot target, not measured adoption. Reputation/share requires sourced comparable observations; small cohorts show rawcounts. No claimed causal lift.
