# Review — A merchant F1
Reviewer family: codex
Spec revision: sha256:d9bce34cfcdb8f3321573a1570e4c13cf1fde520fee5c26d8112e2112268ed34
Source implementation: 12ee9c005104804667bdccd636fe960711c76148
Status: accepted within F1 scope; A1/A2 resolved by independent reviewer.

Parent consolidated the final independent review table from [full receipt](../../telemetry/p-replicator/20260909T060632Z-go-a-merchant/evidence/a-ui-review.md). Earlier findings and correction rounds remain in that immutable review history. Reviewer used Astra high; actual session metadata is reconciled separately when available.

Coordinator browser evidence: 12 actual Firefox scenarios plus parent test, Node13/13 passed, exit0,5802.526421ms. Desktop1440 and real iframeviewport390; no document overflow. Includes both policy kinds/reload, missing-rate denial, same-payment refund/replay, approved CSV, separate manual send, historical/new obligations, clipboard, enrollment preview, error recovery, revised fixture-agent handoff and keyboard activation. Screenshots: [browser evidence](../../telemetry/p-replicator/20260909T060632Z-go-a-merchant/evidence/browser/).

## Spec conformance

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-a-merchant-1011 | met | Per-kind latest server policy selection, run-specific selected-kind persistence and credit-specific invoice preview; A2 follow-up check. |
| AC-a-merchant-1012 | met | Explicit rate/day validation and repairable alert; server revalidation preserved. |
| AC-a-merchant-1021 | met | Stable confirmed fixture event, visible event/rule/reward/available date from server projection. |
| AC-a-merchant-1022 | met | Identical event replay and distinct refund identity; correction remains in refreshed server summary. |
| AC-a-merchant-1031 | met | Exact artifact reference for approval/export, explicit exclusions, stale-source recompute flow. |
| AC-a-merchant-1032 | met | Current obligation/revision-based sent interpretation, independent export/send, visible stored operator/date/evidence; A1 focused test and repeated-approval assertions pass. |
| AC-a-merchant-1041 | met | Explicit same-session F1 enrollment preview/current terms, distinct from personal referral URL; no public-publication claim. |
| AC-a-merchant-1042 | met | Provided session/artifact retained and authorized server registry loaded; revised handoff assertion in coordinator E2E source. |

## Scope limits

F1 synthetic only. The invitation shows current-session terms; public tenant enrollment is not connected. Agent handoff setup is through deterministic fixture task commands; D UI and real MCP/A2A are separate. B/C/D and global batch completion gates remain pending. No real payment/provider approval/production readiness is claimed.
