# N8 — secrets-management

Server-only env keys/session secret; no NEXT_PUBLIC/client storage/logs. Private .env ignored and0600. Local loopback, future TLS/release separately authorized. Client never receives provider key, encryption of exposed keys is not a substitute. Rotation needs explicit session/ledger impact plan; no global config change.
