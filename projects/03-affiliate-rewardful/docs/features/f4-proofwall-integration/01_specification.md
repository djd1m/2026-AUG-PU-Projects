# Specification — f4-proofwall-integration

User approved integration plan and confirmed test shop. XL. US-001: as merchant/partner I can prove a paid referral in the existing Proofwall product without losing native purchases. Product research already available; no repeated discovery.

### AC-f4-proofwall-integration-1 — External intent

Given a verified bound customer and valid connector, when reserving an external invoice, then persist one attributed order without provider creation; replay same invoice reuses it, changed amount conflicts, unknown customer/foreign key refuses.

### AC-f4-proofwall-integration-2 — Verified settlement

Given that external order, when Proofwall submits payment id, then independently fetch and verify provider shop/test/RUB/amount/metadata/paid status before exactly one commission; forged or legacy-order events fail and cannot consume dedup.

### AC-f4-proofwall-integration-3 — Durable corrections

Given paid external order, when refund arrives before or after payment relay and is replayed, then validate original payment and apply payment/refund once, preserve policy and proportional correction; test money never enters payable registry.

### AC-f4-proofwall-integration-4 — Authority across waits

Given key rotation/revocation or contention during provider IO, when result returns, then current authority/order binding is checked under consistent locks; foreign order refuses before network; no SQL held across network.

### AC-f4-proofwall-integration-5 — Merchant contract

Given real HTTPS frontend→Proofwall→N3 path, when signup proof and99000minor purchase complete, then existing partner sees referral registration/test payment/commission; reload preserves evidence; payout balance truthfully remains separate.

### AC-f4-proofwall-integration-6 — Compatible release

Given current deployedN3 and pending access checkpoint, when bridge rolls out, then baseline auth remains usable or prerequisite access gates pass; old payments/refunds, A–D and MCP/A2A regressions pass; databases stay unpublished and scoped; sources/builds/limitations recorded.

## Scope

One configured existing N3tenant + existing Proofwall test shop. No project02changes, bank payouts, new payment provider, recurring autocharge, broad auth rewrite or extra CJM. Refund entitlement is explicitly manual review; commission correction automated. Source contract: N3f4-proofwall-integration/02_pseudocode.md.
