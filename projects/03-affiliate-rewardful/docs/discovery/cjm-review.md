# N3 discovery + HTML CJM consequential review

Status: completed
Reviewed: 2026-09-08T19:55:35Z; read-only repository review, no source edits.
Scope: research consistency, money-state semantics, roles, source provenance and choice boundary.
Requested model: gpt-6-astra, high, quality-first consequential review.
Actual model/effort: unknown; this worker has no independent host execution attestation.
Usage/cost/elapsed: unavailable to this worker; parent can attach its measured invocation timestamps.
No delegation. Only this requested report was written. No PRD is required by this review.

## Verdict

The revised prototype preserves the manual-payout and user-choice boundaries.
Two consequential defects reported early were corrected during review and independently rechecked.
Three remaining findings should be addressed before presenting the final CJM comparison.
These are prototype/research validity findings, not claims of production vulnerabilities.

## Open findings

### CJM-R03 — medium: partner landing presents merchant-wide numbers

Location: `projects/03-affiliate-rewardful/docs/prototypes/cjm/assets/app.js:13`, `preview()`.
The function distinguishes only B from the rest. C therefore shows the same `Продажи партнёров`,
`Комиссии`, `Партнёры: 12` dashboard as the merchant journey A, while its headline addresses an
individual author/agency. This teaches the wrong access and information model at the entry point.
VM verification confirmed C renders `Партнёры</label><strong>12`.
Fix: give C its own personal preview (`Ваши рекомендации`, `Ваш доход`, `К выплате`) or explicitly
label the displayed panel as a merchant example. Personal totals should match the C story.

### CJM-R04 — medium: owner-to-referrer role return is implicit

Location: `app.js:24–26` and `data.js:4–5`.
B/C explicitly switch to the owner for pricing, but `К приглашениям` returns to personal customer/
affiliate copy without naming that role change. The generic role label remains `Клиент Proofwall →
владелец` or `Автор / агентство → владелец` on steps before AND after the owner step. The shared
sidebar also lists `Тариф` inside the supposed customer/partner cabinet.
Fix: use precise per-step actors; name the return CTA `Вернуться к рекомендациям клиента/партнёра`;
show owner pricing as a research interlude rather than an item in the affiliate's product navigation.
There is already an adequate explanatory disclaimer on the pricing screen; preserve it.

### CJM-R05 — medium: research candidate letters mean different journeys

Locations: `docs/discovery/research/product-research.md:256,276,296` versus
`docs/discovery/research/market-trends.md:263–269` and `assets/data.js:3–5`.
Product research defines A=merchant setup, B=operations/reconciliation, C=customer credits.
The comparison defines A=merchant setup, B=customer credits, C=partner portal.
Without an explicit revision/mapping, choosing “C” and following the research can develop the
customer-credit model instead of the chosen cash-commission partner journey.
Fix: add a synthesis mapping near the research header and final brief: original research C →
prototype B; original operations B remains deferred; prototype C is the partner-trust candidate.
Also state that the original research's “must be clickable in all three prototypes” list at
lines 316–324 is a candidate test inventory, not completed acceptance: delayed webhook,
self-referral, attribution-mode choice and evidence drawer are absent from the current demo.
Do not require implementing that entire inventory to finish this discovery task.

## Corrected during review and rechecked

### CJM-R01 — high for the modeled invariant; resolved

Original `app.js:34` payment handler reset `refund=false` on every duplicate payment. Sequence:
payment → refund → duplicate payment resurrected the canceled commission despite the “repeat
does not increase amount” narrative. Parent corrected the handler during this review.
Final VM execution confirms refund remains true after the duplicate; separate explicit restore
control remains available for exploring the sample. No actual webhook behavior is established.

### CJM-R02 — medium; resolved

Original A invitation used `/r/studio`, a customer-acquisition referral URL, while inviting new
partners; its reward stayed at 20% after changing the configured rate.
Parent corrected `app.js:11,25`: A now uses `/partners/join`, and the reward derives from A.rate.
VM execution confirmed the new enrollment URL and that rate=37 renders 37% in the invitation.

## Boundaries checked

- Cash payout remains manual registry/export + operator marking. `Отправлено` is distinct from
  recipient crediting on C; demo actions and fixed data are labeled. No action claims real money movement.
- Calendar “previous month by next month's day 5” is the owner's policy. `До 100` is marked as an
  operating assumption; price and commercial limits are not approved. Month close/hold exceptions
  are acknowledged in payout-decisions and should remain future decisions.
- B's subscription credits are explicitly noncash and conditional, a candidate product extension.
  Research correctly says Rewardful supports primitives for credits; merchant-built UI is required.
- Existing YooKassa payment code reuse is deferred to an audit. Receiving payments is not represented
  as a verified outgoing payout adapter. Future documentation-only adapters remain unverified.
- Payout evidence correctly attaches Split payments to historical Yandex.Kassa/current YooKassa,
  treats CloudPayments separately, and avoids universal 3-day or IP-only onboarding assertions.
- Public source measurement records Rubik 16px body / 54px headline / #0087ee / 5px buttons.
  Prototype uses Rubik / #0087ee / 5px buttons but 15px body / 45px desktop hero. Describe this as
  adaptation of the measured public visual language, not exact dimensions or a captured cabinet.
  Private source cabinet was not observed; it must retain an auth-required/unknown capture status.
- Choices persist locally with `proposal_for_user_review`, `prd_created:false`; nothing submits a
  decision automatically. Mixed choices are explicitly proposals with role sequencing to validate.

## Evidence / limits

Read root CLAUDE.md, applicable replication/honest-state/complexity/model-routing rules and policy.
No project CLAUDE.md or project-local rules existed at initial discovery.
Reviewed all app/data source, HTML shell, CSS, source-styles.json and supplied research reports.
Executed app/data in Node VM with minimal DOM stubs for the three specific checks above.
First VM attempt lacked timer stubs and failed; repeated with timer stubs, exit 0. This was a
harness limitation, not a product defect. Browser/layout validation belongs to parent's separate run.
No new external-source claims; this is consistency review of supplied evidence, not fresh research.

Snapshot SHA256:
- app.js: `5da99e4e37e35e6d68a5e026f26f057aefe650cea6583f27fae06dea4594cd2d`
- data.js: `52be654e7f1b352f483220fac95d6e2f0b848b63280410b399aabdd21a3b423a`
- /tmp/n3-product-research.md: `3d5811e957a74fe5782ef626e909dd9ca3c20bcf458be453f92ea22c5cf73a8b`
- /tmp/n3-market-trends.md: `89ecd33058d055cd87888854206563b77f52bcf0290836a4345c6026d3450bf9`
- /tmp/n3-payout-evidence.md: `8e6deb54e80259064304d2e443ccddacdf517379f61f51f2d9b75a5717f242f9`

Status: completed

## Интеграционная проверка координатора после снимка ревью

- CJM-R03: исправлено — C имеет «Мои продажи / Мои комиссии / Мои клиенты», суммы личного примера. Browser guard проверяет scope.
- CJM-R04: исправлено — актор на каждом экране конкретный, возврат с paywall подписан; пункт в sidebar referrer явно «Вид владельца ↗», это исследовательская вставка.
- CJM-R05: исправлено — в product research и brief добавлен mapping ранних кандидатов к итоговым A/B/C; предложения test inventory не выдаются за выполненные сценарии.
- CJM-R01/R02 дополнительно покрыты browser-check.js: duplicate после refund, корректный invite URL и настраиваемая ставка.

Первоначальный отчёт выше сохранён как receipt своего снимка; последующие исправления проверены координатором, не приписаны повторному запуску Astra.
