# N7 testing

Canonical54 scenario IDs: docs/test-scenarios.md and docs/tests/security-scenarios.md.
Source-bound tests must prove assertions, not mirror implementation. Unit input/policy
oracles; real PostgreSQL integration for rollback,20workers/3quota,2tenant boundaries;
local SMTP/IMAP protocol fixtures for TLS/auth/reply/UIDVALIDITY; no external sends.
Final-stop tests exercise every stop writer BEFORE and AFTER submitting commit.
Rescan fault injection before page commit proves no partial cursor/effects, after commit
proves durability, replay proves semantic dedup. Local billing must succeed canonically.
UI E2E through shared Docker Playwright1.63.0,390/1440+keyboard+persistence; preflight first.
Required typecheck/lint/build/full tests and consent/quota/tenant mutations. BudgetCPU2;
coordinate heavy suites with root. Rerun affected checks only after relevant changes.
No line/branch percentage invented; acceptance requires critical scenario assertions.
