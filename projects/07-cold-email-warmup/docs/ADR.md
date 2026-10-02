# ADR register

Status: approved with XL plan v1, OWN-N7-002. Detailed rationale is in
[mvp-xl-plan](plans/mvp-xl-plan.md). Acceptance must cover these decisions.

| ID | Decision | Consequence | Trace |
|---|---|---|---|
| ADR-001 | Server AEAD ciphertext for mailbox credentials, external runtime key | Intentional exception to browser-only generic template, needed for autonomous worker | FR-n7-002, Architecture credentials |
| ADR-002 | Test transport by default; explicit operator + user gates for live mode | No accidental real sending; no fake production success | FR-n7-003, FR-n7-005 |
| ADR-003 | Seeded cohort, measured pool eligibility, reputation unknown by default | No network-effect guarantee before observations | FR-n7-004, FR-GROWTH-001 |
| ADR-004 | Sandbox billing first, server truth and immutable idempotent intents | Live billing/deploy checkpoint preserved | FR-n7-009, FR-GROWTH-002 |
| ADR-005 | Reuse narrow audited donor primitives | Internal provenance retained; third-party licenses checked at lock | FR-n7-001, NFR-n7-001 |

## v1.1 clarification after N7-V01..06

ADR-002: final claimed→submitting commit under shared transaction advisory lock
(7,1) is the irreversible boundary, not SMTP acceptance. All eligibility/stop
writers share this lock; no network I/O inside transaction.
ADR-003: direct SMTP necessarily discloses sender/header/test body to consenting
peer; privacy promise excludes these disclosed fields and still protects private
campaigns/credentials and API enumeration. Original impossible AC corrected explicitly.
ADR-004: usable local fake adapter success is mandatory; unavailable-only does not
pass billing. All local amounts/events are marked TEST; live provider remains deferred.
