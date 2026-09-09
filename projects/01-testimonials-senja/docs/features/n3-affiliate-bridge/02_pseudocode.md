# Pseudocode — Proofwall bridge

Canonical shared wire contract: ../../../../03-affiliate-rewardful/docs/features/f4-proofwall-integration/02_pseudocode.md. See role-specific algorithms below; local service-only verification, durable checkout and delivery tables enforce isolation.

## Algorithms and scenarios

### Algorithm: Proven signup

REQUIREMENT: `AC-n3-affiliate-bridge-1`

Given referred new Proofwall account, when same current account proves email with valid one-use fragment token, then atomically store service-only proof and durable idempotent signup delivery of original receipt toN3; checkout waits for acknowledged customer binding; GET/replay/foreign/expired/version-changed proof cannot verify; requests bounded5/hour/account and30/hour/IP with60s cooldown.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Identity and attribution

REQUIREMENT: `AC-n3-affiliate-bridge-2`

Given existing/SSO account or concurrent signup, when establishing referral proof, then no unverified equal-email SSO auto-link can inherit verified account; N3 and native cookie namespaces remain separate; no duplicate native commission on bridge-managed order.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Durable native checkout

REQUIREMENT: `AC-n3-affiliate-bridge-3`

Given owned project and verified bridge customer, when buying990RUB/30days, then persist stable local intent andN3external order before native YooKassa creation; metadata binds both IDs, retries/earlywebhook/crash recover one purchase; amount/project/customer cannot be browser-forged.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Transactional delivery

REQUIREMENT: `AC-n3-affiliate-bridge-4`

Given confirmed provider payment, when native webhook commits tariff, then atomically persist unique bridge event; N3 outage/restart cannot lose it or duplicate tariff; bounded leased worker sends outsideSQL and retries with visible status.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Refund and renewal

REQUIREMENT: `AC-n3-affiliate-bridge-5`

Given original purchase and another independent extension, when repeated or partial/full verified refund arrives, then relay once toN3 and expose manual entitlement review without silently removing unrelated paid periods; distinct successful purchases serialize extension and repeated event never extends twice.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

### Algorithm: Usable isolated rollout

REQUIREMENT: `AC-n3-affiliate-bridge-6`

Given existing Proofwall and project02, when bridge is enabled only for configured test program, then native nonbridge behavior stays available, user sees email/payment/bridge status, real browser route works desktop/mobile, no DB host ports/new default passwords; project02 unchanged.
Apply the explicit wire, transactional ordering and limits in the canonical contract above.

