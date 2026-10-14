---
name: testing-patterns
description: N8 meaningful fixtures, Gherkin, adversarial/concurrency/mutation and browser evidence.
---

# Testing Patterns

## Available Features

| Feature | Scenarios | Coverage |
|---|---|---|
| foundation | sessions/ownership/prebody/rate | independent tests pending |
| space | measurements/uploads/refs | guards + actual decoder fixtures |
| design | immutable scene/history/job caps | real DB fences/barriers |
| procurement | packaging/unknown/phase/CSV | exact immutable round trips |
| billing | replay/outage/refund | offline HTTP provider + real DB |
| sharing | provenance/watermark/revoke | real bytes + browser |

## Gherkin → Test Mapping

### Feature: procurement

```gherkin
Given confirmed18m2 and8percent waste
And pack1.99m2 costs160000minor
When calculateBudget runs
Then10packs and1600000minor are returned
And missing delivery remains unresolved
```

Maps to a test invoking actual production calculation and asserting literal10/1600000, not another copy of the algorithm. Exact named65SC live in docs/test-scenarios.md.

## Given → Setup Patterns

| Given Step | Setup Code |
|---|---|
| two owners | isolated real PostgreSQL fixtures, owned IDs |
| provider outage | local HTTP simulator timeout/invalid response |
| concurrent writes | separate connections and held-lock barrier |

## When → Action Patterns

| When Step | Action Code |
|---|---|
| calculate | actual public domain function |
| mutation | actual service/API with same expectedVersion |
| webhook | actual adapter HTTP parser then ledger transaction |

## Then → Assert Patterns

| Then Step | Assertion Code |
|---|---|
| one effect | query persisted ledger/counter after race |
| privacy | actual forbidden response/bytes + unchanged rows |
| unknown | null/status/unknown count, never invented0 |

## Fixture Patterns

Fresh schema/asset temp scope; never use unrelated production data. Capture exact fixture/code/spec/build/host hashes. Tests missing required DB are not-run, not successful skip.

## Coverage Requirements (Fitness)

All named mandatory risk cases must pass; arbitrary line/branch percentage not assigned. Threshold tests pin literal limits. Mutation introduces actual bug and must fail. Source parsing guards alone do not prove runtime behavior.

## Test Data Builders

Use existing donor fixture patterns with N8 types, injected clocks/providers for units; actual HTTP/DB/bytes for integration. Companion readiness preflight immediately before Playwright production build. One unchanged passing suite is not rerun without cause.
