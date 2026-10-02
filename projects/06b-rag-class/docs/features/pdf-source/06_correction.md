# F06 — bounded exact P2 correction

Run-ID: 20261002T190728Z-pdf-source. Work-Unit-ID: pdf-source-correction. Attempt-ID: correction-1.
Source base: 20417e604f43066639e62ea1c79cca85b951f45c. Launch SHA256: c229e2d96236966f6be148c0d504c39fc7c6607545c8aebd2bd8a415ffed9f87 (verified).

Profile: compact-quality-first-v2; requested gpt-6.1-sol/high, actual model/effort and usage unknown without native metadata. Existing run/launch records precede this correction. One executor, no children or fallback. Hard limit 300 seconds from launch 2026-10-02T20:00:53.650235Z.

ROUTE: mechanical S/exit 0, substantive scoped M retained from accepted F06 plan. Only PDF-07/P2 is changed. Requirements: Specification FR-n6b-3/SC-US-003 and accepted 01_plan.md; architecture: Architecture Source/IndexJob and ADR-012. No donor, schema, API or shared-resource change. PLAN is the caller's accepted exact-P2 correction; IMPLEMENT route unchanged. All final F06 gates remain coordinator-owned.

AddPdf remembers the accepted job ID and waits until refreshed cabinet data contains that ID. The acceptance lock clears even when the first authoritative observation is terminal. Existing busy and pending locks remain. Existing upload errors/status remain. page.tsx supplies IDs from the existing tenant-filtered cabinet query. No AddSource changes.

Prepared browser regression retains queued/live disabled assertions at 1440/390, then holds a real successful upload response for a signature-valid damaged PDF until its own authenticated job GET returns failed. It delivers the exact real 202, waits for terminal source/error on the mounted form, asserts input/button enabled without reload, and uploads another PDF with 202. This source has NO cancel route. Coordinator must start the own-stack real worker with fake provider only after the script prints terminal-worker-required; both initial live checks must run with that worker stopped. Terminal wait is 60 seconds. No fake backend response or new dependency.

E2E preflight: not_applicable to this implementation attempt; browser lane busy and coordinator owns fresh build/runtime execution. Browser regression and mutation red/green remain pending; no browser pass claimed. Historical 353 unit/183 integration/build pass applies only to the old source. Fresh complete checks, build, UI and independent re-review remain pending before feature acceptance.

Checks completed on Node v22.22.3: npm run typecheck exit 0; focused vitest suites pdf-handler, jobs-handler, pdf-extract and job-guards exit 0, 4 files / 32 tests passed (2.66 seconds). node --check ui-e2e.mjs and git diff --check exit 0. Checks logs: /tmp/n6b-correction-typecheck.log and /tmp/n6b-correction-unit.log. None proves the browser regression passed. Snapshot destination: tests/artifacts/pdf-source/correction-source-hashes.json. Telemetry/CLI receipt destination: docs/telemetry/p-replicator/20261002T190728Z-pdf-source/evidence/correction-1-receipt.md (caller persists final output).

Scope audit: only add-pdf.tsx, minimal page.tsx prop wiring, prepared ui-e2e.mjs, this report and correction-source-hashes.json written by this executor. Pre-existing coordinator telemetry/artifacts preserved. No commit/push, containers, backend/API changes, dependencies or global changes. Native usage/cost/active time unavailable (null); no savings estimate. Coordinator needs a real worker test runner using the existing FakeProvider seam; production main.ts has no fake-provider environment switch.
