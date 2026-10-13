---
name: testing-patterns
description: Testing patterns with Gherkin templates for RoomKind. Use when writing tests, creating fixtures, or following TDD workflow. Keywords: test, Gherkin, scenario, fixture, TDD, coverage.
---

# Testing Patterns

## Available Features

| Feature | Scenarios | Coverage |
|---------|-----------|----------|
| docs/test-scenarios.md |57 named scenarios /41AC | Planned required paths, execution pending |

## Gherkin → Test Mapping

### Feature: Refund hold and credit reservation

```gherkin
Given a verified refund hold
When a new reservation races after hold
Then no reservation or attempt starts
```

Maps to:

```javascript
// Planned test shape; not an executed result.
await settleVerifiedRefund(refund);
await assert.rejects(() => reserveJob(account, input), { code: "billing_hold" });
```

## Given → Setup Patterns

| Given Step | Setup Code |
|------------|------------|
| Existing account/credit | Isolated real Postgres setup |
| Verified provider object | Explicit bounded local provider adapter |

## When → Action Patterns

| When Step | Action Code |
|-----------|-------------|
| Concurrent notifications/reservations | Promise.all against separate DB connections |

## Then → Assert Patterns

| Then Step | Assertion Code |
|-----------|----------------|
| Exactly once | Query ledger reference/count/balance |
| Owner denied |404 and zero bytes |

## Fixture Patterns

```javascript
// Fixtures are local test inputs, never real quality evidence.
const jobMode = "fixture"; // production startup refuses this mode
```

## Coverage Requirements (Fitness)

| Metric | Target |
|--------|--------|
| Line Coverage | Not prescribed; named AC coverage required |
| Branch Coverage | Not prescribed; named AC coverage required |
| Critical Paths | 100% |

## Test Data Builders

```javascript
// Build two distinct accounts and owner-scoped image IDs;
// use injected provider responses and no live merchant credentials.
```
