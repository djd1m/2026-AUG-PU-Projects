# Specification — n3-affiliate-bridge

User approved integration plan and confirmed test shop. XL. US-001: as merchant/partner I can prove a paid referral in the existing Proofwall product without losing native purchases. Product research already available; no repeated discovery.

### AC-n3-affiliate-bridge-1 — Proven signup

Given referred new Proofwall account, when same current account proves email with valid one-use fragment token, then atomically store service-only proof and durable idempotent signup delivery of original receipt toN3; checkout waits for acknowledged customer binding; GET/replay/foreign/expired/version-changed proof cannot verify; requests bounded5/hour/account and30/hour/IP with60s cooldown.

### AC-n3-affiliate-bridge-2 — Identity and attribution

Given existing/SSO account or concurrent signup, when establishing referral proof, then no unverified equal-email SSO auto-link can inherit verified account; N3 and native cookie namespaces remain separate; no duplicate native commission on bridge-managed order.

### AC-n3-affiliate-bridge-3 — Durable native checkout

Given owned project and verified bridge customer, when buying990RUB/30days, then persist stable local intent andN3external order before native YooKassa creation; metadata binds both IDs, retries/earlywebhook/crash recover one purchase; amount/project/customer cannot be browser-forged.

### AC-n3-affiliate-bridge-4 — Transactional delivery

Given confirmed provider payment, when native webhook commits tariff, then atomically persist unique bridge event; N3 outage/restart cannot lose it or duplicate tariff; bounded leased worker sends outsideSQL and retries with visible status.

### AC-n3-affiliate-bridge-5 — Refund and renewal

Given original purchase and another independent extension, when repeated or partial/full verified refund arrives, then relay once toN3 and expose manual entitlement review without silently removing unrelated paid periods; distinct successful purchases serialize extension and repeated event never extends twice.

### AC-n3-affiliate-bridge-6 — Usable isolated rollout

Given existing Proofwall and project02, when bridge is enabled only for configured test program, then native nonbridge behavior stays available, user sees email/payment/bridge status, real browser route works desktop/mobile, no DB host ports/new default passwords; project02 unchanged.

## Scope

One configured existing N3tenant + existing Proofwall test shop. No project02changes, bank payouts, new payment provider, recurring autocharge, broad auth rewrite or extra CJM. Refund entitlement is explicitly manual review; commission correction automated. Source contract: N3f4-proofwall-integration/02_pseudocode.md.
