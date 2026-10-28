# Independent bounded integration review — wiring / Cloud.ru / Similarweb
Reviewer family: codex

Source HEAD: `77dc69c7548a2e32f38131e1ba5d737eafe2e554`, isolated integration project `/tmp/n5-acquisition-analytics-20261026/projects/05-podcast-clips-opus`. This review covers the dirty working-copy optional analytics wiring, Cloud.ru launch/addendum documentation, and the Similarweb supplement against `similarweb-data.json`. Coder receipts, coder logs and coder chat were not read. No code, configuration, runtime, historical evidence or source document was changed; only this report was written. No stand/container launch, deployment, account creation, network research or spend occurred.

Verdict: REQUEST CHANGES for two bounded documentation inconsistencies below. Optional compose wiring passes source inspection, and the central Similarweb uncertainty/arithmetic conclusions agree with the supplied copied-source JSON. No overall implementation PASS: caller reports an actual SDK URL privacy leak with a correction pending; that is an unresolved enablement blocker and outside this review's diff. The caller also reports full suite 1065/1065 and build/lint/typecheck passes; these are caller-provided results, not checks independently performed or re-certified here. Final exact-snapshot verification remains caller-owned.

Actual model/effort/usage/cost: null, verifiable execution metadata unavailable to reviewer. Requested policy/context remains model-routing-econom. This bounded pass does not measure total task duration or cost.

## Findings

### I1 — medium: supplement substitutes a different pilot definition and event funnel

`docs/research/acquisition-20261026/similarweb-analysis.md:66` labels segment → channel → offer → first successful download as the selected “1–1–1–1”, then recommends “UTM каждого размещения” and signup → job_succeeded → first_download → purchase. This omits the approved single tariff and conflicts with the authoritative addendum and research README, which freeze channel → Старт 990₽/300 credits → feature → segment, one approved UTM tuple, and the implemented browser observation names visit/signup/first_clip_ready/payment_confirmed.

The supplement's JSON decision likewise uses target_action “First successful download” without declaring it a separate future validation metric. The text cautions that events are not yet proven, but the section still presents this different funnel as the pilot decision. This can cause launch setup to create wrong goals or vary UTM content beyond the closed adapter tuple.

Fix only the decision section/decision metadata: preserve the selected tariff/feature/segment/channel and fixed telegram/community/n5_pilot/demo_a tuple; name the four actual n5_* browser goals or link to the authoritative README. Label download acceptance as a desired user outcome or later measurement hypothesis, not an existing implemented event or replacement for ready observation. No extra event implementation is requested.

### I2 — medium: runtime.env instruction is not bound to the env file actually loaded by compose

`docs/features/acquisition-analytics/cloudru-launch.md:22` instructs saving N5_METRIKA_COUNTER_ID in runtime.env. `docker-compose.yml` interpolates the host/CLI environment and declares no env_file pointing to runtime.env. The referenced existing `docs/REPRODUCE.md` commands explicitly use `--env-file .env` (e.g. lines 169, 194 and 221). Merely saving runtime.env therefore does not make this counter available to those commands, leaving the default-off value despite the operator following the new step.

Fix with one precise statement: put the public ID in the env file actually selected by the target launch process, or explicitly select the protected runtime.env with `--env-file runtime.env` in the target process. Do not print any file contents or execute a restart here. No change to default-off semantics is requested.

## Wiring / launch conclusions supported by inspected source

- `.env.example` introduces only the empty optional public ID and documents default off, consent and the future Cloud.ru target.
- Compose declares `N5_METRIKA_COUNTER_ID: ${N5_METRIKA_COUNTER_ID:-}` only under web, not shared anchors, workers, DB, Redis or proxy. No host ports, secrets, payment mode, tariff/provider wiring or existing authorization logic is changed by this diff.
- This is compatible with previously inspected dynamic-layout runtime reading and public numeric prop design; actual same-built-artifact runtime tests remain caller-owned. Dockerfile still builds Next before runtime, so avoiding NEXT_PUBLIC build-time dependence is appropriate.
- Deployment-context reconciliation correctly distinguishes SDK/queue teardown on excluded paths from preservation of previously consented bounded first-touch/dedupe; withdrawal clears all. This agrees with the accepted R1 correction.
- Cloud.ru document explicitly labels activation planned, keeps the current VPS unactivated, requires owner counter and exact four n5_* goals, distinguishes target tariffs from confirmed runtime implementation, and separately authorizes any real payment test.
- Its evidence instructions require nonintercepted owner-counter transport and separate authenticated goal/report visibility; HTTP 200/callback is not ingestion, and no counter/access remains planned/unknown. Browser-observed payments are correctly distinguished from ledger revenue/refunds.
- Before any future enablement, the known actual SDK URL leak must be corrected and actual-request privacy checks rerun on the final build; generic SDK flags or wrapper mocks are insufficient. The caller's live-browser finding is recorded as a known external-to-this-pass blocker, not independently reproduced here.

