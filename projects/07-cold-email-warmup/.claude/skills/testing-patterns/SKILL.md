---
name: testing-patterns
description: Testing patterns with Gherkin templates for N7 Почтовый прогрев. Use when writing tests, creating fixtures, or following TDD workflow. Keywords: test, Gherkin, scenario, fixture, TDD, coverage.
---

# Testing Patterns

## Available Features

| Feature | Scenarios | Coverage |
|---------|-----------|----------|
| Auth/mailbox/consent | SC-US-001..003 | future runtime |
| Pool/campaign/replies/unsubscribe | SC-US-004..007 | future runtime |
| Evidence/billing/growth | SC-US-008..013 | future runtime |

## Gherkin → Test Mapping

### Feature: SC-US-006-3 crash rollback and replay

```gherkin
Given a persisted rescan cursor and unseen reply
When crash occurs after page writes BEFORE COMMIT
Then no page effect or cursor advance is durable
```

Maps to:

```text
Sol implements a PostgreSQL fault-injection integration test bound to SC-US-006-3; do not replace it with an in-memory transaction mock.
```

## Given → Setup Patterns

| Given Step | Setup Code |
|------------|------------|
| two tenants | isolated database fixtures |
| persisted rescan cursor | committed run/cursor/highwater |

## When → Action Patterns

| When Step | Action Code |
|-----------|-------------|
| stop wins before final submitting | explicit transaction barrier |
| crash before pageCOMMIT | fault hook then rollback/connection loss |

## Then → Assert Patterns

| Then Step | Assertion Code |
|-----------|----------------|
| no transport | fake transport call count0 |
| no partial page | durable cursor/effects inspection after reconnect |

## Fixture Patterns

```text
Local SMTP/IMAP and independent payment provider fixture state only; never real emails/charges. Data builders create two tenants and distinct credentials.
```

## Coverage Requirements (Fitness)

| Metric | Target |
|--------|--------|
| Line Coverage | not prescribed; explicit critical-path assertions required |
| Branch Coverage | not prescribed; explicit critical-path assertions required |
| Critical Paths | 100% |

## Test Data Builders

```text
Sol test builder produces distinct tenant/mailbox/enrollment IDs; expected effects come from specification, not implementation helpers.
```
