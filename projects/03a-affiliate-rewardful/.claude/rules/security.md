# N3a security rules

Sources: `docs/Specification.md` FR-AUTH-001, FR-N1-001, FR-TAX-001..004,
NFR-SECURITY-001/002, NFR-PRIVACY-001; `docs/Architecture.md` Security Architecture;
`docs/Refinement.md` Security Hardening.

## Trust boundaries

- Authenticate sessions before tenant lookup or any durable write. Store only password
  hashes and session-token hashes; expired or revoked sessions authorize nothing.
- Assign owner/partner roles through trusted enrollment or invite grants. Never accept a
  role, tenant, program, partner, merchant, or environment as authority from request data.
- Resolve object ownership locally and enforce deny-by-default server authorization on every
  read and mutation. Test cross-program and cross-partner access explicitly.
- Give delegated operators the smallest named scope. Program policy, tax approval, payout
  preparation, and transfer observation require their specific authority and audit actor.

## N1 and ЮKassa intake

Apply the operation order in the inherited root rule
`../../../../.claude/rules/security-operation-order.md`: authenticate transport, validate the
envelope, authorize the connection, verify provider facts, resolve local business identity,
then claim/post atomically. A duplicate response cannot happen before authentication.

N1 alone holds ЮKassa credentials and performs canonical provider lookup. N3a verifies the
signed N1 event/attestation, connection, version/type, merchant/environment, customer/order,
amount, RUB, timestamps, and provider object identity. Redirects, raw notification fields,
signup, `paid_until`, or client metadata do not authorize a monetary effect.

Use bounded payloads, explicit allowlists, constant-time MAC comparison, key identifiers and
rotation overlap. Rate-limit invalid authentication without creating a claim. Never log raw
secrets, session tokens, complete provider payloads, tax evidence, or payment credentials.

## Data and output

- Parameterize SQL. Treat identifiers as values, not interpolated clauses.
- If connection-scoped tenant context is adopted, set it with parameterized `set_config` and
  execute protected queries on that same transaction/client; a shared-pool query loses context.
- Escape stored user text at every HTML output. Protect CSV exports against formula injection.
- Cookies must be Secure, HttpOnly, SameSite, scoped narrowly, and state changes must enforce
  CSRF/Origin protections appropriate to the chosen session design.
- Keep consent, program terms version, policy snapshot, financial provenance, and actor/time
  audit records append-only. Redaction/retention needs an approved policy before production.
- Unknown tax, recipient, contract, rule, YTD, or accountant state blocks payout progression.
- Validate required secrets at startup with no development fallback. Keep production CORS,
  errors and logging strict; never expose stack traces or sensitive values in responses.

Run dependency and secret scans only through commands actually present in the implemented
foundation. Record unavailable checks as unavailable; do not invent a passing result.
