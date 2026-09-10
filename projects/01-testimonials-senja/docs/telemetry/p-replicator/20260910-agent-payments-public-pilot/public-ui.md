# Public agent UI TEST acceptance — coordinator takeover receipt
RUN_ID: 20260910-agent-payments-public-pilot
WORK_UNIT: public-ui
Receipt owner: root (explicit takeover after interrupted payments_core pending_init)
Profile: compact-quality-first-v2; risk XL
Requested child model: gpt-6-astra high; actual model/usage/cost: null, unavailable
Finished: 2026-09-10T11:43:57.655265+00:00

Result: 14/14 recorded public browser/MCP/A2A scenarios PASS.
Author execution: signup/login, actual Resend labeled test email and explicit proof,
consented grant, actual hosted YooKassa TEST first payment, saved method, independent
mandate, outside-window refusal, actual saved renewal and command replay.
Coordinator execution: final browser mandate/grant revocation (A2A401), browser close,
independent authoritative provider/ledger readback for both payments, evidence packaging.
Two actual TEST payments of990 RUB; verified matching TEST shop/order, saved=true,
succeeded and active tariff. Exactly2owned orders/attempts/reservations.

Runtime source equivalent to186f8b3; Next build9IB9BvmtgGJceHgW07HGX.
31candidate source hashes independently matched MAIN. Built/deployed image IDs are
in evidence/candidate.json and coordinator deployment.json. 6module syntax checks PASS.
Harness commits: 02ba073e1c39c90c81f7b1155341114195a55395 and1c3d675.
Only tests/agent-payments-pilot paths; unused cleanup.mjs is excluded from commits.

Limits: native Proofwall only, N3disabled; ordinary pilot checkout webhook/refund
recovery separate. First consumed budget month and owned project paid_until were
synthetically adjusted by coordinator solely to exercise renewal policy. No application
policy or provider history changed. No live funds. Resend test recipient delivery is
simulated by real provider; it is not evidence of inbox delivery to a person's mailbox.
Shared TEST shop's unchanged old webhook can write unknown operational events in the
main app; no main runtime upgrade or direct production-account mutation by this harness.

Approval interruption: child revoke invocation waited1283s and was interrupted with no
execution evidence; root reissued only revoke/close after explicit tool approval and
both passed. Root first invocation was interrupted by a status message. A later child
packaging resumption reported pending_init on interruption; root took over packaging.
Do not attribute root cleanup or packaging to the child; no payment retry was made.

Evidence: tests/agent-payments-pilot/evidence/close.json records all14scenarios,
revoke.json records rejection; candidate.json binds source/images; source-hashes.json
binds committed text artifacts. Provider-first-payment.json, provider-renewal-payment.json,
renewal-fixture.json are in coordinator telemetry. Private browser state/credentials
remain in /tmp/agent-payments-public-pilot; never copied into Git. Browser closed.

Close evidence SHA256: 992c817146e793a3f8702f7a2e6b101748065ed7a4253e4fe1256119819cfe42
Source manifest SHA256: 9ef59a72d22a547542de4e1bbe4c7cb9c2453f56ea4117f96e34dd10fd403d9b

Status: completed
