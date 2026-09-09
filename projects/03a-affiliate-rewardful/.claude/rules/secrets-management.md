# N3a secrets management

Sources: `docs/Architecture.md` Security Architecture, `docs/Completion.md` Pre-Deployment,
and `docs/webhook-contract.md`.

- N1 keeps ЮKassa credentials. Never copy them into N3a, client code, URLs, logs, fixtures,
  screenshots, exports, commits, or telemetry.
- Create new N3a secrets for sessions, internal N1 authentication, database roles, and any
  operator integration. Do not reuse N1, N2, old N3, demo, or default credentials.
- Store secret material outside git and load it through the eventual environment/runtime
  secret mechanism. Commit only variable names and safe examples without values.
- Give each N1 connection a key ID and scoped secret; support rotation with a bounded overlap.
  Store only hashes where verification does not require plaintext.
- Do not expose secrets to browser bundles. Public partner codes and opaque IDs are identifiers,
  not authentication credentials.
- Redact command output before attaching evidence. Check names/presence without printing values.
- A missing secret or unknown key ID fails closed. Development must not silently substitute a
  hard-coded fallback.
- Rotation or compromise response must preserve event auditability, reject retired keys after
  overlap, and avoid replaying a monetary effect.

No secret store, environment file, rotation job, or installed service is asserted by this rule;
the foundation implementation must choose and verify them before runtime or deployment.
