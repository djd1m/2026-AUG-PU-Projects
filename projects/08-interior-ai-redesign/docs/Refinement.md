# N8 — Refinement and Verification v0.1

Все ниже — требуемые проверки, **ещё не выполненные** в стадии SPARC. Их результат привязывается к exact code/spec/build revision и receipt. Mandatory gates нельзя менять ради срока; mutation проверяет, способен ли guard упасть на намеренно внесённом дефекте.

## Edge Cases Matrix

| Scenario | Input | Expected | Handling |
|---|---|---|---|
| Empty input | dimensions/price/coverage отсутствуют | 422 или явное unknown по полю, никогда 0 | boundary schemas |
| Max size | 25MiB+1 GLB / 10MiB+1 image / standalone image >20MP / GLB texture side >8192 or total >134217728 pixels / >250k triangles | ранний 413/422, память bounded | actual stream/decode limit |
| Concurrent access | same project version / two workers / duplicate webhook | один commit/dispatch/grant, другой конфликт/duplicate | real PostgreSQL transactions |
| Network failure | timeout после отправки AI; checkout/provider refetch failure | uncertain hold / pending intent / retryable 503 без lost event | no blind paid retries |
| Source context | регион/магазин сменён, timestamp future/expired | stale/422, снимок истории сохранён | derived freshness |
| Geometry | changed scale/window/shell hash, external URI/extension | scene/import rejected | immutable baseline + schema |
| Privacy | другой owner, share после revoke, direct storage key | 404 без private bytes/DTO fields | scoped repositories + routed asset serving |
| Budget | 19.9/1.99 exact; decimal just over pack boundary; null delivery; phase transfer | exact ceil; incomplete; total invariant | decimal + property tests |
| Payment | чужая сумма/shop/test/remote id; replay/refund/out-of-order | rejection or once-only effect/refund hold | donor verifier + transactional ledger |
| Mode honesty | отсутствующий key/caps, fake in normal app, disabled feature | startup reject/off UI, no egress | config and network spy |

## Testing Strategy

Unit: чистые domain модули, scene/budget/config validators, meaningful boundary/property cases. Не требовать произвольный процент coverage вместо перечисленных рисков.
Integration: реальные ephemeral PostgreSQL, private temp storage и локальные HTTP provider simulators. Simulators используют реальный HTTP adapter/response parser, но не считаются live evidence. Успешные донорские тесты не доказывают N8; портировать их и адаптировать доменные fixtures.
Concurrency: отдельные DB connections, barriers/held locks и bounded deadline; тест должен отличать SKIP LOCKED/fence/CAS от последовательного lucky-run. Skip из-за missing DB означает not-run, не pass.
E2E: Playwright production build, две изолированные user sessions, ручной 4.5×4 план, upload image/self-contained GLB fixture, style/history, product snapshot, budget, replacement, export/share/revoke. Обязательный read-only companion preflight непосредственно до E2E.
Performance: 200-line exact calculation benchmark и 10 concurrent local API clients; input/host/iterations/p95 фиксируются. Цели — NFR proposal, не уже наблюдённая скорость. Платные endpoints не нагрузочные targets.

## Requirement / scenario test matrix

| Suite | SC coverage | Обязательный adversarial case / mutation |
|---|---|---|
| auth | SC-US-001-1, SC-US-001-2 | expired/revoked session, dummy hash, forged cookie; bypass expiry mutation fails |
| project-ownership | SC-US-002-1, SC-US-002-2, SC-US-004-3 | A cannot GET/PATCH/use any B project/asset/relation; remove owner predicate mutation fails |
| space-calibration | SC-US-003-1, SC-US-003-2 | zero anchor distance, negative/NaN, invalid opening; altered scale/door fixture rejected |
| asset-boundaries | SC-US-004-1, SC-US-004-2 | actual bytes exceed declaration, remote URI, image bomb, invalid GLB; no egress assertion |
| references | SC-US-005-1, SC-US-005-2, SC-US-005-3 | malicious HTML/URL note, denied Pinterest, upload fallback and exact owner pin persist |
| scene-invariants | SC-US-006-1, SC-US-006-2 | shell transform/new vertices/unknown catalog object/collision; guard mutation must fail |
| revision-concurrency | SC-US-007-1, SC-US-007-2, SC-US-007-3 | same expectedVersion simultaneous; style/selected history revokes approval and warns products; stale shell completion can't replace current revision |
| job-budget | SC-US-008-1, SC-US-008-2, SC-US-008-3 | keyless startup, malformed schema, two workers, midnight outstanding reservation, crash-before/after dispatch |
| snapshots | SC-US-009-1, SC-US-009-2, SC-US-009-3 | 401 adapter → blocked; region switch/TTL; no price=0 invention |
| budget-decimal | SC-US-010-1, SC-US-010-2, SC-US-010-3, SC-US-010-4 | exact 10 packs/1600000 minor; integer RUB native validity; live limit rerender; unmatched rows stay unknown despite known delivery/labor; reserve once |
| substitutions | SC-US-011-1, SC-US-011-2, SC-US-011-3 | replacement changes dims invalidates fit; phase partition invariant; history reproducible |
| payment-config-checkout | SC-US-012-1, SC-US-012-2 | fake prohibited outside tests; body price ignored/rejected; duplicate key different SKU→409 |
| webhook-replay-rollback | SC-US-013-1, SC-US-013-2, SC-US-013-3 | provider timeout then successful replay, two callbacks, wrong merchant/amount, refund-before-late-success |
| share-privacy-export | SC-US-014-1, SC-US-014-2, SC-US-014-3 | free watermark can't be client-bypassed; no private DTO fields; cached/direct image denied after revoke |
| growth-events | SC-US-015-1, SC-US-015-2 | unique event key; DB down→unknown; no raw token/PII |
| request-security | SC-US-016-1, SC-US-016-2 | forged Origin/XFF, missing Origin, concurrent rate limit, secret redaction |
| compose-smoke-recovery | SC-US-017-1, SC-US-017-2 | no DB published ports, restart preserves history, missing storage/config non-ready |
| browser-journey | SC-US-018-1 + happy chain | 390px+keyboard, WebGL fail fallback, mode labels, persisted choices |
| bounded-load | NFR-performance-1 | page/object/quota cap race, 200-line benchmark; no optional reruns once unchanged passing |

