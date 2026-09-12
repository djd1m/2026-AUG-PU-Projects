# Validator report — architecture / pseudocode / coherence / dependencies

Project: N4 «Тарелка» (`projects/04-calorie-vision-cal-ai`). Reviewer scope: Phase 2 validation,
read-only. RUN_ID: 20260912T171708Z-replicate-04-phase1-4-sparc-0c00.
WORK_UNIT_ID: validator-docs-coherence.

Spec revision: sha256:eb69591d375fcebcc8574a8ea3c8104efaab992b88c385a2818b634805c5a540

requested: claude-sonnet-5; actual: unknown to worker

## Verdict lens

| Lens | Verdict | Why |
|---|---|---|
| architecture | 🟡 CAVEATS | Required blocks all present and correct (Overview/style/diagram, Component Breakdown, Technology Stack, External Dependencies, Data Architecture, Security Architecture, Scalability, Reconciliation). One high-severity gap: `attribution.replaced_source` is a logical field the pseudocode writes to but has no physical column in Architecture.md (V1-R02). |
| pseudocode | 🟡 CAVEATS | 17/17 algorithms trace to REQUIREMENT/REALISES correctly, 26/26 scenarios claimed, operation order (rate-limit→validation→quota→model, consent-before-diary, initData-before-parse) all correct, races (double-lease, atomic quota, self-referral) correctly closed. One medium finding: the API contract table's own 409 description doesn't cover a case its own algorithm produces (V1-R04). |
| coherence | 🔴 NEEDS WORK | One blocker (V1-R01: a third spend ceiling is declared and relied upon in four documents but has no supporting data model or algorithm, and contradicts ADR-007's and canon's explicit "two numbers" claim) and one high finding (V1-R03: three documents — ADR-008, Refinement.md, Architecture.md's own reconciliation note — still describe pre-fix partner-code-attribution behavior that the current Pseudocode.md algorithm no longer implements). |
| dependencies | 🔴 NEEDS WORK | Architecture.md's `## External Dependencies` table itself is clean (8/8 CONFIRMED, capability-shaped rows, provider-quote evidence, `check-external-deps.cjs` → 0). The blocker is the same cross-document spend-ceiling gap as V1-R01, which is a dependency/cost-contract issue as much as a coherence one. |

## Findings

### V1-R01 — severity: blocker — lens: dependencies + coherence

**Where:** `docs/model-cost-contract.md:17-18,34-36` · `docs/ADR.md:137,143-144` · `docs/canon.md:80-86`
(§7 «Числа канона») · `docs/Pseudocode.md:40` (`scan_quota_counter.scope`), `:77-87`
(`CheckAndConsumeQuota`) · `docs/Refinement.md:17` · `docs/Completion.md:24-26` ·
`CLAUDE.md:51`.

**What's wrong.** `model-cost-contract.md` declares a **third**, independent daily spend ceiling —
"эскалация-sonnet: предел на пользователя 10, предел в сутки 600" — separate from the "распознавание-
фото: 10 / 3000" row. This third ceiling is then treated as real and relied upon in three other
documents: `Refinement.md`'s edge case ("суточный потолок эскалации 600 уже исчерпан ... `recognizer`
проверяет счётчик эскалации ДО второго вызова тем же атомарным механизмом"), `Completion.md`'s
pre-deployment checklist ("Потолки расхода модели сконфигурированы (10/сутки на пользователя,
3000/сутки суммарно, **600/сутки на эскалацию**)"), and `CLAUDE.md`'s invariants section (same three
numbers).

But nothing in the data model or algorithm can enforce a fourth, escalation-scoped counter:

- `canon.md` §7 "Числа канона" lists exactly two limits (10/user, 3000/day). No 600 anywhere.
- `ADR-007`'s Decision text says explicitly: **"Два числа канона"** — 10/user and 3000/global — and
  names no third number. The Confirmation clause only tests these two.
