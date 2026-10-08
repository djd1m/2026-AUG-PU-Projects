# N7 — managed cold-outreach API research, 2026-10-08

Status: completed. Scope: read-only official documentation/pricing/terms; no signup, traffic with credentials, purchases, messages, source changes or publishing. Requested executor: Sol6.1 HIGH; actual host model metadata unknown, usage counters null. Bounded research target: 12 minutes. No performance benchmark or live provider test occurred.

## Recommendation

External HTTPS APIs can move SMTP/IMAP connections off the blocked VPS: N7 calls a vendor over 443, and that vendor connects to the customer's mailbox. This is an architectural inference from documented account APIs, not a tested solution for this VPS or Yandex.

For N7 as a Russian SaaS analogue, do not treat an ordinary Instantly/Smartlead subscription as permission to use a competing platform as your backend. Instantly explicitly restricts competitive products; Smartlead restricts resale without written consent. EmailBison is the strongest documented candidate for a separately agreed backend/warmup arrangement because it expressly discusses white-label warmup for new products. Its public PDF terms also contain commercial/competitive restrictions, so the feature page is a sales invitation, not unconditional authorization.

This alternative solves a connectivity boundary by outsourcing substantial product capability. It is substantially broader than moving the existing F09/F10 worker to an egress-capable host or providing an owner-controlled transport gateway. If N7's own scheduler, quota/consent semantics and course-cohort pool are strategic, prefer retaining them and evaluate transport-only infrastructure first. If speed and a larger managed pool outweigh independence, scope a written vendor agreement and a bounded acceptance pilot before buying.

## Exact N7 baseline

Documentation checkout HEAD: cfc075948e1f0dfa12fbe600fe0b8539f3ddb959. Sources read under /home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n7-replicate/projects/07-cold-email-warmup:
- CLAUDE.md; docs/Completion.md; docs/Specification.md; docs/plans/live-mail-runtime-operator-20261007.md; docs/deployment-checkpoint.md.
- Completion states F07 capacity, F08 connection diagnostics, F09 native SMTP/UID IMAP and F10 durable runtime locally accepted; F09 source e043bb27, F10 db50798a. F11–F15 pending in that document. This research did not inspect every dirty source change; it does not supersede coordinator's newer accepted-state receipts.
- SMTP465/587 required TLS and IMAP993 TLS; no sending on mailbox save; separate pool/campaign consent; combined warmup+campaign quota; revoked consent/stop checked at final serialized submission boundary.
- Read-only UID IMAP observations deduplicate independently of semantic reply effects; replies stop follow-ups. Ambiguous delivery is not blindly retried. Live acceptance includes full poll <60 seconds, SMTP250 plus separate inbox receipt, and reply-stop across the approved follow-up window.
- Cohort pool is voluntary; without a peer, show waiting. Reputation stays unknown absent verifiable observations. Runtime grants, live provider traffic, LLMs, spend and deployments have separate gates.

## Platform evidence

### Instantly

