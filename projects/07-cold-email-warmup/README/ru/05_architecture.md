# 05. Архитектура

Node 22/TypeScript native HTTP, PostgreSQL 16, pg и Argon2id. Браузерный кабинет
использует реальные tenant API. Worker и web разделяют durable очередь и
транзакционные проверки. Общая блокировка `(7,1)` сериализует все stop writers
с последним переходом в submitting; I/O выполняется после commit.
Credentials и адреса защищены AEAD с внешним keyring, lookup — отдельным HMAC.
Нет Redis, LLM, реального SMTP/IMAP или платёжного SDK.

[Architecture](../../docs/Architecture.md) · [ADR](../../docs/ADR.md) · [Walkthrough](../../docs/pipeline-walkthrough.md)