- `Pseudocode.md`'s `scan_quota_counter` entity has `scope: user / global` — a **closed set of
  exactly two values** (also true in `Architecture.md`'s physical schema: `scope ∈ user / global`).
  There is no `escalation` scope value anywhere in the canon-owned closed set.
- `CheckAndConsumeQuota` (the only algorithm that checks/consumes quota) computes exactly **three
  keys per attempt** — `(user, session_id, day)`, `(user, ip_prefix, day)`, `(global, 'all', day)` —
  and explicitly states that an `escalation`-reason call **reuses the same two scopes**: "`escalation`
  вызывает этот же алгоритм второй раз, и вторая попытка списывается наравне с первой" (step 5). There
  is no fourth key, no escalation-scoped counter, and no branch that would check a 600/day ceiling
  before allowing an escalation call.

So `Refinement.md`'s scenario — a recognizer checking "счётчик эскалации" against 600 "тем же
атомарным механизмом" — describes behavior the current algorithm cannot perform: there is no such
counter to check. This is not a wording nuance; it is a documented spend ceiling with no data-model
or algorithm path to enforce it, which is exactly the class of defect
[`model-call-cost.md`](../../../../../.claude/rules/model-call-cost.md) exists to catch (a declared
limit is only real once code enforces it — but here the declared limit isn't even *reachable* by the
described mechanism).

**Why it matters.** `model-call-cost.md`'s Правило №0 requires every external-model spend ceiling to
be enforced or the service refuses to start. If 600/day is real, `RecognizeScan`/`CheckAndConsumeQuota`
and the schema are incomplete — escalation spend is currently unbounded except by the 3000/day global
ceiling (20x looser). If 600/day is aspirational and the real design is "escalation shares the
existing two counters" (which is what the algorithm actually does), then `model-cost-contract.md`,
`Refinement.md`, `Completion.md`, and `CLAUDE.md` all assert an operational control that does not
exist, and a pre-deployment checklist item ("Потолки расхода модели сконфигурированы... 600/сутки на
эскалацию") can never honestly be checked off.

**Fix (pick one, not both):**
- (a) Add a third `scope` value (e.g. `escalation`) to `scan_quota_counter`, add a fourth key to
  `CheckAndConsumeQuota` step 2 keyed on it, update `canon.md` §7 to list **three** numbers, and
  correct ADR-007's Decision text ("два числа" → "три числа") and Confirmation clause; or
- (b) Drop the 600/day figure and the `эскалация-sonnet` row from `model-cost-contract.md`,
  `Refinement.md`'s edge case, `Completion.md`'s checklist, and `CLAUDE.md`, and rely on the two-number
  model the algorithm actually implements (escalation consumes the same user/global counters as the
  first attempt — which is already a real, working control, just not a 600-specific one).

### V1-R02 — severity: high — lens: architecture

**Where:** `docs/Architecture.md:143` (Data Architecture, `attribution` row) · `docs/Pseudocode.md:39`
(entity table), `:237` (`ApplyPartnerCode` step 7).

**What's wrong.** `Pseudocode.md`'s `attribution` entity declares `replaced_source: explicit /
deeplink / cookie?` ("чем была атрибуция до замены"), and `ApplyPartnerCode` step 7 writes to it on
every explicit-code-replaces-weak-source event. `Architecture.md`'s Data Architecture table for
`attribution` maps `status` (3-value enum) and `source` (3-value enum) to physical columns, and even
carries a note about *why* `source` needs a physical column ("правило приоритета... живёт в коде и
потому обязано иметь физическую опору") — but never mentions `replaced_source` at all. The
Reconciliation section (which found and fixed 10 other missing-column mismatches, including `source`
itself) predates the commit that added `replaced_source` to `Pseudocode.md`'s entity table, so this
field was never carried into physical schema.

**Why it matters.** Without a physical column, `ApplyPartnerCode` step 7 has nowhere to write
`replaced_source`, and route 7's API response field `replaced_source: null | 'cookie' | 'deeplink'`
(`Pseudocode.md:352`) has no backing store — a direct translation of `Architecture.md`'s schema into
DDL would silently drop this field.

**Fix.** Add `replaced_source` (nullable enum matching `source`'s three values) to the `attribution`
row in Architecture.md's Data Architecture table, and add a line to the Reconciliation table recording
it as the 12th finding (or amend the existing `attribution.source` row to cover both columns).

### V1-R03 — severity: high — lens: coherence

**Where:** `docs/ADR.md:172-174` (ADR-008 Confirmation) · `docs/Refinement.md:20` (edge case
"Повторный apply кода") · `docs/Architecture.md:258` (Reconciliation table, last row).

**What's wrong.** Git history shows `Pseudocode.md`'s `ApplyPartnerCode` algorithm was rewritten
(commit `1718a62`) to make an explicit code **replace** an existing weak (`cookie`/`deeplink`)
attribution — an `UPDATE`, returning `200`/`applied` with `replaced_source` set — rather than being
rejected by the `attribution(device_session_id)` unique constraint. This matches
`Specification.md`'s FR-GROWTH-002 ("явный код сильнее cookie... атрибуция создана ровно одна, с
кодом NEW") and canon's stated priority order. But three other documents still describe the **old**
behavior:

1. **ADR-008 Confirmation** (`docs/ADR.md:172-174`): "повторное применение другого кода к устройству с
   уже существующей атрибуцией отклоняется уникальным индексом, а не проверкой в коде." This is false
   for the explicit-replaces-weak case, which is an `UPDATE` on an existing row, not an `INSERT` that
   would ever hit the unique constraint.
2. **Refinement.md**'s edge case "Повторный apply кода" (`docs/Refinement.md:20`): "Устройство с уже
   существующей атрибуцией пытается применить второй код (**любой, включая действительный**) →
   Отклонено; атрибуция устройства не меняется задним числом ... `UNIQUE
   (attribution.device_session_id)` — конфликт вставки и есть ответ, а не проверка в коде приложения."
   This directly contradicts `ApplyPartnerCode` step 7 and route 7's `200`/`replaced_source` outcome
   for exactly the case this row calls out ("включая действительный").
3. **Architecture.md**'s own Reconciliation table, last row (`docs/Architecture.md:258`): calls the
   409-vs-replace disagreement an open item "требует правки `Pseudocode.md` ... Передано
   координатору" — but `Pseudocode.md`'s own commit `1718a62` (which added `replaced_source` and
   rewrote both the algorithm and route 7's contract row together) already resolved the *internal*
   Pseudocode.md inconsistency this row describes. The Architecture.md text is now stale and would
   mislead a reader into believing a coordinator decision is still pending on a question
   `Pseudocode.md` has already answered (though V1-R02's schema gap is a separate, still-real
   consequence of that same fix).

**Why it matters.** A reader implementing from ADR-008 or Refinement.md alone (both are supposed to be
authoritative for tests: "ADR... Confirmation — проверка, обязанная упасть при нарушении решения";
Refinement.md's edge-case matrix is the Refinement-phase test-design input per
`feature-lifecycle.md`) would build a reject-only implementation and a test asserting the wrong
outcome, defeating FR-GROWTH-002 and the very "явный код сильнее cookie" feature the growth section
exists for.

**Fix.** Update ADR-008's Confirmation clause and Refinement.md's "Повторный apply кода" row to state
the actual three-way outcome (existing=explicit + any new code → `conflict`, no change; existing=weak
+ new=explicit → `200 applied`, replace + `replaced_source` set; existing=weak + new=weak → `conflict`,
no change), and either remove or correct Architecture.md's stale Reconciliation line.

### V1-R04 — severity: medium — lens: pseudocode

**Where:** `docs/Pseudocode.md:238-239` (`ApplyPartnerCode` steps 8-9) vs `:352` (API Contracts,
route 7).

**What's wrong.** `ApplyPartnerCode` has two distinct branches that both return the internal result
`conflict`: step 8 (existing `source = explicit`, any new code) and step 9 (existing `source ∈
{cookie, deeplink}` **and** new source is **not** `explicit` — i.e. a second weak signal after a
first weak signal, or a deeplink after a cookie). But route 7's API contract documents `409
already_attributed` as occurring "**только** когда существующая атрибуция уже имеет `source =
explicit`" — worded as an exclusive condition that only covers step 8. Step 9's case (weak-vs-weak) is
not mentioned anywhere in the route 7 row, so the HTTP status for that branch is undocumented — a
reader of the API contract alone would not know what code a second `deeplink` application after an
existing `cookie` attribution returns.

**Why it matters.** This is the same document contradicting itself: the algorithm has two conflict
paths, the contract documents one and explicitly excludes the other from its stated condition ("только
когда... explicit"). An implementer following the contract literally could route step 9's outcome to
an undefined status or wrongly treat it as `200`.

**Fix.** Broaden route 7's 409 description to cover both conflict branches explicitly (e.g. "409
`already_attributed` when either the existing attribution is already `explicit`, or the existing
attribution is weak and the new source is also not `explicit`"), or give the two branches distinct
outcomes if they are meant to differ.

### V1-R05 — severity: low — lens: coherence

**Where:** `docs/canon.md:14` (§2, NFR family row) vs `:50-51` (§3, NFR list).

**What's wrong.** canon.md §2's family table describes NFR area words as "производительность,
безопасность, масштаб" (three areas), but §3's "NFR (ровно 6)" list includes `NFR-OPS-001`, whose area
word `OPS` is not one of the three named in §2. This is an internal inconsistency inside the document
every other document is told to inherit identifiers from verbatim ("канон... числа берутся оттуда и
здесь не переизобретаются").

**Fix.** Add "эксплуатация" (or similar) to §2's NFR area list, or fold `NFR-OPS-001` under an
existing named area.

### V1-R06 — severity: low (informational) — lens: coherence

**Where:** `docs/Architecture.md` (no `ADR-nnn` token anywhere in the file).

**What's wrong.** `Architecture.md` never cites a specific `ADR-nnn` id anywhere in its own text,
despite its content directly realizing ADR-001 (number-from-base), ADR-003 (`SKIP LOCKED` queue),
ADR-005 (USDA core), ADR-006 (`food_synonym`), ADR-007 (quotas), ADR-009 (consent-before-diary), and
ADR-010 (photo storage). Traceability from the document that owns these decisions' physical
realization back to the decisions themselves currently runs only through `Refinement.md` and
`Completion.md`. This does **not** violate the Decision Coverage rule (every ADR is named at least
once downstream — see below) and is not blocking; noted as a maintainability weakness only.

**Fix (optional).** Add inline `ADR-nnn` citations to Architecture.md's Component Breakdown, Data
Architecture, and Security Architecture sections where each decision is realized.

## Decision Coverage

Method: `grep -oE '^## ADR-[0-9]+' docs/ADR.md` for the declared set; `grep -oE 'ADR-[0-9]+'` over
`PRD.md, Solution_Strategy.md, Specification.md, Pseudocode.md, Architecture.md, Refinement.md,
Completion.md, C4_Diagrams.md` (ADR.md and validation-report.md excluded per instruction) for the
named-downstream set.

```
Decisions: 10 · named downstream: 10 · superseded: 0
```

Per-decision: all of ADR-001…ADR-010 are named downstream. ADR-001 appears in `C4_Diagrams.md`;
ADR-002, ADR-003, ADR-005, ADR-006, ADR-007 appear in `Completion.md`; all ten appear in
`Refinement.md`. Zero appear (by exact token) in `PRD.md`, `Solution_Strategy.md`, `Specification.md`,
`Pseudocode.md`, or `Architecture.md` — those five documents reference `ADR.md` only as a generic
link ("причины технических решений — в ADR"), never by specific id (see V1-R06 for the
Architecture.md-specific consequence of this).

**Recorded but named nowhere:** none.
**Named downstream but absent from ADR.md:** none (grep found no `ADR-0nn` token outside 001–010).

## Проверено без замечаний

- **REQUIREMENT ↔ Specification headings.** `grep -oE '^### [A-Z][A-Z-]*[0-9]+' Specification.md`
  (35 FR/NFR headings) vs `grep -oE 'REQUIREMENT: ...' Pseudocode.md` (33 unique ids): zero ids in
  Pseudocode absent from Specification; exactly two Specification headings have no algorithm —
  `FR-GROWTH-005` (a seeding-plan artifact, not a runtime behavior) and `NFR-PERF-002` (client-side
  viewfinder render time, a frontend/perf concern with no backend algorithm) — both legitimately
  non-algorithmic, and `NFR-PERF-002` is explicitly addressed in `Refinement.md`'s Performance section.
- **Scenario Coverage.** `Pseudocode.md`'s self-reported "26 · claimed by an algorithm: 26" is
  independently verified: `grep -oE 'SC-US-[0-9]+-[0-9]+' Specification.md | sort -u | wc -l` → 26,
  matching count of `[SC-US-...]` bracket occurrences.
- **Closed enums match across documents.** `recognition.status` (4 values: `queued/done/failed/
  refused`) and `attribution.status` (3 values: `pending/activated/rejected`) are identical, word for
  word, in `canon.md` §4, `Specification.md` §1, `Pseudocode.md` (entity table + State Transitions),
  and referenced consistently in `Architecture.md`.
- **Canon numbers cross-checked and consistent** (excluding the 600/day escalation ceiling — V1-R01):
  10 scans/user/day, 3000 scans/day global, confidence escalation threshold 0.6 (0,59 vs 0,60 boundary
  test named in both `ADR.md` and `Refinement.md`), 15% discrepancy threshold, 30-day photo retention,
  60s recognizer lease / 60s share-card revoke propagation, 50 applications per 10-minute anti-fraud
  window, 12MB / 320×320px photo limits — all identical across `canon.md`, `Specification.md`,
  `Pseudocode.md`, `Architecture.md`, `ADR.md`, `Refinement.md`.
- **Architecture required blocks** (per `sparc-prd-mini/SKILL.md` §Phase 5): `## Architecture
  Overview` (style + Mermaid diagram covering Client/Edge/App/Data/External), `## Component
  Breakdown`, `## Technology Stack` (Frontend/Backend/Database/Cache/Queue/Infrastructure rows all
  present with Rationale), `## External Dependencies`, `## Data Architecture`, `## Security
  Architecture`, `## Scalability Considerations`, `## Reconciliation with Pseudocode` — all present
  and substantive (Reconciliation documents 11 concrete findings, not a bare "no discrepancies").
- **Architecture Constraints compliance.** Distributed Monolith (Monorepo) pattern named explicitly
  and matches `.claude/rules/replicate-pipeline.md`'s Architecture Constraints; Docker Compose on VPS;
  PostgreSQL in a container; `db`/`storage` explicitly stated to have no host port publication;
  `proxy` (Caddy) named the single public door; no managed BaaS mentioned or implied anywhere.
- **External Dependencies table.** 8 rows, each phrased as a capability ("принимает изображение...",
  "возвращает ответ, обязанный соответствовать JSON-схеме...") rather than a vendor name; each cites
  the provider's own docs with a verbatim quote and an explicit check date (2026-09-12, one
  additionally cross-confirmed via data.gov 2026-09-10); `node .claude/hooks/check-external-deps.cjs .`
  → exit 0, 8 CONFIRMED / 0 UNCONFIRMED / 0 CONTRADICTED.
- **model-cost-contract.md declaration shape.** `node .claude/hooks/check-model-cost.cjs .` → exit 0
  (both declared calls name a per-user and per-day numeric limit, both fail-closed on missing config).
  This passes at the declaration layer only — it cannot see the cross-document contradiction in
  V1-R01, which is a semantic/structural check outside the hook's scope.
- **long-job-contract.md.** `node .claude/hooks/check-job-contract.cjs .` → exit 2, "НЕ ВЫПОЛНЕНА,
  причина: not-deployed". This is the correct, honest answer for a project with no deployed stack yet
  — not a defect.
- **Handoff manifest.** `node .claude/hooks/check-handoff-manifest.cjs .` → exit 0, all 22/22 PD-*
  discovery outputs answered across the 11 Phase-1 documents.
- **PRD §1.2 Scope vs canon.** `PRD.md`'s "В объёме недели" / "НЕ входит" lists match `canon.md` §1
  verbatim (PRD explicitly labels the exclusion list "дословно из канона").
- **FR-LOOK-003/004 rejections hold.** Both rejected in `Specification.md` §4 with a named reason
  (no content section this week); neither resurfaces as a requirement in `PRD.md`, `Refinement.md`, or
  `Completion.md` — the only other mentions are the raw capture rows in
  `source-product-profile.md` (pre-promotion source data, correctly not promoted).
- **Success Metrics identical across documents.** All seven rows (20% @ n≥30, 60% install-to-scan,
  ≤6s p95, ≤5% limit-refusal rate, ≤1560₽/day spend, ≤10% billing reconciliation, ≥24/30 manual USDA
  match) are byte-identical across `Specification.md`, `PRD.md`, and `Final_Summary.md`.

Status: completed
