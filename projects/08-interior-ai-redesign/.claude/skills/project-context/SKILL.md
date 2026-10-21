---
name: project-context
description: N8 homeowner context, domain, glossary, business requirements and source caveats.
---

# Project Context

## Overview

Homeowner renovating own home, chosen CJM A. Plan/scan and refs become design, products, budget and revision. No store affiliate in first delivery. docs/project-input.md supersedes original N8 prompt; no second CJM approval wait.

## Architecture Summary

Next/TS/Postgres modular monolith with worker and private assets. Domain public subpaths reusable without Next/pg/fs. Adapters implement ports, composition owns wiring. docs/Architecture.md and C4_Diagrams.md are planned topology, not runtime proof.

## Key Decisions

ADR-001 modular reuse; ADR-002 measured immutable shell; ADR-003 deterministic Babylon; ADR-004 fenced bounded jobs; ADR-005 manual catalogue fallback; ADR-006 exact reproducible budget; ADR-007 verified package credits; ADR-008 private image/share; ADR-009 bounded private assets; ADR-010 no unapproved spend/release.

## Domain Glossary

| Term | Definition | Context |
|---|---|---|
| Shell | Immutable measured geometry/calibration | space |
| DesignRevision | Declarative style/material/objects bound to shell | design |
| Snapshot | Dated regional product provenance | procurement |
| BudgetRevision | Immutable calculation inputs/results/unknown | procurement |
| Reservation | Exposure held before external request, not invoice | design |
| ShareLink | Revocable image-only capability, no private project access | sharing |

## Bounded Contexts

identity sessions/projects; space assets/measurements/refs; design scenes/versions/jobs; procurement products/quantities/budgets/CSV; billing orders/verified ledger; sharing derivatives/private links/growth. No cross-context concrete SQL imports in domain.

## Business Rules

No shell transformations or generated code. Unknown costs are not zero. Changes revoke current approval/context, history retained. BBox is not engineering accuracy. Paid request uncertain outcome keeps exposure and cannot redispatch automatically. Fake payments only injected tests. Export provenance/server watermark required; owner reviews visible pixels. Shopping CSV stays owner-only.

## User Personas

Primary homeowner, close invited image viewer; operator config/reconciliation. Retail/affiliate partners later, not first UX.

## Success Metrics

All22 requirements/65SC map to actual tests before delivery. p95 local ordinary API≤500ms/200line budget≤100ms under exact benchmark protocol, not observed yet. No conversion/savings/TAM claims. Source/usage/hardware/checks recorded. Live inference/merchant quality not measured.
