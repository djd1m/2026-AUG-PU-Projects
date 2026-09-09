# Completion — D agent F1

All10 criteria passed in source review and actual Firefox13/13 tests (12 scenarios). Full PostgreSQL44/44 and14 current mutation guards passed. Refund explanation finding resolved at cb033a8; no open consequential findings. D runs on loopback13034 with frontend network only. This is the deterministic fixture runner: no actual LLM or MCP/A2A wire. Full batch and demo publication evidence follows in docs/Completion.md.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-d-agent-4011 | tests/e2e/d-agent.mjs | SC-US-401-1 consent creates only subject-scoped read and draft grant |
| AC-d-agent-4021 | tests/e2e/d-agent.mjs | SC-US-402-1 replay keeps logical task and one payable registry |
| AC-d-agent-4031 | tests/e2e/d-agent.mjs | SC-US-403-1 owner exports only approved exact snapshot and never sends |
| AC-d-agent-4022 | tests/e2e/d-agent.mjs | SC-US-402-2 refund recount changes same artifact and explains exact correction |
| AC-d-agent-4032 | tests/e2e/d-agent.mjs | SC-US-403-2 revoke denies cached agent read and owner continues exact revised artifact in A |
| AC-d-agent-4012 | tests/e2e/d-agent.mjs | SC-US-401-2 expired grant denies next step while owner read stays available |
| AC-d-agent-4041 | tests/e2e/d-agent.mjs | SC-US-404-1 partner repeat preserves same own task with no settlement side effects |
| AC-d-agent-4042 | tests/e2e/d-agent.mjs | SC-US-404-2 canceled T1 late response never completes selected T2 |
| AC-d-agent-4051 | tests/e2e/d-agent.mjs | SC-US-405-1 customer agent answer matches the actual B credit UI on same session |
| AC-d-agent-4052 | tests/e2e/d-agent.mjs | SC-US-405-2 read-only customer grant cannot reserve or apply credit |
