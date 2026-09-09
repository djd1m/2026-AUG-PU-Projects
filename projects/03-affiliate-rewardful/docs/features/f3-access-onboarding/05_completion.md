# Completion — f3-access-onboarding

Status: planned; implementation and acceptance pending. Do not mark live provider delivery/consent from contract tests.

## Deployment Plan

Before deployment: source-bound full tests/build/review/pipeline gates and actual browser A–D; check occupied ports/owners and DB no-port internal-network policy. Configure `.runtime/access.json`600 with explicit disabled providers until dedicated keys ready. Additive migration and backend first, A–D sequentially, public smoke and configured status. Existing accounts retain login until actual mail readiness and operator enables sticky verification policy. No actual credentials copied from donors.

## Rollback Procedure

Preserve data and revocations. After new nullable-password/verification states, restore only access-compatible candidate or forward-fix while ingress stopped. Never turn off persisted policy implicitly or restore F2 backend after connector order. Test compatibility on isolated database before release; no schema deletion.

## Tests and Evidence

Pending exact criterion → existing testpath/verbatim testtitle mapping after implementation. Required: full backend, build, provider/account concurrency, isolated Firefox A–D, public49CJM/account/protocol, mutation guards and deployment checks. No acceptance claim yet.

## Handoff

Detailed five provider guides and docs index; config names/scope/rotation, failure and restart steps. Telemetry: ../../telemetry/p-replicator/20260909T135340Z-f3-access-8b71/. Billing and active time unknown until measured; former3–5h estimate withdrawn as unsubstantiated donor-gap estimate. Live external acceptance remains separately recorded.
