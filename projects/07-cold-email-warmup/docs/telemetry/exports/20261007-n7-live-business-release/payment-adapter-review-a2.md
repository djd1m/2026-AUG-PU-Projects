# Independent A2 adapter REVIEW

Verdict: **needs_specific_corrections**; ACCEPT_BOUNDED_ADAPTER withheld for one HIGH finding.
Frozen source132346a000d489dfcb1b54e08e7f38a6ab629560; baseline0d1d9323daa1ed0d5425b7685a35b424b4d49b1c. Eight source files and four compiled artifact hashes match the clean objective; immutable review launch matches the parent digest. Context was approved plan/validation, frozen source/tests and clean objective only; author receipt/reasoning not read.

## A2-R1 — saved24h window can expire between DB guard and POST

`src/billing/live.ts:43–48` evaluates deadline with DB clock inside billingTransaction. That transaction awaits COMMIT before returning. The external POST begins afterwards with no deadline recheck; `YooKassaProvider.request()` accepts only body/key and cannot enforce saved expiry. A response-loss retry near the24h boundary can therefore be treated by the provider as a new operation, violating mandatory zeroPOST after expiry and potentially creating a duplicate payment.

Independent witness on the exact authorized local database asserted `current_database()=n7billing_20261007_a1` before inserting a new tenant/intent fixture. The immutable request and first attempt were stored with500ms remaining. Only completion of the first real COMMIT was delayed1000ms; adapter fetch was injected and performed no provider network. Checkout then invoked one fake POST522ms after expiry instead of zero. The witness passed its BUG_REPRODUCED assertions and cleaned only its own tenant/intent. See `deadline-witness.mjs` and `deadline-witness.log`.

Required correction: carry the immutable deadline to the actual external create boundary and fail closed immediately before dispatch, preserving same request/key and no network under DB transaction. A crossing-after-transaction regression must produce checkout_reconciliation_required with zeroPOST; keep existing already-expired and bound-GET witnesses. The existing24/25h test exercises an already-expired pretransaction state and does not catch this race.

## What passed this bounded review

Independent Node22.22.3 execution of live-billing-unit and yookassa-unit tests:7/7. Raw id/order/shop/test=false/exact money are verified before local enrichment. Calendar checks accept1–9fraction digits and retain raw precision; grant code normalizes to Date and rejects future paidAt. Request/timestamp freeze and existing intent binding/terminal constraints are retained in017; confirmation URL is exact-host HTTPS with credential/control/port checks and remains immutable once stored. Code retains first-expired-paidAt grant persistence and ON CONFLICT behavior, refund canonical payment context and sticky revoke. Source db/readiness and diagnostics-test version bump is limited to017. No second must-fix identified.

No independent full integration/build rerun was needed to establish this rejection. The initial exploratory unit run used default Node20; the recorded acceptance-relevant unit run explicitly sourced the authorized private environment without printing it and used Node22. No claim of real provider payment, deployment or business release is made. Server/config/UI and full workflow gates are outside this adapter packet. Full expanded MVP still requires AI replies.

Actual host model/usage/cost:null (not supplied by host). Requested Sol6.1 HIGH. Profile: bounded independent XL payment review. Elapsed from parent-recorded launch: 428.917seconds, including review and witness; no fabricated token/cost measurement.

Status: completed