**Mailbox transport.** API v2 POST /api/v2/accounts accepts separate SMTP and IMAP hosts, ports, usernames and passwords. This supports general custom-account onboarding, not proof of Yandex support or guaranteed successful AUTH. [Create account](https://developer.instantly.ai/api-reference/account/create-account)

**Delegation.** API docs index lists account warmup enable/disable and analytics, account pause, campaigns and email reads. External campaign scheduling replaces N7's own send loop. The documented POST /api/v2/emails/reply sends only as a reply to an existing email UUID; it is not a generic raw send endpoint. The index uses a misspelling in prose, while the request example has reply_to_uuid. [API index](https://developer.instantly.ai/llms.txt), [Reply endpoint](https://developer.instantly.ai/api-reference/email/reply-to-an-email)

**Replies.** Campaign webhooks include received replies, sends, bounces, unsubscribes and account errors; POST JSON and optional custom authentication headers. Available Hyper Growth+. Provider-to-Instantly ingestion latency is not established by “real-time webhook” wording. [Webhook help](https://help.instantly.ai/en/articles/6261906-webhooks)

**Cost/access.** API v2 is available on all Email Outreach plans. Pricing/help: Growth $47/month, 1,000 uploaded contacts, 5,000 sends; Hyper Growth $97, 25,000 contacts, 125,000 sends; Light Speed $358, 100,000 contacts, 500,000 sends. Unlimited connected accounts/warmup is marketed; sends/contacts are bounded. Pricing-page comparison has a stale/conflicting 100,000 Hypergrowth figure, while main card and plan help say125,000. Workspace/subscription multiplication matters. [API access](https://help.instantly.ai/en/articles/10432807-api-v2), [Plans](https://help.instantly.ai/en/articles/10273259-instantly-plans-overview), [Pricing](https://instantly.ai/pricing)

**Multitenancy.** Agency white-label exists on Hyper Growth/Light Speed, one portal per workspace. Clients can see all campaigns in that workspace; isolating clients requires separate workspaces, each with its own subscription. No specified client-account count limit. [Agency help](https://help.instantly.ai/en/articles/8678006-agency-white-labeling)

**Contract fit.** Terms §4.4 prohibits use to build a similar/competitive product and unauthorized third-party resale/access, and restricts onward exposure of performance/warmup data. §4.7 excludes ordinary lead/reply/revenue outcome guarantees except separately defined VIP terms. Thus agency portal availability does not establish permission for N7's competing SaaS backend. [Terms](https://instantly.ai/terms)

### Smartlead

**Transport and orchestration.** Official full API reference documents POST /email-accounts/save with SMTP/IMAP configuration; POST /email-accounts/{id}/warmup with ramp/reply-rate/daily volume; campaign sequence/schedule/configuration and stop_lead_settings=REPLY_TO_AN_EMAIL; GET campaign/lead message-history; POST campaign reply-email-thread. This delegates scheduler, rotation, warmup and campaign reply handling. API base is HTTPS server.smartlead.ai/api/v1, API key in query parameter; avoid URL logging of secrets. The reference is not evidence of arbitrary transport-only SMTP submission, read-only-only IMAP, or N7's exact no-retry semantics. [Full API reference](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation)

**Replies and latency.** Webhooks include EMAIL_REPLIED, account/lead/campaign identifiers, reply body/message metadata; documented user/client/campaign associations. Official troubleshooting says master-inbox replies can lag 30–60 minutes, and claims the engine checks for replies before follow-up. This conflicts with adopting “real-time” as a <60s N7 guarantee. [Webhooks](https://api.smartlead.ai/core/webhooks), [Reply delay](https://helpcenter.smartlead.ai/en/articles/83-replies-by-leads-not-reflected-in-master-inbox)

**Client isolation.** Client-level keys are designed for white-label agencies/resellers: one key per client, default60requests/minute, adjustable. That is technical scoping, not a replacement for N7 tenant predicates or contract authorization. [Client keys](https://helpcenter.smartlead.ai/en/articles/430-how-client-level-api-keys-work-in-smartlead)

**Price and limits.** Current four plans: Base$39/mo6K sends/2K contact storage; Pro$94/mo90K/30K; Unlimited Smart$174/mo150K/unlimited storage; Unlimited Prime$379/mo500K/unlimited storage. Official guide excludes client workspaces on Base; Pro+ has workspace/private-infrastructure add-ons. Pricing table shows workspace add-on$29 and server$39. API access is plan-dependent in the API help, but browser text loses tick/cross associations: exact lowest API tier remains unknown from reliable extracted primary evidence. Do not assert Pro gating based on third-party reviews. [Pricing](https://www.smartlead.ai/pricing), [Plan guide](https://helpcenter.smartlead.ai/en/articles/439-smartlead-pricing-plans)

**“Unlimited” conflict.** Fair Use Policy explicitly limits mailboxes to Basic100, Popular300, Pro800, using names inconsistent with the current four-plan table; mapping to current plans unknown. It forbids resupply/resale/shared access without express written consent. Terms give a non-sublicensable license and restrict third-party resale; subscription terms may rank above base terms, with Fair Use first. An agency feature requires the applicable agreement, not assumed unrestricted embedded SaaS rights. [Fair use](https://www.smartlead.ai/fair-use-policy), [Terms](https://www.smartlead.ai/new-terms-and-conditions)

### EmailBison

**Custom transport.** Official sender onboarding documents custom SMTP providers via API, /api/sender-emails/imap-smtp; the same page's bulk examples instead use /api/sender-emails/bulk and CSV, so exact production schema/path must be resolved against the instance API reference. Google bulk upload is not first-party supported due to captcha. Custom protocol support alone does not verify Yandex. [Adding accounts](https://docs.emailbison.com/email-accounts/adding-accounts)

**Replies and synchronization.** GET /api/replies and campaign endpoints are documented; webhook failures retry up to five times in24h. GET /api/leads/{lead_id}/replies and /sent-emails provide readback; POST /api/replies/{reply_id}/reply supports message/sender/to/html-or-text. Marketing says Master Inbox can compose one-off mail, but the exact generic new-email API was not verified; reply API is confirmed. [Developer guide](https://emailbison.com/developers), [Readback](https://docs.emailbison.com/master-inbox/fetching-replies), [Reply API](https://docs.emailbison.com/master-inbox/responding-to-messages)

**Warmup backend.** Public feature page documents PATCH /api/warmup/sender-emails/enable|disable and warmup list/details, provider-aware caps and private pools. It explicitly invites companies building new products to discuss white-label-only warmup. User controls max daily warmup, vendor controls ramp/reply timing. This is documented suitability for negotiation, not a delivered integration or verified efficacy. [Private warmup](https://emailbison.com/features/email-warmup)

**Price/isolation.** Base$599/mo includes500K emails, isolated network, warmup and API; website says unlimited workspaces/team members/leads. Workspace documentation says records and keys scoped per workspace, sender can exist in only one workspace at a time. api-user key is bound to its creation workspace; super-admin follows creator's current workspace, so prefer stable per-tenant api-user keys. Published price of warmup-only embedded agreement and mailbox cap are unknown. [Pricing](https://emailbison.com/pricing), [Product](https://emailbison.com/), [Workspace scope](https://docs.emailbison.com/workspaces/overview)

**Contract gap.** Public PDF §7 permits commercial endeavors only when endorsed/approved, and contains competitive/revenue-use restrictions; §3 also generically restricts automated site access despite advertised APIs. It supplies as-is/availability disclaimers. Do not silently interpret those as a binding reseller/API license; require specific order/agreement clarifying permitted N7 backend, commercial/white-label rights and precedence. [Public terms PDF](https://emailbison.com/emailbison-terms-of-service-v2.pdf)

## N7 ownership and acceptance implications (engineering inference)

| N7 capability | Vendor delegation | What N7 must still own / prove |
|---|---|---|
| Native SMTP/IMAP F09 | Vendor connects and holds mailbox credentials | New transport adapter/authority, credentials disclosure and rotation, exact authorized sender, actual Yandex AUTH/receive tests |
| Durable dispatcher F10 | Vendor owns campaigns, queues, pacing and retries | One scheduling authority; no dual worker; explicit in-flight stop boundary and ambiguous-submit reconciliation |
| Combined quota | Vendor warmup and campaigns may have independent counters | Enforce/prove single shared N7 cap; API enable/max settings cannot prove atomic combined reservation |
| Reply ingestion/stop | Vendor sees replies and sends webhooks | Authenticated tenant mapping, durable dedupe, polling reconciliation, raw identity/thread mapping, outage handling; vendor-native stop plus N7 stop |
| Course-cohort pool | Replaced by vendor-private/global pool | New consent/disclosure; user's agreed cohort policy cannot be assumed equivalent |
| F11 inbound context/retention | Vendor stores potentially full mailbox content | Minimize fetched bodies, retention/deletion contract, scrub secrets and webhook payloads; sending UI not authorization to export entire inbox |
| Reputation observations | Vendor statistics/scores | Label vendor-derived evidence and unknowns; do not represent warmup score as guaranteed inbox placement |
| Russian cabinet, billing, product policy | Usually stay N7 | Margin, vendor per-client/workspace costs, payment/access feasibility, tenant isolation, support ownership |

Buying the full outreach engine would cannibalize N7's scheduler, warmup pool, rotation, reply detection and inbox features; N7 would retain a localized cabinet, billing/consent rules, course integration and support. Warmup-only procurement limits cannibalization but does not solve N7 campaign SMTP/IMAP egress by itself. Vendor lock-in attaches to workspace/account IDs, reply UUIDs, campaign models, proprietary warmup pool, analytics definitions and contract/cost changes. Keep stable N7 IDs and an external-ID mapping, canonical consent/quota records, export/readback adapter, and an exit path to the owned worker.

## Remaining unknowns and next bounded step

Unknown for every provider: confirmed Yandex account compatibility, receiving reliability, sub60s poll equivalent, signup/payment/service availability for the specific Russian legal entity, enforceable API/reseller rights for N7, transport-only arbitrary send semantics, N7's exact combined quota and at-most-attempt behavior. No deliverability percentage is asserted. Marketing claims and vendor network size are not measured improvement.

Proposed next owner-reviewable package: choose transport-only architecture versus managed full engine; if managed, draft an agreement question sheet covering competing SaaS/white-label rights, Russian entity availability, Yandex TLS/app-password handling, mailbox/workspace/API limits and data residency/deletion. Only after a separate authorized purchase/live gate, run a one-mailbox acceptance pilot: save causes0sends, explicit consent/start, bounded submit outcome, independent inbox receipt, reply-stop/full window, revoke-stop, combined warmup+campaign cap, webhook loss/duplicate/out-of-order/reconciliation. No outreach credentials were transferred in this research.