## Similarweb conclusions checked against supplied JSON

This validates faithful arithmetic/interpretation of the copied source, not provenance of an original Similarweb export. The JSON explicitly says owner-provided copy, no export/screenshots available, vendor estimates, unverified per-table filters. No claims of independently measured competitor traffic or conversion are warranted.

| Check | Result |
|---|---|
| Exact reported channel shares | 16.09 + 15.08 + 5.92 = 37.09, verified with Decimal arithmetic. “Exact” describes arithmetic of displayed values, not a precise first-party measurement. |
| Unresolved residual | 100 − 37.09 = 62.91, containing paid_search <1 and every unreported channel; correctly not labelled Direct. |
| Main channel | overall null/unknown in JSON and prose; Organic Search is largest only among the three exact reported shares. |
| Paid Search | less-than bound preserved; not subtracted as exactly 1%, not equated to total ad spend or absence of paid social/referral placements. |
| Referrer table | four copied domain labels versus five share values; mapping null, not assigned by position, denominator unverified. |
| Outgoing YooMoney | 11.09% retained as outgoing-table value; payment conversion/signup rate/revenue null and not inferred. OAuth labels do not prove registration. |
| Visits | 22053 over three months / 3 = 7351 mean monthly visits; visits not users/clients. |
| Geography/growth/keywords | no country×channel multiplication or causal growth inference; MoM bases/filter periods unknown and keyword percentages not site-wide conversion or ready N5 semantics. |

The research README correctly preserves the fixed pilot, makes economics conditional, says target credits/runtime/provider costs still need separate verification, and explicitly leaves exercise 3.4 incomplete until target event checks. No purchase/publication/spend claim is made. External methodology/listing URLs and author claims of having checked them were not independently re-browsed in this bounded raw-source comparison; this report does not certify those past browsing actions.

## Evidence binding

Inspected HEAD plus dirty-file byte hashes at the review snapshot:

| File | SHA-256 |
|---|---|
| .env.example | aaf48430022a2c64f1ee3f4cbcadde16e6f46157e61f785a7ac974f2cb2a514c |
| docker-compose.yml | 0b0c079c812841d612c408defe1983abf68888082c15718337ca048a5d7b6c4d |
| docs/features/acquisition-analytics/cloudru-launch.md | 60440807257d5316ccb78028db152b084ae74a18b698a3a9cc8f9185605da440 |
| docs/features/acquisition-analytics/deployment-context.md | 4369d2131161a97ffa1d20d1336850138d9986d8b9be08ca80a5c223eda3b3ea |
| docs/research/acquisition-20261026/similarweb-analysis.md | 1d480af2b67f2aee9c53524b05c4ea77fb2d80e83c03d43397101c288fb0acf0 |
| docs/research/acquisition-20261026/similarweb-data.json | 16703aeedb1366f96c69fc140c492b8d89a759313d147a3ceac5bbc93d33108b |
| docs/research/acquisition-20261026/README.md | f31e837f094417bf9068359b195efd0ed08b4a17cff75e57af99d3b172ce2c4a |

Checks performed: read-only git status/diff/revision, bounded document/config reads and SHA-256 hashes, plus in-memory Decimal JSON arithmetic/count checks. No full checks, browser test, provider HTTP receipt or authenticated dashboard verification was performed by this reviewer. Narrow read-only escalation was used because sandbox initialization had failed in this session. Caller owns the two concrete doc corrections, pending privacy fix and final source/build/receipt reconciliation. No new scope or optional polish is requested.

Status: completed
