# Credit packages — Source research and scope

Read-only audit, 2026-10-26, source c559673649460fa5d8ef1e5e3c86bf7053ebbb69. Existing product/pricing/context were supplied; Explore skipped because product, target, stack and change are clear. Reuse prior internal findings rather than launch new market research/provider calls. Skill: root `.claude/skills/sparc-prd-mini/SKILL.md`, `/feature` role map, `requirements-validator/references/feature-report-contracts.md`, local project-work-companion. Existing project canon/scaffold is not regenerated.

## Product Brief and Solution
Russian clip-generation product, existing Next.js/PostgreSQL/BullMQ pipeline. Problem: runtime free/Pro990 quotas recur daily, target sells finite credits and one-time trial. Smallest solution: keep payment/queue/safety machinery, add three bounded credit tables, stable input charge and independent entitlement windows. Source of truth is trusted probe+SQL, not browser duration or payment amount alone. No generic billing framework/new service.

## Findings
| Finding | Source | Confidence |
|---|---|---|
| Target ordinary1credit/minute, signup30once, three exact offers and visible hours | docs/research/unit-economics-20261026/pricing-decisions.md; credits-record.json | High for recorded owner decisions |
| Additional owner replies: per-second billing and addon30days WITH paidrights | Coordinator direct owner-answer messages in this run | High as supplied requirement; root must preserve actual reply receipt |
| Existing intent stores amount but no SKU;990cannot identify newStart vs legacyPro | packages/db/src/payments.ts; migrations/021_payments.sql | High source audit; new behavior untested |
| Existing probe rounds minutes up and new STT series re-enters probe | packages/db/src/probe.ts; apps/web/src/server/video-retry.ts | High source audit |
| Provider chunk retries consume user/global minutes and increase minutes_charged | packages/db/src/transcription.ts | High source audit; customer/provider split mandatory |
| Provider costs count real attempts before dispatch | apps/worker/src/stt/spend.ts; llm/spend.ts | High source audit |
| Existing account→video deletion order forbids video→account lock inversion | apps/web/src/server/retention.ts; packages/db/src/quota.ts | High source audit; proposed added lock ordering needs races |
| Existing paid/free effectivePlan reads control watermark and retention across workers/screens | packages/db/src/plan.ts; packages/shared/src/tariff.ts; render/selection readers | High source audit; addon rights require all readers updated |
| Existing tests cover payment retries/order, probe duplicates and guarded worker continuation | tests/billing.integration.test.ts; queue-probe.integration.test.ts; transcription-quota.test.ts | Existing test source only, not a fresh execution claim |
No external URL was freshly checked; no compatibility capability is marked confirmed from recollection. Source audit does not prove production data cohorts, provider availability, product quality, timing or business conversion.

## Process and Evidence
Profile model-routing-econom: planning requested gpt-6.1-sol/high; actual model/effort/usage/cost null without host proof. Root coordinator owns run record and elapsed time including preparation. ROUTE established XL exit1 by payment flag on prior exact source audit; before implementation rerun against approved scope. Initial full-project structural gate is recorded below; owner later approved a selected-scope exception. Root will run frozen official checker on integrated selected-feature snapshots before cold validation; never call aggregate exit1 a pass. Source-linked requirements and scenario claims are necessary, not financial correctness evidence.

## Bounded File Scope
This planning unit writes only seven files in this directory, each five role files<200lines. No root docs, canon, code, SQL, containers, environment, secrets or global config edits. No provider/model/payment call, no runtime DB inspection. Implementation file ownership/review and later Cloud.ru VM/FM/S3/Metrika work belong to root coordinator; terminal doc receipt does not complete those AC.

## Actual Phase 1 gate result
Installed checker with explicit authoritative root role-map flags returned1: `VERDICT traceability=FAIL features=32 gaps=11 inconclusive=30`. Own contour: `PASS contour=credit-packages bidirectional traceability complete`, requirements21/claims21, no missing/orphan keys. Aggregate blockers are pre-existing project/legacy contours; no historical docs repaired and no commit made in the earlier attempt; root now explicitly authorizes a seven-doc WIP commit under the selected-scope exception. This aggregate failure remains a failure; owner selected-scope exception permits bounded progress, and root owns frozen official selected-snapshot verification. Initial default-role-map attempt returned2 because project-local toolkit files are absent.

## Revision v2 and bounded scope
Root supplied owner autonomy/selected-gate exception and delegated finite implementation choices. New code mode defaults legacy; no existing account is automatically converted/gifted. Explicit free-account operator opt-in is audited/idempotent. Immediate upgrade is disabled;20RUBexample remains future research only. First release uses full-price scheduled base renewal/switch and independent addon now. No framework, quote engine, new service or live activation. Shared typed mode/config/compose/env/tests are integration-owner files, avoiding overlap with Cloud provider config work. Existing1067-test behavior is a supplied historical regression baseline, not a new result; tests add explicit versioned credit fixtures.
