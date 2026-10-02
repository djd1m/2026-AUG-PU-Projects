# F03a bounded reuse decisions

Source baseline: ada9d9b361492777ea8514487fef39546ae60024. Owner-approved internal donors only; no new dependency.

Use N7 F02 src/consent/transaction.ts, src/mailboxes/crypto.ts, src/errors.ts, tenant/session routing. Preserve global lock ordering and versioned AEAD without modifying crypto/network/auth algorithms. Adapt enrollment encryption by explicit purpose prefix in the tenant AAD parameter; key version/enrollment ID remain bound. F02 snapshot/consent store integrates canonical100-recipient validation and atomic version invalidation.

Bounded donor inspected: projects/05-podcast-clips-opus/apps/web/src/server/queue-runtime.ts; last-change SHA2b52eff62e9ef7607bade321e1c30c4363511662; SHA25658bb6eda462cc395d3fecc5c183e30c55da84ec7c4ee0ab467576d48d9eb19f2. Reject copying: this runtime couples Bull-style transport, video attempt state, S3 and watchdog deletion; it cannot share PostgreSQL consent/quota authority. Retain only the design lesson to separate durable state from execution; F03 scheduler/claim directly use the existing N7 transaction, no donor imports or code copied.

Existing docs/reuse-inventory.md contained no personalization fragment. No broad donor survey/copy was performed; known-field plain-text replacement is small N7-owned code. Third-party dependencies and lockfile remain unchanged.