## Test Cases

```gherkin
Scenario: SC-US-010-1 exact purchases
  Given owner has confirmed 18 m2 floor and 8 percent waste
  And a user-confirmed pack covers 1.99 m2 and costs 160000 minor RUB
  When owner calculates budget
  Then line contains 10 packs and 1600000 minor RUB
  And missing delivery stays explicitly unresolved

Scenario: SC-US-013-2 replay after verification outage
  Given a pending order and first provider verification times out
  When the same succeeded notification is delivered again with valid remote data
  Then first response is retryable and no event key or entitlement was committed
  And second response grants exactly one package
```

## Security Hardening / accessibility / optimizations

Parameter binding, schemas at every boundary, strict fixed network targets, trusted proxy source, CSP/nosniff/no-store, password/secret redaction, private volume. GLB/image parser timeout/limits guard resource exhaustion; PDF/FBX/splat unsupported now. Avoid caching permission/entitlement/share resolution. Index ownership/history/job keys; lazy-load viewer/library after form interaction. Bound derived scene/object lists before render. Labels/focus/error text, not colour-only status; no claim of full WCAG certification without audit.

## Independent validation and anti-drift

Before feature dispatch, independent review covers the six `/replicate` lenses exactly: validator-stories (INVEST), validator-acceptance (SMART/testability), validator-architecture (constraints/completeness/security), validator-pseudocode (coverage/implementability), validator-coherence (cross-document consistency), validator-dependencies (provider-owned capability evidence outside our documents). Each reports concrete requirement/algorithm/field/source and severity in a fresh terminal receipt, never invented minimum findings. Implementation uses exact source snapshots and two-way trace: every requirement→code/test; every behavior→authorized requirement. After EACH feature, reviewer independent of author checks actual code+tests, not only report.
Coordinator may fix code or specification autonomously within intent. Log before/after, IDs, reason/alternative, revisions, affected tests and observed outcomes; re-run only changed mandatory suites plus required regressions by risk. Final integrated full suite remains required. Confirmed reusable lessons teach/reinforce canonical dz; no hypothesis as success.

## Technical Debt / deliberate exclusions

Manual geometry limited to rectangle/openings; no promised automated mesh semantics. Local asset volume limits multi-host scaling. Password reset/email verification, physical privacy erasure lifecycle, engineering validation, public SEO gallery and affiliate are future scope. Until these are designed, this is a local evaluation build, not an unrestricted public launch. AI inference quality/cost/live merchant tests remain explicitly not-run; their absence does not excuse missing offline adapter/security tests.

## Validation correction checks

Add actual suites for bcrypt72-byte/multibyte boundaries; malformed-body rate-before-parse; same-key replay after eligibility changes; archive/refund versus dispatch mark and later manual same-shell edits; consent snapshot immutability; partial/foreign-payment refund verification; raw asset cannot share/design mismatch; entitlement loss versus export/share; aggregate quota/parser deadline/slot recovery and responsive unrelated reads; array/JSON relation isolation; budget snapshot-only reproduction/phase delta/server-computed reserve/unit-source mapping; source XOR; owned product/line reads + blocked refresh; local growth known/unknown and audited uncertain reconciliation.
Performance protocol is SC-US-024-1/2: exact fixture/build/host hash, monotonic clock,10clients×20warm-up+100measured API GETs, nearest-rank p95 across1000 with errors retained; budget50warm-up+1000measured200-line golden-output hashes. Any error/omitted sample fails. No paid route is benchmarked. Phase preview is immediate, saved old budget remains outdated until explicit recalculation.

Shopping-list export SC-US-025-1: owner CSV round-trip equals immutable snapshot including unknown/retained/source/unit/phase/cost groups; formula-like name =HYPERLINK and leading-tab payload inert; foreign owner404, no public share budget route. All added SC in Specification are implemented as new focused checks, not merely the historical45 table.

Updated acceptance targets (each inherits its adjacent Specification test oracle): SC-US-001-3, SC-US-008-4, SC-US-008-5, SC-US-008-6, SC-US-010-5, SC-US-010-6, SC-US-010-7, SC-US-011-4, SC-US-013-4, SC-US-015-3, SC-US-016-3, SC-US-019-1, SC-US-020-1, SC-US-020-2, SC-US-021-1, SC-US-022-1, SC-US-023-1, SC-US-024-2.
