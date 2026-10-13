# F07 I2 implementation receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i2
Attempt-ID: replicate-i2-1
Source: ef6758b0b42f61ed5e2e54c7cf1d82c5e7e72461
Launch-SHA256: 2596a8c6b2bd5e3b174a02f59cc4bfcdcb9b9fcc1d1cb7ff537cfb8efe777c9e
Finished-At: 2026-10-03T08:27:12.942132+00:00
Verdict: I2 implementation/checks complete; bounded receipt milestone missed; ready for fresh independent review

Profile: compact-quality-first-v2; substantive XL. Accepted exact contracts and owner scope retained. Mechanical ROUTE S/exit0 is a lower bound; no plan checkpoint reopened.
Requested-Model: gpt-6.1-sol
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Model/effort/billing measurements are host-owned and unavailable; requested routing is not proof. No delegation/fallback/global configuration change; no savings claim.
Elapsed-From-Serialized-Launch-Seconds: 1424.683
Active-Wall-Seconds: null (no separate measurement)
Product code and final149/149 run froze before1400s; substantive receipt was installed at1424.683s, missing the1400s milestone by24.683s while within the1500s hard deadline. Final evidence assembly and reconciliation of the whitespace wrapper consumed the margin. This timing failure is disclosed rather than calling the bounded milestone a pass.

Implemented only web/replicate.js and tests/replicate.test.js: pinned fail-closed server config and immutable canonical request binding; I1 committed send-CAS authority; final live authorization/abort/deadline check; fixed-origin asynchronous one-shot POST; streamed JSON limits; validated identity/status; late cleanup-only binding and I1 monotonic observation; fixed-original-budget GET polling; safe cancellation observations. No create retry, completion/release/credit/spend refund, browser URL/token output, SDK, scheduler or output-quality acceptance.

API handback: docs/features/f07-replicate/i2-implementation.md. Includes exact config/candidate/binding/claim/prepared/budget/finalAuthorize signatures; I3 remaining-budget accessor/private succeeded output depth0/generated1; I4 original-deadline recovery, heartbeat, final fence/deletion/revocation, cleanup budget and conservative ambiguity obligations. GET stops at the third consecutive failure (two transient retry waits2000/4000ms, cap5000ms/429); no fourth GET. Token presence alone never authorizes spend. Cancellation never proves billing stop, erasure or refund.

Actual checks under /tmp/n8-node22 v22.20.0, PROJECT_ROOT cwd:
- /tmp/n8-node22 --check web/replicate.js: exit0.
- /tmp/n8-node22 --check tests/replicate.test.js: exit0.
- /tmp/n8-node22 tests/replicate.test.js: exit0,149 TAP tests/pass149/fail0/cancelled0/skipped0/todo0. 25 top-level tests plus124 nested subtests; not149 independent scenarios.
- /tmp/n8-node22 tests/provider-submissions.test.js: exit0,2/2, unchanged authority units. No repeat of unchanged passing units.
- git diff --check: exit0. git diff --no-index --check /dev/null web/replicate.js and tests/replicate.test.js: actual exit1 each, empty diagnostic output; new-file diff status, no whitespace defect. Final check wrapper initially exited1 after misinterpreting that status; retained and reconciled, not hidden.
- Source/launch digests, protected I1 bytes versus HEAD and changed-path allowlist: pass via read-only local Python/git checks. No tracked product/contract/manifest changes. Existing node_modules symlink retained.

Failed checks retained: replicate-i2-tests-first.log reports134 tests/pass123/fail11; first inner test exit was not captured separately (summary shell exit0 is not a pass). Next measured run replicate-i2-tests.log exit1 reports134/pass133/fail1. Failures were fixture assertions against an intentionally mutated binding and an invalid requirement to destroy an already completed HTTP request after later schema rejection. Subsequent147/147 and148/148 runs are retained; the final149/149 snapshot includes an observation/deadline correction and required I3 budget accessor. Initial/intermediate candidate hashes and some final-wrapper timings unavailable; no inferred measurements substituted.

All provider tests use injected fake EventEmitter requests/Readable streams and fake durable authority/clock through production boundary code. No host listeners, DNS/network/provider/credentials/paid calls, Docker/build/PG/dependency install, commit/push or run/events writes. These are not new real-PG tests. Supplied accepted I1 PG16 proof16/16 (15 children+parent) remains independent and unchanged. No executed mutant, runtime integration or fresh review pass is claimed. Mandatory send-CAS mutation is I6.

Frozen product SHA256:
- web/replicate.js: be4bd7f92fb6dc354b11326ea6d8d519bbc35285756a6531defb4f91d59b649c
- tests/replicate.test.js: f0efc8f4114cc59dd10c14576356c5db96a996f2c65d7aa76fef05e87cbd46cd
Snapshot: docs/telemetry/n8-20261002-1740/replicate-i2-snapshot.json (both product files, exact11 contract/API/review digests, protected I1 files, launch, checks and handback).
Checks: docs/telemetry/n8-20261002-1740/replicate-i2-checks.json (actual commands/exits/counts, failures and gaps).

E2E preflight: not_applicable; injected unit-only slice. Fresh independent I2 review, I3 secure media, I4 wiring/recovery/cleanup/job authority, I5 provenance/quality, I6 mutation/UI, I7 full regression/canonical docs/review, I8 browser and separately authorized real pilot are out_of_scope here and pending parent/operator work. No F07/MVP/paid activation acceptance or working background executor is asserted. Parent coordinator owns the next bounded fresh-review launch; no delegation was performed by this sole coder.

Status: failed
