# 05. Architecture

Node 22/TypeScript native HTTP, PostgreSQL 16, pg and Argon2id. The cabinet uses
real tenant APIs. Workers share durable jobs and transactional eligibility checks.
Advisory lock `(7,1)` serializes all stop writers against final submitting; I/O
happens after commit. Credentials/addresses use AEAD with an external keyring and
a separate lookup HMAC. No Redis, LLM, live SMTP/IMAP or payment SDK is used.

[Architecture](../../docs/Architecture.md) · [ADR](../../docs/ADR.md) · [Walkthrough](../../docs/pipeline-walkthrough.md)
