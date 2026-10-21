# N7 security

Authority: docs/Specification.md safety-v1, docs/Architecture.md, ADR001–005.
Validate all inputs before state changes; server-derived tenant in every owner query.
Bound request/CSV/password input; reject header injection; plain-text allowlisted personalization.
Session revocation is durable; unsafe requests require same Origin and authorization.
Global advisory transaction lock(7,1) FIRST for every eligibility/stop writer and final
submitting transition. No lock across network. Before-commit stop denies transport; later
stop may leave one in-flight attempt. Both orderings require fault-injection tests.
AEAD keys external, versioned; AAD binds tenant+mailbox. Credentials never API/log output.
Distinct pool/campaign consent, unsubscribe every message, complaint sender quarantine.
Allowlisted provider host plus resolved-IP validation/pinning; TLS required. Local test
transport default; live disabled. No secrets in git/telemetry/dz. Scan dependencies and
secret diffs before acceptance; retain exact direct/transitive license/source provenance.
