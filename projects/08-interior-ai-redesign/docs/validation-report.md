# Phase 2 — validation state

Deterministic first pass complete; independent semantic validation pending. Report is not acceptance. Exact outputs: `telemetry/n8-20261002-1740/phase1-gates.json`.

| Gate | Exit | Meaning |
|---|---|---|
| check-docs-complete | 0 | Declaration/trace check passed, not runtime proof |
| check-external-deps | 0 | Declaration/trace check passed, not runtime proof |
| check-growth-trace | 0 | Declaration/trace check passed, not runtime proof |
| check-handoff-manifest | 0 | Declaration/trace check passed, not runtime proof |
| check-look-origin | 1 | Not measured / applicability or missing runtime; see evidence |
| check-look-trace | 2 | Not measured / applicability or missing runtime; see evidence |
| check-embed-contract | 2 | Not measured / applicability or missing runtime; see evidence |
| check-job-contract | 2 | Not measured / applicability or missing runtime; see evidence |
| check-webhook-contract | 2 | Not measured / applicability or missing runtime; see evidence |
| check-model-cost | 2 | Not measured / applicability or missing runtime; see evidence |

Initial manifest/look table format checks failed2; repaired exact documented formats. No vendor hook changed. Source path remains auth-required, look trace2 is not pass. Webhook generic signature gate does not model YooKassa authenticated GET; production equivalence requires separate tests. Job/model/embedding checks remain honestly unavailable or not applicable. Independent reviewer must assess scope and release blockers.
