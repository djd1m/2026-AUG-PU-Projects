# Independent targeted revalidation — N5 referrals

Verdict: PASS for implementation of v2 together with the mandatory SQL timing detail below. No further planning/research round is required. This validates the plan, not code, tests, migration execution or E2E.

Plan: `/tmp/n5-referral-plan-v2-20261028.md`
Verified SHA256: `dbaba0f7109601b56a86cab13609a3895f187c110d8e1c391b570cc0d54605f1`.
Source baseline retained: `3b48d0ff4697d96f6b7e2de8f89a16f61ea1fbc1` in `/tmp/n5-acquisition-analytics-20261026`.
Prior validation: `/tmp/n5-referral-validation-20261028.md`.

V2 resolves H1: preserves original created_at; introduces current assigned_at; advances it only for actual code change; preserves same-code source promotion; applies both intent-created and payment-paid cutoffs; lists old purchase, late old intent, new intent and same-code regressions. Existing-row migration-time initialization is conservative and does not invent historical assignment evidence. Disclose that existing pre-migration purchases are consequently excluded from new sales counters. No payout/billing engine is required.

Mandatory implementation detail: use `assigned_at DEFAULT clock_timestamp()` rather than transaction-start `now()`, or explicitly set assigned_at on INSERT from the post-lock assignment timestamp already sampled by apply. PostgreSQL now() can precede waiting for the account lock; an earlier intent may commit during that wait and incorrectly qualify. On changed-code UPDATE use post-lock time as v2 already requires; on unchanged code preserve timestamp. Add/retain old-intent regression with deterministic ordered timestamps; independent source review must verify this timing detail. This report is a normative refinement of v2's literal DEFAULT now() / new-insert-default wording, not permission to weaken cutoffs.

Other original validation constraints remain: own-session creation; reject a new active campaign when owned antifraud-blocked code exists; partial unique direct-view index with no silent cleanup; cookie/public donors unchanged; accepted package identity/amount/status/fulfilled checks; refund exclusion; isolated DB for YooKassa test money. Root must bind v2 plus this refinement to writers. Backend/UI disjoint ownership is appropriate; integration owner reconciles migration and common artifacts. Mandatory quality, concurrent, mutation, mobile, browser and independent review gates remain.

Read only v2 amendment and verified hash in this pass; wrote this requested /tmp report and terminal trace. No credentials read; no provider calls, DB changes, source/git/production writes, installs or external publication.
Profile: model-routing-econom, requested validation/high. Actual model, effort, usage and cost: null (not exposed). E2E preflight: not_applicable, plan review only.
Status: completed
